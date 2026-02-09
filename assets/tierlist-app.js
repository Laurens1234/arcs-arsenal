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
  basecourtTierList: document.getElementById("basecourtTierList"),
  leaders3pSection: document.getElementById("leaders3pSection"),
  leaders4pSection: document.getElementById("leaders4pSection"),
  loreSection: document.getElementById("loreSection"),
  basecourtSection: document.getElementById("basecourtSection"),
  tabs: document.querySelectorAll(".tab"),
  subTabs: document.querySelectorAll(".sub-tab"),
  leaderSubTabs: document.getElementById("leaderSubTabs"),
  themeToggle: document.getElementById("themeToggle"),
  downloadBtn: document.getElementById("downloadBtn"),
  editBtn: document.getElementById("editBtn"),
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
let allCards = [];       // loaded card data
let hiddenTiers = new Set(); // tiers the user has removed
let visibleEmptyTiers = new Set(); // empty tiers that should be shown as rows
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
  // Empty rows separate 3P leaders, 4P leaders, lore, and base court
  // First row is header (Name, Tier) or (Name,Tier)
  const leaders3P = [];
  const leaders4P = [];
  const lore = [];
  const basecourt = [];
  let section = 0; // 0 = 3P leaders, 1 = 4P leaders, 2 = lore, 3 = base court
  let headerSkipped = false;

  // Build a lookup map: normalized name → card
  const cardMap = new Map();
  for (const card of cards) {
    cardMap.set(normalizeText(card.name), card);
  }

  for (const row of rows) {
    let name, tier;

    if (row.length === 1) {
      // Single column: "Name,Tier"
      const cell = (row[0] ?? "").trim();
      if (cell.includes(",")) {
        [name, tier] = cell.split(",", 2).map(s => s.trim());
      } else {
        name = cell;
        tier = "";
      }
    } else {
      // Two columns: Name | Tier
      name = (row[0] ?? "").trim();
      tier = (row[1] ?? "").trim();
    }
    tier = tier.toUpperCase();

    // Skip header row
    if (!headerSkipped) {
      if (normalizeText(name) === "name") {
        headerSkipped = true;
        continue;
      }
    }

    // Empty row = separator between sections
    if (!name && !tier) {
      if (headerSkipped) {
        section++;
        if (section > 3) break; // Stop after base court section
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

    if (section === 0) {
      leaders3P.push(entry);
    } else if (section === 1) {
      leaders4P.push(entry);
    } else if (section === 2) {
      lore.push(entry);
    } else if (section === 3) {
      basecourt.push(entry);
    }
  }

  return { leaders3P, leaders4P, lore, basecourt };
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
  for (const entry of entries) {
    const t = TIER_ORDER.includes(entry.tier) ? entry.tier : "D";
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
      cardsDiv.classList.add("drag-over");
    });
    cardsDiv.addEventListener("dragleave", () => {
      cardsDiv.classList.remove("drag-over");
    });
    cardsDiv.addEventListener("drop", (e) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      cardsDiv.classList.remove("drag-over");
      const cardName = e.dataTransfer.getData("text/plain");
      const srcType = e.dataTransfer.getData("application/x-type");
      if (srcType !== type) return; // don't mix leaders/lore
      
      // Check if dropping on a card or drop zone
      const target = e.target.closest('.personal-tier-card, .card-drop-zone');
      if (target) {
        // Already handled by individual card/zone handlers
        return;
      }
      
      // Dropping on empty space in the tier - add to end
      moveCard(cardName, tier, type);
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
        
        dropZone.addEventListener("dragover", (e) => {
          if (!editMode) return;
          e.preventDefault();
          dropZone.classList.add("drag-over");
        });
        dropZone.addEventListener("dragleave", () => {
          dropZone.classList.remove("drag-over");
        });
        dropZone.addEventListener("drop", (e) => {
          if (!editMode) return;
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove("drag-over");
          const cardName = e.dataTransfer.getData("text/plain");
          const srcType = e.dataTransfer.getData("application/x-type");
          if (srcType !== type) return; // don't mix leaders/lore
          const insertBefore = dropZone.dataset.insertBefore;
          moveCard(cardName, tier, type, insertBefore);
        });
        
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
  
  // Drop target (for inserting before this card)
  cardEl.addEventListener("dragover", (e) => {
    if (!editMode) return;
    e.preventDefault();
    cardEl.classList.add("drag-over");
  });
  cardEl.addEventListener("dragleave", () => {
    cardEl.classList.remove("drag-over");
  });
  cardEl.addEventListener("drop", (e) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    cardEl.classList.remove("drag-over");
    const cardName = e.dataTransfer.getData("text/plain");
    const srcType = e.dataTransfer.getData("application/x-type");
    if (srcType !== type || cardName === entry.name) return; // don't mix leaders/lore or drop on self
    moveCard(cardName, entry.tier, type, entry.name);
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

function moveCard(name, newTier, type, insertBefore = null) {
  const entries = type === "leaders" ? (currentLeaderTab === '3p' ? leaderEntries3P : leaderEntries4P) : type === "lore" ? loreEntries : basecourtEntries;
  const entryIndex = entries.findIndex((e) => e.name === name);
  if (entryIndex === -1) return;
  
  const entry = entries[entryIndex];
  const oldTier = entry.tier;
  
  // Remove from current position
  entries.splice(entryIndex, 1);
  
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
  // Check if this is a visible empty tier that should just be hidden from view
  const entries = currentLeaderTab === '3p' ? leaderEntries3P : currentLeaderTab === '4p' ? leaderEntries4P : currentLeaderTab === 'lore' ? loreEntries : basecourtEntries;
  const hasCards = entries.some(e => e.tier === tier);
  
  if (!hasCards && visibleEmptyTiers.has(tier)) {
    // This is a visible empty tier, just remove it from visible set
    visibleEmptyTiers.delete(tier);
    rebuildCurrentView();
    return;
  }

  // Normal tier removal: move cards and hide tier
  // Find the next visible tier below to move cards into
  const visibleTiers = TIER_ORDER.filter((t) => !hiddenTiers.has(t) && t !== tier);
  if (visibleTiers.length === 0) return; // can't remove the last tier

  const tierIdx = TIER_ORDER.indexOf(tier);
  // Pick the next lower visible tier, or the nearest above if none below
  let target = visibleTiers.find((t) => TIER_ORDER.indexOf(t) > tierIdx);
  if (!target) target = visibleTiers[visibleTiers.length - 1];

  // Move all cards from this tier to the target
  for (const e of leaderEntries3P) {
    if (e.tier === tier) e.tier = target;
  }
  for (const e of leaderEntries4P) {
    if (e.tier === tier) e.tier = target;
  }
  for (const e of loreEntries) {
    if (e.tier === tier) e.tier = target;
  }
  for (const e of basecourtEntries) {
    if (e.tier === tier) e.tier = target;
  }

  hiddenTiers.add(tier);
  rebuildCurrentView();
}

function rebuildCurrentView() {
  buildTierListHTML(leaderEntries3P, el.leaders3pTierList, "leaders");
  buildTierListHTML(leaderEntries4P, el.leaders4pTierList, "leaders");
  buildTierListHTML(loreEntries, el.loreTierList, "lore");
  buildTierListHTML(basecourtEntries, el.basecourtTierList, "basecourt");
}

// ========== Edit Mode ==========
function toggleEditMode() {
  editMode = !editMode;
  document.body.classList.toggle("edit-mode", editMode);
  el.editBtn.textContent = editMode ? "✅ Done" : "Edit";
  el.importBtn.style.display = editMode ? "" : "none";
  el.exportBtn.style.display = editMode ? "" : "none";
  el.shareBtn.style.display = editMode ? "" : "none";
  // Clear visible empty tiers when entering edit mode
  if (editMode) {
    visibleEmptyTiers.clear();
  }
  rebuildCurrentView();
}

// ========== Export ==========
function entriesToCsv(leaders3P, leaders4P, lore, basecourt) {
  const TIER_ORDER = ["SSS", "SS", "S", "A", "B", "C", "D", "F"];
  
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
  el.exportText.value = entriesToCsv(leaderEntries3P, leaderEntries4P, loreEntries, basecourtEntries);
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

    if (result.leaders3P.length === 0 && result.leaders4P.length === 0 && result.lore.length === 0 && result.basecourt.length === 0) {
      alert("No valid tier data found in the input.");
      return;
    }

    leaderEntries3P = result.leaders3P;
    leaderEntries4P = result.leaders4P;
    loreEntries = result.lore;
    basecourtEntries = result.basecourt;
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
    basecourt: el.basecourtSection,
  };

  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      // Don't allow clicking disabled tabs
      if (tab.classList.contains('disabled')) return;
      
      const target = tab.dataset.tab;
      el.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      
      // Show/hide sub-tabs
      if (target === 'leaders') {
        el.leaderSubTabs.style.display = '';
        // Show the current leader sub-tab
        const currentSub = currentLeaderTab === '3p' ? 'leaders3p' : 'leaders4p';
        Object.entries(sections).forEach(([key, section]) => {
          section.classList.toggle("hidden", key !== currentSub);
        });
      } else {
        el.leaderSubTabs.style.display = 'none';
        Object.entries(sections).forEach(([key, section]) => {
          section.classList.toggle("hidden", key !== target);
        });
      }
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
    });
  });

  // Initialize sub-tabs visibility
  if (el.tabs[0].classList.contains('active') && el.tabs[0].dataset.tab === 'leaders') {
    el.leaderSubTabs.style.display = '';
  }
}

function disableEmptyTabs() {
  // Check if this is a shared tier list (has URL parameter)
  const urlParams = new URLSearchParams(window.location.search);
  const isSharedTierList = urlParams.has('tierlist');
  
  if (!isSharedTierList) return; // Only disable tabs for shared tier lists
  
  // Disable main tabs for empty sections
  const tabMappings = {
    'leaders': leaderEntries3P.length > 0 || leaderEntries4P.length > 0,
    'lore': loreEntries.length > 0,
    'basecourt': basecourtEntries.length > 0
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
    // Determine which section is visible
    const isLeaders3P = !el.leaders3pSection.classList.contains("hidden");
    const isLeaders4P = !el.leaders4pSection.classList.contains("hidden");
    const isLore = !el.loreSection.classList.contains("hidden");
    const isBaseCourt = !el.basecourtSection.classList.contains("hidden");
    
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

// ========== URL Sharing ==========
const TIER_MAP = { 'SSS': '0', 'SS': '1', 'S': '2', 'A': '3', 'B': '4', 'C': '5', 'D': '6', 'F': '7' };
const REVERSE_TIER_MAP = { '0': 'SSS', '1': 'SS', '2': 'S', '3': 'A', '4': 'B', '5': 'C', '6': 'D', '7': 'F' };

function encodeTierListForURL(selectedSections) {
  // Build card index map for compression
  const cardIndex = new Map();
  allCards.forEach((card, index) => {
    cardIndex.set(card.name, index);
  });
  
  // Create format: name|Section:idx(2)digit(1)idx(2)digit(1)...|name|Section:...
  const parts = [];
  for (const section of selectedSections) {
    let entries = '';
    for (const entry of section.data) {
      const index = cardIndex.get(entry.name);
      const tierDigit = TIER_MAP[entry.tier];
      if (index !== undefined && tierDigit) {
        entries += index.toString().padStart(2, '0') + tierDigit;
      }
    }
    
    if (entries) {
      // Encode section name and data
      const sectionCode = getSectionCode(section.id);
      parts.push(`${btoa(section.name)}|${sectionCode}:${entries}`);
    }
  }
  
  return btoa(parts.join('|')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function getSectionCode(sectionId) {
  switch (sectionId) {
    case 'leaders3p': return '3';
    case 'leaders4p': return '4';
    case 'lore': return 'L';
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
    
    const leaders3P = [];
    const leaders4P = [];
    const lore = [];
    const basecourt = [];
    
    // Detect format: if first part is a section code (3,4,L,B), it's old format
    // If first part is base64 encoded name, it's new format
    const isOldFormat = /^[34LB]:/.test(parts[0]);
    
    if (isOldFormat) {
      // Old format: Section:entries|Section:entries...
      for (const section of parts) {
        const [sectionName, entriesStr] = section.split(':');
        if (!entriesStr) continue;
        
        let targetArray;
        switch (sectionName) {
          case '3': targetArray = leaders3P; break;
          case '4': targetArray = leaders4P; break;
          case 'L': targetArray = lore; break;
          case 'B': targetArray = basecourt; break;
          default: continue;
        }
        
        // Parse fixed-width entries: 2 digits index + 1 digit tier
        for (let i = 0; i < entriesStr.length; i += 3) {
          const indexStr = entriesStr.substr(i, 2);
          const tierDigit = entriesStr.substr(i + 2, 1);
          const index = parseInt(indexStr, 10);
          const tier = REVERSE_TIER_MAP[tierDigit];
          if (!isNaN(index) && index >= 0 && index < allCards.length && tier) {
            const card = allCards[index];
            targetArray.push({ name: card.name, tier, card });
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
        
        let targetArray;
        switch (sectionName) {
          case '3': targetArray = leaders3P; break;
          case '4': targetArray = leaders4P; break;
          case 'L': targetArray = lore; break;
          case 'B': targetArray = basecourt; break;
          default: continue;
        }
        
        // Parse fixed-width entries: 2 digits index + 1 digit tier
        for (let j = 0; j < entriesStr.length; j += 3) {
          const indexStr = entriesStr.substr(j, 2);
          const tierDigit = entriesStr.substr(j + 2, 1);
          const index = parseInt(indexStr, 10);
          const tier = REVERSE_TIER_MAP[tierDigit];
          if (!isNaN(index) && index >= 0 && index < allCards.length && tier) {
            const card = allCards[index];
            targetArray.push({ name: card.name, tier, card, customSectionName: customName });
          }
        }
      }
    }
    
    return { leaders3P, leaders4P, lore, basecourt };
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
          const entryCount = entriesStr.length / 3; // Each entry is 3 characters
          totalCount += entryCount;
          
          // Add default section names
          switch (sectionName) {
            case '3': sectionNames.push('3P Leaders'); break;
            case '4': sectionNames.push('4P Leaders'); break;
            case 'L': sectionNames.push('Lore'); break;
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

function shareTierList() {
  populateShareModal();
  el.shareModal.classList.remove('hidden');
}

function populateShareModal() {
  const sections = [
    { id: 'leaders3p', name: '3P Leaders', data: leaderEntries3P, defaultName: '3P Leaders' },
    { id: 'leaders4p', name: '4P Leaders', data: leaderEntries4P, defaultName: '4P Leaders' },
    { id: 'lore', name: 'Lore', data: loreEntries, defaultName: 'Lore' },
    { id: 'basecourt', name: 'Base Court', data: basecourtEntries, defaultName: 'Base Court' }
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
      case 'basecourt': data = basecourtEntries; break;
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

    if (tierData.leaders3P.length === 0 && tierData.leaders4P.length === 0 && tierData.lore.length === 0 && tierData.basecourt.length === 0) {
      setStatus("No tier list data found. Check the spreadsheet.", { isError: true });
      return;
    }

    leaderEntries3P = tierData.leaders3P;
    leaderEntries4P = tierData.leaders4P;
    loreEntries = tierData.lore;
    basecourtEntries = tierData.basecourt;

    buildTierListHTML(leaderEntries3P, el.leaders3pTierList, "leaders", "3P Leaders");
    buildTierListHTML(leaderEntries4P, el.leaders4pTierList, "leaders", "4P Leaders");
    buildTierListHTML(loreEntries, el.loreTierList, "lore", "Lore");
    buildTierListHTML(basecourtEntries, el.basecourtTierList, "basecourt", "Base Court");

    // Disable tabs for empty sections in shared tier lists
    disableEmptyTabs();

    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, { isError: true });
  }
}

init();
