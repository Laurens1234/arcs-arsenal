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
  "Poet",
  "Brainbox"
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

function getUrlCardName() {
  try {
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const name = params.get("card");
    return name ? name : null;
  } catch (e) {
    return null;
  }
}

let suppressHashHandler = false;

function setUrlCardName(cardName) {
  try {
    const path = window.location.pathname || "/";
    const search = window.location.search || "";

    const hash = (window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(hash);
    if (cardName) params.set("card", String(cardName));
    else params.delete("card");

    const nextHash = params.toString();
    suppressHashHandler = true;
    history.replaceState(null, "", `${path}${search}${nextHash ? "#" + nextHash : ""}`);
  } catch (e) {
    // ignore URL errors
  } finally {
    // Let the browser dispatch hashchange first if it will.
    setTimeout(() => {
      suppressHashHandler = false;
    }, 0);
  }
}

function clearUrlCardName() {
  setUrlCardName("");
}

// ========== DOM ==========
const el = {
  status: document.getElementById("status"),
  cardGrid: document.getElementById("cardGrid"),
  query: document.getElementById("query"),
  searchModeSelect: document.getElementById("searchModeSelect"),
  tabs: document.querySelectorAll(".tab"),
  sortSelect: document.getElementById("sortSelect"),
  resourceSelect: document.getElementById("resourceSelect"),
  setupSelect: document.getElementById("setupSelect"),
  draftBtn: document.getElementById("draftBtn"),
  themeToggle: document.getElementById("themeToggle"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightboxImg"),
  lightboxTitle: document.getElementById("lightboxTitle"),
  lightboxMeta: document.getElementById("lightboxMeta"),
  lightboxAbilities: document.getElementById("lightboxAbilities"),
  lightboxBackdrop: document.querySelector(".lightbox-backdrop"),
};

// ========== State ==========
let allCards = [];
let activeTab = "leaders";
let selectMode = false;
let selectedCards = new Set(); // stores card imageUrl as unique key
let currentLightboxCard = null;
let draftedCardImageUrls = null; // Set<string> of imageUrl

function isDraftActive() {
  return draftedCardImageUrls instanceof Set && draftedCardImageUrls.size > 0;
}

function updateDraftButton() {
  if (!el.draftBtn) return;
  el.draftBtn.textContent = isDraftActive() ? "✅ Done" : "Draft";
}

let leaderOrderByName = new Map(); // key: normalizeName(leaderName) -> number (1-based)
let leaderAbilityCharsByName = new Map(); // key: normalizeName(leaderName) -> number (chars in ability names + text)
let leaderAbilityTextByName = new Map(); // key: normalizeName(leaderName) -> string (combined abilities text)
let leaderResourcesByName = new Map(); // key: normalizeName(leaderName) -> Set<string>
let leaderResourceListByName = new Map(); // key: normalizeName(leaderName) -> string[] (ordered)
let leaderHasTwoSameResourceByName = new Map(); // key: normalizeName(leaderName) -> boolean
let leaderSetupFootprintByName = new Map(); // key: normalizeName(leaderName) -> string (e.g. "3-3-2|CS-")
let leaderMetadataLoaded = false;

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
      if (!el.lightbox.classList.contains("hidden") && currentLightboxCard) {
        updateLightboxDetails(currentLightboxCard);
      }
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

    // If the URL has a card hash, open it (and switch to a sensible tab).
    const cardFromUrl = getUrlCardName();
    if (cardFromUrl) {
      const target = allCards.find((c) => normalizeName(c.name) === normalizeName(cardFromUrl));
      if (target) {
        if (target.type === "Leader") {
          activeTab = BEYOND_SET.has(normalizeName(target.name)) ? "beyond" : "leaders";
        } else if (target.type === "Lore") {
          activeTab = "lore";
        }
        el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === activeTab));
        setUrlTab(activeTab);
        updateSortControlVisibility();
        render();
        openLightbox(target);
      }
    }
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
  const urls = {
    leaders: `${RAW_BASE}/scripts/leadersFormatted.py`,
    btr: `${RAW_BASE}/scripts/btrFormatted.py`,
  };

  async function safeFetchText(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return "";
      return await res.text();
    } catch (e) {
      return "";
    }
  }

  function parseInto(text, opts) {
    const {
      includeKey = () => true,
      overwrite = false,
      writeOrder = false,
      orderCounter = { value: 1 },
      orderMap,
      abilityCharsMap,
      abilityTextMap,
      resourcesMap,
      resourceListMap,
      twoSameMap,
      setupMap,
    } = opts;

    if (!text) return;

    const nameRe = /"name"\s*:\s*"([^"]+)"/g;
    const nameMatches = [];
    let match;
    while ((match = nameRe.exec(text))) {
      const name = match[1];
      const key = normalizeName(name);
      if (!key) continue;
      if (!includeKey(key)) continue;
      if (writeOrder && !orderMap.has(key)) {
        orderMap.set(key, orderCounter.value++);
      }
      nameMatches.push({ name, key, index: match.index });
    }

    for (let i = 0; i < nameMatches.length; i++) {
      const { key, index } = nameMatches[i];
      const nextIndex = i + 1 < nameMatches.length ? nameMatches[i + 1].index : text.length;
      const slice = text.slice(index, nextIndex);

      // abilities
      if (overwrite || !abilityCharsMap.has(key) || !abilityTextMap.has(key)) {
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
                abilityTextMap.set(key, combined);
                abilityCharsMap.set(key, computeAbilityCharCount(combined));
              }
            }
          }
        }
      }

      // resources
      if (overwrite || !resourcesMap.has(key) || !resourceListMap.has(key)) {
        const resMatch = slice.match(/"resources"\s*:\s*\[([^\]]*)\]/);
        if (resMatch && resMatch[1] !== undefined) {
          const items = extractDoubleQuotedStrings(resMatch[1]);
          const cleaned = items.map((s) => stripMarkdownForCharCount(s)).filter(Boolean);
          const set = new Set(cleaned);
          if (set.size) {
            resourcesMap.set(key, set);
            resourceListMap.set(key, cleaned);
          }
          if (cleaned.length >= 2) {
            twoSameMap.set(key, cleaned[0] === cleaned[1]);
          }
        }
      }

      // setup footprint
      if (overwrite || !setupMap.has(key)) {
        const setupMatch = slice.match(/"setup"\s*:\s*\{([\s\S]*?)\}\s*,?\s*(?:"body_font_size"|\}|$)/);
        const setupText = setupMatch ? setupMatch[1] : "";
        if (setupText) {
          function readSlot(slot) {
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
            setupMap.set(key, `${shipsPattern}|${buildingsPattern}`);
          }
        }
      }
    }
  }

  const [leadersText, btrText] = await Promise.all([
    safeFetchText(urls.leaders),
    safeFetchText(urls.btr),
  ]);

  const nextOrderMap = new Map();
  const nextAbilityMap = new Map();
  const nextAbilityTextMap = new Map();
  const nextResourcesMap = new Map();
  const nextResourceListMap = new Map();
  const nextTwoSameMap = new Map();
  const nextSetupMap = new Map();
  const orderCounter = { value: 1 };

  // Regular leaders use leadersFormatted.py
  parseInto(leadersText, {
    includeKey: (k) => !BEYOND_SET.has(k),
    overwrite: false,
    writeOrder: true,
    orderCounter,
    orderMap: nextOrderMap,
    abilityCharsMap: nextAbilityMap,
    abilityTextMap: nextAbilityTextMap,
    resourcesMap: nextResourcesMap,
    resourceListMap: nextResourceListMap,
    twoSameMap: nextTwoSameMap,
    setupMap: nextSetupMap,
  });

  // Beyond the Reach leaders use btrFormatted.py
  parseInto(btrText, {
    includeKey: (k) => BEYOND_SET.has(k),
    overwrite: true,
    writeOrder: false,
    orderCounter,
    orderMap: nextOrderMap,
    abilityCharsMap: nextAbilityMap,
    abilityTextMap: nextAbilityTextMap,
    resourcesMap: nextResourcesMap,
    resourceListMap: nextResourceListMap,
    twoSameMap: nextTwoSameMap,
    setupMap: nextSetupMap,
  });

  leaderOrderByName = nextOrderMap;
  leaderAbilityCharsByName = nextAbilityMap;
  leaderAbilityTextByName = nextAbilityTextMap;
  leaderResourcesByName = nextResourcesMap;
  leaderResourceListByName = nextResourceListMap;
  leaderHasTwoSameResourceByName = nextTwoSameMap;
  leaderSetupFootprintByName = nextSetupMap;
  leaderMetadataLoaded = true;
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

function getSearchMode() {
  const mode = el.searchModeSelect?.value || "name";
  if (mode === "abilities" || mode === "both" || mode === "name") return mode;
  return "name";
}

function getLeaderAbilitySearchText(cardName) {
  const key = normalizeName(cardName);
  const raw = leaderAbilityTextByName.get(key) || "";
  // Use a normalized visible-ish string for searching.
  return stripMarkdownForCharCount(raw).toLowerCase();
}

function cardMatchesQuery(card, qLower, searchMode) {
  if (!qLower) return true;
  const nameText = String(card?.name || "").toLowerCase();

  if (searchMode === "name") {
    return nameText.includes(qLower);
  }

  if (searchMode === "abilities") {
    if (card?.type !== "Leader") return false;
    return getLeaderAbilitySearchText(card.name).includes(qLower);
  }

  // both
  if (nameText.includes(qLower)) return true;
  if (card?.type !== "Leader") return false;
  return getLeaderAbilitySearchText(card.name).includes(qLower);
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
  const mode = getSearchMode();
  if (q) {
    cards = cards.filter((c) => cardMatchesQuery(c, q, mode));
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
function getFilteredCards({ ignoreDraft = false } = {}) {
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
  const mode = getSearchMode();
  if (q) {
    cards = cards.filter((c) => cardMatchesQuery(c, q, mode));
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

  // Draft filter (applied after all other filtering/sorting)
  if (!ignoreDraft && draftedCardImageUrls && draftedCardImageUrls.size > 0) {
    cards = cards.filter((c) => draftedCardImageUrls.has(c.imageUrl));
  }

  return cards;
}

function pickRandomSubset(items, n) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

function draftCards() {
  // When draft mode is active, this button becomes "Done".
  if (isDraftActive()) {
    draftedCardImageUrls = null;
    render();
    return;
  }

  const source = getFilteredCards({ ignoreDraft: true });
  if (source.length === 0) return;

  const raw = prompt("Draft how many cards?", "4");
  if (raw === null) return;
  const n = parseInt(String(raw).trim(), 10);

  if (!Number.isFinite(n) || n <= 0) return;
  const take = Math.min(n, source.length);
  const drafted = pickRandomSubset(source, take);
  draftedCardImageUrls = new Set(drafted.map((c) => c.imageUrl));
  render();
}

function render() {
  updateDraftButton();
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
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdownToHtml(s) {
  // Minimal markdown support used by the generator output.
  // Safe because we escape first.
  const escaped = escapeHtml(s);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function parseAbilitySections(abilitiesCombinedText) {
  const text = String(abilitiesCombinedText || "");
  const headerRe = /(?:^|\n)\s*\*([^*]+?)\.\*\s*/g;
  const matches = [];
  let m;
  while ((m = headerRe.exec(text))) {
    matches.push({
      name: (m[1] || "").trim(),
      start: m.index,
      contentStart: headerRe.lastIndex,
    });
  }

  if (matches.length === 0) {
    const body = text.trim();
    return body ? [{ name: "", body }] : [];
  }

  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const body = text.slice(cur.contentStart, next ? next.start : text.length).trim();
    sections.push({ name: cur.name, body });
  }
  return sections;
}

function clearLightboxDetails() {
  if (el.lightboxTitle) el.lightboxTitle.textContent = "";
  if (el.lightboxMeta) el.lightboxMeta.textContent = "";
  if (el.lightboxAbilities) el.lightboxAbilities.innerHTML = "";
}

function updateLightboxDetails(card) {
  if (!card) {
    clearLightboxDetails();
    return;
  }

  if (el.lightboxTitle) el.lightboxTitle.textContent = card.name || "";

  if (card.type !== "Leader") {
    if (el.lightboxMeta) el.lightboxMeta.textContent = "";
    if (el.lightboxAbilities) el.lightboxAbilities.innerHTML = "";
    return;
  }

  const key = normalizeName(card.name);
  const resources = leaderResourceListByName.get(key) || [];
  const setupKey = leaderSetupFootprintByName.get(key) || "";

  const metaParts = [];
  if (resources.length) metaParts.push(`Resources: ${resources.join(", ")}`);
  if (setupKey) metaParts.push(`Setup: ${formatSetupFootprintLabel(setupKey)}`);
  if (el.lightboxMeta) el.lightboxMeta.textContent = metaParts.join(" · ");

  const abilitiesText = leaderAbilityTextByName.get(key);
  if (!el.lightboxAbilities) return;

  if (!abilitiesText) {
    if (!leaderMetadataLoaded) {
      el.lightboxAbilities.innerHTML = `<div class="lightbox-ability"><div class="lightbox-ability-body">Loading details…</div></div>`;
    } else {
      el.lightboxAbilities.innerHTML = `<div class="lightbox-ability"><div class="lightbox-ability-body">No ability text found.</div></div>`;
    }
    return;
  }

  const sections = parseAbilitySections(abilitiesText);
  if (sections.length === 0) {
    el.lightboxAbilities.innerHTML = `<div class="lightbox-ability"><div class="lightbox-ability-body">No ability text found.</div></div>`;
    return;
  }

  el.lightboxAbilities.innerHTML = sections
    .map(({ name, body }) => {
      const nameHtml = name ? `<div class="lightbox-ability-name">${escapeHtml(name)}</div>` : "";
      const bodyHtml = renderInlineMarkdownToHtml(body).replace(/\n/g, "<br>");
      return `<div class="lightbox-ability">${nameHtml}<div class="lightbox-ability-body">${bodyHtml}</div></div>`;
    })
    .join("");
}

function openLightbox(card) {
  currentLightboxCard = card;
  el.lightboxImg.src = card.imageUrl;
  el.lightboxImg.alt = card.name;
  updateLightboxDetails(card);
  el.lightbox.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setUrlCardName(card.name);
}

function closeLightbox() {
  el.lightbox.classList.add("hidden");
  el.lightboxImg.src = "";
  currentLightboxCard = null;
  clearLightboxDetails();
  document.body.style.overflow = "";
  clearUrlCardName();
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

  // Build explicit rows so adjacent cards can share a single cut line (no doubled borders).
  // Assumes A4 with @page horizontal margins totaling 10mm (see CSS): usable width ≈ 200mm.
  const PAGE_CONTENT_WIDTH_MM = 200;
  const widthMmForCard = (card) => (card.type === "Lore" ? 63 : 70);

  /** @type {Array<Array<any>>} */
  const rows = [];
  let currentRow = [];
  let currentWidth = 0;

  for (const card of cards) {
    const w = widthMmForCard(card);
    if (currentRow.length > 0 && currentWidth + w > PAGE_CONTENT_WIDTH_MM) {
      rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
    currentRow.push(card);
    currentWidth += w;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const promises = [];
  rows.forEach((rowCards, rowIndex) => {
    const rowEl = document.createElement("div");
    rowEl.className = "print-row";

    rowCards.forEach((card, colIndex) => {
      const div = document.createElement("div");
      const isLeader = card.type !== "Lore";
      const isEndOfRow = colIndex === rowCards.length - 1;
      const isLastRow = rowIndex === rows.length - 1;
      div.className = [
        "print-card",
        isLeader ? "print-card-leader" : "print-card-lore",
        isEndOfRow ? "cut-right" : "",
        isLastRow ? "cut-bottom" : "",
      ].filter(Boolean).join(" ");

      const img = document.createElement("img");
      img.src = card.imageUrl;
      img.alt = card.name;

      promises.push(new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve; // don't block on broken images
      }));

      div.appendChild(img);
      rowEl.appendChild(div);
    });

    container.appendChild(rowEl);
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

  // Draft
  if (el.draftBtn) el.draftBtn.addEventListener("click", draftCards);

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
  if (el.searchModeSelect) {
    el.searchModeSelect.addEventListener("change", render);
  }

  // Lightbox close
  el.lightboxBackdrop.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  window.addEventListener("hashchange", () => {
    if (suppressHashHandler) return;
    const cardName = getUrlCardName();
    if (!cardName) {
      if (!el.lightbox.classList.contains("hidden")) closeLightbox();
      return;
    }

    const target = allCards.find((c) => normalizeName(c.name) === normalizeName(cardName));
    if (target) {
      if (!currentLightboxCard || normalizeName(currentLightboxCard.name) !== normalizeName(target.name)) {
        openLightbox(target);
      }
    }
  });

  loadCards();
}

init();
