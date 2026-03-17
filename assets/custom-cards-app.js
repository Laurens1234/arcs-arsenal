// ========== GitHub API Config ==========
const REPO_OWNER = "Laurens1234";
const REPO_NAME = "Arcs-Leader-Generator";
const BRANCH = "main";
const LEADERS_PATH = "results";
const LORE_PATH = "results/lore";

const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

// ======= Beyond the Reach ========
// Names of leaders to show when the "beyond" tab is active
const BEYOND_NAMES = [
  "God's Hand",
  "Firebrand",
  "Scavenger",
  "Diplomat",
  "Imperator",
  "Ancient Wraith",
];
const BEYOND_SET = new Set(BEYOND_NAMES.map(n => normalizeName(n)));

function normalizeName(n) {
  if (!n) return "";
  // normalize curly quotes, lowercase, remove punctuation, collapse spaces
  let s = String(n).toLowerCase();
  s = s.replace(/[’‘]/g, "'");
  // replace all non-alphanumeric characters (except spaces) with nothing
  s = s.replace(/[^a-z0-9\s]/g, "");
  // collapse multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ========== URL Sync ==========
function setUrlTab(tab) {
  try {
    // Use pathname + search to avoid embedding auth/origin specifics
    const path = window.location.pathname || "/";
    const hash = window.location.hash || "";
    const search = `?tab=${encodeURIComponent(tab)}`;
    history.replaceState(null, "", `${path}${search}${hash}`);
  } catch (e) {
    // ignore URL errors
  }
}

function getUrlTab() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab");
  } catch (e) {
    return null;
  }
}

// ========== DOM ==========
const el = {
  status: document.getElementById("status"),
  cardGrid: document.getElementById("cardGrid"),
  query: document.getElementById("query"),
  tabs: document.querySelectorAll(".tab"),
  sortSelect: document.getElementById("sortSelect"),
  resourceSelect: document.getElementById("resourceSelect"),
  setupSelect: document.getElementById("setupSelect"),
  themeToggle: document.getElementById("themeToggle"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightboxImg"),
  lightboxClose: document.querySelector(".lightbox-close"),
  lightboxBackdrop: document.querySelector(".lightbox-backdrop"),
};

// ========== State ==========
let allCards = [];
let activeTab = "leaders";
let selectMode = false;
let selectedCards = new Set(); // stores card imageUrl as unique key

let leaderOrderByName = new Map(); // key: normalizeName(leaderName) -> number (1-based)
let leaderAbilityCharsByName = new Map(); // key: normalizeName(leaderName) -> number (chars in ability names + text)
let leaderResourcesByName = new Map(); // key: normalizeName(leaderName) -> Set<string>
let leaderHasTwoSameResourceByName = new Map(); // key: normalizeName(leaderName) -> boolean
let leaderSetupFootprintByName = new Map(); // key: normalizeName(leaderName) -> string (e.g. "3-3-2|CS-")

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
async function fetchGitHubDir(path) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${path}`);
  return res.json();
}

function nameFromFile(filename, type) {
  // "Alchemist_Card.png" → "Alchemist"
  // "Ancient Prophecy_Lore_Card.png" → "Ancient Prophecy"
  let name = filename.replace(/\.png$/i, "");
  if (type === "Lore") {
    name = name.replace(/_Lore_Card$/i, "");
  } else {
    name = name.replace(/_Card$/i, "");
  }
  return name.replace(/_/g, " ");
}

async function loadCards() {
  el.status.textContent = "Loading cards from GitHub…";

  try {
    // Load leader ordering metadata in the background; don't block image list.
    loadLeaderMetadata().then(() => {
      // Counts for the resource dropdown also depend on this metadata.
      if (activeTab !== "leaders" && activeTab !== "beyond") return;
      render();
    });

    const [leaderFiles, loreFiles] = await Promise.all([
      fetchGitHubDir(LEADERS_PATH),
      fetchGitHubDir(LORE_PATH),
    ]);

    const leaders = leaderFiles
      .filter((f) => f.type === "file" && f.name.toLowerCase().endsWith(".png"))
      .map((f) => ({
        name: nameFromFile(f.name, "Leader"),
        type: "Leader",
        filename: f.name,
        imageUrl: `${RAW_BASE}/${LEADERS_PATH}/${encodeURIComponent(f.name)}`,
      }));

    const lore = loreFiles
      .filter((f) => f.type === "file" && f.name.toLowerCase().endsWith(".png"))
      .map((f) => ({
        name: nameFromFile(f.name, "Lore"),
        type: "Lore",
        filename: f.name,
        imageUrl: `${RAW_BASE}/${LORE_PATH}/${encodeURIComponent(f.name)}`,
      }));

    allCards = [...leaders, ...lore].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    el.status.textContent = "";
    render();
  } catch (err) {
    el.status.textContent = `Error loading cards: ${err.message}`;
    el.status.classList.add("error");
    console.error(err);
  }
}

async function loadLeaderOrderMap() {
  // Deprecated: kept for backwards compatibility; metadata is loaded via loadLeaderMetadata().
  await loadLeaderMetadata();
}

function decodeBackslashEscapes(s) {
  // Decode only the escapes we expect to see in this generated file.
  // Leave any unknown escapes as-is.
  return String(s)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function stripMarkdownForCharCount(s) {
  return String(s)
    // Remove markdown markers commonly used in ability text.
    .replace(/\*\*|\*/g, "")
    // Collapse whitespace to approximate visible character count.
    .replace(/\s+/g, " ")
    .trim();
}

function extractDoubleQuotedStrings(source) {
  // Extracts the contents of all double-quoted string literals in `source`.
  // Handles escaped quotes/backslashes, and allows literal newlines.
  const strings = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '"') {
      i++;
      continue;
    }
    i++; // skip opening quote
    let buf = "";
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\") {
        // Keep escape sequences intact for later decode.
        if (i + 1 < source.length) {
          buf += ch + source[i + 1];
          i += 2;
          continue;
        }
        buf += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        i++; // closing quote
        break;
      }
      buf += ch;
      i++;
    }
    strings.push(decodeBackslashEscapes(buf));
  }
  return strings;
}

function findMatchingParen(text, openParenIndex) {
  // Finds the matching ')' for the '(' at openParenIndex, skipping parentheses inside strings.
  let depth = 0;
  let inString = false;
  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i++; // skip escaped char
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function computeAbilityCharCount(abilitiesCombinedText) {
  const text = String(abilitiesCombinedText || "");
  // Ability headers look like: *Blitzing.* (italic name + dot)
  const headerRe = /(?:^|\n)\s*\*([^*]+?)\.\*\s*/g;
  const matches = [];
  let m;
  while ((m = headerRe.exec(text))) {
    matches.push({
      name: m[1] || "",
      start: m.index,
      contentStart: headerRe.lastIndex,
    });
  }

  // If we can't detect headers, fall back to counting everything as text.
  if (matches.length === 0) {
    const visible = stripMarkdownForCharCount(text);
    return visible.length;
  }

  let total = 0;
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const rawName = stripMarkdownForCharCount(cur.name);
    const body = text.slice(cur.contentStart, next ? next.start : text.length);
    const rawBody = stripMarkdownForCharCount(body);
    total += rawName.length + rawBody.length;
  }
  return total;
}

async function loadLeaderMetadata() {
  // The generator repo contains an ordered Python list of leader objects.
  // We use that list order as the leader "card number" shown on the card,
  // and we also parse ability text to support sorting by ability length.
  const url = `${RAW_BASE}/scripts/leadersFormatted.py`;

  let text = "";
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    text = await res.text();
  } catch (e) {
    return;
  }
  if (!text) return;

  // 1) Card number order (first occurrence wins)
  const nextOrderMap = new Map();
  let nextNumber = 1;
  const nameRe = /"name"\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = nameRe.exec(text))) {
    const name = match[1];
    const key = normalizeName(name);
    if (!key) continue;
    if (nextOrderMap.has(key)) continue;
    nextOrderMap.set(key, nextNumber++);
  }

  // 2) Ability char counts (first occurrence wins)
  const nameMatches = [];
  nameRe.lastIndex = 0;
  while ((match = nameRe.exec(text))) {
    nameMatches.push({ name: match[1], index: match.index });
  }

  const nextAbilityMap = new Map();
  const nextResourcesMap = new Map();
  const nextTwoSameMap = new Map();
  const nextSetupMap = new Map();
  for (let i = 0; i < nameMatches.length; i++) {
    const { name, index } = nameMatches[i];
    const key = normalizeName(name);
    if (!key) continue;

    const nextIndex = i + 1 < nameMatches.length ? nameMatches[i + 1].index : text.length;
    const slice = text.slice(index, nextIndex);

    // abilities
    if (!nextAbilityMap.has(key)) {
      const abilitiesKeyIndex = slice.search(/"abilities"\s*:\s*\(/);
      if (abilitiesKeyIndex !== -1) {
        const openParenIndex = slice.indexOf("(", abilitiesKeyIndex);
        if (openParenIndex !== -1) {
          const closeParenIndex = findMatchingParen(slice, openParenIndex);
          if (closeParenIndex !== -1) {
            const inside = slice.slice(openParenIndex + 1, closeParenIndex);
            const pieces = extractDoubleQuotedStrings(inside);
            if (pieces.length) {
              const combined = pieces.join("");
              const totalChars = computeAbilityCharCount(combined);
              nextAbilityMap.set(key, totalChars);
            }
          }
        }
      }
    }

    // resources
    if (!nextResourcesMap.has(key)) {
      const resMatch = slice.match(/"resources"\s*:\s*\[([^\]]*)\]/);
      if (resMatch && resMatch[1] !== undefined) {
        const items = extractDoubleQuotedStrings(resMatch[1]);
        const cleaned = items.map((s) => stripMarkdownForCharCount(s)).filter(Boolean);
        const set = new Set(cleaned);
        if (set.size) nextResourcesMap.set(key, set);

        if (!nextTwoSameMap.has(key) && cleaned.length >= 2) {
          nextTwoSameMap.set(key, cleaned[0] === cleaned[1]);
        }
      }
    }

    // setup footprint
    if (!nextSetupMap.has(key)) {
      const setupMatch = slice.match(/"setup"\s*:\s*\{([\s\S]*?)\}\s*,?\s*(?:"body_font_size"|\}|$)/);
      const setupText = setupMatch ? setupMatch[1] : "";
      if (setupText) {
        function readSlot(slot) {
          // Capture ships + building within the slot dict.
          const slotRe = new RegExp(`"${slot}"\\s*:\\s*\\{[\\s\\S]*?"ships"\\s*:\\s*(\\d+)[\\s\\S]*?"building"\\s*:\\s*"([^\"]+)"`, "m");
          const m = setupText.match(slotRe);
          if (!m) return null;
          const ships = parseInt(m[1], 10);
          const buildingRaw = stripMarkdownForCharCount(m[2]);
          const building = (buildingRaw || "").toLowerCase();
          return { ships: Number.isFinite(ships) ? ships : 0, building };
        }

        const a = readSlot("A");
        const b = readSlot("B");
        const c = readSlot("C");
        if (a && b && c) {
          const shipsPattern = `${a.ships}-${b.ships}-${c.ships}`;
          function bldChar(bld) {
            if (bld === "city") return "C";
            if (bld === "starport") return "S";
            return "-";
          }
          const buildingsPattern3 = `${bldChar(a.building)}${bldChar(b.building)}${bldChar(c.building)}`;
          const buildingsPattern = buildingsPattern3.endsWith("-")
            ? buildingsPattern3.slice(0, -1)
            : buildingsPattern3;
          nextSetupMap.set(key, `${shipsPattern}|${buildingsPattern}`);
        }
      }
    }
  }

  leaderOrderByName = nextOrderMap;
  leaderAbilityCharsByName = nextAbilityMap;
  leaderResourcesByName = nextResourcesMap;
  leaderHasTwoSameResourceByName = nextTwoSameMap;
  leaderSetupFootprintByName = nextSetupMap;
}

function getLeaderSortMode() {
  return el.sortSelect?.value || "name";
}

function getLeaderResourceFilter() {
  return el.resourceSelect?.value || "any";
}

function getLeaderSetupFilter() {
  return el.setupSelect?.value || "any";
}

function updateSortControlVisibility() {
  if (!el.sortSelect) return;
  const show = activeTab === "leaders" || activeTab === "beyond";
  el.sortSelect.style.display = show ? "" : "none";
  if (el.resourceSelect) el.resourceSelect.style.display = show ? "" : "none";
  if (el.setupSelect) el.setupSelect.style.display = show ? "" : "none";
}

function filterLeaderCardsByResource(cards, resource) {
  if (!resource || resource === "any") return cards;
  return cards.filter((c) => {
    if (c.type !== "Leader") return false;
    const key = normalizeName(c.name);
    if (resource === "twoSame") {
      return leaderHasTwoSameResourceByName.get(key) === true;
    }
    const resources = leaderResourcesByName.get(key);
    return resources ? resources.has(resource) : false;
  });
}

function filterLeaderCardsBySetup(cards, setupKey) {
  if (!setupKey || setupKey === "any") return cards;
  return cards.filter((c) => {
    if (c.type !== "Leader") return false;
    return leaderSetupFootprintByName.get(normalizeName(c.name)) === setupKey;
  });
}

function getLeaderBaseCardsForCounts() {
  // Returns leader cards after tab filtering + search filtering, but BEFORE resource filtering.
  // Used to compute counts displayed in the filter dropdowns.
  let cards = allCards;

  if (activeTab === "leaders") {
    cards = cards.filter(
      (c) => c.type === "Leader" && !BEYOND_SET.has(normalizeName(c.name))
    );
  } else if (activeTab === "beyond") {
    cards = cards.filter(
      (c) => c.type === "Leader" && BEYOND_SET.has(normalizeName(c.name))
    );
  } else {
    return [];
  }

  const q = (el.query.value || "").trim().toLowerCase();
  if (q) {
    cards = cards.filter((c) => c.name.toLowerCase().includes(q));
  }

  return cards;
}

function updateResourceDropdownCounts() {
  if (!el.resourceSelect) return;
  if (activeTab !== "leaders" && activeTab !== "beyond") return;

  // Counts should respect the other filter (setup), but not this resource filter.
  const baseCards = filterLeaderCardsBySetup(getLeaderBaseCardsForCounts(), getLeaderSetupFilter());
  const total = baseCards.length;

  // Update "Has any" label
  const anyOpt = el.resourceSelect.querySelector('option[value="any"]');
  if (anyOpt) anyOpt.textContent = `Has any (${total})`;

  const resourcesInOrder = ["Material", "Fuel", "Weapon", "Relic", "Psionic"];
  for (const r of resourcesInOrder) {
    const opt = el.resourceSelect.querySelector(`option[value="${r}"]`);
    if (!opt) continue;
    let count = 0;
    for (const c of baseCards) {
      const set = leaderResourcesByName.get(normalizeName(c.name));
      if (set && set.has(r)) count++;
    }
    opt.textContent = `Has ${r} (${count})`;
  }

  const twoSameOpt = el.resourceSelect.querySelector('option[value="twoSame"]');
  if (twoSameOpt) {
    let count = 0;
    for (const c of baseCards) {
      if (leaderHasTwoSameResourceByName.get(normalizeName(c.name)) === true) count++;
    }
    twoSameOpt.textContent = `Has same (${count})`;
  }
}

function formatSetupFootprintLabel(setupKey) {
  // setupKey is "shipsPattern|buildingsPattern".
  const [ships, buildings] = String(setupKey).split("|");
  if (!ships || !buildings) return String(setupKey);
  return `${ships} / ${buildings}`;
}

function updateSetupDropdownOptionsAndCounts() {
  if (!el.setupSelect) return;
  if (activeTab !== "leaders" && activeTab !== "beyond") return;

  const selected = getLeaderSetupFilter();

  // Counts should respect the other filter (resource), but not this setup filter.
  const baseCards = filterLeaderCardsByResource(getLeaderBaseCardsForCounts(), getLeaderResourceFilter());

  const counts = new Map();
  for (const c of baseCards) {
    const key = leaderSetupFootprintByName.get(normalizeName(c.name));
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const keys = [...counts.keys()];
  keys.sort((a, b) => {
    const aCount = counts.get(a) || 0;
    const bCount = counts.get(b) || 0;
    if (aCount !== bCount) return bCount - aCount;

    const [aShips, aBld] = String(a).split("|");
    const [bShips, bBld] = String(b).split("|");
    const aTotal = (aShips || "").split("-").reduce((s, x) => s + (parseInt(x, 10) || 0), 0);
    const bTotal = (bShips || "").split("-").reduce((s, x) => s + (parseInt(x, 10) || 0), 0);
    if (aTotal !== bTotal) return bTotal - aTotal;
    if (aShips !== bShips) return String(aShips).localeCompare(String(bShips));
    return String(aBld).localeCompare(String(bBld));
  });

  // Rebuild options (preserve selection if possible)
  const total = baseCards.length;
  const anyText = `Setup: Any (${total})`;
  el.setupSelect.innerHTML = `<option value="any">${anyText}</option>` +
    keys.map((k) => {
      const n = counts.get(k) || 0;
      const label = formatSetupFootprintLabel(k);
      return `<option value="${String(k).replace(/"/g, "&quot;")}">Setup: ${label} (${n})</option>`;
    }).join("");

  // Restore selection
  const stillExists = [...el.setupSelect.options].some((o) => o.value === selected);
  el.setupSelect.value = stillExists ? selected : "any";
}

// ========== Rendering ==========
function getFilteredCards() {
  let cards = allCards;

  // Tab filter
  if (activeTab === "leaders") {
    // Regular leaders tab should NOT include the Beyond the Reach leader set
    cards = cards.filter(
      (c) => c.type === "Leader" && !BEYOND_SET.has(normalizeName(c.name))
    );
  } else if (activeTab === "lore") {
    cards = cards.filter((c) => c.type === "Lore");
  } else if (activeTab === "beyond") {
    // Show only the specified leaders for the "Beyond the Reach" tab
    cards = cards.filter((c) => c.type === "Leader" && BEYOND_SET.has(normalizeName(c.name)));
  }

  // Filters (leader tabs only)
  if (activeTab === "leaders" || activeTab === "beyond") {
    cards = filterLeaderCardsByResource(cards, getLeaderResourceFilter());
    cards = filterLeaderCardsBySetup(cards, getLeaderSetupFilter());
  }

  // Search filter
  const q = (el.query.value || "").trim().toLowerCase();
  if (q) {
    cards = cards.filter((c) => c.name.toLowerCase().includes(q));
  }

  // Sorting (leaders tab only)
  if (activeTab === "leaders") {
    const sortMode = getLeaderSortMode();
    if (sortMode === "number") {
      cards = [...cards].sort((a, b) => {
        const aNum = leaderOrderByName.get(normalizeName(a.name)) ?? Number.POSITIVE_INFINITY;
        const bNum = leaderOrderByName.get(normalizeName(b.name)) ?? Number.POSITIVE_INFINITY;
        if (aNum !== bNum) return aNum - bNum;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === "abilityCharsAsc" || sortMode === "abilityCharsDesc") {
      const dir = sortMode === "abilityCharsAsc" ? 1 : -1;
      cards = [...cards].sort((a, b) => {
        // Put leaders with unknown counts at the end.
        const aChars = leaderAbilityCharsByName.get(normalizeName(a.name));
        const bChars = leaderAbilityCharsByName.get(normalizeName(b.name));

        const aKnown = Number.isFinite(aChars);
        const bKnown = Number.isFinite(bChars);
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        if (!aKnown && !bKnown) return a.name.localeCompare(b.name);

        if (aChars !== bChars) return (aChars - bChars) * dir;
        return a.name.localeCompare(b.name);
      });
    }
  }

  return cards;
}

function render() {
  updateResourceDropdownCounts();
  updateSetupDropdownOptionsAndCounts();
  const cards = getFilteredCards();

  if (cards.length === 0 && allCards.length > 0) {
    el.cardGrid.innerHTML = `<p class="status">No cards match your search.</p>`;
    return;
  }

  el.cardGrid.innerHTML = cards
    .map(
      (card, i) => `
    <div class="card${selectMode ? ' selectable' : ''}${selectedCards.has(card.imageUrl) ? ' selected' : ''}" data-index="${i}" style="animation-delay: ${Math.min(i * 0.02, 0.22)}s">
      ${selectMode ? `<div class="card-checkbox${selectedCards.has(card.imageUrl) ? ' checked' : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>` : ''}
      <div class="card-image">
        <img src="${card.imageUrl}" alt="${card.name}" loading="lazy" />
      </div>
      <div class="card-info">
        <h3 class="card-name">${card.name}</h3>
      </div>
    </div>`
    )
    .join("");

  // Attach click listeners
  el.cardGrid.querySelectorAll(".card").forEach((cardEl) => {
    cardEl.addEventListener("click", () => {
      const idx = parseInt(cardEl.dataset.index);
      const card = cards[idx];
      if (!card) return;
      if (selectMode) {
        toggleCardSelection(card, cardEl);
      } else {
        openLightbox(card);
      }
    });
  });

  updateSelectionCount();
}

// ========== Lightbox ==========
function openLightbox(card) {
  el.lightboxImg.src = card.imageUrl;
  el.lightboxImg.alt = card.name;
  el.lightbox.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  el.lightbox.classList.add("hidden");
  el.lightboxImg.src = "";
  document.body.style.overflow = "";
}

// ========== Selection ==========
function toggleSelectMode() {
  selectMode = !selectMode;
  document.getElementById("selectBtn").textContent = selectMode ? "✅ Done" : "☑ Select";
  document.getElementById("selectActions").style.display = selectMode ? "inline-flex" : "none";
  if (!selectMode) {
    // Keep selections but exit visual mode
  }
  render();
}

function toggleCardSelection(card, cardEl) {
  if (selectedCards.has(card.imageUrl)) {
    selectedCards.delete(card.imageUrl);
    cardEl.classList.remove("selected");
    cardEl.querySelector(".card-checkbox")?.classList.remove("checked");
  } else {
    selectedCards.add(card.imageUrl);
    cardEl.classList.add("selected");
    cardEl.querySelector(".card-checkbox")?.classList.add("checked");
  }
  updateSelectionCount();
}

function selectAll() {
  const cards = getFilteredCards();
  for (const c of cards) selectedCards.add(c.imageUrl);
  render();
}

function deselectAll() {
  selectedCards.clear();
  render();
}

function updateSelectionCount() {
  const countEl = document.getElementById("selectionCount");
  if (!countEl) return;
  const n = selectedCards.size;
  countEl.textContent = n > 0 ? `${n} selected` : "";
  document.getElementById("printBtn").textContent = n > 0 ? `🖨 Print (${n})` : "🖨 Print All";
}

// ========== Print ==========
function printCards() {
  // If cards are selected, print only those; otherwise print all visible
  const visible = getFilteredCards();
  const cards = selectedCards.size > 0
    ? visible.filter((c) => selectedCards.has(c.imageUrl))
    : visible;
  if (cards.length === 0) return;

  const container = document.getElementById("printContainer");
  container.innerHTML = "";

  // Pre-load all images, then print
  const promises = cards.map((card) => {
    return new Promise((resolve) => {
      const div = document.createElement("div");
      div.className = `print-card ${card.type === "Lore" ? "print-card-lore" : "print-card-leader"}`;
      const img = document.createElement("img");
      img.src = card.imageUrl;
      img.alt = card.name;
      img.onload = resolve;
      img.onerror = resolve; // don't block on broken images
      div.appendChild(img);
      container.appendChild(div);
    });
  });

  Promise.all(promises).then(() => {
    window.print();
  });
}

// ========== Download Images ==========
async function downloadImages() {
  const visible = getFilteredCards();
  const cards = selectedCards.size > 0
    ? visible.filter((c) => selectedCards.has(c.imageUrl))
    : visible;
  if (cards.length === 0) return;

  el.status.textContent = "Preparing download…";

  try {
    const zip = new JSZip();
    const folder = zip.folder("cards") || zip;

    for (const card of cards) {
      try {
        const res = await fetch(card.imageUrl);
        const blob = await res.blob();
        const filename = card.filename || `${card.name.replace(/\s+/g, "_")}.png`;
        folder.file(filename, blob);
      } catch (err) {
        console.error("Failed to fetch", card.imageUrl, err);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    function tabToFilename(tab) {
      const map = {
        leaders: "leaders.zip",
        lore: "lore.zip",
        all: "all_cards.zip",
        beyond: "beyond-the-reach.zip",
      };
      return map[tab] || `${(tab || 'cards').replace(/\s+/g, '_')}.zip`;
    }
    a.download = tabToFilename(activeTab);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error creating ZIP", err);
  } finally {
    el.status.textContent = "";
  }
}

// ========== Event Listeners ==========
function init() {
  initTheme();

  el.themeToggle.addEventListener("click", toggleTheme);

  // Print
  document.getElementById("printBtn").addEventListener("click", printCards);
  // Download
  const downloadBtn = document.getElementById("downloadBtn");
  if (downloadBtn) downloadBtn.addEventListener("click", downloadImages);

  // Select mode
  document.getElementById("selectBtn").addEventListener("click", toggleSelectMode);
  document.getElementById("selectAllBtn").addEventListener("click", selectAll);
  document.getElementById("deselectAllBtn").addEventListener("click", deselectAll);

  // Tabs
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTab = tab.dataset.tab;
      // reflect tab in the URL
      setUrlTab(activeTab);
      updateSortControlVisibility();
      render();
    });
  });

  // Read tab from URL if present and valid
  const initialUrlTab = getUrlTab();
  const validTabs = ["leaders", "lore", "all", "beyond"];
  if (initialUrlTab && validTabs.includes(initialUrlTab)) {
    activeTab = initialUrlTab;
    // update active class on tab buttons
    el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
  }

  updateSortControlVisibility();

  // Sort
  if (el.sortSelect) {
    el.sortSelect.addEventListener("change", () => {
      render();
    });
  }

  // Resource filter
  if (el.resourceSelect) {
    el.resourceSelect.addEventListener("change", () => {
      render();
    });
  }

  // Setup filter
  if (el.setupSelect) {
    el.setupSelect.addEventListener("change", () => {
      render();
    });
  }

  // Search
  el.query.addEventListener("input", render);

  // Lightbox close
  el.lightboxClose.addEventListener("click", closeLightbox);
  el.lightboxBackdrop.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  loadCards();
}

init();
