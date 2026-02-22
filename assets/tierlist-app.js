import { toBlob } from "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm";
import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import Papa from "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm";
import { CONFIG } from "./config.js";

// ========== DOM ==========
const el = {
  status: document.getElementById("status"),
  leaders3pTierList: document.getElementById("leaders3pTierList"),
  leaders4pTierList: document.getElementById("leaders4pTierList"),
  loreTierList: document.getElementById("loreTierList"),
  fateTierList: document.getElementById("fateTierList"),
  campaignGuildVoxTierList: document.getElementById("campaignGuildVoxTierList"),
  campaignLoresTierList: document.getElementById("campaignLoresTierList"),
  basecourtTierList: document.getElementById("basecourtTierList"),
  leaders3pSection: document.getElementById("leaders3pSection"),
  leaders4pSection: document.getElementById("leaders4pSection"),
  loreSection: document.getElementById("loreSection"),
  fateSection: document.getElementById("fateSection"),
  campaignGuildVoxSection: document.getElementById("campaignGuildVoxSection"),
  campaignLoresSection: document.getElementById("campaignLoresSection"),
  basecourtSection: document.getElementById("basecourtSection"),
  tabs: document.querySelectorAll(".tab"),
  subTabs: document.querySelectorAll(".sub-tab"),
  leaderSubTabs: document.getElementById("leaderSubTabs"),
  baseSubTabs: document.getElementById("baseSubTabs"),
  baseSubTabsButtons: document.querySelectorAll('.base-sub-tab'),
  campaignSubTabs: document.getElementById('campaignSubTabs'),
  campaignSubTabsButtons: document.querySelectorAll('.campaign-sub-tab'),
  fateFilters: document.getElementById('fateFilters'),
  fateFilterA: document.getElementById('fateFilterA'),
  fateFilterB: document.getElementById('fateFilterB'),
  fateFilterC: document.getElementById('fateFilterC'),
  campaignLoresFilters: document.getElementById('campaignLoresFilters'),
  loreFilterDeck: document.getElementById('loreFilterDeck'),
  loreFilterFates: document.getElementById('loreFilterFates'),
  campaignGuildVoxFilters: document.getElementById('campaignGuildVoxFilters'),
  guildFilterVox: document.getElementById('guildFilterVox'),
  guildFilterMaterial: document.getElementById('guildFilterMaterial'),
  guildFilterFuel: document.getElementById('guildFilterFuel'),
  guildFilterWeapon: document.getElementById('guildFilterWeapon'),
  guildFilterRelic: document.getElementById('guildFilterRelic'),
  guildFilterPsionic: document.getElementById('guildFilterPsionic'),
  themeToggle: document.getElementById("themeToggle"),
  downloadBtn: document.getElementById("downloadBtn"),
  editBtn: document.getElementById("editBtn"),
  clearBtn: document.getElementById("clearBtn"),
  importBtn: document.getElementById("importBtn"),
  exportBtn: document.getElementById("exportBtn"),
  shareBtn: document.getElementById("shareBtn"),
  // Modal
  modal: document.getElementById("cardModal"),
  modalImg: document.getElementById("modalImg"),
  modalName: document.getElementById("modalName"),
  modalText: document.getElementById("modalText"),
  modalClose: document.querySelector("#cardModal .modal-close"),
  modalBackdrop: document.querySelector("#cardModal .modal-backdrop"),
  // Import modal
  importModal: document.getElementById("importModal"),
  importUrl: document.getElementById("importUrl"),
  importText: document.getElementById("importText"),
  importConfirmBtn: document.getElementById("importConfirmBtn"),
  importCancelBtn: document.getElementById("importCancelBtn"),
  importModalClose: document.getElementById("importModalClose"),
  importModalBackdrop: document.getElementById("importModalBackdrop"),
  // Export modal
  exportModal: document.getElementById("exportModal"),
  exportText: document.getElementById("exportText"),
  exportCopyBtn: document.getElementById("exportCopyBtn"),
  exportCloseBtn: document.getElementById("exportCloseBtn"),
  exportModalClose: document.getElementById("exportModalClose"),
  exportModalBackdrop: document.getElementById("exportModalBackdrop"),
  // Share modal
  shareModal: document.getElementById("shareModal"),
  shareSections: document.getElementById("shareSections"),
  shareConfirmBtn: document.getElementById("shareConfirmBtn"),
  shareCancelBtn: document.getElementById("shareCancelBtn"),
  shareModalClose: document.getElementById("shareModalClose"),
  shareModalBackdrop: document.getElementById("shareModalBackdrop"),
};

// ========== State ==========
let editMode = false;
let leaderEntries3P = []; // current 3P leader entries (mutable in edit mode)
let leaderEntries4P = []; // current 4P leader entries (mutable in edit mode)
let loreEntries = [];   // current lore entries (mutable in edit mode)
let basecourtEntries = []; // current base court entries (mutable in edit mode)
let fateEntries = []; // current fate entries (cards with Fate tag)
let guildVoxEntries = []; // campaign: cards with Guild or Vox tags (unique names)
let campaignLoresEntries = []; // campaign: lores from base game only
let blightedReachRaw = []; // raw cards loaded from blightedreach.yml (unfiltered)
let allCards = [];       // loaded card data
// Track hidden/visible-empty tiers per section type so changes affect only one tab
const hiddenTiersByType = new Map();
const visibleEmptyTiersByType = new Map();

function getHiddenTiers(type) {
  if (!hiddenTiersByType.has(type)) hiddenTiersByType.set(type, new Set());
  return hiddenTiersByType.get(type);
}

function getVisibleEmptyTiers(type) {
  if (!visibleEmptyTiersByType.has(type)) visibleEmptyTiersByType.set(type, new Set());
  return visibleEmptyTiersByType.get(type);
}
let currentLeaderTab = '3p'; // current leader sub-tab

// Touch drag and drop state
let touchDraggedElement = null;
let touchDraggedData = null;
let touchDraggedClone = null;
let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

// ========== Utilities ==========
function setStatus(msg, { isError = false } = {}) {
  el.status.textContent = msg;
  el.status.classList.toggle("error", isError);
  el.status.style.display = msg ? "" : "none";
}

function normalizeText(s) {
  return String(s ?? "").trim().toLowerCase().replace(/['']/g, "'").replace(/\s+/g, " ");
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((val, index) => JSON.stringify(val) === JSON.stringify(b[index]));
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  const text = await res.text();
  if (text.includes("accounts.google.com") && text.includes("Sign in")) {
    throw new Error("Google requires login. Make the sheet public.");
  }
  return text;
}

function getImageUrl(card) {
  if (!card?.image) return null;
  return `${CONFIG.cardImagesBaseUrl}${encodeURIComponent(card.image)}.png`;
}

// Map of normalized fate/leader names -> BGG guide thread URLs (only BGG links)
const BGG_GUIDE_LINKS = {
  steward: "https://boardgamegeek.com/thread/3329551/a-void-chronicler-s-guide-to-the-steward",
  naturalist: "https://boardgamegeek.com/thread/3331117/a-void-chroniclers-guide-to-the-naturalist",
  admiral: "https://boardgamegeek.com/thread/3332175/a-void-chroniclers-guide-to-the-admiral",
  magnate: "https://boardgamegeek.com/thread/3345245/a-void-chroniclers-guide-to-the-magnate",
  pacifist: "https://boardgamegeek.com/thread/3348381/a-void-chroniclers-guide-to-the-pacifist",
  peacekeeper: "https://boardgamegeek.com/thread/3355715/a-void-chroniclers-guide-to-the-peacekeeper",
  "blight speaker": "https://boardgamegeek.com/thread/3377854/a-void-chronicler-s-guide-to-the-blight-speaker",
  guardian: "https://boardgamegeek.com/thread/3390717/a-void-chroniclers-guide-to-the-guardian",
  believer: "https://boardgamegeek.com/thread/3394329/a-void-chroniclers-guide-to-the-believer",
  "gate wraith": "https://boardgamegeek.com/thread/3426284/a-void-chroniclers-guide-to-the-gate-wraith",
  advocate: "https://boardgamegeek.com/thread/3443509/the-void-chroniclers-guide-to-the-advocate",
  caretaker: "https://boardgamegeek.com/thread/3457463/a-void-chroniclers-guide-to-the-caretaker",
  hegemon: "https://boardgamegeek.com/thread/3461404/a-void-chroniclers-guide-to-the-hegemon",
  conspirator: "https://boardgamegeek.com/thread/3467021/a-void-chroniclers-guide-to-conspirator",
  redeemer: "https://boardgamegeek.com/thread/3475485/a-void-chroniclers-guide-to-redeemer",
  overlord: "https://boardgamegeek.com/thread/3477308/a-void-chroniclers-guide-to-overlord",
  pirate: "https://boardgamegeek.com/thread/3481548/a-void-chroniclers-guide-to-the-pirate",
  warden: "https://boardgamegeek.com/thread/3484110/a-void-chroniclers-guide-to-the-warden",
  pathfinder: "https://boardgamegeek.com/thread/3489162/a-void-chroniclers-guide-to-the-pathfinder",
  judge: "https://boardgamegeek.com/thread/3493471/a-void-chroniclers-guide-to-the-judge",
  partisan: "https://boardgamegeek.com/thread/3517302/a-void-chroniclers-guide-to-the-partisan",
  founder: "https://boardgamegeek.com/thread/3517422/a-void-chronicler-s-guide-to-the-founder",
  "planet breaker": "https://boardgamegeek.com/thread/3518298/a-void-chroniclers-guide-to-the-planet-breaker",
  survivalist: "https://boardgamegeek.com/thread/3522217/a-void-chroniclers-guide-to-the-survivalist"
};
function formatCardText(text) {
  if (!text) return "";
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return formatted;
}

// ========== Theme ==========
function initTheme() {
  const saved = localStorage.getItem("arcs-theme");
  if (saved) document.documentElement.dataset.theme = saved;
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("arcs-theme", next);
}

// ========== Data Loading ==========
async function loadCards() {
  // Load base game cards first
  const baseText = await fetchText(CONFIG.cardsYamlUrl);
  const baseData = yaml.load(baseText);
  if (!Array.isArray(baseData)) throw new Error("Invalid base game YAML format");
  const baseCards = baseData
    .filter((c) => c && typeof c === "object" && c.name)
    .map((c) => ({
      id: c.id ?? null,
      name: c.name ?? "",
      image: c.image ?? null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      text: c.text ?? "",
      source: 'base',
    }));

  // Optionally load blighted reach -- keep the raw expansion set, but only merge Fate-tagged cards
  let brRaw = [];
  let brFate = [];
  if (CONFIG.blightedReachYamlUrl) {
    try {
      const brText = await fetchText(CONFIG.blightedReachYamlUrl);
      const brData = yaml.load(brText);
      if (Array.isArray(brData)) {
        brRaw = brData
          .filter((c) => c && typeof c === "object" && c.name)
          .map((c) => ({
            id: c.id ?? null,
            name: c.name ?? "",
            image: c.image ?? null,
            tags: Array.isArray(c.tags) ? c.tags : [],
            text: c.text ?? "",
            source: 'blighted'
          }));
        brFate = brRaw.filter((c) => Array.isArray(c.tags) && c.tags.includes("Fate"));
      }
    } catch (e) {
      console.warn("Failed to load blighted reach YAML:", e);
    }
  }

  // Keep a global copy of raw blighted reach cards for campaign-only sourcing
  blightedReachRaw = brRaw;

  // Merge: base cards first, then all blighted reach cards that don't duplicate base names
  // This ensures lookups (import/share) can find expansion-only cards like Guild/Vox.
  const existing = new Set(baseCards.map((c) => normalizeText(c.name)));
  const combined = baseCards.concat(brRaw.filter((c) => !existing.has(normalizeText(c.name))));
  return combined;
}

// Global touch cleanup
document.addEventListener("touchend", () => {
  if (touchDraggedElement) {
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
    
    // Clean up clone
    if (touchDraggedClone && touchDraggedClone.parentNode) {
      touchDraggedClone.parentNode.removeChild(touchDraggedClone);
    }
    
    touchDraggedElement = null;
    touchDraggedData = null;
    touchDraggedClone = null;
    touchMoved = false;
  }
});

document.addEventListener("touchcancel", () => {
  if (touchDraggedElement) {
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
    
    // Clean up clone
    if (touchDraggedClone && touchDraggedClone.parentNode) {
      touchDraggedClone.parentNode.removeChild(touchDraggedClone);
    }
    
    touchDraggedElement = null;
    touchDraggedData = null;
    touchDraggedClone = null;
    touchMoved = false;
  }
});

async function loadTierListSheet() {
  const text = await fetchText(CONFIG.tierListCsvUrl);
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
  return parsed.data ?? [];
}

function parseTierListSheet(rows, cards) {
  // Sheet format: Name | Tier  OR  "Name,Tier" in single column
  // Empty rows separate sections. Historically sheets had 4 sections
  // (3P,4P,Lore,BaseCourt). Newer sheets may include a Fate section
  // between Lore and BaseCourt. We'll split into raw sections and map
  // them based on how many sections are present to remain backward
  // compatible.

  // Build a lookup map: normalized name → card
  const cardMap = new Map();
  for (const card of cards) {
    cardMap.set(normalizeText(card.name), card);
  }

  const rawSections = [];
  let currentIdx = 0;
  rawSections[currentIdx] = [];
  let headerSkipped = false;

  for (const row of rows) {
    let name, tier;

    if (row.length === 1) {
      const cell = (row[0] ?? "").trim();
      if (cell.includes(",")) {
        [name, tier] = cell.split(",", 2).map(s => s.trim());
      } else {
        name = cell;
        tier = "";
      }
    } else {
      name = (row[0] ?? "").trim();
      tier = (row[1] ?? "").trim();
    }

    // Normalize tier casing
    tier = (tier || "").toUpperCase();
    // Preserve the special-cased 'Unranked' value in its canonical form
    if (tier === "UNRANKED") tier = "Unranked";

    // Skip header row
    if (!headerSkipped) {
      if (normalizeText(name) === "name") {
        headerSkipped = true;
        continue;
      }
    }

    // Empty row = new section separator (only after header)
    if (!name && !tier) {
      if (headerSkipped) {
        currentIdx++;
        rawSections[currentIdx] = rawSections[currentIdx] || [];
      }
      continue;
    }

    // Treat missing tier as Unranked (allow entries without explicit tier)
    if (!name) continue;
    if (!tier) tier = "Unranked";

    const card = cardMap.get(normalizeText(name));
    const entry = { name, tier, card: card ?? null };
    rawSections[currentIdx].push(entry);
  }

  // Map raw sections to named sections. If there are 5+ raw sections,
  // we assume the order is [3P,4P,Lore,Fate,BaseCourt]. If 4, it's
  // [3P,4P,Lore,BaseCourt] for backward compatibility.
  const leaders3P = rawSections[0] || [];
  const leaders4P = rawSections[1] || [];
  const lore = rawSections[2] || [];
  let fate = [];
  let basecourt = [];
  // Support additional campaign sections in exported CSVs. Export order is:
  // 3P, 4P, Lore, BaseCourt, Fate, CampaignLores, CampaignGuildVox
  basecourt = rawSections[3] || [];
  if (rawSections.length >= 5) fate = rawSections[4] || [];
  const campaignLores = rawSections[5] || [];
  const campaignGuildVox = rawSections[6] || [];

  const others = {};
  if (campaignLores.length > 0) others['campaignLores'] = campaignLores;
  if (campaignGuildVox.length > 0) others['campaignGuildVox'] = campaignGuildVox;

  return { leaders3P, leaders4P, lore, fate, basecourt, others };
}

// ========== Rendering ==========
const TIER_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "F"];

function buildTierListHTML(entries, container, type, sectionName) {
  // Check if all entries have the same custom section name
  const customSectionNames = new Set(entries.map(e => e.customSectionName).filter(Boolean));
  const displaySectionName = customSectionNames.size === 1 ? customSectionNames.values().next().value : sectionName;
  
  // Group by tier
  const grouped = new Map();
  for (const tier of TIER_ORDER) {
    grouped.set(tier, []);
  }
  grouped.set("Unranked", []);
  const hiddenTiers = getHiddenTiers(type);
  const visibleEmptyTiers = getVisibleEmptyTiers(type);
  for (const entry of entries) {
    const tierVal = (typeof entry.tier === 'string' && entry.tier.trim().length) ? entry.tier : "Unranked";
    const t = TIER_ORDER.includes(tierVal) ? tierVal : (tierVal === "Unranked" ? "Unranked" : "D");
    grouped.get(t).push(entry);
  }

  container.innerHTML = "";

  // Add section header if we have a custom name
  if (displaySectionName) {
    const header = document.createElement("h3");
    header.className = "section-header";
    header.textContent = displaySectionName;
    header.style.cssText = "margin:0 0 16px 0;font-size:1.2rem;font-weight:600;color:var(--text);border-bottom:1px solid var(--border);padding-bottom:8px";
    container.appendChild(header);
  }

  for (const tier of TIER_ORDER) {
    if (hiddenTiers.has(tier)) continue;
    const items = grouped.get(tier);
    if (items.length === 0 && !editMode) continue;
    // In edit mode, show tiers with cards OR tiers marked as visible even when empty
    if (items.length === 0 && editMode && !visibleEmptyTiers.has(tier)) continue;
    
    // If this empty visible tier somehow got cards, keep it visible
    // If this tier became empty again, remove it from visible set so it becomes an add button
    if (editMode && items.length === 0 && visibleEmptyTiers.has(tier)) {
      // This is a visible empty tier, show it
    }

    const row = document.createElement("div");
    row.className = "personal-tier-row";

    const label = document.createElement("div");
    label.className = `personal-tier-label tier-${tier.toLowerCase()}`;
    label.textContent = tier;

    // Remove tier button (edit mode only)
    if (editMode) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "tier-remove-btn";
      removeBtn.textContent = "✕";
      removeBtn.title = `Remove ${tier} tier`;
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeTier(tier);
      });
      label.style.position = "relative";
      label.appendChild(removeBtn);
    }

    const cardsDiv = document.createElement("div");
    cardsDiv.className = "personal-tier-cards";
    cardsDiv.dataset.tier = tier;
    cardsDiv.dataset.type = type;

    // Drag & drop targets (always set up, only active in edit mode)
    cardsDiv.addEventListener("dragover", (e) => {
      if (!editMode) return;
      e.preventDefault();
    });

    for (let i = 0; i < items.length; i++) {
      const entry = items[i];
      const cardEl = createCardElement(entry, type);
      cardsDiv.appendChild(cardEl);
      
      // Add drop zone after each card (except the last one) in edit mode
      if (editMode && i < items.length - 1) {
        const dropZone = document.createElement("div");
        dropZone.className = "card-drop-zone";
        dropZone.dataset.insertBefore = items[i + 1].name;
        dropZone.dataset.tier = tier;
        dropZone.dataset.type = type;
        
        cardsDiv.appendChild(dropZone);
      }
    }

    row.appendChild(label);
    row.appendChild(cardsDiv);
    container.appendChild(row);
  }

  // Show Unranked tier if it has cards OR if in edit mode
  const unrankedItems = grouped.get("Unranked");
  if (unrankedItems.length > 0 || editMode) {
    const row = document.createElement("div");
    row.className = "personal-tier-row";

    const label = document.createElement("div");
    label.className = `personal-tier-label tier-unranked`;
    label.textContent = "";

    const cardsDiv = document.createElement("div");
    cardsDiv.className = "personal-tier-cards";
    cardsDiv.dataset.tier = "Unranked";
    cardsDiv.dataset.type = type;

    // Drag & drop targets (always set up, only active in edit mode)
    cardsDiv.addEventListener("dragover", (e) => {
      if (!editMode) return;
      e.preventDefault();
    });

    for (let i = 0; i < unrankedItems.length; i++) {
      const entry = unrankedItems[i];
      const cardEl = createCardElement(entry, type);
      cardsDiv.appendChild(cardEl);
      
      // Add drop zone after each card (except the last one) in edit mode
      if (editMode && i < unrankedItems.length - 1) {
        const dropZone = document.createElement("div");
        dropZone.className = "card-drop-zone";
        dropZone.dataset.insertBefore = unrankedItems[i + 1].name;
        dropZone.dataset.tier = "Unranked";
        dropZone.dataset.type = type;
        
        cardsDiv.appendChild(dropZone);
      }
    }

    row.appendChild(label);
    row.appendChild(cardsDiv);
    container.appendChild(row);
  }

  // In edit mode, show add-tier bar for hidden tiers and empty tiers
  if (editMode) {
    const addBar = document.createElement("div");
    addBar.className = "add-tier-bar";
    const lbl = document.createElement("span");
    lbl.textContent = "Add tier:";
    lbl.style.fontSize = "0.8rem";
    lbl.style.color = "var(--text-muted)";
    lbl.style.marginRight = "8px";
    addBar.appendChild(lbl);
    
    // Add buttons for hidden tiers
    for (const tier of TIER_ORDER) {
      if (hiddenTiers.has(tier)) {
        const btn = document.createElement("button");
        btn.className = `add-tier-btn tier-${tier.toLowerCase()}`;
        btn.textContent = `+ ${tier}`;
        btn.addEventListener("click", () => {
          hiddenTiers.delete(tier);
          rebuildCurrentView();
        });
        addBar.appendChild(btn);
      }
    }
    
    // Add buttons for empty tiers (tiers with no cards)
    for (const tier of TIER_ORDER) {
      if (!hiddenTiers.has(tier) && grouped.get(tier).length === 0 && !visibleEmptyTiers.has(tier)) {
        const btn = document.createElement("button");
        btn.className = `add-tier-btn tier-${tier.toLowerCase()}`;
        btn.textContent = `+ ${tier}`;
        btn.addEventListener("click", () => {
          visibleEmptyTiers.add(tier);
          rebuildCurrentView();
        });
        addBar.appendChild(btn);
      }
    }
    
    container.appendChild(addBar);
  }
}

function getFilteredFateEntries() {
  // Fate entries are grouped by index ranges: A 1-8, B 9-16, C 17-24 (1-based)
  if (!Array.isArray(fateEntries)) return [];
  const a = el.fateFilterA && el.fateFilterA.checked;
  const b = el.fateFilterB && el.fateFilterB.checked;
  const c = el.fateFilterC && el.fateFilterC.checked;
  if (a && b && c) return fateEntries;
  const res = [];
  for (let i = 0; i < fateEntries.length; i++) {
    const entry = fateEntries[i];
    let num = null;
    if (entry && entry.card && entry.card.id) {
      const m = String(entry.card.id).match(/(\d+)/);
      if (m) num = parseInt(m[1], 10);
    }
    // If we can parse a numeric id, use it to determine group; otherwise fall back to index order
    if (num !== null && !isNaN(num)) {
      if (num >= 1 && num <= 8 && a) res.push(entry);
      else if (num >= 9 && num <= 16 && b) res.push(entry);
      else if (num >= 17 && num <= 24 && c) res.push(entry);
    } else {
      const idx1 = i + 1;
      if (idx1 >= 1 && idx1 <= 8 && a) res.push(entry);
      else if (idx1 >= 9 && idx1 <= 16 && b) res.push(entry);
      else if (idx1 >= 17 && idx1 <= 24 && c) res.push(entry);
    }
  }
  return res;
}

function getFilteredCampaignLoresEntries() {
  if (!Array.isArray(campaignLoresEntries)) return [];
  const deck = el.loreFilterDeck && el.loreFilterDeck.checked;
  const fates = el.loreFilterFates && el.loreFilterFates.checked;
  if (deck && fates) return campaignLoresEntries;
  const res = [];
  for (const entry of campaignLoresEntries) {
    const card = entry.card;
    let isDeck = false;
    if (card && card.id) {
      const m = String(card.id).match(/ARCS-L0*(\d+)/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n >= 1 && n <= 28) isDeck = true;
      }
    }
    if (isDeck && deck) res.push(entry);
    else if (!isDeck && fates) res.push(entry);
  }
  return res;
}

function getFilteredGuildVoxEntries() {
  if (!Array.isArray(guildVoxEntries)) return [];
  // Guild is always included; only Vox has a toggle now
  const vox = el.guildFilterVox && el.guildFilterVox.checked;
  const mat = el.guildFilterMaterial && el.guildFilterMaterial.checked;
  const fuel = el.guildFilterFuel && el.guildFilterFuel.checked;
  const weap = el.guildFilterWeapon && el.guildFilterWeapon.checked;
  const relic = el.guildFilterRelic && el.guildFilterRelic.checked;
  const psionic = el.guildFilterPsionic && el.guildFilterPsionic.checked;

  // If Vox toggle is off, still show Guild entries; if Vox toggle is on, include Vox entries too

  const res = [];
  for (const entry of guildVoxEntries) {
    const card = entry.card;
    // If no card or tags, skip (can't determine role/type)
    const tags = Array.isArray(card && card.tags) ? card.tags : [];

    // Exclude by type if the corresponding checkbox is OFF
    if (!mat && tags.includes('Material')) continue;
    if (!fuel && tags.includes('Fuel')) continue;
    if (!weap && tags.includes('Weapon')) continue;
    if (!relic && tags.includes('Relic')) continue;
    if (!psionic && tags.includes('Psionic')) continue;

    const isGuild = tags.includes('Guild');
    const isVox = tags.includes('Vox');

    if (isGuild) res.push(entry);
    else if (isVox && vox) res.push(entry);
  }
  return res;
}

function createCardElement(entry, type) {
  const cardEl = document.createElement("div");
  cardEl.className = "personal-tier-card";
  cardEl.dataset.name = entry.name;

  const isLeaders = typeof type === 'string' && type.startsWith('leaders');
  const cardHeight = isLeaders ? 190 : 160;
  // give leaders a modifier class for CSS if needed
  if (isLeaders) cardEl.classList.add('personal-tier-card--leader');

  // Drag source
  cardEl.draggable = editMode;
  cardEl.addEventListener("dragstart", (e) => {
    if (!editMode) { e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", entry.name);
    e.dataTransfer.setData("application/x-type", type);
    // Remove opacity from original card immediately
    cardEl.style.opacity = "0";

    // Create drag preview
    dragPreviewElement = cardEl.cloneNode(true);
    dragPreviewElement.className = "personal-tier-card drag-preview";
    dragPreviewElement.style.position = "fixed";
    dragPreviewElement.style.pointerEvents = "none";
    dragPreviewElement.style.zIndex = "1000";
    dragPreviewElement.style.opacity = "0.7";
    dragPreviewElement.style.transform = "scale(0.95)";
    document.body.appendChild(dragPreviewElement);
  });
  cardEl.addEventListener("dragend", () => {
    // Restore opacity to original card
    cardEl.style.opacity = "";
    // Clean up drag preview
    if (dragPreviewElement && dragPreviewElement.parentNode) {
      dragPreviewElement.parentNode.removeChild(dragPreviewElement);
    }
    dragPreviewElement = null;
    // Clear any remaining shifted cards
    document.querySelectorAll('.personal-tier-card.shifted-right, .personal-tier-card.shifted-left').forEach(card => {
      card.classList.remove('shifted-right', 'shifted-left');
    });
  });
  
  // Touch drag support for mobile devices
  cardEl.addEventListener("touchstart", (e) => {
    if (!editMode) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchMoved = false;
    touchDraggedElement = cardEl;
    touchDraggedData = {
      name: entry.name,
      type: type
    };
    
    // Create visual clone for drag feedback
    touchDraggedClone = cardEl.cloneNode(true);
    touchDraggedClone.className = "personal-tier-card touch-drag-clone";
    touchDraggedClone.style.position = "fixed";
    touchDraggedClone.style.pointerEvents = "none";
    touchDraggedClone.style.zIndex = "1000";
    touchDraggedClone.style.opacity = "0.7";
    touchDraggedClone.style.transform = "rotate(5deg) scale(1.05)";
    touchDraggedClone.style.left = `${touchStartX - cardEl.offsetWidth / 2}px`;
    touchDraggedClone.style.top = `${touchStartY - cardEl.offsetHeight / 2}px`;
    document.body.appendChild(touchDraggedClone);
    
    // Prevent scrolling while touching
    e.preventDefault();
  }, { passive: false });
  
  cardEl.addEventListener("touchmove", (e) => {
    if (!editMode || !touchDraggedElement || !touchDraggedClone) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const deltaX = Math.abs(touchX - touchStartX);
    const deltaY = Math.abs(touchY - touchStartY);
    
    // Only start dragging if moved more than 10px (to distinguish from tap)
    if (deltaX > 10 || deltaY > 10) {
      touchMoved = true;
      
      // Move the clone to follow the finger
      touchDraggedClone.style.left = `${touchX - touchDraggedElement.offsetWidth / 2}px`;
      touchDraggedClone.style.top = `${touchY - touchDraggedElement.offsetHeight / 2}px`;
      
      // Find element under touch
      const elementAtPoint = document.elementFromPoint(touchX, touchY);
      if (elementAtPoint) {
        // Clear previous drag-over states
        document.querySelectorAll('.drag-over').forEach(el => {
          el.classList.remove('drag-over');
        });
        
        // Check if we're over a valid drop target
        const cardTarget = elementAtPoint.closest('.personal-tier-card');
        const dropZoneTarget = elementAtPoint.closest('.card-drop-zone');
        const tierTarget = elementAtPoint.closest('.personal-tier-cards');
        
        if (cardTarget && cardTarget !== touchDraggedElement) {
          cardTarget.classList.add('drag-over');
        } else if (dropZoneTarget) {
          dropZoneTarget.classList.add('drag-over');
        } else if (tierTarget) {
          tierTarget.classList.add('drag-over');
        }
      }
    }
    
    e.preventDefault();
  }, { passive: false });
  
  cardEl.addEventListener("touchend", (e) => {
    if (!editMode || !touchDraggedElement) return;
    
    // Clear drag-over states
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
    
    if (touchMoved && touchDraggedClone) {
      const touchX = e.changedTouches[0].clientX;
      const touchY = e.changedTouches[0].clientY;
      
      // Find element under touch end point
      const elementAtPoint = document.elementFromPoint(touchX, touchY);
      if (elementAtPoint) {
        const cardTarget = elementAtPoint.closest('.personal-tier-card');
        const dropZoneTarget = elementAtPoint.closest('.card-drop-zone');
        const tierTarget = elementAtPoint.closest('.personal-tier-cards');
        
        if (cardTarget && cardTarget !== touchDraggedElement) {
          // Drop on card - insert before it
          moveCard(touchDraggedData.name, cardTarget.closest('.personal-tier-cards').dataset.tier, touchDraggedData.type, cardTarget.dataset.name);
        } else if (dropZoneTarget) {
          // Drop on drop zone
          moveCard(touchDraggedData.name, dropZoneTarget.dataset.tier, touchDraggedData.type, dropZoneTarget.dataset.insertBefore);
        } else if (tierTarget) {
          // Drop on tier container - add to end
          moveCard(touchDraggedData.name, tierTarget.dataset.tier, touchDraggedData.type);
        }
      }
    }
    
    // Clean up clone
    if (touchDraggedClone && touchDraggedClone.parentNode) {
      touchDraggedClone.parentNode.removeChild(touchDraggedClone);
    }
    
    // Clean up
    touchDraggedElement = null;
    touchDraggedData = null;
    touchDraggedClone = null;
    touchMoved = false;
  });
  

  const imgUrl = entry.card ? getImageUrl(entry.card) : null;

  if (imgUrl) {
    const img = document.createElement("img");
    img.src = imgUrl;
    img.alt = entry.name;
    img.loading = "lazy";
    img.onerror = () => {
      img.style.display = "none";
      cardEl.style.background = "var(--bg-solid)";
      cardEl.style.display = "flex";
      cardEl.style.alignItems = "center";
      cardEl.style.justifyContent = "center";
      cardEl.style.padding = "8px";
      cardEl.style.height = `${cardHeight}px`;
      const fallback = document.createElement("span");
      fallback.style.color = "var(--text)";
      fallback.style.fontSize = "0.75rem";
      fallback.style.textAlign = "center";
      fallback.textContent = entry.name;
      cardEl.appendChild(fallback);
    };
    cardEl.appendChild(img);
  } else {
    cardEl.style.background = "var(--bg-solid)";
    cardEl.style.display = "flex";
    cardEl.style.alignItems = "center";
    cardEl.style.justifyContent = "center";
    cardEl.style.padding = "8px";
    cardEl.style.height = `${cardHeight}px`;
    const fallback = document.createElement("span");
    fallback.style.color = "var(--text)";
    fallback.style.fontSize = "0.75rem";
    fallback.style.textAlign = "center";
    fallback.textContent = entry.name;
    cardEl.appendChild(fallback);
  }

  const nameOverlay = document.createElement("div");
  nameOverlay.className = "personal-tier-card-name";
  nameOverlay.textContent = entry.name;
  cardEl.appendChild(nameOverlay);

  // Click behavior: open the card modal (when not editing) if card data exists.
  if (entry.card) {
    cardEl.addEventListener("click", () => {
      if (!editMode) openModal(entry.card);
    });
  }

  return cardEl;
}

// ========== Proximity-based Drag & Drop ==========

// Track current drag state
// Global dragover handler - track mouse position and show live preview
let dragMouseX = 0;
let dragMouseY = 0;
let dragPreviewElement = null;

document.addEventListener("dragover", (e) => {
  if (!editMode) return;

  dragMouseX = e.clientX;
  dragMouseY = e.clientY;

  // Create or update drag preview
  if (!dragPreviewElement) {
    const draggedCard = document.querySelector('.personal-tier-card[style*="opacity: 0"]');
    if (draggedCard) {
      dragPreviewElement = draggedCard.cloneNode(true);
      dragPreviewElement.className = "personal-tier-card drag-preview";
      dragPreviewElement.style.position = "fixed";
      dragPreviewElement.style.pointerEvents = "none";
      dragPreviewElement.style.zIndex = "1000";
      dragPreviewElement.style.opacity = "0.7";
      dragPreviewElement.style.transform = "scale(0.95)";
      document.body.appendChild(dragPreviewElement);
    }
  }

  // Update preview position and show card rearrangement
  updateDragPreview();

  e.preventDefault();
});

function updateDragPreview() {
  if (!dragPreviewElement) return;

  // Find the dragged card
  const draggedCard = document.querySelector('.personal-tier-card[style*="opacity: 0"]');
  if (!draggedCard) return;

  // Clear previous shifting
  document.querySelectorAll('.personal-tier-card.shifted-right, .personal-tier-card.shifted-left').forEach(card => {
    card.classList.remove('shifted-right', 'shifted-left');
  });

  // Clear previous empty tier preview
  document.querySelectorAll('.personal-tier-cards.preview-empty-tier').forEach(el => {
    el.classList.remove('preview-empty-tier');
  });
  document.querySelectorAll('.personal-tier-row.preview-empty-tier-row').forEach(el => {
    el.classList.remove('preview-empty-tier-row', 'preview-empty-tier-row-leaders');
  });
  // Clear any inline sizing added during preview
  document.querySelectorAll('.personal-tier-row').forEach(row => {
    row.style.minHeight = '';
  });

  // Calculate where the card would be inserted based on current mouse position
  let previewPosition = null;

  // Check all tier containers to find target position
  const allTierContainers = document.querySelectorAll('.personal-tier-cards');

  // Clear previous zone highlights
  document.querySelectorAll('.drag-zone-above, .drag-zone-end').forEach(el => el.classList.remove('drag-zone-above', 'drag-zone-end'));

  for (const container of allTierContainers) {
    const containerRect = container.getBoundingClientRect();

    // Check if mouse is within this container's bounds
    if (dragMouseX >= containerRect.left &&
        dragMouseY >= containerRect.top && dragMouseY <= containerRect.bottom) {

      const cardsInTargetTier = Array.from(container.querySelectorAll('.personal-tier-card'));

      let insertIndex = -1;
      let lastOverCard = -1;
      let lastOverSide = null;

      // Mouse is inside the container - normal logic

        // If this is an empty tier and mouse is over it, expand it for preview.
        // Use the container's type (target tier) to decide leader sizing so
        // dragging a Fate card onto a leaders tier expands it correctly.
        if (cardsInTargetTier.length === 0) {
          const containerType = container.dataset.type || '';
          const isLeaders = typeof containerType === 'string' && containerType.startsWith('leaders');
          container.classList.add('preview-empty-tier');
          container.parentElement.classList.add('preview-empty-tier-row');
          if (isLeaders) container.parentElement.classList.add('preview-empty-tier-row-leaders');
          // Determine card and tier sizing from container type so Fate tiers
          // expand to Fate card height and Leaders expand to leader height.
          const cardHeight = isLeaders ? 190 : 160; // match createCardElement sizing
          const tierMin = cardHeight + 10; // small padding for tier container
          container.parentElement.style.minHeight = `${tierMin}px`;
        }

        // Check each card to see if mouse is over it (including the dragged card's original position)
        for (let i = 0; i < cardsInTargetTier.length; i++) {
          const card = cardsInTargetTier[i];
          const cardRect = card.getBoundingClientRect();

          // Check if mouse is within this card's bounds
          if (dragMouseX >= cardRect.left && dragMouseX <= cardRect.right &&
              dragMouseY >= cardRect.top && dragMouseY <= cardRect.bottom) {

            // Mouse is over this card - determine left or right half
            const cardCenterX = cardRect.left + cardRect.width / 2;
            if (dragMouseX < cardCenterX) {
              // Left half - insert before this card
              insertIndex = i;
              lastOverCard = i;
              lastOverSide = 'left';
            } else {
              // Right half - normally insert after this card, but if this is
              // the dragged card's original position, move one position further left
              if (card === draggedCard) {
                insertIndex = Math.max(i, 0);
                lastOverCard = i;
                lastOverSide = 'right';
              } else {
                // If this is the last card, insert at end to allow dragging far right
                insertIndex = (i === cardsInTargetTier.length - 1) ? cardsInTargetTier.length : i + 1;
                lastOverCard = i;
                lastOverSide = 'right';
              }
            }
            break;
          }
        }

      // Calculate draggedCardIndex
      let draggedCardIndex = -1;
      for (let i = 0; i < cardsInTargetTier.length; i++) {
        if (cardsInTargetTier[i] === draggedCard) {
          draggedCardIndex = i;
          break;
        }
      }

      // Special case: if hovering over right side of 3rd rightmost card and card started at end, set to final
      if (cardsInTargetTier.length >= 3 && lastOverCard === cardsInTargetTier.length - 3 && lastOverSide === 'right' && draggedCardIndex === cardsInTargetTier.length - 1) {
        insertIndex = cardsInTargetTier.length;
      }

      // If not over any visible card, check if mouse is over the dragged card's original position
      // or the left side of the adjacent card to the right
      if (insertIndex === -1) {
        const draggedCardIndex = cardsInTargetTier.indexOf(draggedCard);
        if (draggedCardIndex !== -1) {
          let originalGapLeft, originalGapRight, originalGapTop, originalGapBottom;

          if (draggedCardIndex === 0) {
            // Original position was at the beginning
            if (cardsInTargetTier.length > 1) {
              const firstCardRect = cardsInTargetTier[1].getBoundingClientRect(); // Next card is now at index 1
              originalGapLeft = containerRect.left;
              originalGapRight = firstCardRect.left;
              originalGapTop = firstCardRect.top;
              originalGapBottom = firstCardRect.bottom;
            } else {
              // Only card in tier
              originalGapLeft = containerRect.left;
              originalGapRight = containerRect.right;
              originalGapTop = containerRect.top;
              originalGapBottom = containerRect.bottom;
            }
          } else if (draggedCardIndex === cardsInTargetTier.length - 1) {
            // Original position was at the end
            const lastVisibleCardRect = cardsInTargetTier[draggedCardIndex - 1].getBoundingClientRect();
            originalGapLeft = lastVisibleCardRect.right;
            originalGapRight = containerRect.right;
            originalGapTop = lastVisibleCardRect.top;
            originalGapBottom = lastVisibleCardRect.bottom;
          } else {
            // Original position was in the middle
            const prevCardRect = cardsInTargetTier[draggedCardIndex - 1].getBoundingClientRect();
            const nextCardRect = cardsInTargetTier[draggedCardIndex + 1].getBoundingClientRect();
            originalGapLeft = prevCardRect.right;
            originalGapRight = nextCardRect.left;
            originalGapTop = Math.min(prevCardRect.top, nextCardRect.top);
            originalGapBottom = Math.max(prevCardRect.bottom, nextCardRect.bottom);
          }

          // Check if mouse is in the original gap
          if (dragMouseX >= originalGapLeft && dragMouseX <= originalGapRight &&
              dragMouseY >= originalGapTop && dragMouseY <= originalGapBottom) {
            // Check if mouse is in left or right half of the gap
            const gapCenterX = originalGapLeft + (originalGapRight - originalGapLeft) / 2;
            if (dragMouseX < gapCenterX || draggedCardIndex === 0) {
              // Left half or beginning position - insert at original position
              insertIndex = draggedCardIndex ;
            } else {
              // Right half - insert one position to the left
              insertIndex = draggedCardIndex;
            }
          }
        } else {
          // Check if mouse is over the left side of the card immediately to the right of the original position
          // Only apply this special case if the dragged card was not originally at the end of the tier
          const draggedCardIndex = cardsInTargetTier.indexOf(draggedCard);
          if (draggedCardIndex !== -1 && draggedCardIndex + 1 < cardsInTargetTier.length && draggedCardIndex < cardsInTargetTier.length - 1) {
            const nextCard = cardsInTargetTier[draggedCardIndex + 1];
            const nextCardRect = nextCard.getBoundingClientRect();
            if (dragMouseX >= nextCardRect.left && dragMouseX <= nextCardRect.left + nextCardRect.width / 2 &&
                dragMouseY >= nextCardRect.top && dragMouseY <= nextCardRect.bottom) {
              // Mouse is over the left side of the next card - insert one position to the left of original
              insertIndex = draggedCardIndex - 1;
            }
          }
        }
      }

      // If still no insertIndex, check gaps between cards
      if (insertIndex === -1) {
        for (let i = 0; i <= cardsInTargetTier.length; i++) {
          let gapLeft, gapRight, gapTop, gapBottom;

          if (i === 0) {
            // Gap before first card
            if (cardsInTargetTier.length > 0) {
              const firstCardRect = cardsInTargetTier[0].getBoundingClientRect();
              gapLeft = containerRect.left;
              gapRight = firstCardRect.left;
              gapTop = firstCardRect.top;
              gapBottom = firstCardRect.bottom;
              insertIndex = 0;
            } else {
              // Empty tier
              insertIndex = 0;
            }
          } else if (i === cardsInTargetTier.length) {
            // Gap after last card
            const lastCardRect = cardsInTargetTier[cardsInTargetTier.length - 1].getBoundingClientRect();
            gapLeft = lastCardRect.right;
            gapRight = containerRect.right;
            gapTop = lastCardRect.top;
            gapBottom = lastCardRect.bottom;
            insertIndex = cardsInTargetTier.length;
          } else {
            // Gap between cards
            const prevCardRect = cardsInTargetTier[i - 1].getBoundingClientRect();
            const nextCardRect = cardsInTargetTier[i].getBoundingClientRect();
            gapLeft = prevCardRect.right;
            gapRight = nextCardRect.left;
            gapTop = Math.min(prevCardRect.top, nextCardRect.top);
            gapBottom = Math.max(prevCardRect.bottom, nextCardRect.bottom);
            insertIndex = i;
          }

          // Check if mouse is in this gap
          if (dragMouseX >= gapLeft && dragMouseX <= gapRight &&
              dragMouseY >= gapTop && dragMouseY <= gapBottom) {
            break;
          }
        }
      }

      // Calculate preview position based on insert index
      if (insertIndex !== -1) {
        // If the computed insertIndex would place the card after the card
        // that is immediately after the original card, and the original
        // card was the lower index (draggedCardIndex === insertIndex - 1),
        // move the insertion one position left so it lands at the original
        // card's index instead. This handles the case when pointer moves
        // from the right-half of the original card to the left-half of
        // the next card (user requested behavior).
        if (draggedCardIndex !== -1 && insertIndex !== -1 && draggedCardIndex === insertIndex - 1 && draggedCardIndex !== cardsInTargetTier.length - 1) {
          const oldIndex = insertIndex;
          insertIndex = Math.max(0, insertIndex - 1);
          console.log(`[drag-debug] adjusted insertIndex ${oldIndex} -> ${insertIndex} because original card was lower index`);
        }

        if (draggedCardIndex !== -1 && draggedCardIndex === insertIndex) {
          // Dragged card is being placed back in its original position
          if (draggedCardIndex === cardsInTargetTier.length - 1) {
            // Card was at the end - position after the last visible card
            const lastVisibleCardRect = cardsInTargetTier[draggedCardIndex - 1].getBoundingClientRect();
            previewPosition = {
              left: lastVisibleCardRect.right + 2,
              top: lastVisibleCardRect.top
            };
          } else {
            // Card was not at the end - use its original position
            const draggedCardRect = draggedCard.getBoundingClientRect();
            previewPosition = {
              left: draggedCardRect.left,
              top: draggedCardRect.top
            };
          }
        } else if (cardsInTargetTier.length === 0) {
          // Empty tier - center the preview card vertically.
          // Determine sizing from the target container type (not active tab)
          const containerType = container.dataset.type || '';
          const isLeaders = typeof containerType === 'string' && containerType.startsWith('leaders');
          const cardHeight = isLeaders ? 190 : 160; // approximate card height
          const tierHeight = isLeaders ? 200 : 172;
          const centeredTop = containerRect.top + (tierHeight - cardHeight) / 2;
          previewPosition = {
            left: containerRect.left + 6,
            top: centeredTop
          };
        } else if (insertIndex === 0) {
          // Insert at beginning
          previewPosition = {
            left: containerRect.left + 6,
            top: containerRect.top + 6
          };
        } else if (insertIndex >= cardsInTargetTier.length) {
          // Insert at end
          const lastCardRect = cardsInTargetTier[cardsInTargetTier.length - 1].getBoundingClientRect();
          previewPosition = {
            left: lastCardRect.right + 2,
            top: lastCardRect.top
          };
        } else {
          // Insert between cards
          const prevCardRect = cardsInTargetTier[insertIndex - 1].getBoundingClientRect();
          const nextCardRect = cardsInTargetTier[insertIndex].getBoundingClientRect();
          previewPosition = {
            left: prevCardRect.right + 2,
            top: prevCardRect.top
          };
        }

        // Shift cards based on where the dragged card would be inserted
        // Debug: report where the dragged card would be placed, which card is nearest,
        // whether it's on the left/right side of that card, and if it's over the original card
        try {
          const cardName = draggedCard && draggedCard.dataset && draggedCard.dataset.name ? draggedCard.dataset.name : '<unknown>';
          const targetTier = container && container.dataset ? container.dataset.tier : '<unknown>';
          let overCardName = null;
          let overSide = null;
          if (cardsInTargetTier.length > 0) {
            let overEl = null;
            if (insertIndex === 0) {
              overEl = cardsInTargetTier[0];
            } else if (insertIndex >= cardsInTargetTier.length) {
              overEl = cardsInTargetTier[cardsInTargetTier.length - 1];
            } else {
              overEl = cardsInTargetTier[insertIndex];
            }
            if (overEl) {
              overCardName = overEl.dataset ? overEl.dataset.name : null;
              const overRect = overEl.getBoundingClientRect();
              const overCenter = overRect.left + overRect.width / 2;
              overSide = (dragMouseX < overCenter) ? 'left' : 'right';
            }
          }

          let onOriginal = false;
          if (draggedCard) {
            const origRect = draggedCard.getBoundingClientRect();
            onOriginal = (dragMouseX >= origRect.left && dragMouseX <= origRect.right && dragMouseY >= origRect.top && dragMouseY <= origRect.bottom);
          }

          let leftOfOriginal = false;
          if (draggedCard) {
            const origRect = draggedCard.getBoundingClientRect();
            leftOfOriginal = dragMouseX < origRect.left;
          }

          console.log(`[drag-debug] card="${cardName}" targetTier="${targetTier}" insertIndex=${insertIndex} overCard="${overCardName}" overSide=${overSide} onOriginal=${onOriginal} leftOfOriginal=${leftOfOriginal}`);
        } catch (err) {
          console.log('[drag-debug] failed to read drag state', err);
        }

        for (let i = 0; i < cardsInTargetTier.length; i++) {
          const card = cardsInTargetTier[i];
          if (card === draggedCard) continue;

          if (draggedCardIndex !== -1 && draggedCardIndex < insertIndex) {
            // Dragged card is moving right, so cards between old and new position shift left
            if (i > draggedCardIndex && i < insertIndex) {
              card.classList.add('shifted-left');
            }
          } else if (draggedCardIndex !== -1 && draggedCardIndex > insertIndex) {
            // Dragged card is moving left, so cards between new and old position shift right
            if (i >= insertIndex && i < draggedCardIndex) {
              card.classList.add('shifted-right');
            }
          } else if (draggedCardIndex === -1) {
            // Dragged card is moving to this tier from another tier
            if (i >= insertIndex) {
              card.classList.add('shifted-right');
            }
          }
        }
      }

      // Highlight zones for debugging

      break; // Found the target tier, stop checking others
    }
  }

  // Position preview at the calculated insertion spot
  if (previewPosition) {
    dragPreviewElement.style.left = `${previewPosition.left}px`;
    dragPreviewElement.style.top = `${previewPosition.top}px`;
    dragPreviewElement.style.display = "block";
  } else {
    dragPreviewElement.style.display = "none";
  }
}

// Global drop handler
document.addEventListener("drop", (e) => {
  if (!editMode) return;

  e.preventDefault();
  const cardName = e.dataTransfer.getData("text/plain");
  const srcType = e.dataTransfer.getData("application/x-type");

  // Check if dropping directly on the original card (which is invisible)
  const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
  const originalCard = document.querySelector(`.personal-tier-card[data-name="${cardName}"]`);
  if (elementAtPoint === originalCard) {
    // Dropped directly on the original invisible card - don't move
    // Clean up visual effects
    if (dragPreviewElement && dragPreviewElement.parentNode) {
      dragPreviewElement.parentNode.removeChild(dragPreviewElement);
    }
    dragPreviewElement = null;
    document.querySelectorAll('.personal-tier-card.shifted-right, .personal-tier-card.shifted-left').forEach(card => {
      card.classList.remove('shifted-right', 'shifted-left');
    });
    return;
  }

  // Clean up visual effects first
  if (dragPreviewElement && dragPreviewElement.parentNode) {
    dragPreviewElement.parentNode.removeChild(dragPreviewElement);
  }
  dragPreviewElement = null;
  document.querySelectorAll('.personal-tier-card.shifted-right, .personal-tier-card.shifted-left').forEach(card => {
    card.classList.remove('shifted-right', 'shifted-left');
  });

  // Find the tier container that contains the dragged card
  const draggedCard = document.querySelector(`.personal-tier-card[data-name="${cardName}"]`);
  if (!draggedCard) return;

  const tierContainer = draggedCard.closest('.personal-tier-cards');
  if (!tierContainer) return;

  // Get all cards in this tier
  const cardsInTier = Array.from(tierContainer.querySelectorAll('.personal-tier-card'));
  const tierRect = tierContainer.getBoundingClientRect();

  // Find insertion position based on mouse position (center of dragged card)
  let insertBefore = null;
  let targetTier = tierContainer.dataset.tier;
  let foundPosition = false;

  // Check all tier containers to see if mouse is over a different tier
  const allTierContainers = document.querySelectorAll('.personal-tier-cards');
  for (const container of allTierContainers) {
    const containerRect = container.getBoundingClientRect();

    // Check if mouse is within this container's bounds
    if (dragMouseX >= containerRect.left && dragMouseX <= containerRect.right &&
        dragMouseY >= containerRect.top && dragMouseY <= containerRect.bottom) {

      targetTier = container.dataset.tier;
      const cardsInTargetTier = Array.from(container.querySelectorAll('.personal-tier-card'));

      // If dropping in the same tier as the dragged card, check original position first
      const draggedCardTier = draggedCard.dataset.tier;
      if (targetTier === draggedCardTier) {
        const draggedCardIndex = cardsInTargetTier.indexOf(draggedCard);
        if (draggedCardIndex !== -1) {
          let originalGapLeft, originalGapRight, originalGapTop, originalGapBottom;

          if (draggedCardIndex === 0) {
            // Original position was at the beginning
            if (cardsInTargetTier.length > 1) {
              const firstCardRect = cardsInTargetTier[1].getBoundingClientRect();
              originalGapLeft = containerRect.left;
              originalGapRight = firstCardRect.left;
              originalGapTop = firstCardRect.top;
              originalGapBottom = firstCardRect.bottom;
            } else {
              // Only card in tier
              originalGapLeft = containerRect.left;
              originalGapRight = containerRect.right;
              originalGapTop = containerRect.top;
              originalGapBottom = containerRect.bottom;
            }
          } else if (draggedCardIndex === cardsInTargetTier.length - 1) {
            // Original position was at the end
            const lastVisibleCardRect = cardsInTargetTier[draggedCardIndex - 1].getBoundingClientRect();
            originalGapLeft = lastVisibleCardRect.right;
            originalGapRight = containerRect.right;
            originalGapTop = lastVisibleCardRect.top;
            originalGapBottom = lastVisibleCardRect.bottom;
          } else {
            // Original position was in the middle
            const prevCardRect = cardsInTargetTier[draggedCardIndex - 1].getBoundingClientRect();
            const nextCardRect = cardsInTargetTier[draggedCardIndex + 1].getBoundingClientRect();
            originalGapLeft = prevCardRect.right;
            originalGapRight = nextCardRect.left;
            originalGapTop = Math.min(prevCardRect.top, nextCardRect.top);
            originalGapBottom = Math.max(prevCardRect.bottom, nextCardRect.bottom);
          }

          // Check if mouse is in the original gap
          if (dragMouseX >= originalGapLeft && dragMouseX <= originalGapRight &&
              dragMouseY >= originalGapTop && dragMouseY <= originalGapBottom) {
            document.title = "My Tier List - ingap";
            // Check if mouse is in left or right half of the gap
            const gapCenterX = originalGapLeft + (originalGapRight - originalGapLeft) / 2;
            if (dragMouseX < gapCenterX || draggedCardIndex === 0) {
              // Left half or beginning position - insert at original position
              insertBefore = draggedCard.dataset.name;
              document.title = "My Tier List - lefthalf";
            } else {
              // Right half - insert one position to the left
              const leftIndex = draggedCardIndex - 1;
              insertBefore = leftIndex >= 0 ? cardsInTargetTier[leftIndex].dataset.name : null;
              document.title = "My Tier List - righthalf";
            }
            foundPosition = true;
          }
        }
      }

      // Check each card in the target tier to see if mouse is over it
      if (!foundPosition) {
        for (let i = 0; i < cardsInTargetTier.length; i++) {
          const card = cardsInTargetTier[i];
          if (card === draggedCard) continue; // Skip the dragged card itself

          const cardRect = card.getBoundingClientRect();

        // Check if mouse is within this card's bounds
        if (dragMouseX >= cardRect.left && dragMouseX <= cardRect.right &&
            dragMouseY >= cardRect.top && dragMouseY <= cardRect.bottom) {

          // Mouse is over this card - determine left or right half
          const cardCenterX = cardRect.left + cardRect.width / 2;
          if (dragMouseX < cardCenterX) {
            // Left half - insert before this card
            insertBefore = card.dataset.name;
          } else {
            // Right half - insert after this card
            if (i < cardsInTargetTier.length - 1) {
              insertBefore = cardsInTargetTier[i + 1].dataset.name;
            } else {
              insertBefore = null; // Insert at end
            }
          }
          foundPosition = true;
          break;
        }
      }
    }

      // If not over any card, check gaps between cards in target tier
      if (!foundPosition) {
        for (let i = 0; i <= cardsInTargetTier.length; i++) {
          let gapLeft, gapRight, gapTop, gapBottom;

          if (i === 0) {
            // Gap before first card
            if (cardsInTargetTier.length > 0) {
              const firstCardRect = cardsInTargetTier[0].getBoundingClientRect();
              gapLeft = containerRect.left;
              gapRight = firstCardRect.left;
              gapTop = firstCardRect.top;
              gapBottom = firstCardRect.bottom;
              insertBefore = cardsInTargetTier[0].dataset.name;
            } else {
              // Empty tier
              gapLeft = containerRect.left;
              gapRight = containerRect.right;
              gapTop = containerRect.top;
              gapBottom = containerRect.bottom;
              insertBefore = null;
            }
          } else if (i === cardsInTargetTier.length) {
            // Gap after last card
            const lastCardRect = cardsInTargetTier[cardsInTargetTier.length - 1].getBoundingClientRect();
            gapLeft = lastCardRect.right;
            gapRight = containerRect.right;
            gapTop = lastCardRect.top;
            gapBottom = lastCardRect.bottom;
            insertBefore = null; // Insert at end
          } else {
            // Gap between cards
            const prevCardRect = cardsInTargetTier[i - 1].getBoundingClientRect();
            const nextCardRect = cardsInTargetTier[i].getBoundingClientRect();
            gapLeft = prevCardRect.right;
            gapRight = nextCardRect.left;
            gapTop = Math.min(prevCardRect.top, nextCardRect.top);
            gapBottom = Math.max(prevCardRect.bottom, nextCardRect.bottom);
            insertBefore = cardsInTargetTier[i].dataset.name;
          }

          // Check if mouse is in this gap
          if (dragMouseX >= gapLeft && dragMouseX <= gapRight &&
              dragMouseY >= gapTop && dragMouseY <= gapBottom) {
            foundPosition = true;
            break;
          }
        }
      }

      break; // Found the target tier, stop checking others
    }
  }

  // If we found a valid position, move the card
  if (foundPosition) {
    moveCard(cardName, targetTier, srcType, insertBefore);
  }
  // If no valid position found, card stays in its current position
});

function moveCard(name, newTier, type, insertBefore = null) {
  // Normalize type to include leader subtab when applicable
  let typeKey = type;
  if (type && type.startsWith('leaders') && !type.includes('-')) {
    typeKey = `leaders-${currentLeaderTab}`;
  }

  let entries = null;
  if (typeKey === 'leaders-3p') entries = leaderEntries3P;
  else if (typeKey === 'leaders-4p') entries = leaderEntries4P;
  else if (typeKey === 'lore') entries = loreEntries;
  else if (typeKey === 'basecourt') entries = basecourtEntries;
  else if (typeKey === 'fate') entries = fateEntries;
  else if (typeKey === 'campaign-lores') entries = campaignLoresEntries;
  else if (typeKey === 'campaign-guildvox' || typeKey === 'campaign-guild-vox') entries = guildVoxEntries;
  const entryIndex = entries.findIndex((e) => e.name === name);
  if (entryIndex === -1) return;
  
  const entry = entries[entryIndex];
  const oldTier = entry.tier;
  
  // Remove from current position
  entries.splice(entryIndex, 1);
  
  // If the old tier is now empty, keep it visible as an empty tier (per-type)
  const oldTierStillHasCards = entries.some(e => e.tier === oldTier);
  const visibleEmptyTiers = getVisibleEmptyTiers(typeKey);
  if (!oldTierStillHasCards && !visibleEmptyTiers.has(oldTier)) {
    visibleEmptyTiers.add(oldTier);
  }
  
  // Determine insertion position
  let insertIndex;
  
  if (insertBefore !== null) {
    // Specific position requested - find it regardless of tier
    const targetIndex = entries.findIndex((e) => e.name === insertBefore);
    if (targetIndex !== -1) {
      insertIndex = targetIndex;
      // Update tier to match the tier of the card we're inserting before
      entry.tier = entries[targetIndex].tier;
    } else {
      // insertBefore not found, insert at end of requested tier
      entry.tier = newTier;
      insertIndex = entries.length;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].tier === newTier) {
          insertIndex = i + 1;
          break;
        }
      }
    }
  } else {
    // No specific position - add to end of new tier
    entry.tier = newTier;
    insertIndex = entries.length;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].tier === newTier) {
        insertIndex = i + 1;
        break;
      }
    }
  }
  
  // Insert at the determined position
  entries.splice(insertIndex, 0, entry);
  
  // Remove dragging class from any elements before rebuilding view
  document.querySelectorAll('.personal-tier-card.dragging').forEach(el => {
    el.classList.remove('dragging');
  });
  
  rebuildCurrentView();
}

function removeTier(tier) {
  // Determine active main tab and subtab to scope the removal
  const activeTabEl = Array.from(el.tabs).find(tab => tab.classList.contains('active'));
  const activeTab = activeTabEl ? activeTabEl.dataset.tab : 'leaders';
  const activeSubEl = Array.from(el.subTabs).find(subTab => subTab.classList.contains('active'));
  const activeSub = activeSubEl ? activeSubEl.dataset.subtab : null;

  // Pick entries for this active section
  let entries = null;
  if (activeTab === 'leaders') entries = (activeSub === '3p' ? leaderEntries3P : leaderEntries4P);
  else if (activeTab === 'lore') entries = loreEntries;
  else if (activeTab === 'basecourt') entries = basecourtEntries;
  else if (activeTab === 'fate') entries = fateEntries;
  else if (activeTab === 'campaign') {
    const activeCamp = Array.from(el.campaignSubTabsButtons).find(b => b.classList.contains('active'));
    const camp = activeCamp ? activeCamp.dataset.subtab : 'fate';
    if (camp === 'lores') entries = campaignLoresEntries;
    else if (camp === 'guildvox') entries = guildVoxEntries;
    else entries = fateEntries;
  }

  let activeKey = activeTab;
  if (activeTab === 'leaders') {
    activeKey = activeSub ? `leaders-${activeSub}` : `leaders-${currentLeaderTab}`;
  }
  if (activeTab === 'campaign') {
    const activeCamp = Array.from(el.campaignSubTabsButtons).find(b => b.classList.contains('active'));
    const camp = activeCamp ? activeCamp.dataset.subtab : 'fate';
    activeKey = camp === 'lores' ? 'campaign-lores' : (camp === 'guildvox' ? 'campaign-guildvox' : 'fate');
  }
  const visibleEmptyTiers = getVisibleEmptyTiers(activeKey);
  const hiddenTiers = getHiddenTiers(activeKey);

  const hasCards = entries ? entries.some(e => e.tier === tier) : false;

  if (!hasCards && visibleEmptyTiers.has(tier)) {
    // This is a visible empty tier, just remove it from visible set
    visibleEmptyTiers.delete(tier);
    rebuildCurrentView();
    return;
  }

  // Normal tier removal: move cards and hide tier (only within this section)
  // Consider only tiers that are actually displayed in this section: not hidden
  // AND either have cards or are explicitly visible-empty (in edit mode).
  const visibleTiers = TIER_ORDER.filter((t) => {
    if (t === tier) return false;
    if (hiddenTiers.has(t)) return false;
    const hasCardsInTier = entries ? entries.some(e => e.tier === t) : false;
    const explicitlyVisibleEmpty = editMode && visibleEmptyTiers.has(t);
    return hasCardsInTier || explicitlyVisibleEmpty;
  });

  const tierIdx = TIER_ORDER.indexOf(tier);
  // Pick the next lower visible tier (index > tierIdx). If none, move to Unranked.
  let target = visibleTiers.find((t) => TIER_ORDER.indexOf(t) > tierIdx);
  if (!target) target = "Unranked";

  if (entries) {
    // Collect cards from the removed tier in their current order and remove them
    const toMove = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].tier === tier) {
        toMove.unshift(entries[i]);
        entries.splice(i, 1);
      }
    }

    if (toMove.length > 0) {
      // Set moved entries' tier to the target
      for (const m of toMove) m.tier = target;

      // Rebuild entries grouped by tier order to ensure moved cards are placed
      // at the end of the target tier while preserving relative order.
      const buckets = new Map();
      for (const t of [...TIER_ORDER, "Unranked"]) buckets.set(t, []);
      for (const e of entries) {
        const tierVal = (typeof e.tier === 'string' && e.tier.trim().length) ? e.tier : "Unranked";
        const key = TIER_ORDER.includes(tierVal) ? tierVal : (tierVal === "Unranked" ? "Unranked" : "D");
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(e);
      }

      // Insert moved cards into the target bucket (append to end)
      if (!buckets.has(target)) buckets.set(target, []);
      buckets.get(target).push(...toMove);

      // Flatten buckets back into entries in TIER_ORDER order, then Unranked
      const newEntries = [];
      for (const t of TIER_ORDER) {
        const arr = buckets.get(t) || [];
        newEntries.push(...arr);
      }
      newEntries.push(...(buckets.get("Unranked") || []));

      // Replace entries contents in-place
      entries.length = 0;
      entries.push(...newEntries);
    }
  }

  hiddenTiers.add(tier);
  rebuildCurrentView();
}

function rebuildCurrentView() {
  buildTierListHTML(leaderEntries3P, el.leaders3pTierList, "leaders-3p", "3P Leaders");
  buildTierListHTML(leaderEntries4P, el.leaders4pTierList, "leaders-4p", "4P Leaders");
  buildTierListHTML(loreEntries, el.loreTierList, "lore");
  buildTierListHTML(getFilteredFateEntries(), el.fateTierList, "fate", "Fates");
  buildTierListHTML(basecourtEntries, el.basecourtTierList, "basecourt");
  buildTierListHTML(getFilteredCampaignLoresEntries(), el.campaignLoresTierList, "campaign-lores", "Lore");
  buildTierListHTML(getFilteredGuildVoxEntries(), el.campaignGuildVoxTierList, "campaign-guildvox", "Guild & Vox");
}

// ========== Edit Mode ==========
function toggleEditMode() {
  editMode = !editMode;
  document.body.classList.toggle("edit-mode", editMode);
  el.editBtn.textContent = editMode ? "✅ Done" : "Edit";
  el.clearBtn.style.display = editMode ? "" : "none";
  // Clear visible empty tiers when entering edit mode
  if (editMode) {
    // Clear visible empty tiers for the currently active main tab only
    const activeTabEl = Array.from(el.tabs).find(tab => tab.classList.contains('active'));
    const activeTab = activeTabEl ? activeTabEl.dataset.tab : 'leaders';
    const activeSubEl = Array.from(el.subTabs).find(subTab => subTab.classList.contains('active'));
    const activeSub = activeSubEl ? activeSubEl.dataset.subtab : null;
    let activeKey = activeTab;
    if (activeKey === 'leaders') activeKey = activeSub ? `leaders-${activeSub}` : `leaders-${currentLeaderTab}`;
    if (activeKey === 'campaign') {
      const campActive = Array.from(el.campaignSubTabsButtons).find(b => b.classList.contains('active'));
      const campSub = campActive ? campActive.dataset.subtab : 'fate';
      activeKey = campSub === 'lores' ? 'campaign-lores' : (campSub === 'guildvox' ? 'campaign-guildvox' : 'fate');
    }

    const visibleEmpty = getVisibleEmptyTiers(activeKey);
    visibleEmpty.clear();

    // If this section has no entries at all, auto-show S through D tiers for quick setup
    let entries = null;
    const activeSubFinal = activeSub || currentLeaderTab;
    if (activeTab === 'leaders') entries = (activeSubFinal === '3p' ? leaderEntries3P : leaderEntries4P);
    else if (activeTab === 'lore') entries = loreEntries;
    else if (activeTab === 'basecourt') entries = basecourtEntries;
    else if (activeTab === 'fate') entries = fateEntries;
    else if (activeTab === 'campaign') {
      const campActive = Array.from(el.campaignSubTabsButtons).find(b => b.classList.contains('active'));
      const campSub = campActive ? campActive.dataset.subtab : 'fate';
      if (campSub === 'lores') entries = campaignLoresEntries;
      else if (campSub === 'guildvox') entries = guildVoxEntries;
      else entries = fateEntries;
    }

    // Treat a section as empty if it has no entries or only Unranked entries
    const hasNonUnranked = entries && entries.some(e => (e.tier || '').toUpperCase() !== 'UNRANKED');
    if (!entries || entries.length === 0 || !hasNonUnranked) {
      const autoTiers = ['S', 'A', 'B', 'C', 'D'];
      for (const t of autoTiers) visibleEmpty.add(t);
    }
  }
  rebuildCurrentView();
}

async function loadCardsFromYAML(type) {
  // Use already loaded cards if available, otherwise load them
  let cards = allCards;
  if (cards.length === 0) {
    const text = await fetchText(CONFIG.cardsYamlUrl);
    const loadedCards = yaml.load(text);
    if (!Array.isArray(loadedCards)) throw new Error("Invalid YAML format");
    cards = loadedCards.map((c) => ({
      id: c.id ?? null,
      name: c.name ?? "",
      image: c.image ?? null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      text: c.text ?? "",
    }));
  }
  
  // Filter cards by type
  let filteredCards;
  if (type === 'leaders') {
    filteredCards = cards.filter(card => card.tags && card.tags.includes('Leader'));
  } else if (type === 'lore') {
    filteredCards = cards.filter(card => card.tags && card.tags.includes('Lore'));
  } else if (type === 'basecourt') {
    filteredCards = cards.filter(card => card.tags && card.tags.includes('Base Court'));
  }
  
  // Sort by ID number (extract number from ID like ARCS-L01 -> 1, ARCS-LEAD01 -> 1, ARCS-BC01 -> 1)
  filteredCards.sort((a, b) => {
    const aMatch = a.id && a.id.match(/ARCS-(?:L|LEAD|BC)(\d+)/);
    const bMatch = b.id && b.id.match(/ARCS-(?:L|LEAD|BC)(\d+)/);
    const aNum = aMatch ? parseInt(aMatch[1]) : 0;
    const bNum = bMatch ? parseInt(bMatch[1]) : 0;
    return aNum - bNum;
  });
  
  return filteredCards;
}

function clearTierList() {
  // Determine which section is currently visible
  const activeTab = Array.from(el.tabs).find(tab => tab.classList.contains('active'));
  const activeSubTab = Array.from(el.subTabs).find(subTab => subTab.classList.contains('active'));
  
  let targetType, targetEntries;
  if (activeTab.dataset.tab === 'leaders') {
    targetType = 'leaders';
    if (activeSubTab.dataset.subtab === '3p') {
      targetEntries = leaderEntries3P;
    } else {
      targetEntries = leaderEntries4P;
    }
  } else if (activeTab.dataset.tab === 'lore') {
    targetType = 'lore';
    targetEntries = loreEntries;
  } else if (activeTab.dataset.tab === 'basecourt') {
    targetType = 'basecourt';
    targetEntries = basecourtEntries;
  } else if (activeTab.dataset.tab === 'campaign') {
    // Determine which campaign subtab is active
    const activeCamp = Array.from(el.campaignSubTabsButtons).find(b => b.classList.contains('active'));
    const camp = activeCamp ? activeCamp.dataset.subtab : 'fate';
    if (camp === 'lores') {
      targetType = 'campaign-lores';
      // Load base YAML lores
      loadCardsFromYAML('lore').then(cards => {
        campaignLoresEntries.length = 0;
        for (const c of cards) campaignLoresEntries.push({ name: c.name, tier: 'Unranked', card: c });
        // reset visible/hidden tiers for this section
        const activeMainKey = 'campaign-lores';
        const visEmpty = getVisibleEmptyTiers(activeMainKey);
        const hid = getHiddenTiers(activeMainKey);
        visEmpty.clear(); hid.clear();
        for (const t of ["S","A","B","C","D"]) visEmpty.add(t);
        for (const t of ["SSS","SS","F"]) hid.add(t);
        rebuildCurrentView();
      });
      return;
    } else if (camp === 'fate') {
      targetType = 'fate';
      // Rebuild Fate entries from loaded cards (expansion + base merged into allCards)
      fateEntries.length = 0;
      const seenF = new Set();
      const foundFates = (allCards || []).filter(c => Array.isArray(c.tags) && c.tags.includes('Fate'))
        .filter(c => {
          const key = normalizeText(c.name);
          if (seenF.has(key)) return false; seenF.add(key); return true;
        });
      for (const c of foundFates) fateEntries.push({ name: c.name, tier: 'Unranked', card: c });
      // reset visible/hidden tiers for this section
      const activeMainKeyF = 'fate';
      const visEmptyF = getVisibleEmptyTiers(activeMainKeyF);
      const hidF = getHiddenTiers(activeMainKeyF);
      visEmptyF.clear(); hidF.clear();
      for (const t of ["S","A","B","C","D"]) visEmptyF.add(t);
      for (const t of ["SSS","SS","F"]) hidF.add(t);
      rebuildCurrentView();
      return;
    } else if (camp === 'guildvox') {
      targetType = 'campaign-guildvox';
      // Derive from blightedReachRaw and attach the Blighted Reach card objects (do NOT fall back to base/allCards)
      guildVoxEntries.length = 0;
      const seen = new Set();
      const found = (blightedReachRaw || []).filter(c => Array.isArray(c.tags) && (c.tags.includes('Guild') || c.tags.includes('Vox')))
        .filter(c => {
          const key = normalizeText(c.name);
          if (seen.has(key)) return false; seen.add(key); return true;
        });
      for (const c of found) {
        // Attach the raw Blighted Reach card object so images/ids come from blightedreach.yml only
        guildVoxEntries.push({ name: c.name, tier: 'Unranked', card: c });
      }
      // reset visible/hidden tiers for this section
      const activeMainKey = 'campaign-guildvox';
      const visEmpty = getVisibleEmptyTiers(activeMainKey);
      const hid = getHiddenTiers(activeMainKey);
      visEmpty.clear(); hid.clear();
      for (const t of ["S","A","B","C","D"]) visEmpty.add(t);
      for (const t of ["SSS","SS","F"]) hid.add(t);
      rebuildCurrentView();
      return;
    }
  }
  
  // Load cards from YAML in original order
  loadCardsFromYAML(targetType).then(cards => {
    // Clear existing entries
    targetEntries.length = 0;
    
    // Add cards in YAML order, all set to "Unranked" tier
    for (const card of cards) {
      targetEntries.push({
        name: card.name,
        tier: "Unranked",
        card: card,
      });
    }
    
    // Make sure only S-D tiers are visible as empty rows, hide others (for this active tab)
    let activeMainKey = activeTab.dataset.tab;
    if (activeMainKey === 'leaders') {
      const sub = activeSubTab && activeSubTab.dataset && activeSubTab.dataset.subtab ? activeSubTab.dataset.subtab : currentLeaderTab;
      activeMainKey = `leaders-${sub}`;
    }
    const visEmpty = getVisibleEmptyTiers(activeMainKey);
    const hid = getHiddenTiers(activeMainKey);
    visEmpty.clear();
    hid.clear();
    // Show S, A, B, C, D as empty rows
    const visibleTiers = ["S", "A", "B", "C", "D"];
    for (const tier of visibleTiers) {
      visEmpty.add(tier);
    }
    // Hide SSS, SS, F
    const hiddenTierList = ["SSS", "SS", "F"];
    for (const tier of hiddenTierList) {
      hid.add(tier);
    }
    
    rebuildCurrentView();
  });
}

// ========== Export ==========
function entriesToCsv(leaders3P, leaders4P, lore, fate, basecourt, guildVox, campaignLores) {
  const TIER_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "F", "Unranked"];
  
  // Group 3P leaders by tier
  const leader3PGroups = new Map();
  for (const tier of TIER_ORDER) {
    leader3PGroups.set(tier, []);
  }
  for (const entry of leaders3P) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
    leader3PGroups.get(t).push(entry);
  }

  // Group 4P leaders by tier
  const leader4PGroups = new Map();
  for (const tier of TIER_ORDER) {
    leader4PGroups.set(tier, []);
  }
  for (const entry of leaders4P) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
    leader4PGroups.get(t).push(entry);
  }
  
  // Group lore by tier
  const loreGroups = new Map();
  for (const tier of TIER_ORDER) {
    loreGroups.set(tier, []);
  }
  for (const entry of lore) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
    loreGroups.get(t).push(entry);
  }

  // Group fate by tier
  const fateGroups = new Map();
  for (const tier of TIER_ORDER) {
    fateGroups.set(tier, []);
  }
  for (const entry of fate) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
    fateGroups.get(t).push(entry);
  }
  
  // Group guild/vox by tier
  const guildVoxGroups = new Map();
  for (const tier of TIER_ORDER) {
    guildVoxGroups.set(tier, []);
  }
  for (const entry of (guildVox || [])) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
    guildVoxGroups.get(t).push(entry);
  }
  
  // Group base court by tier
  const basecourtGroups = new Map();
  for (const tier of TIER_ORDER) {
    basecourtGroups.set(tier, []);
  }
  for (const entry of basecourt) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
    basecourtGroups.get(t).push(entry);
  }
  
  let csv = "Name,Tier\n";
  
  // Export 3P leaders by tier order
  for (const tier of TIER_ORDER) {
    const entries = leader3PGroups.get(tier);
    for (const entry of entries) {
      csv += `${entry.name},${entry.tier}\n`;
    }
  }
  
  csv += "\n";
  
  // Export 4P leaders by tier order
  for (const tier of TIER_ORDER) {
    const entries = leader4PGroups.get(tier);
    for (const entry of entries) {
      csv += `${entry.name},${entry.tier}\n`;
    }
  }
  
  csv += "\n";

  // Export lore by tier order
  for (const tier of TIER_ORDER) {
    const entries = loreGroups.get(tier);
    for (const entry of entries) {
      csv += `${entry.name},${entry.tier}\n`;
    }
  }

  csv += "\n";

  // Export base court by tier order
  for (const tier of TIER_ORDER) {
    const entries = basecourtGroups.get(tier);
    for (const entry of entries) {
      csv += `${entry.name},${entry.tier}\n`;
    }
  }

  csv += "\n";

  // Export fate by tier order (placed last)
  for (const tier of TIER_ORDER) {
    const entries = fateGroups.get(tier);
    for (const entry of entries) {
      csv += `${entry.name},${entry.tier}\n`;
    }
  }
  
  csv += "\n";

  // Export campaign lores by tier order (between fate and guildvox)
  const campaignLoresGroups = new Map();
  for (const tier of TIER_ORDER) campaignLoresGroups.set(tier, []);
  for (const entry of (campaignLores || [])) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
    campaignLoresGroups.get(t).push(entry);
  }
  for (const tier of TIER_ORDER) {
    const entries = campaignLoresGroups.get(tier) || [];
    for (const entry of entries) {
      csv += `${entry.name},${entry.tier}\n`;
    }
  }

  csv += "\n";

  // Export guild & vox by tier order (placed after lores)
  for (const tier of TIER_ORDER) {
    const entries = guildVoxGroups.get(tier);
    for (const entry of entries) {
      csv += `${entry.name},${entry.tier}\n`;
    }
  }
  
  return csv;
}

function fallbackCopyTextToClipboard(text) {
  // Create a temporary textarea element
  const textArea = document.createElement("textarea");
  textArea.value = text;
  
  // Make it invisible but selectable
  textArea.style.position = "fixed";
  textArea.style.left = "-999999px";
  textArea.style.top = "-999999px";
  textArea.style.opacity = "0";
  
  document.body.appendChild(textArea);
  
  // Select and copy
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      el.exportCopyBtn.textContent = "✅ Copied!";
      setTimeout(() => { el.exportCopyBtn.textContent = "📋 Copy"; }, 1500);
    } else {
      el.exportCopyBtn.textContent = "❌ Failed";
      setTimeout(() => { el.exportCopyBtn.textContent = "📋 Copy"; }, 1500);
    }
  } catch (err) {
    el.exportCopyBtn.textContent = "❌ Failed";
    setTimeout(() => { el.exportCopyBtn.textContent = "📋 Copy"; }, 1500);
  }
  
  // Clean up
  document.body.removeChild(textArea);
}

function openExportModal() {
  el.exportText.value = entriesToCsv(leaderEntries3P, leaderEntries4P, loreEntries, getFilteredFateEntries(), basecourtEntries, getFilteredGuildVoxEntries(), getFilteredCampaignLoresEntries());
  el.exportModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeExportModal() {
  el.exportModal.classList.add("hidden");
  document.body.style.overflow = "";
}

function closeShareModal() {
  el.shareModal.classList.add("hidden");
  document.body.style.overflow = "";
}

// ========== Import ==========
function openImportModal() {
  el.importUrl.value = "";
  el.importText.value = "";
  el.importModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeImportModal() {
  el.importModal.classList.add("hidden");
  document.body.style.overflow = "";
}

async function doImport() {
  try {
    let csvText = el.importText.value.trim();
    const url = el.importUrl.value.trim();

    if (url && !csvText) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);
      csvText = await res.text();
    }

    if (!csvText) {
      alert("Please provide a CSV URL or paste CSV text.");
      return;
    }

    const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: false });
    const rows = parsed.data ?? [];
    const cardMap = new Map();
    for (const c of allCards) cardMap.set(normalizeText(c.name), c);
    const result = parseTierListSheet(rows, allCards);

    if (result.leaders3P.length === 0 && result.leaders4P.length === 0 && result.lore.length === 0 && result.fate.length === 0 && result.basecourt.length === 0) {
      alert("No valid tier data found in the input.");
      return;
    }

    leaderEntries3P = result.leaders3P;
    leaderEntries4P = result.leaders4P;
    loreEntries = result.lore;
    fateEntries = result.fate || [];
    basecourtEntries = result.basecourt;
    // Import any additional sections (campaignGuildVox)
    if (result.others && result.others['campaignGuildVox'] && result.others['campaignGuildVox'].length > 0) {
      // Map imported guild/vox entries to blightedReachRaw card objects when possible
      const imported = result.others['campaignGuildVox'];
      guildVoxEntries = (imported || []).map(ent => {
        let matched = null;
        if (Array.isArray(blightedReachRaw) && blightedReachRaw.length > 0) {
          if (ent.card && ent.card.id) matched = blightedReachRaw.find(c => c.id && String(c.id) === String(ent.card.id));
          if (!matched) matched = blightedReachRaw.find(c => normalizeText(c.name) === normalizeText(ent.name));
        }
        return { name: ent.name, tier: ent.tier || 'Unranked', card: matched || null };
      });
    } else if (Array.isArray(blightedReachRaw) && blightedReachRaw.length > 0) {
      // Derive from Blighted Reach raw cards only
      const seen = new Set();
      guildVoxEntries = blightedReachRaw.filter(c => Array.isArray(c.tags) && (c.tags.includes('Guild') || c.tags.includes('Vox')))
        .filter(c => {
          const key = normalizeText(c.name);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(c => ({ name: c.name, tier: 'Unranked', card: c }));
    } else {
      // No expansion data available -> empty
      guildVoxEntries = [];
    }

    // Debug: log campaign lists sizes
    console.debug('Loaded campaign lists:', {
      campaignLores: campaignLoresEntries.length,
      guildVox: guildVoxEntries.length,
      fate: fateEntries.length
    });
    rebuildCurrentView();
    // Show share button for imported tier lists
    el.shareBtn.style.display = "";
    closeImportModal();
  } catch (err) {
    console.error(err);
    alert(`Import error: ${err.message}`);
  }
}

// ========== Modal ==========
function openModal(card) {
  const imgUrl = getImageUrl(card);
  el.modalImg.src = imgUrl || "";
  el.modalImg.alt = card.name;
  el.modalName.textContent = card.name;
  el.modalText.innerHTML = formatCardText(card.text);
  // Remove any existing guide buttons
  const existingBtns = el.modalText.parentElement.querySelectorAll('.modal-guide-btn');
  existingBtns.forEach(b => { if (b && b.parentNode) b.parentNode.removeChild(b); });
  // Add BGG guide button when a mapping exists (only BGG links)
  const normName = normalizeText(card.name).replace(/^the /, '').trim();
  const guideUrl = BGG_GUIDE_LINKS[normName];
  if (guideUrl) {
    const btn = document.createElement('a');
    btn.className = 'btn-compare modal-guide-btn';
    btn.href = guideUrl;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.style.display = 'inline-block';
    btn.style.marginTop = '12px';
    btn.textContent = 'Open Guide';
    el.modalText.parentElement.appendChild(btn);
    // Add a Buried Giant cards search link for the same tag (tag == card name)
    const searchQuery = `game:"arcs" tag:"${card.name}"`;
    const searchUrl = `https://cards.buriedgiantstudios.com/search?q=${encodeURIComponent(searchQuery)}`;
    const bgLink = document.createElement('a');
    bgLink.className = 'btn-compare modal-guide-btn';
    bgLink.href = searchUrl;
    bgLink.target = '_blank';
    bgLink.rel = 'noopener';
    bgLink.style.display = 'inline-block';
    bgLink.style.marginTop = '8px';
    bgLink.style.marginLeft = '8px';
    bgLink.textContent = 'View related cards';
    el.modalText.parentElement.appendChild(bgLink);
  }
  el.modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  el.modal.classList.add("hidden");
  document.body.style.overflow = "";
}

// ========== Tabs ==========
function initTabs() {
  const sections = {
    leaders3p: el.leaders3pSection,
    leaders4p: el.leaders4pSection,
    lore: el.loreSection,
    fate: el.fateSection,
    basecourt: el.basecourtSection,
    'campaign-guildvox': el.campaignGuildVoxSection,
    'campaign-lores': el.campaignLoresSection,
  };

  // Function to update URL hash based on current tab
  function updateHash() {
    const activeTab = Array.from(el.tabs).find(tab => tab.classList.contains('active'));
    if (!activeTab) return;
    
    const tabName = activeTab.dataset.tab;
    if (tabName === 'base') {
      const activeBase = Array.from(el.baseSubTabsButtons).find(b => b.classList.contains('active'));
      const baseName = activeBase ? activeBase.dataset.subtab : 'leaders';
      if (baseName === 'leaders') {
        const activeLeader = Array.from(el.subTabs).find(subTab => subTab.classList.contains('active'));
        const leaderName = activeLeader ? activeLeader.dataset.subtab : '3p';
        window.location.hash = `#base-leaders-${leaderName}`;
      } else {
        window.location.hash = `#base-${baseName}`;
      }
    } else {
      if (tabName === 'campaign') {
        const activeCamp = Array.from(el.campaignSubTabsButtons).find(b => b.classList.contains('active'));
        const campName = activeCamp ? activeCamp.dataset.subtab : 'fate';
        window.location.hash = `#campaign-${campName}`;
      } else {
        window.location.hash = `#${tabName}`;
      }
    }
  }

    // Function to set tab from hash
    function setTabFromHash() {
    const hash = window.location.hash.substring(1); // remove #
    if (!hash) return;

    const parts = hash.split('-');
    const tabName = parts[0];

    // Find and activate main tab
    const targetTab = Array.from(el.tabs).find(tab => tab.dataset.tab === tabName);
    if (targetTab && !targetTab.classList.contains('disabled')) {
      el.tabs.forEach((t) => t.classList.remove("active"));
      targetTab.classList.add("active");

      if (tabName === 'base') {
        // Show base sub-tabs and pick a subtab
        el.baseSubTabs.style.display = '';
        let baseSub = parts[1] || 'leaders';
        // Validate base subtab value
        if (!['leaders', 'lore', 'basecourt'].includes(baseSub)) baseSub = 'leaders';
        el.baseSubTabsButtons.forEach((b) => b.classList.toggle('active', b.dataset.subtab === baseSub));

        if (baseSub === 'leaders') {
          el.leaderSubTabs.style.display = '';
          let leaderSub = parts[2] || '3p';
          // Map accidental 'leaders' token to default leader subtab
          if (leaderSub === 'leaders') leaderSub = '3p';
          // Validate leader subtab value
          if (!['3p', '4p'].includes(leaderSub)) leaderSub = '3p';
          el.subTabs.forEach((t) => t.classList.toggle('active', t.dataset.subtab === leaderSub));
          currentLeaderTab = leaderSub;
          const sectionKey = currentLeaderTab === '3p' ? 'leaders3p' : 'leaders4p';
          Object.entries(sections).forEach(([key, section]) => {
            section.classList.toggle("hidden", key !== sectionKey);
          });
        } else {
          el.leaderSubTabs.style.display = 'none';
          Object.entries(sections).forEach(([key, section]) => {
            section.classList.toggle("hidden", key !== baseSub);
          });
        }
        // Ensure campaign sub-tabs are hidden when showing Base
        if (el.campaignSubTabs) el.campaignSubTabs.style.display = 'none';
        if (el.fateFilters) el.fateFilters.style.display = 'none';
        if (el.campaignLoresFilters) el.campaignLoresFilters.style.display = 'none';
      } else if (tabName === 'campaign') {
        el.baseSubTabs.style.display = 'none';
        el.leaderSubTabs.style.display = 'none';
        el.campaignSubTabs.style.display = '';
        const campSub = parts[1] || 'fate';
        el.campaignSubTabsButtons.forEach((b) => b.classList.toggle('active', b.dataset.subtab === campSub));
          if (campSub === 'fate') {
            Object.entries(sections).forEach(([key, section]) => {
              section.classList.toggle("hidden", key !== 'fate');
            });
            if (el.fateFilters) el.fateFilters.style.display = '';
            if (el.fateFilterA) el.fateFilterA.checked = true;
            if (el.fateFilterB) el.fateFilterB.checked = true;
            if (el.fateFilterC) el.fateFilterC.checked = true;
            rebuildCurrentView();
          } else if (campSub === 'lores') {
            Object.entries(sections).forEach(([key, section]) => {
              section.classList.toggle("hidden", key !== 'campaign-lores');
            });
            if (el.campaignLoresFilters) el.campaignLoresFilters.style.display = '';
            if (el.loreFilterDeck) el.loreFilterDeck.checked = true;
            if (el.loreFilterFates) el.loreFilterFates.checked = true;
            rebuildCurrentView();
          } else if (campSub === 'guildvox') {
            Object.entries(sections).forEach(([key, section]) => {
              section.classList.toggle("hidden", key !== 'campaign-guildvox');
            });
            // Show Guild & Vox filters and initialize them when starting on this subtab
            if (el.fateFilters) el.fateFilters.style.display = 'none';
            if (el.campaignLoresFilters) el.campaignLoresFilters.style.display = 'none';
            if (el.campaignGuildVoxFilters) el.campaignGuildVoxFilters.style.display = '';
            if (el.guildFilterVox) el.guildFilterVox.checked = true;
            if (el.guildFilterMaterial) el.guildFilterMaterial.checked = true;
            if (el.guildFilterFuel) el.guildFilterFuel.checked = true;
            if (el.guildFilterWeapon) el.guildFilterWeapon.checked = true;
            if (el.guildFilterRelic) el.guildFilterRelic.checked = true;
            if (el.guildFilterPsionic) el.guildFilterPsionic.checked = true;
            rebuildCurrentView();
          }
      }
    }
  }

  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Don't allow clicking disabled tabs
      if (tab.classList.contains('disabled')) return;
      
      const target = tab.dataset.tab;
      el.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      
      // Show/hide sub-tabs
      if (target === 'base') {
        el.baseSubTabs.style.display = '';
        // Default to leaders subtab if not previously selected
        const activeBase = Array.from(el.baseSubTabsButtons).find(b => b.classList.contains('active')) || el.baseSubTabsButtons[0];
        const sub = activeBase ? activeBase.dataset.subtab : 'leaders';

        if (sub === 'leaders') {
          el.leaderSubTabs.style.display = '';
          const sectionKey = currentLeaderTab === '3p' ? 'leaders3p' : 'leaders4p';
          Object.entries(sections).forEach(([key, section]) => {
            section.classList.toggle("hidden", key !== sectionKey);
          });
        } else {
          el.leaderSubTabs.style.display = 'none';
          Object.entries(sections).forEach(([key, section]) => {
            section.classList.toggle("hidden", key !== sub);
          });
        }
        // Ensure campaign sub-tabs are hidden when Base is clicked
        if (el.campaignSubTabs) el.campaignSubTabs.style.display = 'none';
        if (el.fateFilters) el.fateFilters.style.display = 'none';
      } else if (target === 'campaign') {
        el.baseSubTabs.style.display = 'none';
        el.leaderSubTabs.style.display = 'none';
        el.campaignSubTabs.style.display = '';
        const activeCamp = Array.from(el.campaignSubTabsButtons).find(b => b.classList.contains('active')) || el.campaignSubTabsButtons[0];
        const campSub = activeCamp ? activeCamp.dataset.subtab : 'fate';

        if (campSub === 'fate') {
          Object.entries(sections).forEach(([key, section]) => {
            section.classList.toggle("hidden", key !== 'fate');
          });
          if (el.fateFilters) el.fateFilters.style.display = '';
          if (el.fateFilterA) el.fateFilterA.checked = true;
          if (el.fateFilterB) el.fateFilterB.checked = true;
          if (el.fateFilterC) el.fateFilterC.checked = true;
          rebuildCurrentView();
        } else if (campSub === 'lores') {
          Object.entries(sections).forEach(([key, section]) => {
            section.classList.toggle("hidden", key !== 'campaign-lores');
          });
        } else if (campSub === 'guildvox') {
          Object.entries(sections).forEach(([key, section]) => {
            section.classList.toggle("hidden", key !== 'campaign-guildvox');
          });
        }
      }
      
      updateHash();
    });
  });

  // Sub-tab switching
  el.subTabs.forEach((subTab) => {
    subTab.addEventListener("click", () => {
      // Don't allow clicking disabled sub-tabs
      if (subTab.classList.contains('disabled')) return;
      
      const target = subTab.dataset.subtab;
      el.subTabs.forEach((t) => t.classList.remove("active"));
      subTab.classList.add("active");
      currentLeaderTab = target;
      
      const sectionKey = target === '3p' ? 'leaders3p' : 'leaders4p';
      Object.entries(sections).forEach(([key, section]) => {
        section.classList.toggle("hidden", key !== sectionKey);
      });
      if (el.fateFilters) el.fateFilters.style.display = 'none';
      updateHash();
    });
  });

  // Base sub-tabs switching
  el.baseSubTabsButtons.forEach((b) => {
    b.addEventListener('click', () => {
      el.baseSubTabsButtons.forEach((bb) => bb.classList.remove('active'));
      b.classList.add('active');
      const sub = b.dataset.subtab;
      if (sub === 'leaders') {
        el.leaderSubTabs.style.display = '';
        const sectionKey = currentLeaderTab === '3p' ? 'leaders3p' : 'leaders4p';
        Object.entries(sections).forEach(([key, section]) => {
          section.classList.toggle("hidden", key !== sectionKey);
        });
      } else {
        el.leaderSubTabs.style.display = 'none';
        Object.entries(sections).forEach(([key, section]) => {
          section.classList.toggle("hidden", key !== sub);
        });
      }
      updateHash();
      if (el.fateFilters) el.fateFilters.style.display = 'none';
    });
  });

  // Campaign sub-tabs switching
  el.campaignSubTabsButtons.forEach((b) => {
    b.addEventListener('click', () => {
      el.campaignSubTabsButtons.forEach((bb) => bb.classList.remove('active'));
      b.classList.add('active');
      const sub = b.dataset.subtab;
      if (sub === 'fate') {
        Object.entries(sections).forEach(([key, section]) => {
          section.classList.toggle("hidden", key !== 'fate');
        });
        if (el.fateFilters) el.fateFilters.style.display = '';
        if (el.campaignLoresFilters) el.campaignLoresFilters.style.display = 'none';
        if (el.fateFilterA) el.fateFilterA.checked = true;
        if (el.fateFilterB) el.fateFilterB.checked = true;
        if (el.fateFilterC) el.fateFilterC.checked = true;
        rebuildCurrentView();
      } else if (sub === 'lores') {
        Object.entries(sections).forEach(([key, section]) => {
          section.classList.toggle("hidden", key !== 'campaign-lores');
            if (el.fateFilters) el.fateFilters.style.display = 'none';
            if (el.campaignLoresFilters) el.campaignLoresFilters.style.display = '';
            if (el.loreFilterDeck) el.loreFilterDeck.checked = true;
            if (el.loreFilterFates) el.loreFilterFates.checked = true;
            rebuildCurrentView();
        });
      } else if (sub === 'guildvox') {
        Object.entries(sections).forEach(([key, section]) => {
          section.classList.toggle("hidden", key !== 'campaign-guildvox');
        });
        if (el.fateFilters) el.fateFilters.style.display = 'none';
        if (el.campaignLoresFilters) el.campaignLoresFilters.style.display = 'none';
        if (el.campaignGuildVoxFilters) el.campaignGuildVoxFilters.style.display = '';
        if (el.guildFilterVox) el.guildFilterVox.checked = true;
        rebuildCurrentView();
      }
      updateHash();
    });
  });

  // Initialize sub-tabs visibility
  if (el.tabs[0].classList.contains('active') && el.tabs[0].dataset.tab === 'base') {
    el.baseSubTabs.style.display = '';
    if (el.campaignSubTabs) el.campaignSubTabs.style.display = 'none';
    if (el.fateFilters) el.fateFilters.style.display = 'none';
    if (el.campaignLoresFilters) el.campaignLoresFilters.style.display = 'none';
  }
  
  // Set initial tab from hash
  setTabFromHash();
  
  // Update hash to reflect current state (in case no hash was set)
  updateHash();
  
  // Listen for hash changes (e.g., back/forward buttons)
  window.addEventListener('hashchange', setTabFromHash);
}

function disableEmptyTabs() {
  // Check if this is a shared tier list (has URL parameter)
  const urlParams = new URLSearchParams(window.location.search);
  const isSharedTierList = urlParams.has('tierlist');
  
  if (!isSharedTierList) return; // Only disable tabs for shared tier lists
  
  // Disable main tabs for empty sections
  const tabMappings = {
    'base': (leaderEntries3P.length > 0 || leaderEntries4P.length > 0) || loreEntries.length > 0 || basecourtEntries.length > 0,
    'campaign': fateEntries.length > 0 || campaignLoresEntries.length > 0 || guildVoxEntries.length > 0
  };
  
  el.tabs.forEach((tab) => {
    const tabType = tab.dataset.tab;
    const hasData = tabMappings[tabType];
    
    if (!hasData) {
      tab.classList.add('disabled');
    }
  });
  
  // Disable sub-tabs for empty leader sections
  el.subTabs.forEach((subTab) => {
    const subTabType = subTab.dataset.subtab;
    const hasData = subTabType === '3p' ? leaderEntries3P.length > 0 : leaderEntries4P.length > 0;

    if (!hasData) {
      subTab.classList.add('disabled');
    }
  });

  // Disable base sub-tabs for shared lists if empty
  el.baseSubTabsButtons.forEach((b) => {
    const id = b.dataset.subtab;
    let hasData = false;
    if (id === 'leaders') hasData = leaderEntries3P.length > 0 || leaderEntries4P.length > 0;
    if (id === 'lore') hasData = loreEntries.length > 0;
    if (id === 'basecourt') hasData = basecourtEntries.length > 0;
    if (!hasData) b.classList.add('disabled');
  });
  // Disable campaign sub-tabs for shared lists if empty
  el.campaignSubTabsButtons.forEach((b) => {
    const id = b.dataset.subtab;
    let hasData = false;
    if (id === 'fate') hasData = getFilteredFateEntries().length > 0;
    if (id === 'lores') hasData = getFilteredCampaignLoresEntries().length > 0;
    if (id === 'guildvox') hasData = getFilteredGuildVoxEntries().length > 0;
    if (!hasData) b.classList.add('disabled');
  });
  
  // If current active tab is disabled, switch to first available tab
  const activeTab = Array.from(el.tabs).find(tab => tab.classList.contains('active'));
  if (activeTab && activeTab.classList.contains('disabled')) {
    const firstEnabledTab = Array.from(el.tabs).find(tab => !tab.classList.contains('disabled'));
    if (firstEnabledTab) {
      firstEnabledTab.click();
    }
  }
  
  // If current active sub-tab is disabled, switch to first available sub-tab
  const activeSubTab = Array.from(el.subTabs).find(subTab => subTab.classList.contains('active'));
  if (activeSubTab && activeSubTab.classList.contains('disabled')) {
    const firstEnabledSubTab = Array.from(el.subTabs).find(subTab => !subTab.classList.contains('disabled'));
    if (firstEnabledSubTab) {
      firstEnabledSubTab.click();
    }
  }
}

// ========== Download PNG ==========
function initDownload() {
  el.downloadBtn.addEventListener("click", async () => {
    // Determine which section is visible (include campaign sections)
    const isLeaders3P = !el.leaders3pSection.classList.contains("hidden");
    const isLeaders4P = !el.leaders4pSection.classList.contains("hidden");
    const isLore = !el.loreSection.classList.contains("hidden");
    const isBaseCourt = !el.basecourtSection.classList.contains("hidden");
    const isFate = !el.fateSection.classList.contains("hidden");
    const isCampaignLores = !el.campaignLoresSection.classList.contains("hidden");
    const isGuildVox = !el.campaignGuildVoxSection.classList.contains("hidden");

    let target, label;
    if (isLeaders3P) {
      target = el.leaders3pTierList;
      label = "leaders-3p";
    } else if (isLeaders4P) {
      target = el.leaders4pTierList;
      label = "leaders-4p";
    } else if (isLore) {
      target = el.loreTierList;
      label = "lore";
    } else if (isFate) {
      target = el.fateTierList;
      label = "fates";
    } else if (isCampaignLores) {
      target = el.campaignLoresTierList;
      label = "campaign-lores";
    } else if (isGuildVox) {
      target = el.campaignGuildVoxTierList;
      label = "guild-vox";
    } else if (isBaseCourt) {
      target = el.basecourtTierList;
      label = "basecourt";
    }

    el.downloadBtn.disabled = true;
    el.downloadBtn.textContent = "Capturing…";

    try {
      // Wait for all images to load
      const imgs = target.querySelectorAll("img");
      await Promise.all(
        Array.from(imgs).map(
          (img) =>
            new Promise((resolve) => {
              if (img.complete) return resolve();
              img.onload = resolve;
              img.onerror = resolve;
            })
        )
      );

      const devicePR = window.devicePixelRatio || 1;

      // Compute scale so card images are rendered at their natural resolution
      const imgsForScale = Array.from(target.querySelectorAll('img'))
        .filter((img) => img.naturalWidth && img.clientWidth);
      let pixelRatio = devicePR;
      if (imgsForScale.length > 0) {
        const scales = imgsForScale.map((img) => img.naturalWidth / img.clientWidth);
        const maxImgScale = Math.max(...scales);
        pixelRatio = maxImgScale * devicePR;
        // Cap extreme sizes to avoid generating enormous files
        const MAX_EXPORT_SCALE = 4;
        if (pixelRatio > MAX_EXPORT_SCALE) pixelRatio = MAX_EXPORT_SCALE;
        // Ensure at least 1x
        pixelRatio = Math.max(1, pixelRatio);
      }

      const blob = await toBlob(target, {
        pixelRatio,
        backgroundColor:
          document.documentElement.dataset.theme === "light"
            ? "#f5f7fa"
            : "#0a0e1a",
        cacheBust: true,
      });

      if (!blob) throw new Error("Capture failed");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arcs-tierlist-${label}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to capture tier list. Try again.");
    } finally {
      el.downloadBtn.disabled = false;
      el.downloadBtn.textContent = "\u2b07 Download PNG";
    }
  });
}

// ========== URL Sharing ==========
const TIER_MAP = { 'SSS': '0', 'SS': '1', 'S': '2', 'A': '3', 'B': '4', 'C': '5', 'D': '6', 'F': '7', 'Unranked': '8' };
const REVERSE_TIER_MAP = { '0': 'SSS', '1': 'SS', '2': 'S', '3': 'A', '4': 'B', '5': 'C', '6': 'D', '7': 'F', '8': 'Unranked' };

function encodeTierListForURL(selectedSections) {
  // Build card index map for compression (use normalized names)
  const cardIndex = new Map();
  allCards.forEach((card, index) => {
    cardIndex.set(normalizeText(card.name), index);
  });
  
  // Create format: name|Section:idx(2)digit(1)idx(2)digit(1)...|name|Section:...
  const parts = [];
  for (const section of selectedSections) {
    let entries = '';
    for (const entry of section.data) {
      const idxKey = normalizeText(entry.name);
      const index = cardIndex.get(idxKey);
      const tierDigit = TIER_MAP[entry.tier];
      // Use 3-digit index to support large card sets; ensure tierDigit exists (allow '0')
      if (index !== undefined && tierDigit !== undefined && tierDigit !== null) {
        entries += index.toString().padStart(3, '0') + tierDigit;
      }
    }
    
    if (entries) {
      // Encode section display name and section id (for future-proofing)
      const sectionIdEncoded = btoa(section.id);
      parts.push(`${btoa(section.name)}|${sectionIdEncoded}:${entries}`);
    }
  }
  
  return btoa(parts.join('|')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getSectionCode(sectionId) {
  switch (sectionId) {
    case 'leaders3p': return '3';
    case 'leaders4p': return '4';
    case 'lore': return 'L';
    case 'fate': return 'T';
    case 'basecourt': return 'B';
    default: return 'U'; // Unknown
  }
}

function decodeTierListFromURL(encoded) {
  try {
    // Add back base64 padding and convert from URL-safe
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const data = atob(padded);
    const parts = data.split('|');
    
    const parsedSections = {};
    
    // Detect format: if first part is a section code (3,4,L,B), it's old format
    // If first part is base64 encoded name, it's new format
    const isOldFormat = /^[34LB]:/.test(parts[0]);
    
    if (isOldFormat) {
      // Old format: Section:entries|Section:entries...
      for (const section of parts) {
        const [sectionName, entriesStr] = section.split(':');
        if (!entriesStr) continue;

        let sectionId;
        switch (sectionName) {
          case '3': sectionId = 'leaders3p'; break;
          case '4': sectionId = 'leaders4p'; break;
          case 'L': sectionId = 'lore'; break;
          case 'T': sectionId = 'fate'; break;
          case 'B': sectionId = 'basecourt'; break;
          default: sectionId = 'unknown'; break;
        }

        const targetArray = parsedSections[sectionId] = parsedSections[sectionId] || [];

        // Parse fixed-width entries: 3 digits index + 1 digit tier
        for (let i = 0; i < entriesStr.length; i += 4) {
          const indexStr = entriesStr.substr(i, 3);
          const tierDigit = entriesStr.substr(i + 3, 1);
          const index = parseInt(indexStr, 10);
          const tier = REVERSE_TIER_MAP[tierDigit];
          if (!isNaN(index) && index >= 0 && index < allCards.length && tier) {
            const card = allCards[index];
            targetArray.push({ name: card.name, tier, card });
          }
        }
      }
    } else {
      // New format: name|SectionIdEncoded:entries|name|SectionIdEncoded:entries...
      for (let i = 0; i < parts.length; i += 2) {
        if (i + 1 >= parts.length) break;

        const nameEncoded = parts[i];
        const sectionData = parts[i + 1];

        const customName = atob(nameEncoded);
        const [sectionIdEncoded, entriesStr] = sectionData.split(':');
        if (!entriesStr) continue;

        let sectionId;
        try {
          sectionId = atob(sectionIdEncoded);
        } catch (err) {
          continue;
        }

        const targetArray = parsedSections[sectionId] = parsedSections[sectionId] || [];

        // Parse fixed-width entries: 3 digits index + 1 digit tier
        for (let j = 0; j < entriesStr.length; j += 4) {
          const indexStr = entriesStr.substr(j, 3);
          const tierDigit = entriesStr.substr(j + 3, 1);
          const index = parseInt(indexStr, 10);
          const tier = REVERSE_TIER_MAP[tierDigit];
          if (!isNaN(index) && index >= 0 && index < allCards.length && tier) {
            const card = allCards[index];
            targetArray.push({ name: card.name, tier, card, customSectionName: customName });
          }
        }
      }
    }

    // Map parsedSections into well-known return shape while preserving unknown sections
    const leaders3P = parsedSections['leaders3p'] || [];
    const leaders4P = parsedSections['leaders4p'] || [];
    const lore = parsedSections['lore'] || [];
    const fate = parsedSections['fate'] || [];
    const basecourt = parsedSections['basecourt'] || [];

    // Also include any other sections so callers can access them if needed
    const others = {};
    for (const k of Object.keys(parsedSections)) {
      if (!['leaders3p','leaders4p','lore','fate','basecourt'].includes(k)) {
        others[k] = parsedSections[k];
      }
    }

    return { leaders3P, leaders4P, lore, fate, basecourt, others };
    
    return { leaders3P, leaders4P, lore, fate, basecourt };
  } catch (err) {
    console.error('Failed to decode tier list from URL:', err);
    return null;
  }
}

function updateMetaTagsForSharedTierList(encoded) {
  // Parse encoded string to get counts and names without needing card data
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const data = atob(padded);
    const parts = data.split('|');
    
    let totalCount = 0;
    const sectionNames = [];
    
    // Detect format
    const isOldFormat = /^[34LB]:/.test(parts[0]);
    
    if (isOldFormat) {
      // Old format: Section:entries|Section:entries...
      for (const section of parts) {
        const [sectionName, entriesStr] = section.split(':');
        if (entriesStr) {
          const entryCount = entriesStr.length / 4; // Each entry is 4 characters (3-digit index + 1-digit tier)
          totalCount += entryCount;
          
            // Add default section names
          switch (sectionName) {
            case '3': sectionNames.push('3P Leaders'); break;
            case '4': sectionNames.push('4P Leaders'); break;
            case 'L': sectionNames.push('Lore'); break;
            case 'T': sectionNames.push('Fate'); break;
            case 'B': sectionNames.push('Base Court'); break;
          }
        }
      }
    } else {
      // New format: name|Section:entries|name|Section:entries...
      for (let i = 0; i < parts.length; i += 2) {
        if (i + 1 >= parts.length) break;
        
        const nameEncoded = parts[i];
        const sectionData = parts[i + 1];
        
        const customName = atob(nameEncoded);
          const [sectionName, entriesStr] = sectionData.split(':');
        
          if (entriesStr) {
          const entryCount = entriesStr.length / 3; // Each entry is 3 characters
          totalCount += entryCount;
          sectionNames.push(customName);
        }
      }
    }
    
    const title = sectionNames.length > 0 ? `Shared ${sectionNames.join(', ')}` : 'Shared Arcs Tier List';
    const description = `View this custom tier list with ${totalCount} card rankings${sectionNames.length > 0 ? ` (${sectionNames.join(', ')})` : ''}.`;
    
    document.title = title;
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.content = title;
    }
    
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      ogDescription.content = description;
    }
    
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) {
      twitterTitle.content = title;
    }
    
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) {
      twitterDescription.content = description;
    }
  } catch (err) {
    console.error('Failed to parse tier list for meta tags:', err);
  }
}

async function shareTierList() {
  // Load the default tier list from spreadsheet
  const rows = await loadTierListSheet();
  const defaultTierData = parseTierListSheet(rows, allCards);

  // Check if the current tier list matches the default
  const isDefault = arraysEqual(leaderEntries3P, defaultTierData.leaders3P) &&
                    arraysEqual(leaderEntries4P, defaultTierData.leaders4P) &&
                    arraysEqual(loreEntries, defaultTierData.lore) &&
                    arraysEqual(basecourtEntries, defaultTierData.basecourt) &&
                    arraysEqual(fateEntries, defaultTierData.fate) &&
                    arraysEqual(guildVoxEntries, defaultTierData.others ? (defaultTierData.others['campaignGuildVox'] || []) : []);

  if (isDefault) {
    // Share the default tier list (base URL without parameters)
    const url = new URL(window.location);
    url.searchParams.delete('tierlist');
    navigator.clipboard.writeText(url.toString()).then(() => {
      alert('Shareable link to default tier list copied to clipboard!');
    }).catch(() => {
      alert(`Shareable link: ${url.toString()}`);
    });
    return;
  }

  // Proceed with custom share modal for edited tier lists
  populateShareModal();
  el.shareModal.classList.remove('hidden');
}

function populateShareModal() {
  const sections = [
    { id: 'leaders3p', name: '3P Leaders', data: leaderEntries3P, defaultName: '3P Leaders' },
    { id: 'leaders4p', name: '4P Leaders', data: leaderEntries4P, defaultName: '4P Leaders' },
    { id: 'lore', name: 'Lore', data: loreEntries, defaultName: 'Lore' },
    { id: 'basecourt', name: 'Base Court', data: basecourtEntries, defaultName: 'Base Court' },
    { id: 'fate', name: 'Fate', data: getFilteredFateEntries(), defaultName: 'Fate' },
    { id: 'campaignLores', name: 'Lores', data: getFilteredCampaignLoresEntries(), defaultName: 'Lores' },
    { id: 'campaignGuildVox', name: 'Guild & Vox', data: getFilteredGuildVoxEntries(), defaultName: 'Guild & Vox' }
  ];
  
  el.shareSections.innerHTML = '';
  
  sections.forEach(section => {
    if (section.data.length === 0) return; // Skip empty sections
    
    const sectionDiv = document.createElement('div');
    sectionDiv.style.cssText = 'margin-bottom:12px;padding:12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-solid)';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `share-${section.id}`;
    checkbox.checked = true; // Default to included
    checkbox.style.cssText = 'margin-right:8px';
    
    const label = document.createElement('label');
    label.htmlFor = `share-${section.id}`;
    label.textContent = section.name;
    label.style.cssText = 'font-weight:600;margin-right:12px';
    
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = `name-${section.id}`;
    nameInput.value = section.defaultName;
    nameInput.placeholder = 'Custom name';
    nameInput.style.cssText = 'flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-solid);color:var(--text);font-family:inherit;font-size:0.85rem';
    
    sectionDiv.appendChild(checkbox);
    sectionDiv.appendChild(label);
    sectionDiv.appendChild(nameInput);
    
    el.shareSections.appendChild(sectionDiv);
  });
}

function confirmShare() {
  const selectedSections = [];
  
  // Collect selected sections
  const checkboxes = el.shareSections.querySelectorAll('input[type="checkbox"]:checked');
  checkboxes.forEach(checkbox => {
    const sectionId = checkbox.id.replace('share-', '');
    const nameInput = document.getElementById(`name-${sectionId}`);
    const customName = nameInput.value.trim() || nameInput.placeholder;
    
    let data;
    switch (sectionId) {
      case 'leaders3p': data = leaderEntries3P; break;
      case 'leaders4p': data = leaderEntries4P; break;
      case 'lore': data = loreEntries; break;
      case 'fate': data = getFilteredFateEntries(); break;
      case 'basecourt': data = basecourtEntries; break;
      case 'campaignLores': data = getFilteredCampaignLoresEntries(); break;
      case 'campaignGuildVox': data = getFilteredGuildVoxEntries(); break;
    }
    
    if (data && data.length > 0) {
      selectedSections.push({
        id: sectionId,
        name: customName,
        data: data
      });
    }
  });
  
  if (selectedSections.length === 0) {
    alert('Please select at least one tier list to share.');
    return;
  }
  
  const encoded = encodeTierListForURL(selectedSections);
  const url = new URL(window.location);
  url.searchParams.set('tierlist', encoded);
  
  // Copy to clipboard
  navigator.clipboard.writeText(url.toString()).then(() => {
    alert('Shareable link copied to clipboard!');
  }).catch(() => {
    // Fallback: show the URL
    alert(`Shareable link:\n${url.toString()}`);
  });
  
  el.shareModal.classList.add('hidden');
}

async function loadDefaultTierList() {
  const rows = await loadTierListSheet();
  return parseTierListSheet(rows, allCards);
}

// ========== Init ==========
async function init() {
  initTheme();
  el.themeToggle.addEventListener("click", toggleTheme);
  initTabs();
  initDownload();

  // Edit mode
  el.editBtn.addEventListener("click", toggleEditMode);
  el.clearBtn.addEventListener("click", clearTierList);
  el.exportBtn.addEventListener("click", openExportModal);
  el.importBtn.addEventListener("click", openImportModal);
  el.shareBtn.addEventListener("click", shareTierList);

  // Export modal
  el.exportCopyBtn.addEventListener("click", () => {
    const textToCopy = el.exportText.value;
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        el.exportCopyBtn.textContent = "✅ Copied!";
        setTimeout(() => { el.exportCopyBtn.textContent = "📋 Copy"; }, 1500);
      }).catch(() => {
        // Fallback to older method
        fallbackCopyTextToClipboard(textToCopy);
      });
    } else {
      // Fallback for older browsers
      fallbackCopyTextToClipboard(textToCopy);
    }
  });
  el.exportCloseBtn.addEventListener("click", closeExportModal);
  el.exportModalClose.addEventListener("click", closeExportModal);
  el.exportModalBackdrop.addEventListener("click", closeExportModal);

  // Import modal
  el.importConfirmBtn.addEventListener("click", doImport);
  el.importCancelBtn.addEventListener("click", closeImportModal);
  el.importModalClose.addEventListener("click", closeImportModal);
  el.importModalBackdrop.addEventListener("click", closeImportModal);

  // Share modal
  el.shareConfirmBtn.addEventListener("click", confirmShare);
  el.shareCancelBtn.addEventListener("click", closeShareModal);
  el.shareModalClose.addEventListener("click", closeShareModal);
  el.shareModalBackdrop.addEventListener("click", closeShareModal);

  // Modal events
  el.modalClose.addEventListener("click", closeModal);
  el.modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeImportModal();
      closeExportModal();
      closeShareModal();
    }
  });

  try {
    setStatus("Loading cards & tier list…");
    const [cards] = await Promise.all([loadCards()]);
    allCards = cards;

    // Check for URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const tierlistParam = urlParams.get('tierlist');
    
    if (tierlistParam) {
      // Update meta tags immediately for link previews
      updateMetaTagsForSharedTierList(tierlistParam);
    }
    
    let tierData;
    if (tierlistParam) {
      // Load tier list from URL
      tierData = decodeTierListFromURL(tierlistParam);
      if (tierData) {
        setStatus("Loaded tier list from URL");
        // Show share button for shared tier lists
        el.shareBtn.style.display = "";
      } else {
        setStatus("Invalid tier list in URL, loading default", { isError: true });
        tierData = await loadDefaultTierList();
      }
    } else {
      // Load default tier list
      const rows = await loadTierListSheet();
      tierData = parseTierListSheet(rows, cards);
    }

    if (tierData.leaders3P.length === 0 && tierData.leaders4P.length === 0 && tierData.lore.length === 0 && tierData.fate.length === 0 && tierData.basecourt.length === 0) {
      setStatus("No tier list data found. Check the spreadsheet.", { isError: true });
      return;
    }

    leaderEntries3P = tierData.leaders3P;
    leaderEntries4P = tierData.leaders4P;
    loreEntries = tierData.lore;
    basecourtEntries = tierData.basecourt;
    // If the shared/default tier data included Fate section, use it; otherwise populate Fate from allCards
    if (tierData.fate && tierData.fate.length > 0) {
      fateEntries = tierData.fate;
    } else {
      fateEntries = allCards.filter(c => Array.isArray(c.tags) && c.tags.includes('Fate')).map(c => ({ name: c.name, tier: 'Unranked', card: c }));
    }

    // Populate campaign lores: prefer parsed data, otherwise source from base + campaign cards
    if (tierData.others && tierData.others['campaignLores'] && tierData.others['campaignLores'].length > 0) {
      campaignLoresEntries = tierData.others['campaignLores'];
    } else {
      // Use all loaded card sources (base + blighted reach) for lores, deduplicated by name
      const seenL = new Set();
      campaignLoresEntries = allCards.filter(c => Array.isArray(c.tags) && c.tags.includes('Lore'))
        .filter(c => {
          const key = normalizeText(c.name);
          if (seenL.has(key)) return false;
          seenL.add(key);
          return true;
        })
        .map(c => ({ name: c.name, tier: 'Unranked', card: c }));
    }

    // Populate Guild & Vox campaign entries: only from blighted reach raw cards (expansion)
    if (tierData.others && tierData.others['campaignGuildVox'] && tierData.others['campaignGuildVox'].length > 0) {
      // Map any provided campaignGuildVox entries to Blighted Reach raw card objects
      const provided = tierData.others['campaignGuildVox'];
      guildVoxEntries = (provided || []).map(ent => {
        let matched = null;
        if (Array.isArray(blightedReachRaw) && blightedReachRaw.length > 0) {
          if (ent.card && ent.card.id) matched = blightedReachRaw.find(c => c.id && String(c.id) === String(ent.card.id));
          if (!matched) matched = blightedReachRaw.find(c => normalizeText(c.name) === normalizeText(ent.name));
        }
        return { name: ent.name, tier: ent.tier || 'Unranked', card: matched || null };
      });
    } else if (Array.isArray(blightedReachRaw) && blightedReachRaw.length > 0) {
      const seen = new Set();
      guildVoxEntries = blightedReachRaw.filter(c => Array.isArray(c.tags) && (c.tags.includes('Guild') || c.tags.includes('Vox')))
        .filter(c => {
          const key = normalizeText(c.name);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(c => ({ name: c.name, tier: 'Unranked', card: c }));
    } else {
      // No expansion data available -> empty
      guildVoxEntries = [];
    }

    buildTierListHTML(leaderEntries3P, el.leaders3pTierList, "leaders-3p", "3P Leaders");
    buildTierListHTML(leaderEntries4P, el.leaders4pTierList, "leaders-4p", "4P Leaders");
    buildTierListHTML(loreEntries, el.loreTierList, "lore", "Lore");
    buildTierListHTML(getFilteredFateEntries(), el.fateTierList, "fate", "Fates");
    buildTierListHTML(basecourtEntries, el.basecourtTierList, "basecourt", "Base Court");
    buildTierListHTML(getFilteredCampaignLoresEntries(), el.campaignLoresTierList, "campaign-lores", "Lores");
    buildTierListHTML(getFilteredGuildVoxEntries(), el.campaignGuildVoxTierList, "campaign-guildvox", "Guild & Vox");

    // Disable tabs for empty sections in shared tier lists
    disableEmptyTabs();

    // Wire fate filter events
    if (el.fateFilterA) el.fateFilterA.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
    if (el.fateFilterB) el.fateFilterB.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
    if (el.fateFilterC) el.fateFilterC.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
      // Wire campaign lores filter events
      if (el.loreFilterDeck) el.loreFilterDeck.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
      if (el.loreFilterFates) el.loreFilterFates.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
      // Wire guild & vox filter events
      if (el.guildFilterVox) el.guildFilterVox.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
      if (el.guildFilterMaterial) el.guildFilterMaterial.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
      if (el.guildFilterFuel) el.guildFilterFuel.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
      if (el.guildFilterWeapon) el.guildFilterWeapon.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
      if (el.guildFilterRelic) el.guildFilterRelic.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
      if (el.guildFilterPsionic) el.guildFilterPsionic.addEventListener('change', () => { rebuildCurrentView(); disableEmptyTabs(); });
    // Show/hide filter UI when campaign subtab toggles
    if (el.campaignSubTabsButtons) {
      el.campaignSubTabsButtons.forEach(b => b.addEventListener('click', () => {
        const sub = b.dataset.subtab;
        if (el.fateFilters) el.fateFilters.style.display = sub === 'fate' ? '' : 'none';
        if (el.campaignLoresFilters) el.campaignLoresFilters.style.display = sub === 'lores' ? '' : 'none';
        if (el.campaignGuildVoxFilters) el.campaignGuildVoxFilters.style.display = sub === 'guildvox' ? '' : 'none';
      }));
    }

    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, { isError: true });
  }
}

init();
