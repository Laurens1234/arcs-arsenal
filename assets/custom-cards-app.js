// ========== GitHub API Config ==========
const REPO_OWNER = "Laurens1234";
const REPO_NAME = "Arcs-Leader-Generator";
const BRANCH = "main";
const LEADERS_PATH = "results/leader";
const LORE_PATH = "results/lore";
const COURT_PATHS = ["results/guild", "results/vox"];

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
let courtCards = [];
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
let parsedLeadersList = [];

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

function filenameFromName(name, type) {
  // Keep all letters, numbers, spaces, and underscores from the name; remove all other characters
  let s = String(name || "").replace(/[^A-Za-z0-9_ ]/g, "");
  if (type === "Lore") return `${s}_Lore_Card.png`;
  if (type === "Guild") return `${s}_Guild_Card.png`;
  if (type === "Vox") return `${s}_Vox_Card.png`;
  return `${s}_Card.png`;
}

function generateFilenameCandidates(name, type) {
  const out = [];
  const suffix = type === "Lore" ? "_Lore_Card.png" : "_Card.png";
  const raw = String(name || "").trim();

  // candidate 1: preserve spaces, cleaned of odd punctuation
  const keepSpaces = raw.replace(/[’‘]/g, "").replace(/[^A-Za-z0-9\s\-']/g, "").replace(/\s+/g, " ").trim();
  out.push(`${keepSpaces}${suffix}`);

  // candidate 2: remove underscores and spaces (join)
  const joinNoUnderscore = raw.replace(/[_\s]+/g, "").replace(/[’‘]/g, "").replace(/[^A-Za-z0-9\-']/g, "");
  if (joinNoUnderscore) out.push(`${joinNoUnderscore}${suffix}`);

  // candidate 3: spaces -> underscores (older style)
  const underscored = raw.replace(/[’‘]/g, "").replace(/[^A-Za-z0-9\s\-']/g, "").replace(/\s+/g, "_").trim();
  if (underscored) out.push(`${underscored}${suffix}`);

  // candidate 4: remove spaces only (join words)
  const join = raw.replace(/\s+/g, "").replace(/[’‘]/g, "").replace(/[^A-Za-z0-9\-']/g, "");
  if (join) out.push(`${join}${suffix}`);

  // candidate 5/6: lowercase variants for the above join forms
  if (joinNoUnderscore) out.push(`${joinNoUnderscore.toLowerCase()}${suffix}`);
  if (join) out.push(`${join.toLowerCase()}${suffix}`);

  // de-dupe while preserving order
  return [...new Set(out)];
}

async function findExistingImageUrl(folderPath, name, type) {
  const filename = filenameFromName(name, type);
  const url = `${RAW_BASE}/${folderPath}/${encodeURIComponent(filename)}`;
  return { url, filename };
}

async function loadCards() {
  el.status.textContent = "Loading cards from GitHub…";

  try {
    // Load leader metadata (parsed from raw YAML) and YAML manifests for lore/guild/vox.
    const parsedLeaders = await loadLeaderMetadata();
    const parsedLore = await loadYamlListFor('lore');
    const parsedGuild = await loadYamlListFor('guild');
    const parsedVox = await loadYamlListFor('vox');

    // Update lightbox/details now that metadata is available
    if (activeTab === "leaders" && !el.lightbox.classList.contains("hidden") && currentLightboxCard) {
      updateLightboxDetails(currentLightboxCard);
    }

    // Build leader list from parsed YAML only (no API fallback)
    const leaderPromises = (Array.isArray(parsedLeaders) ? parsedLeaders : []).map(async (p) => {
      const found = await findExistingImageUrl(LEADERS_PATH, p.name, "Leader");
      return {
        name: p.name,
        type: "Leader",
        filename: found.filename,
        imageUrl: found.url,
      };
    });
    const leaders = await Promise.all(leaderPromises);

    // Build lore list from parsed YAML only (resolve existing filename variants)
    const lorePromises = (Array.isArray(parsedLore) ? parsedLore : []).map(async (p) => {
      const found = await findExistingImageUrl(LORE_PATH, p.name, "Lore");
      return {
        name: p.name,
        type: "Lore",
        filename: found.filename,
        imageUrl: found.url,
      };
    });
    const lore = await Promise.all(lorePromises);


    // Build court deck (guild + vox) from raw YAML manifests only
    const guildPromises = (Array.isArray(parsedGuild) ? parsedGuild : []).map(async (p) => {
      const found = await findExistingImageUrl(COURT_PATHS[0], p.name, "Guild");
      return {
        name: p.name,
        type: "Guild",
        filename: found.filename,
        imageUrl: found.url,
      };
    });

    const voxPromises = (Array.isArray(parsedVox) ? parsedVox : []).map(async (p) => {
      const found = await findExistingImageUrl(COURT_PATHS[1], p.name, "Vox");
      return {
        name: p.name,
        type: "Vox",
        filename: found.filename,
        imageUrl: found.url,
      };
    });

    const guild = await Promise.all(guildPromises);
    const vox = await Promise.all(voxPromises);

    courtCards = [...guild, ...vox].sort((a, b) => a.name.localeCompare(b.name));

    // The leaders tab should only include true leaders (not guild/vox)
    // Sort leaders by their order in leaders.yml, not alphabetically
    // Find the order for each leader using leaderOrderByName (set after loadLeaderMetadata)
    // For lore, keep alphabetical order after leaders
    function leaderOrderSort(a, b) {
      const aOrder = leaderOrderByName.get(normalizeName(a.name));
      const bOrder = leaderOrderByName.get(normalizeName(b.name));
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return a.name.localeCompare(b.name);
    }
    const sortedLeaders = [...leaders].sort(leaderOrderSort);
    const sortedLore = [...lore].sort((a, b) => a.name.localeCompare(b.name));
    allCards = [...sortedLeaders, ...sortedLore];

    el.status.textContent = "";
    render();

    // If the URL has a card hash, open it (and switch to a sensible tab).
    const cardFromUrl = getUrlCardName();
    if (cardFromUrl) {
      let target = allCards.find((c) => normalizeName(c.name) === normalizeName(cardFromUrl));
      if (!target) {
        target = courtCards.find((c) => normalizeName(c.name) === normalizeName(cardFromUrl));
        if (target) activeTab = "court";
      } else {
        if (target.type === "Leader") {
          // Always show leader targets in the main leaders tab (previous 'beyond' leaders are included)
          activeTab = "leaders";
        } else if (target.type === "Lore") {
          activeTab = "lore";
        }
      }

      if (target) {
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

// Parse a simple YAML list of card objects (used for leaders, lore, guild, vox)
function parseYamlList(yaml) {
  if (!yaml) return [];
  // Ensure splitting works for items at start of file
  const text = yaml.startsWith('\n') ? yaml : '\n' + yaml;
  const blocks = text.split(/\n-(?=\s*(?:name|image_name):)/g);
  const items = [];

  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i];
    if (!block || !block.trim()) continue;
    // Remove any leading '-' or whitespace
    block = block.replace(/^\s*-\s*/, '');

    // Name
    const nameMatch = block.match(/name:\s*"?([^\n"]+)"?/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();
    const key = normalizeName(name);

    // Abilities: block scalar (|), quoted multi-line, or inline
    let abilities = '';
    const abilitiesBlockMatch = block.match(/abilities:\s*\|[\r\n]+((?:\s{2,}.*[\r\n]*)*)(?=(?:\n\s{2}[A-Za-z0-9_-]+:)|\n*$)/m);
    if (abilitiesBlockMatch) {
      // strip common indent (at least 2 spaces)
      abilities = abilitiesBlockMatch[1].split(/\r?\n/).map(l => l.replace(/^\s{2}/, '')).join('\n').replace(/\r/g, '').trim();
    } else {
      const abilitiesQuotedMatch = block.match(/abilities:\s*(['"])([\s\S]*?)\1(?=(?:\n\s{2}[A-Za-z0-9_-]+:)|\n*$)/m);
      if (abilitiesQuotedMatch) {
        abilities = abilitiesQuotedMatch[2].replace(/\r/g, '').trim();
      } else {
        const abilitiesInlineMatch = block.match(/abilities:\s*([^\n\r]+)/m);
        if (abilitiesInlineMatch) abilities = abilitiesInlineMatch[1].replace(/\r/g, '').trim();
      }
    }

    // Resources: either a YAML list or inline array
    let resources = [];
    const resourcesListMatch = block.match(/resources:\s*\n((?:\s*-\s*[^\n]+\n?)*)/m);
    if (resourcesListMatch && resourcesListMatch[1]) {
      const lines = resourcesListMatch[1].split(/\r?\n/);
      for (const ln of lines) {
        const m = ln.match(/-\s*(.*)/);
        if (m && m[1]) resources.push(stripMarkdownForCharCount(m[1].trim().replace(/['"]/g, '')));
      }
    } else {
      const resourcesInlineMatch = block.match(/resources:\s*\[([^\]]*)\]/m);
      if (resourcesInlineMatch && resourcesInlineMatch[1]) {
        resources = resourcesInlineMatch[1].split(',').map(s => stripMarkdownForCharCount(s.replace(/['"]/g, '').trim())).filter(Boolean);
      }
    }

    // Setup
    let setupKey = '';
    const setupMatch = block.match(/setup:\s*\n([\s\S]*?)(?=(?:\n\s{2}[A-Za-z0-9_-]+:)|\n*$)/m);
    if (setupMatch) {
      const setupText = setupMatch[1];
      function readSlot(slot) {
        const slotRe = new RegExp(`${slot}:\\s*\\n\\s*ships:\s*(\\d+)\\s*\\n\\s*building:\s*['\"]?([^'\"\\n]+)['\"]?`, 'm');
        const m = setupText.match(slotRe);
        if (!m) return null;
        const ships = parseInt(m[1], 10);
        const buildingRaw = stripMarkdownForCharCount(m[2]);
        const building = (buildingRaw || '').toLowerCase();
        return { ships: Number.isFinite(ships) ? ships : 0, building };
      }
      const a = readSlot('A');
      const b = readSlot('B');
      const c = readSlot('C');
      if (a && b && c) {
        const shipsPattern = `${a.ships}-${b.ships}-${c.ships}`;
        function bldChar(bld) {
          if (bld === 'city') return 'C';
          if (bld === 'starport') return 'S';
          return '-';
        }
        const buildingsPattern3 = `${bldChar(a.building)}${bldChar(b.building)}${bldChar(c.building)}`;
        const buildingsPattern = buildingsPattern3.endsWith('-') ? buildingsPattern3.slice(0, -1) : buildingsPattern3;
        setupKey = `${shipsPattern}|${buildingsPattern}`;
      }
    }

    // Capture other top-level scalar fields (title, body, variant, footer, etc.)
    const extra = {};
    // Find keys at top-level (lines indented 2 spaces)
    const keyRe = /^\s{2}([A-Za-z0-9_-]+):/gm;
    let km;
    const keys = new Set();
    while ((km = keyRe.exec(block)) !== null) {
      keys.add(km[1]);
    }

    for (const k of keys) {
      if (k === 'name' || k === 'abilities' || k === 'resources' || k === 'setup') continue;

      // block scalar
      const blockScalarRe = new RegExp(`${k}:\\s*\\|[\\r\\n]+((?:\\s{2,}.*[\\r\\n]*)*)(?=(?:\\n\\s{2}[A-Za-z0-9_-]+:)|\\n*$)`, 'm');
      const bs = block.match(blockScalarRe);
      if (bs) {
        extra[k] = bs[1].split(/\\r?\\n/).map(l => l.replace(/^\\s{2}/, '')).join('\n').replace(/\\r/g, '').trim();
        continue;
      }

      // quoted multi-line or single-line
      const quotedRe = new RegExp(`${k}:\\s*(['\"])([\\s\\S]*?)\\1(?=(?:\\n\\s{2}[A-Za-z0-9_-]+:)|\\n*$)`, 'm');
      const q = block.match(quotedRe);
      if (q) {
        extra[k] = q[2].replace(/\\r/g, '').trim();
        continue;
      }

      // inline scalar
      const inlineRe = new RegExp(`${k}:\\s*([^\\n\\r]+)`, 'm');
      const im = block.match(inlineRe);
      if (im) {
        extra[k] = im[1].trim();
      }
    }

    items.push(Object.assign({ name, key, abilities, resources, setupKey }, extra));
  }

  return items;
}

// Fetch a scripts/data/*.yml file from raw.githubusercontent if present
async function fetchScriptsDataYaml(name) {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/scripts/data/${name}.yml`;
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    return await res.text();
  } catch (e) {
    return "";
  }
}

async function loadYamlListFor(name) {
  const text = await fetchScriptsDataYaml(name);
  if (!text) return [];
  return parseYamlList(text);
}

async function loadLeaderMetadata() {
  // Fetch YAML data from scripts/data/leaders.yml on raw.githubusercontent
  const yamlText = await fetchScriptsDataYaml('leaders');

      let resources = [];
  const allLeaders = parseYamlList(yamlText);
  parsedLeadersList = allLeaders;

  // Partition into regular and beyond
  const regularLeaders = allLeaders.filter(l => !BEYOND_SET.has(l.key));
  const beyondLeaders = allLeaders.filter(l => BEYOND_SET.has(l.key));

  const nextOrderMap = new Map();
  const nextAbilityMap = new Map();
  const nextAbilityTextMap = new Map();
  const nextResourcesMap = new Map();
  const nextResourceListMap = new Map();
  const nextTwoSameMap = new Map();
  const nextSetupMap = new Map();
  let orderCounter = 1;

  // Regular leaders
  for (const l of regularLeaders) {
    nextOrderMap.set(l.key, orderCounter++);
    nextAbilityTextMap.set(l.key, l.abilities);
    nextAbilityMap.set(l.key, computeAbilityCharCount(l.abilities));
    const set = new Set(l.resources);
    nextResourcesMap.set(l.key, set);
    nextResourceListMap.set(l.key, l.resources);
    if (l.resources.length >= 2) {
      nextTwoSameMap.set(l.key, l.resources[0] === l.resources[1]);
    }
    if (l.setupKey) {
      nextSetupMap.set(l.key, l.setupKey);
    }
  }

  // Beyond the Reach leaders
  for (const l of beyondLeaders) {
    // Beyond leaders do not get an order number
    nextAbilityTextMap.set(l.key, l.abilities);
    nextAbilityMap.set(l.key, computeAbilityCharCount(l.abilities));
    const set = new Set(l.resources);
    nextResourcesMap.set(l.key, set);
    nextResourceListMap.set(l.key, l.resources);
    if (l.resources.length >= 2) {
      nextTwoSameMap.set(l.key, l.resources[0] === l.resources[1]);
    }
    if (l.setupKey) {
      nextSetupMap.set(l.key, l.setupKey);
    }
  }

  leaderOrderByName = nextOrderMap;
  leaderAbilityCharsByName = nextAbilityMap;
  leaderAbilityTextByName = nextAbilityTextMap;
  leaderResourcesByName = nextResourcesMap;
  leaderResourceListByName = nextResourceListMap;
  leaderHasTwoSameResourceByName = nextTwoSameMap;
  leaderSetupFootprintByName = nextSetupMap;
  leaderMetadataLoaded = true;
  return parsedLeadersList;
}

function getLeaderSortMode() {
  return el.sortSelect?.value || "name";
}

function getLeaderResourceFilter() {
  // Primary single-select now encodes singles and combos; just return its value.
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
  const show = activeTab === "leaders";
  el.sortSelect.style.display = show ? "" : "none";
  if (el.resourceSelect) el.resourceSelect.style.display = show ? "" : "none";
  if (el.setupSelect) el.setupSelect.style.display = show ? "" : "none";
}

function filterLeaderCardsByResource(cards, resourceFilter) {
  // Backwards-compatible single-string filter
  if (!resourceFilter || resourceFilter === "any") return cards;
  if (typeof resourceFilter === "string") {
    const resource = resourceFilter;
    // If value is a combo like 'Material|Fuel', handle as unordered pair
    if (resource.includes("|")) {
      const parts = resource.split("|").map(s => s || "none");
      const a = parts[0] || "any";
      const b = parts[1] || "any";
      // Reuse object-style handling by falling through to the pair logic below
      resourceFilter = { a, b };
    } else {
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
  }

  // resourceFilter is {a,b}
  const a = resourceFilter.a || "any";
  const b = resourceFilter.b || "any";
  if ((a === "any" || !a) && (b === "any" || !b)) return cards;

  return cards.filter((c) => {
    if (c.type !== "Leader") return false;
    const key = normalizeName(c.name);
    const list = leaderResourceListByName.get(key) || [];
    const slots = [list[0] || "none", list[1] || "none"];

    // If one side is 'any' treat as single-match on the other side
    if (a === "any") {
      if (b === "none") return slots.includes("none");
      return slots.includes(b);
    }
    if (b === "any") {
      if (a === "none") return slots.includes("none");
      return slots.includes(a);
    }

    // Both specified: order-insensitive match (multiset equality)
    const filterArr = [a, b].slice().sort();
    const slotArr = slots.slice().sort();
    return filterArr[0] === slotArr[0] && filterArr[1] === slotArr[1];
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
    // Include all leaders for counts (previously 'beyond' leaders were separate)
    cards = cards.filter((c) => c.type === "Leader");
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
  if (activeTab !== "leaders") return;

  // Counts should respect the other filter (setup), but not this resource filter.
  const baseCards = filterLeaderCardsBySetup(getLeaderBaseCardsForCounts(), getLeaderSetupFilter());
  const total = baseCards.length;

  // Update "Has any" label
  const anyOpt = el.resourceSelect.querySelector('option[value="any"]');
  if (anyOpt) anyOpt.textContent = `Has any (${total})`;

  const resourcesInOrder = ["Material", "Fuel", "Weapon", "Relic", "Psionic"];

  // Compute single counts for resources
  const singleCounts = new Map();
  for (const r of resourcesInOrder) singleCounts.set(r, 0);
  for (const c of baseCards) {
    const set = leaderResourcesByName.get(normalizeName(c.name));
    if (!set) continue;
    for (const r of resourcesInOrder) {
      if (set.has(r)) singleCounts.set(r, (singleCounts.get(r) || 0) + 1);
    }
  }

  // twoSame count
  const twoSameOpt = el.resourceSelect.querySelector('option[value="twoSame"]');
  if (twoSameOpt) {
    let count = 0;
    for (const c of baseCards) {
      if (leaderHasTwoSameResourceByName.get(normalizeName(c.name)) === true) count++;
    }
    twoSameOpt.textContent = `Has same (${count})`;
  }

  // Compute combination counts (unordered pairs), including 'none'
  const comboElements = ["none", ...resourcesInOrder];
  const comboCounts = new Map();
  for (const c of baseCards) {
    const list = leaderResourceListByName.get(normalizeName(c.name)) || [];
    const s0 = list[0] || "none";
    const s1 = list[1] || "none";
    const key = [s0, s1].slice().sort().join("|");
    comboCounts.set(key, (comboCounts.get(key) || 0) + 1);
  }

  // Build sorted singles list (only include >0) sorted by count desc
  const singlesArr = [...singleCounts.entries()]
    .filter(([r, cnt]) => cnt > 0)
    .sort((a, b) => b[1] - a[1]);

  // Build sorted combos list (only include >0), exclude pairs that are identical to single-only? keep all
  const combosArr = [];
  for (let i = 0; i < comboElements.length; i++) {
    for (let j = i; j < comboElements.length; j++) {
      const a = comboElements[i];
      const b = comboElements[j];
      const key = [a, b].slice().sort().join("|");
      const count = comboCounts.get(key) || 0;
      if (count > 0) combosArr.push({ a, b, key, count });
    }
  }
  combosArr.sort((x, y) => y.count - x.count || String(x.key).localeCompare(y.key));

  // Rebuild resourceSelect: Any, singles (sorted), twoSame (if exists), then combos (sorted)
  const prev = el.resourceSelect.value;
  const anyOptionHtml = `<option value="any">Has any (${total})</option>`;
  const singlesHtml = singlesArr.map(([r, cnt]) => `<option value="${r}">Has ${r} (${cnt})</option>`).join("");
  const twoSameHtml = twoSameOpt ? twoSameOpt.outerHTML : '';
  const combosHtml = combosArr.map(({a, b, count}) => {
    const labelA = a === 'none' ? 'None' : a;
    const labelB = b === 'none' ? 'None' : b;
    return `<option value="${a}|${b}">Has ${labelA} + ${labelB} (${count})</option>`;
  }).join('');

  el.resourceSelect.innerHTML = anyOptionHtml + singlesHtml + twoSameHtml + combosHtml;
  const still = [...el.resourceSelect.options].some(o => o.value === prev);
  el.resourceSelect.value = still ? prev : 'any';

  // No secondary select — single select contains singles and combos only.
}

function formatSetupFootprintLabel(setupKey) {
  // setupKey is "shipsPattern|buildingsPattern".
  const [ships, buildings] = String(setupKey).split("|");
  if (!ships || !buildings) return String(setupKey);
  return `${ships} / ${buildings}`;
}

function updateSetupDropdownOptionsAndCounts() {
  if (!el.setupSelect) return;
  if (activeTab !== "leaders") return;

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
  // Base set: use courtCards if the court tab is active, otherwise use allCards
  let cards = activeTab === "court" ? courtCards : allCards;

  // Tab filter for non-court tabs
  if (activeTab === "leaders") {
    // Leaders tab now includes all leaders (including previously 'beyond' leaders)
    cards = cards.filter((c) => c.type === "Leader");
  } else if (activeTab === "lore") {
    cards = cards.filter((c) => c.type === "Lore");
  }

  // Filters (leader tabs only)
  if (activeTab === "leaders") {
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

  // Layout math for printing (must stay consistent with @page in CSS)
  // A4 = 210×297mm.
  // CSS uses @page margin: 10mm top, 8mm left/right/bottom → content area = 194×279mm.
  // CSS adds .print-container padding: 4mm left/right (horizontal).
  // CSS adds .print-page padding: 12mm top + 4mm bottom (vertical).
  // Usable area per page = 186×263mm.
  const PAGE_CONTENT_WIDTH_MM = 186;
  const PAGE_CONTENT_HEIGHT_MM = 263;

  const backImageUrl = `${RAW_BASE}/cardAssets/CardAssets-Tarot-Leader-No-Bleed.png`;

  const widthMmForCard = (card) => (card.type === "Lore" ? 63 : 70);
  const heightMmForCard = (card) => (card.type === "Lore" ? 88 : 120);

  function buildRows(cardList) {
    /** @type {Array<Array<any>>} */
    const rows = [];
    let currentRow = [];
    let currentWidth = 0;

    for (const card of cardList) {
      const w = widthMmForCard(card);
      // Don't mix card sizes in the same row; shared cut lines won't align otherwise.
      if (currentRow.length > 0 && currentRow[0]?.type !== card.type) {
        rows.push(currentRow);
        currentRow = [];
        currentWidth = 0;
      }
      if (currentRow.length > 0 && currentWidth + w > PAGE_CONTENT_WIDTH_MM) {
        rows.push(currentRow);
        currentRow = [];
        currentWidth = 0;
      }
      currentRow.push(card);
      currentWidth += w;
    }
    if (currentRow.length > 0) rows.push(currentRow);
    return rows;
  }

  function paginateRows(rows) {
    /** @type {Array<Array<Array<any>>>} */
    const pages = [];
    let currentPage = [];
    let currentHeight = 0;

    for (const row of rows) {
      const rowHeight = row.reduce((m, c) => Math.max(m, heightMmForCard(c)), 0);
      if (currentPage.length > 0 && currentHeight + rowHeight > PAGE_CONTENT_HEIGHT_MM) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
      }
      currentPage.push(row);
      currentHeight += rowHeight;
    }
    if (currentPage.length > 0) pages.push(currentPage);
    return pages;
  }

  function renderPages(pages, { imageUrlForCard, altForCard, pageNumberStart, totalPages }) {
    const promises = [];

    pages.forEach((pageRows, pageIndex) => {
      const pageEl = document.createElement("div");
      pageEl.className = "print-page";

      if (Number.isFinite(pageNumberStart) && Number.isFinite(totalPages) && totalPages > 0) {
        const numEl = document.createElement("div");
        numEl.className = "page-number";
        numEl.textContent = `Page ${pageNumberStart + pageIndex}/${totalPages}`;
        pageEl.appendChild(numEl);
      }

      pageRows.forEach((rowCards, rowIndexInPage) => {
        const rowEl = document.createElement("div");
        rowEl.className = "print-row";
        const isFirstRowOfPage = rowIndexInPage === 0;
        const isLastRowOfPage = rowIndexInPage === pageRows.length - 1;

        rowCards.forEach((card, colIndex) => {
          const div = document.createElement("div");
          const isLeader = card.type !== "Lore";
          const isFirstCol = colIndex === 0;
          const isLastCol = colIndex === rowCards.length - 1;

          div.className = [
            "print-card",
            isLeader ? "print-card-leader" : "print-card-lore",
            isFirstCol ? "cut-left" : "",
            isFirstRowOfPage ? "cut-top" : "",
            isLastCol ? "cut-right" : "",
            isLastRowOfPage ? "cut-bottom" : "",
          ].filter(Boolean).join(" ");

          // Crop marks: extend cut lines slightly into page margins.
          // These are only meaningful on the outer page perimeter.
          function addMark(className) {
            const m = document.createElement("span");
            m.className = `crop-mark ${className}`;
            div.appendChild(m);
          }

          if (isFirstRowOfPage) {
            // Vertical marks above: one for every vertical cut line.
            // Vertical cut lines are drawn on the LEFT edge of each card (and on the RIGHT edge only for the last column).
            addMark("crop-v-left-top");
            if (isLastCol) addMark("crop-v-right-top");

            // Horizontal marks on the top edge: only at left/right margins.
            if (isFirstCol) addMark("crop-h-left-top");
            if (isLastCol) addMark("crop-h-right-top");
          }

          // Horizontal marks at the bottom edge: mark each row boundary at left/right margins.
          if (isFirstCol) addMark("crop-h-left-bottom");
          if (isLastCol) addMark("crop-h-right-bottom");

          if (isLastRowOfPage) {
            // Vertical marks below: one for every vertical cut line.
            addMark("crop-v-left-bottom");
            if (isLastCol) addMark("crop-v-right-bottom");
          }

          const img = document.createElement("img");
          img.src = imageUrlForCard(card);
          img.alt = altForCard(card);

          promises.push(new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          }));

          div.appendChild(img);
          rowEl.appendChild(div);
        });

        pageEl.appendChild(rowEl);
      });

      // Ensure page boundaries are deterministic when printing.
      if (pageIndex < pages.length - 1) pageEl.classList.add("break-after");
      container.appendChild(pageEl);
    });

    return promises;
  }

  // 1) Render fronts
  const frontRows = buildRows(cards);
  const frontPages = paginateRows(frontRows);
  const leaderCount = cards.filter((c) => c.type !== "Lore").length;

  /** @type {Array<Array<Array<any>>>} */
  let backPages = [];
  if (leaderCount > 0) {
    // Create placeholder "cards" so we can reuse the same layout logic.
    const backCards = Array.from({ length: leaderCount }, () => ({
      type: "Leader",
      imageUrl: backImageUrl,
      name: "Leader back",
    }));
    backPages = paginateRows(buildRows(backCards));
  }

  const totalPages = frontPages.length + backPages.length;

  const promises = renderPages(frontPages, {
    imageUrlForCard: (card) => card.imageUrl,
    altForCard: (card) => card.name,
    pageNumberStart: 1,
    totalPages,
  });

  // 2) Render leader backs at the end (one or more pages, depending on how many leaders are printed)
  if (backPages.length > 0) {
    const breakEl = document.createElement("div");
    breakEl.className = "print-page-break";
    container.appendChild(breakEl);
    promises.push(...renderPages(backPages, {
      imageUrlForCard: (card) => card.imageUrl,
      altForCard: (card) => card.name,
      pageNumberStart: 1 + frontPages.length,
      totalPages,
    }));
  }

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
        const filename = card.filename || filenameFromName(card.name, card.type || 'Leader');
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
        
        court: "court_deck.zip",
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
  const validTabs = ["leaders", "lore", "court", "all"];
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
  // single resource select only; combos handled by primary select

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
