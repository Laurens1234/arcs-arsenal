import { toBlob } from "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm";
import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import Papa from "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm";
import { CONFIG } from "./config.js";

// ========== DOM ==========
const el = {
  status: document.getElementById("status"),
  leadersTierList: document.getElementById("leadersTierList"),
  loreTierList: document.getElementById("loreTierList"),
  leadersSection: document.getElementById("leadersSection"),
  loreSection: document.getElementById("loreSection"),
  tabs: document.querySelectorAll(".tab"),
  themeToggle: document.getElementById("themeToggle"),
  downloadBtn: document.getElementById("downloadBtn"),
  editBtn: document.getElementById("editBtn"),
  importBtn: document.getElementById("importBtn"),
  exportBtn: document.getElementById("exportBtn"),
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
};

// ========== State ==========
let editMode = false;
let leaderEntries = []; // current leader entries (mutable in edit mode)
let loreEntries = [];   // current lore entries (mutable in edit mode)
let allCards = [];       // loaded card data
let hiddenTiers = new Set(); // tiers the user has removed

// ========== Utilities ==========
function setStatus(msg, { isError = false } = {}) {
  el.status.textContent = msg;
  el.status.classList.toggle("error", isError);
  el.status.style.display = msg ? "" : "none";
}

function normalizeText(s) {
  return String(s ?? "").trim().toLowerCase().replace(/['']/g, "'").replace(/\s+/g, " ");
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
  const text = await fetchText(CONFIG.cardsYamlUrl);
  const data = yaml.load(text);
  if (!Array.isArray(data)) throw new Error("Invalid YAML format");
  return data
    .filter((c) => c && typeof c === "object" && c.name)
    .map((c) => ({
      id: c.id ?? null,
      name: c.name ?? "",
      image: c.image ?? null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      text: c.text ?? "",
    }));
}

async function loadTierListSheet() {
  const text = await fetchText(CONFIG.tierListCsvUrl);
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
  return parsed.data ?? [];
}

function parseTierListSheet(rows, cards) {
  // Sheet format: Name | Tier
  // Empty row separates leaders from lore
  // First row is header (Name, Tier)
  const leaders = [];
  const lore = [];
  let inLore = false;
  let headerSkipped = false;

  // Build a lookup map: normalized name → card
  const cardMap = new Map();
  for (const card of cards) {
    cardMap.set(normalizeText(card.name), card);
  }

  for (const row of rows) {
    const name = (row[0] ?? "").trim();
    const tier = (row[1] ?? "").trim().toUpperCase();

    // Skip header row
    if (!headerSkipped) {
      if (normalizeText(name) === "name") {
        headerSkipped = true;
        continue;
      }
    }

    // Empty row = separator between leaders and lore
    if (!name && !tier) {
      if (headerSkipped && leaders.length > 0) {
        inLore = true;
      }
      continue;
    }

    if (!name || !tier) continue;

    const card = cardMap.get(normalizeText(name));
    const entry = {
      name,
      tier,
      card: card ?? null,
    };

    if (inLore) {
      lore.push(entry);
    } else {
      leaders.push(entry);
    }
  }

  return { leaders, lore };
}

// ========== Rendering ==========
const TIER_ORDER = ["SS", "S", "A", "B", "C", "D"];

function buildTierListHTML(entries, container, type) {
  // Group by tier
  const grouped = new Map();
  for (const tier of TIER_ORDER) {
    grouped.set(tier, []);
  }
  for (const entry of entries) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
    grouped.get(t).push(entry);
  }

  container.innerHTML = "";

  for (const tier of TIER_ORDER) {
    if (hiddenTiers.has(tier)) continue;
    const items = grouped.get(tier);
    if (items.length === 0 && tier === "SS" && !editMode) continue;

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
      cardsDiv.classList.add("drag-over");
    });
    cardsDiv.addEventListener("dragleave", () => {
      cardsDiv.classList.remove("drag-over");
    });
    cardsDiv.addEventListener("drop", (e) => {
      if (!editMode) return;
      e.preventDefault();
      cardsDiv.classList.remove("drag-over");
      const cardName = e.dataTransfer.getData("text/plain");
      const srcType = e.dataTransfer.getData("application/x-type");
      if (srcType !== type) return; // don't mix leaders/lore
      moveCard(cardName, tier, type);
    });

    for (const entry of items) {
      const cardEl = createCardElement(entry, type);
      cardsDiv.appendChild(cardEl);
    }

    row.appendChild(label);
    row.appendChild(cardsDiv);
    container.appendChild(row);
  }

  // In edit mode, show add-tier bar for hidden tiers at the bottom
  if (editMode && hiddenTiers.size > 0) {
    const addBar = document.createElement("div");
    addBar.className = "add-tier-bar";
    const lbl = document.createElement("span");
    lbl.textContent = "Add tier:";
    lbl.style.fontSize = "0.8rem";
    lbl.style.color = "var(--text-muted)";
    lbl.style.marginRight = "8px";
    addBar.appendChild(lbl);
    for (const tier of TIER_ORDER) {
      if (!hiddenTiers.has(tier)) continue;
      const btn = document.createElement("button");
      btn.className = `add-tier-btn tier-${tier.toLowerCase()}`;
      btn.textContent = `+ ${tier}`;
      btn.addEventListener("click", () => {
        hiddenTiers.delete(tier);
        rebuildCurrentView();
      });
      addBar.appendChild(btn);
    }
    container.appendChild(addBar);
  }
}

function createCardElement(entry, type) {
  const cardEl = document.createElement("div");
  cardEl.className = "personal-tier-card";
  cardEl.dataset.name = entry.name;

  // Drag source
  cardEl.draggable = editMode;
  cardEl.addEventListener("dragstart", (e) => {
    if (!editMode) { e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", entry.name);
    e.dataTransfer.setData("application/x-type", type);
    cardEl.classList.add("dragging");
  });
  cardEl.addEventListener("dragend", () => {
    cardEl.classList.remove("dragging");
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
      cardEl.style.height = "160px";
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
    cardEl.style.height = "160px";
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

  // Click to open modal (only when not editing)
  if (entry.card) {
    cardEl.addEventListener("click", () => {
      if (!editMode) openModal(entry.card);
    });
  }

  return cardEl;
}

function moveCard(name, newTier, type) {
  const entries = type === "leaders" ? leaderEntries : loreEntries;
  const entry = entries.find((e) => e.name === name);
  if (!entry || entry.tier === newTier) return;
  entry.tier = newTier;
  rebuildCurrentView();
}

function removeTier(tier) {
  // Find the next visible tier below to move cards into
  const visibleTiers = TIER_ORDER.filter((t) => !hiddenTiers.has(t) && t !== tier);
  if (visibleTiers.length === 0) return; // can't remove the last tier

  const tierIdx = TIER_ORDER.indexOf(tier);
  // Pick the next lower visible tier, or the nearest above if none below
  let target = visibleTiers.find((t) => TIER_ORDER.indexOf(t) > tierIdx);
  if (!target) target = visibleTiers[visibleTiers.length - 1];

  // Move all cards from this tier to the target
  for (const e of leaderEntries) {
    if (e.tier === tier) e.tier = target;
  }
  for (const e of loreEntries) {
    if (e.tier === tier) e.tier = target;
  }

  hiddenTiers.add(tier);
  rebuildCurrentView();
}

function rebuildCurrentView() {
  buildTierListHTML(leaderEntries, el.leadersTierList, "leaders");
  buildTierListHTML(loreEntries, el.loreTierList, "lore");
}

// ========== Edit Mode ==========
function toggleEditMode() {
  editMode = !editMode;
  document.body.classList.toggle("edit-mode", editMode);
  el.editBtn.textContent = editMode ? "✅ Done" : "Edit";
  el.importBtn.style.display = editMode ? "" : "none";
  el.exportBtn.style.display = editMode ? "" : "none";
  rebuildCurrentView();
}

// ========== Export ==========
function entriesToCsv(leaders, lore) {
  let csv = "Name,Tier\n";
  for (const e of leaders) csv += `${e.name},${e.tier}\n`;
  csv += "\nName,Tier\n";
  for (const e of lore) csv += `${e.name},${e.tier}\n`;
  return csv;
}

function openExportModal() {
  el.exportText.value = entriesToCsv(leaderEntries, loreEntries);
  el.exportModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeExportModal() {
  el.exportModal.classList.add("hidden");
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

    if (result.leaders.length === 0 && result.lore.length === 0) {
      alert("No valid tier data found in the input.");
      return;
    }

    leaderEntries = result.leaders;
    loreEntries = result.lore;
    rebuildCurrentView();
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
    leaders: el.leadersSection,
    lore: el.loreSection,
  };

  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      el.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      Object.entries(sections).forEach(([key, section]) => {
        section.classList.toggle("hidden", key !== target);
      });
    });
  });
}

// ========== Download PNG ==========
function initDownload() {
  el.downloadBtn.addEventListener("click", async () => {
    // Determine which section is visible
    const isLeaders = !el.leadersSection.classList.contains("hidden");
    const target = isLeaders ? el.leadersTierList : el.loreTierList;
    const label = isLeaders ? "leaders" : "lore";

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

      const pixelRatio = 2;
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
      el.downloadBtn.textContent = "\u2b07 Download High Res PNG";
    }
  });
}

// ========== Init ==========
async function init() {
  initTheme();
  el.themeToggle.addEventListener("click", toggleTheme);
  initTabs();
  initDownload();

  // Edit mode
  el.editBtn.addEventListener("click", toggleEditMode);
  el.exportBtn.addEventListener("click", openExportModal);
  el.importBtn.addEventListener("click", openImportModal);

  // Export modal
  el.exportCopyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(el.exportText.value).then(() => {
      el.exportCopyBtn.textContent = "✅ Copied!";
      setTimeout(() => { el.exportCopyBtn.textContent = "📋 Copy"; }, 1500);
    });
  });
  el.exportCloseBtn.addEventListener("click", closeExportModal);
  el.exportModalClose.addEventListener("click", closeExportModal);
  el.exportModalBackdrop.addEventListener("click", closeExportModal);

  // Import modal
  el.importConfirmBtn.addEventListener("click", doImport);
  el.importCancelBtn.addEventListener("click", closeImportModal);
  el.importModalClose.addEventListener("click", closeImportModal);
  el.importModalBackdrop.addEventListener("click", closeImportModal);

  // Modal events
  el.modalClose.addEventListener("click", closeModal);
  el.modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeImportModal();
      closeExportModal();
    }
  });

  try {
    setStatus("Loading cards & tier list…");
    const [cards, rows] = await Promise.all([loadCards(), loadTierListSheet()]);
    allCards = cards;
    const { leaders, lore } = parseTierListSheet(rows, cards);

    if (leaders.length === 0 && lore.length === 0) {
      setStatus("No tier list data found. Check the spreadsheet.", { isError: true });
      return;
    }

    leaderEntries = leaders;
    loreEntries = lore;

    buildTierListHTML(leaderEntries, el.leadersTierList, "leaders");
    buildTierListHTML(loreEntries, el.loreTierList, "lore");

    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, { isError: true });
  }
}

init();
