import { toBlob } from "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm";
import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import Papa from "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm";
import { COMMUNITY_DATA } from "./community-data.js";
import { CONFIG } from "./config.js";

// ========== DOM ==========
const el = {
  status: document.getElementById("status"),
  themeToggle: document.getElementById("themeToggle"),
  // Setup
  setupPanel: document.getElementById("setupPanel"),
  playerCountGroup: document.getElementById("playerCountGroup"),
  seatGroup: document.getElementById("seatGroup"),
  lorePerPlayerGroup: document.getElementById("lorePerPlayerGroup"),
  leaderPoolSize: document.getElementById("leaderPoolSize"),
  lorePoolSize: document.getElementById("lorePoolSize"),
  tierSourceGroup: document.getElementById("tierSourceGroup"),
  customTierInput: document.getElementById("customTierInput"),
  customTierUrl: document.getElementById("customTierUrl"),
  customTierText: document.getElementById("customTierText"),
  customTierLoad: document.getElementById("customTierLoad"),
  customTierStatus: document.getElementById("customTierStatus"),
  tierScoringGroup: document.getElementById("tierScoringGroup"),
  leaderWeight: document.getElementById("leaderWeight"),
  weightDisplay: document.getElementById("weightDisplay"),
  leaderPool: document.getElementById("leaderPool"),
  lorePool: document.getElementById("lorePool"),
  leaderPoolCount: document.getElementById("leaderPoolCount"),
  lorePoolCount: document.getElementById("lorePoolCount"),
  randomLeaders: document.getElementById("randomLeaders"),
  randomLore: document.getElementById("randomLore"),
  clearLeaders: document.getElementById("clearLeaders"),
  clearLore: document.getElementById("clearLore"),
  balancedDraft: document.getElementById("balancedDraft"),
  balancedSettingsToggle: document.getElementById("balancedSettingsToggle"),
  balancedSettings: document.getElementById("balancedSettings"),
  leaderTierConstraint: document.getElementById("leaderTierConstraint"),
  loreTierConstraint: document.getElementById("loreTierConstraint"),
  startDraft: document.getElementById("startDraft"),
  // Draft
  draftPanel: document.getElementById("draftPanel"),
  draftPhaseLabel: document.getElementById("draftPhaseLabel"),
  playerBoards: document.getElementById("playerBoards"),
  availableCards: document.getElementById("availableCards"),
  autoDraftBtn: document.getElementById("autoDraftBtn"),
  undoBtn: document.getElementById("undoBtn"),
  resetDraft: document.getElementById("resetDraft"),
  saveDraftImg: document.getElementById("saveDraftImg"),
};

// ========== State ==========
let allLeaders = []; // { name, tier, value, card }
let allLore = [];
let selectedLeaders = new Set();
let selectedLore = new Set();

// Store all tier sources
let personalLeaders = [];
let personalLore = [];
let dataLeaders = [];
let dataLore = [];
let customLeaders = [];
let customLore = [];
let community3pLeaders = [];
let community3pLore = [];
let community4pLeaders = [];
let community4pLore = [];

let draft = {
  numPlayers: 3,
  mySeat: 1,
  lorePerPlayer: 1,
  tierSource: "personal",
  tierScoring: "varied",
  leaderTierConstraint: "any",
  loreTierConstraint: "any",
  leaderWeight: 3,
  loreWeight: 1,
  // Draft state
  active: false,
  pickIndex: 0,
  order: [],
  players: [], // [{ leader: null, lore: [] }]
  availableLeaders: [],
  availableLore: [],
  history: [],
};

// ========== Utilities ==========
function setStatus(msg, { isError = false } = {}) {
  el.status.textContent = msg;
  el.status.classList.toggle("error", isError);
  el.status.style.display = msg ? "" : "none";
}

function normalizeText(s) {
  return String(s ?? "").trim().toLowerCase().replace(/['\u2019]/g, "'").replace(/\s+/g, " ");
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

// ========== Scoring ==========
const TIER_BASE = { SS: 6, S: 5, A: 4, B: 3, C: 2, D: 1 };
const TIER_ORDER = ["SS", "S", "A", "B", "C", "D"];

function assignValues(entries) {
  // Group by tier, assign sub-values within each tier based on position
  const grouped = new Map();
  for (const tier of TIER_ORDER) grouped.set(tier, []);
  for (const e of entries) {
    const t = TIER_ORDER.includes(e.tier) ? e.tier : "D";
    grouped.get(t).push(e);
  }

  // "same" → all cards in a tier get the exact base score
  // "varied" → spread ±0.25 within the tier based on position
  const spread = draft.tierScoring === "varied" ? 0.5 : 0;

  for (const [tier, items] of grouped) {
    const base = TIER_BASE[tier];
    const n = items.length;
    for (let i = 0; i < n; i++) {
      const sub = n > 1 ? ((n - 1 - 2 * i) / (2 * (n - 1))) * spread : 0;
      items[i].value = Math.max(0, base + sub);
    }
  }
}

function getWeightedScore(entry, type) {
  const w = type === "leader" ? draft.leaderWeight : draft.loreWeight;
  return entry.value * w;
}

function playerTotalScore(player) {
  let score = 0;
  if (player.leader) score += getWeightedScore(player.leader, "leader");
  for (const l of player.lore) score += getWeightedScore(l, "lore");
  return score;
}

// ========== Data Loading ==========
async function loadCards() {
  const text = await fetchText(CONFIG.cardsYamlUrl);
  const data = yaml.load(text);
  if (!Array.isArray(data)) throw new Error("Invalid YAML");
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

async function loadTierList() {
  const text = await fetchText(CONFIG.tierListCsvUrl);
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
  return parsed.data ?? [];
}

async function loadRankedSheet() {
  const text = await fetchText(CONFIG.sheetCsvUrl);
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
  return parsed.data ?? [];
}

function parseRankedData(rows, cards) {
  const cardMap = new Map();
  for (const c of cards) cardMap.set(normalizeText(c.name), c);

  // Parse the ranked sheet (same format as app.js parseLeadersLoreSheet)
  const stats = [];
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i] && normalizeText(rows[i][0]) === "leader") {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return { leaders: [], lore: [] };

  const headerRow = rows[headerRowIdx];
  let loreColIdx = -1;
  for (let i = 0; i < headerRow.length; i++) {
    if (normalizeText(headerRow[i]) === "lore") { loreColIdx = i; break; }
  }

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const leaderName = (row[0] ?? "").trim();
    if (leaderName) {
      stats.push({
        name: leaderName,
        type: "Leader",
        winRate: parseFloat((row[3] ?? "").replace("%", "")) || 0,
      });
    }
    if (loreColIdx > 0) {
      const loreName = (row[loreColIdx] ?? "").trim();
      if (loreName) {
        stats.push({
          name: loreName,
          type: "Lore",
          winRate: parseFloat((row[loreColIdx + 3] ?? "").replace("%", "")) || 0,
        });
      }
    }
  }

  // Sort each type by win rate descending, assign tiers by percentile
  function assignTierByPercentile(sorted, idx) {
    const pct = (idx / sorted.length) * 100;
    if (pct <= 10) return "S";
    if (pct <= 30) return "A";
    if (pct <= 70) return "B";
    if (pct <= 90) return "C";
    return "D";
  }

  const leaderStats = stats.filter((s) => s.type === "Leader").sort((a, b) => b.winRate - a.winRate);
  const loreStats = stats.filter((s) => s.type === "Lore").sort((a, b) => b.winRate - a.winRate);

  const leaders = leaderStats.map((s, idx) => ({
    name: s.name,
    tier: assignTierByPercentile(leaderStats, idx),
    value: 0,
    card: cardMap.get(normalizeText(s.name)) ?? null,
  }));

  const lore = loreStats.map((s, idx) => ({
    name: s.name,
    tier: assignTierByPercentile(loreStats, idx),
    value: 0,
    card: cardMap.get(normalizeText(s.name)) ?? null,
  }));

  assignValues(leaders);
  assignValues(lore);
  return { leaders, lore };
}

function parseCommunityTierData(playerCount, cards) {
  const data = COMMUNITY_DATA[playerCount];
  if (!data) return { leaders: [], lore: [] };

  const cardMap = new Map();
  for (const c of cards) cardMap.set(normalizeText(c.name), c);

  function assignTierByPercentile(sorted, idx) {
    const pct = (idx / sorted.length) * 100;
    if (pct <= 10) return "S";
    if (pct <= 30) return "A";
    if (pct <= 70) return "B";
    if (pct <= 90) return "C";
    return "D";
  }

  // Sort by win rate descending
  const leaderEntries = Object.entries(data.leaderWinrates)
    .sort((a, b) => b[1] - a[1]);
  const loreEntries = Object.entries(data.loreWinrates)
    .sort((a, b) => b[1] - a[1]);

  const leaders = leaderEntries.map(([name, winRate], idx) => ({
    name,
    tier: assignTierByPercentile(leaderEntries, idx),
    value: 0,
    card: cardMap.get(normalizeText(name)) ?? null,
  }));

  const lore = loreEntries.map(([name, winRate], idx) => ({
    name,
    tier: assignTierByPercentile(loreEntries, idx),
    value: 0,
    card: cardMap.get(normalizeText(name)) ?? null,
  }));

  assignValues(leaders);
  assignValues(lore);
  return { leaders, lore };
}

function parseTierData(rows, cards) {
  const leaders = [];
  const lore = [];
  const cardMap = new Map();
  for (const c of cards) cardMap.set(normalizeText(c.name), c);

  let inLore = false;
  let headerSkipped = false;

  for (const row of rows) {
    const name = (row[0] ?? "").trim();
    const tier = (row[1] ?? "").trim().toUpperCase();

    if (!headerSkipped && normalizeText(name) === "name") {
      headerSkipped = true;
      continue;
    }
    if (!name && !tier) {
      if (headerSkipped && leaders.length > 0) inLore = true;
      continue;
    }
    if (!name || !tier) continue;

    const card = cardMap.get(normalizeText(name)) ?? null;
    const entry = { name, tier, value: 0, card };
    if (inLore) lore.push(entry);
    else leaders.push(entry);
  }

  assignValues(leaders);
  assignValues(lore);
  return { leaders, lore };
}

// ========== Draft Order ==========
function buildDraftOrder(numPlayers) {
  // Descending: N, N-1, ..., 1 repeating
  const order = [];
  for (let i = numPlayers; i >= 1; i--) order.push(i);
  return order;
}

function getCurrentDrafter() {
  const idx = draft.pickIndex % draft.order.length;
  return draft.order[idx]; // 1-based player number
}

// ========== Setup UI ==========
function initSetupUI() {
  // Button groups
  setupBtnGroup(el.playerCountGroup, (val) => {
    draft.numPlayers = parseInt(val);
    updateDefaults();
    updateSeatButtons();
    updatePoolCounts();
  });

  setupBtnGroup(el.seatGroup, (val) => {
    draft.mySeat = parseInt(val);
  });

  setupBtnGroup(el.lorePerPlayerGroup, (val) => {
    draft.lorePerPlayer = parseInt(val);
    updateDefaults();
    updatePoolCounts();
  });

  el.leaderPoolSize.addEventListener("change", () => updatePoolCounts());
  el.lorePoolSize.addEventListener("change", () => updatePoolCounts());

  el.leaderWeight.addEventListener("input", () => {
    draft.leaderWeight = parseFloat(el.leaderWeight.value);
    el.weightDisplay.textContent = `${draft.leaderWeight}×`;
  });

  // Tier source toggle
  for (const btn of el.tierSourceGroup.querySelectorAll(".btn-option")) {
    btn.addEventListener("click", () => {
      el.tierSourceGroup.querySelector(".active").classList.remove("active");
      btn.classList.add("active");
      draft.tierSource = btn.dataset.value;
      el.customTierInput.classList.toggle("hidden", draft.tierSource !== "custom");
      if (draft.tierSource !== "custom") applyTierSource();
    });
  }

  // Custom tier loading
  el.customTierLoad.addEventListener("click", loadCustomTierData);

  // Tier scoring toggle
  for (const btn of el.tierScoringGroup.querySelectorAll(".btn-option")) {
    btn.addEventListener("click", () => {
      el.tierScoringGroup.querySelector(".active").classList.remove("active");
      btn.classList.add("active");
      draft.tierScoring = btn.dataset.value;
      assignValues(allLeaders);
      assignValues(allLore);
      renderPoolCards();
    });
  }

  el.randomLeaders.addEventListener("click", () => randomizePool("leader"));
  el.randomLore.addEventListener("click", () => randomizePool("lore"));
  el.clearLeaders.addEventListener("click", () => clearPool("leader"));
  el.clearLore.addEventListener("click", () => clearPool("lore"));
  el.balancedDraft.addEventListener("click", generateBalancedDraft);
  el.balancedSettingsToggle.addEventListener("click", () => {
    el.balancedSettings.classList.toggle("hidden");
  });
  setupBtnGroup(el.leaderTierConstraint, (val) => { draft.leaderTierConstraint = val; });
  setupBtnGroup(el.loreTierConstraint, (val) => { draft.loreTierConstraint = val; });
  el.startDraft.addEventListener("click", startDraft);

  updateDefaults();
  updateSeatButtons();
}

function setupBtnGroup(container, onChange) {
  container.querySelectorAll(".btn-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".btn-option").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset.value);
    });
  });
}

function updateDefaults() {
  const n = draft.numPlayers;
  el.leaderPoolSize.value = n + 1;
  el.lorePoolSize.value = n * draft.lorePerPlayer + 1;
  selectedLeaders.clear();
  selectedLore.clear();
  renderPoolCards();
  updatePoolCounts();
  validateStartButton();
}

function updateSeatButtons() {
  const n = draft.numPlayers;
  const labels = ["1st", "2nd", "3rd", "4th"];
  el.seatGroup.innerHTML = "";
  for (let i = 1; i <= n; i++) {
    const btn = document.createElement("button");
    btn.className = "btn-option" + (i === draft.mySeat ? " active" : "");
    btn.dataset.value = i;
    btn.textContent = labels[i - 1];
    btn.addEventListener("click", () => {
      el.seatGroup.querySelectorAll(".btn-option").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      draft.mySeat = i;
    });
    el.seatGroup.appendChild(btn);
  }
  if (draft.mySeat > n) {
    draft.mySeat = 1;
    el.seatGroup.querySelector(".btn-option").classList.add("active");
  }
}

function renderPoolCards() {
  renderPoolSection(el.leaderPool, allLeaders, selectedLeaders, "leader");
  renderPoolSection(el.lorePool, allLore, selectedLore, "lore");
}

function renderPoolSection(container, entries, selected, type) {
  container.innerHTML = "";
  for (const entry of entries) {
    const btn = document.createElement("button");
    btn.className = "pool-card" + (selected.has(entry.name) ? " selected" : "");

    const imgUrl = entry.card ? getImageUrl(entry.card) : null;
    let imgHTML = "";
    if (imgUrl) {
      imgHTML = `<img class="pool-card-img" src="${imgUrl}" alt="${entry.name}" loading="lazy" />`;
    }

    btn.innerHTML = `${imgHTML}<span class="tier-badge tier-${entry.tier.toLowerCase()}">${entry.tier}</span><span class="pool-card-name">${entry.name}</span>`;
    btn.addEventListener("click", () => {
      const maxSize = parseInt(type === "leader" ? el.leaderPoolSize.value : el.lorePoolSize.value);
      if (selected.has(entry.name)) {
        selected.delete(entry.name);
        btn.classList.remove("selected");
      } else if (selected.size < maxSize) {
        selected.add(entry.name);
        btn.classList.add("selected");
      }
      updatePoolCounts();
      validateStartButton();
    });
    container.appendChild(btn);
  }
}

function updatePoolCounts() {
  const leaderMax = parseInt(el.leaderPoolSize.value);
  const loreMax = parseInt(el.lorePoolSize.value);
  el.leaderPoolCount.textContent = `(${selectedLeaders.size} / ${leaderMax})`;
  el.lorePoolCount.textContent = `(${selectedLore.size} / ${loreMax})`;
}

function validateStartButton() {
  const leaderMax = parseInt(el.leaderPoolSize.value);
  const loreMax = parseInt(el.lorePoolSize.value);
  const valid = selectedLeaders.size === leaderMax && selectedLore.size === loreMax;
  el.startDraft.disabled = !valid;
}

function randomizePool(type) {
  const maxSize = parseInt(type === "leader" ? el.leaderPoolSize.value : el.lorePoolSize.value);
  const entries = type === "leader" ? allLeaders : allLore;
  const selected = type === "leader" ? selectedLeaders : selectedLore;

  selected.clear();
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(maxSize, shuffled.length); i++) {
    selected.add(shuffled[i].name);
  }

  renderPoolCards();
  updatePoolCounts();
  validateStartButton();
}

function pickWithConstraint(entries, count, constraint) {
  if (entries.length < count) return null;

  if (constraint === "same") {
    // All cards must be from the same tier
    const tierGroups = new Map();
    for (const e of entries) {
      if (!tierGroups.has(e.tier)) tierGroups.set(e.tier, []);
      tierGroups.get(e.tier).push(e);
    }
    // Find tiers that have enough cards
    const eligible = [...tierGroups.entries()].filter(([, g]) => g.length >= count);
    if (eligible.length === 0) return null;
    const [, group] = eligible[Math.floor(Math.random() * eligible.length)];
    const shuffled = [...group].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  if (constraint === "unique") {
    // All cards must be from different tiers
    const tierGroups = new Map();
    for (const e of entries) {
      if (!tierGroups.has(e.tier)) tierGroups.set(e.tier, []);
      tierGroups.get(e.tier).push(e);
    }
    const availableTiers = [...tierGroups.keys()];
    if (availableTiers.length < count) return null;
    // Pick random tiers
    const shuffledTiers = [...availableTiers].sort(() => Math.random() - 0.5);
    const chosenTiers = shuffledTiers.slice(0, count);
    // Pick one random card from each chosen tier
    return chosenTiers.map((t) => {
      const group = tierGroups.get(t);
      return group[Math.floor(Math.random() * group.length)];
    });
  }

  // "any" no constraint, pure random
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function clearPool(type) {
  const selected = type === "leader" ? selectedLeaders : selectedLore;
  selected.clear();
  renderPoolCards();
  updatePoolCounts();
  validateStartButton();
}

function generateBalancedDraft() {
  const leaderMax = parseInt(el.leaderPoolSize.value);
  const loreMax = parseInt(el.lorePoolSize.value);
  const numPlayers = draft.numPlayers;
  const lpp = draft.lorePerPlayer;

  if (allLeaders.length < leaderMax || allLore.length < loreMax) return;
  if (leaderMax < numPlayers || loreMax < numPlayers * lpp) return;

  // Helper: all permutations of an array
  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const perm of permutations(rest)) {
        result.push([arr[i], ...perm]);
      }
    }
    return result;
  }

  // Helper: all ways to choose k items from arr (indices)
  function combinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const result = [];
    for (let i = 0; i <= arr.length - k; i++) {
      for (const combo of combinations(arr.slice(i + 1), k - 1)) {
        result.push([arr[i], ...combo]);
      }
    }
    return result;
  }

  // For a given pool, find the assignment with the smallest spread
  function findBestAssignment(poolLeaders, poolLore) {
    // Pick numPlayers leaders from pool — try all combos, then permutations
    const leaderCombos = combinations(poolLeaders, numPlayers);
    let bestSpread = Infinity;
    let bestAssignment = null;

    for (const leaderCombo of leaderCombos) {
      // Try all permutations of leader assignment to players
      const leaderPerms = permutations(leaderCombo);
      for (const leaderPerm of leaderPerms) {
        // Assign lore greedily to minimize spread
        const playerScores = leaderPerm.map((l) => getWeightedScore(l, "leader"));
        const playerLore = leaderPerm.map(() => []);
        const availLore = [...poolLore].sort((a, b) => b.value - a.value);

        // Each player needs lpp lore — assign each lore to the player with lowest current score
        let totalAssigned = 0;
        const target = numPlayers * lpp;
        for (const lore of availLore) {
          if (totalAssigned >= target) break;
          // Find player with lowest score who still needs lore
          let minIdx = -1;
          let minScore = Infinity;
          for (let p = 0; p < numPlayers; p++) {
            if (playerLore[p].length >= lpp) continue;
            if (playerScores[p] < minScore) {
              minScore = playerScores[p];
              minIdx = p;
            }
          }
          if (minIdx === -1) break;
          playerLore[minIdx].push(lore);
          playerScores[minIdx] += getWeightedScore(lore, "lore");
          totalAssigned++;
        }

        if (totalAssigned < target) continue;

        const spread = Math.max(...playerScores) - Math.min(...playerScores);
        if (spread < bestSpread) {
          bestSpread = spread;
          bestAssignment = { leaders: leaderPerm, lore: playerLore, scores: [...playerScores] };
        }
      }
    }

    return bestAssignment ? { spread: bestSpread, assignment: bestAssignment } : null;
  }

  const ATTEMPTS = 200;
  let bestSpread = Infinity;
  let bestLeaderNames = null;
  let bestLoreNames = null;
  let bestResult = null;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const poolLeaders = pickWithConstraint(allLeaders, leaderMax, draft.leaderTierConstraint);
    const poolLore = pickWithConstraint(allLore, loreMax, draft.loreTierConstraint);
    if (!poolLeaders || !poolLore) continue;

    const result = findBestAssignment(poolLeaders, poolLore);
    if (!result) continue;

    if (result.spread < bestSpread) {
      bestSpread = result.spread;
      bestLeaderNames = poolLeaders.map((c) => c.name);
      bestLoreNames = poolLore.map((c) => c.name);
      bestResult = result.assignment;
    }
  }

  if (!bestResult) return;

  // Apply the best pool
  selectedLeaders.clear();
  selectedLore.clear();
  for (const n of bestLeaderNames) selectedLeaders.add(n);
  for (const n of bestLoreNames) selectedLore.add(n);

  renderPoolCards();
  updatePoolCounts();
  validateStartButton();

  // Start draft and directly assign the optimal result
  startDraft();

  // Apply the optimal assignments as picks (no draft order needed)
  for (let p = 0; p < numPlayers; p++) {
    const leader = bestResult.leaders[p];
    draft.players[p].leader = leader;
    draft.availableLeaders = draft.availableLeaders.filter((c) => c.name !== leader.name);
    draft.history.push({ pickIndex: draft.pickIndex, card: { ...leader, pickType: "leader" }, type: "leader", playerIdx: p });
    draft.pickIndex++;

    for (const lore of bestResult.lore[p]) {
      draft.players[p].lore.push(lore);
      draft.availableLore = draft.availableLore.filter((c) => c.name !== lore.name);
      draft.history.push({ pickIndex: draft.pickIndex, card: { ...lore, pickType: "lore" }, type: "lore", playerIdx: p });
      draft.pickIndex++;
    }
  }

  draft.active = false;
  el.undoBtn.disabled = false;
  renderDraft();

  // Scroll to the draft panel
  el.draftPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ========== Draft Logic ==========
function startDraft() {
  draft.order = buildDraftOrder(draft.numPlayers);
  draft.pickIndex = 0;
  draft.history = [];

  draft.players = [];
  for (let i = 0; i < draft.numPlayers; i++) {
    draft.players.push({ leader: null, lore: [] });
  }

  draft.availableLeaders = allLeaders.filter((e) => selectedLeaders.has(e.name));
  draft.availableLore = allLore.filter((e) => selectedLore.has(e.name));
  draft.active = true;

  el.undoBtn.disabled = true;
  el.setupPanel.classList.add("hidden");
  el.draftPanel.classList.remove("hidden");

  renderDraft();
}

function resetDraftToSetup() {
  // Undo all picks without re-rendering each time
  while (draft.history.length > 0) {
    const last = draft.history.pop();
    draft.pickIndex = last.pickIndex;
    draft.active = true;
    if (last.type === "leader") {
      draft.players[last.playerIdx].leader = null;
      draft.availableLeaders.push(last.card);
    } else {
      draft.players[last.playerIdx].lore.pop();
      draft.availableLore.push(last.card);
    }
  }
  draft.availableLeaders.sort((a, b) => b.value - a.value);
  draft.availableLore.sort((a, b) => b.value - a.value);
  el.undoBtn.disabled = true;
  renderDraft();
}

function playerDone(player) {
  return player.leader !== null && player.lore.length >= draft.lorePerPlayer;
}

function getPickableCards(playerIdx) {
  const player = draft.players[playerIdx];
  const cards = [];
  // Can pick a leader if don't have one yet
  if (!player.leader) {
    for (const c of draft.availableLeaders) cards.push({ ...c, pickType: "leader" });
  }
  // Can pick lore if haven't filled lore slots
  if (player.lore.length < draft.lorePerPlayer) {
    for (const c of draft.availableLore) cards.push({ ...c, pickType: "lore" });
  }
  return cards;
}

function getBestPick(playerIdx) {
  const cards = getPickableCards(playerIdx);
  if (cards.length === 0) return null;

  // "Value Above Replacement" approach:
  // For each pickable card, calculate its opportunity cost —
  // the difference between this card's score and the score of
  // the worst card you could realistically end up with in the
  // same category if you skip it now.
  //
  // "Replacement" = the card you'd get if all other players
  // who still need that category pick before you from it.

  const player = draft.players[playerIdx];

  // Count how many OTHER players still need a leader / lore
  let competitorsForLeader = 0;
  let competitorsForLore = 0;
  for (let i = 0; i < draft.numPlayers; i++) {
    if (i === playerIdx) continue;
    if (!draft.players[i].leader) competitorsForLeader++;
    if (draft.players[i].lore.length < draft.lorePerPlayer) competitorsForLore++;
  }

  // Sort available pools by value descending
  const sortedLeaders = [...draft.availableLeaders].sort((a, b) => b.value - a.value);
  const sortedLore = [...draft.availableLore].sort((a, b) => b.value - a.value);

  let bestCard = null;
  let bestOpportunityCost = -Infinity;

  // Number of picks between my current turn and my next turn
  // (in a round, each other player picks once)
  const picksBeforeMyNextTurn = draft.numPlayers - 1;

  for (const card of cards) {
    let opportunityCost;

    if (card.pickType === "leader") {
      // If I skip this leader, it stays in the pool — opponents may take it.
      // At most `competitorsForLeader` opponents want a leader, but only
      // `picksBeforeMyNextTurn` picks happen before I go again, and not all
      // of those will be leaders.
      const cardScore = getWeightedScore(card, "leader");
      const leadersTakenBefore = Math.min(competitorsForLeader, picksBeforeMyNextTurn);
      const replacementIdx = leadersTakenBefore;
      if (replacementIdx < sortedLeaders.length) {
        const replacement = sortedLeaders[replacementIdx];
        opportunityCost = cardScore - getWeightedScore(replacement, "leader");
      } else {
        opportunityCost = cardScore;
      }
    } else {
      // Lore: at most (numPlayers - 1) picks happen before my next turn,
      // and at most `competitorsForLore` of those opponents want lore.
      const loreTakenBefore = Math.min(competitorsForLore, picksBeforeMyNextTurn);
      const cardScore = getWeightedScore(card, "lore");
      const replacementIdx = loreTakenBefore;
      if (replacementIdx < sortedLore.length) {
        const replacement = sortedLore[replacementIdx];
        opportunityCost = cardScore - getWeightedScore(replacement, "lore");
      } else {
        opportunityCost = cardScore;
      }
    }

    if (opportunityCost > bestOpportunityCost) {
      bestOpportunityCost = opportunityCost;
      bestCard = card;
    }
  }

  return bestCard;
}

function advanceDrafter() {
  // Move to next drafter who still needs picks, cycling through the order
  const totalSlots = draft.numPlayers * (1 + draft.lorePerPlayer);
  let safety = totalSlots + draft.numPlayers;
  while (safety-- > 0) {
    draft.pickIndex++;
    const drafter = getCurrentDrafter();
    const player = draft.players[drafter - 1];
    if (!playerDone(player)) return;
  }
  // Everyone done
  draft.active = false;
}

function isDraftComplete() {
  return draft.players.every((p) => playerDone(p));
}

function makePick(card) {
  const drafter = getCurrentDrafter();
  const playerIdx = drafter - 1;
  const type = card.pickType;

  // Save to history for undo
  draft.history.push({
    pickIndex: draft.pickIndex,
    card,
    type,
    playerIdx,
  });

  // Assign card
  if (type === "leader") {
    draft.players[playerIdx].leader = card;
    draft.availableLeaders = draft.availableLeaders.filter((c) => c.name !== card.name);
  } else {
    draft.players[playerIdx].lore.push(card);
    draft.availableLore = draft.availableLore.filter((c) => c.name !== card.name);
  }

  // Check if draft is complete
  if (isDraftComplete()) {
    draft.active = false;
  } else {
    advanceDrafter();
  }

  el.undoBtn.disabled = false;
  renderDraft();
}

function undoPick() {
  if (draft.history.length === 0) return;

  const last = draft.history.pop();
  draft.pickIndex = last.pickIndex;
  draft.active = true;

  if (last.type === "leader") {
    draft.players[last.playerIdx].leader = null;
    draft.availableLeaders.push(last.card);
    draft.availableLeaders.sort((a, b) => b.value - a.value);
  } else {
    draft.players[last.playerIdx].lore.pop();
    draft.availableLore.push(last.card);
    draft.availableLore.sort((a, b) => b.value - a.value);
  }

  el.undoBtn.disabled = draft.history.length === 0;
  renderDraft();
}

function autoDraft() {
  if (!draft.active) return;
  let safety = 200;
  while (draft.active && safety-- > 0) {
    const drafter = getCurrentDrafter();
    const playerIdx = drafter - 1;
    const best = getBestPick(playerIdx);
    if (!best) break;

    // Apply pick directly (no render per pick)
    draft.history.push({
      pickIndex: draft.pickIndex,
      card: best,
      type: best.pickType,
      playerIdx,
    });

    if (best.pickType === "leader") {
      draft.players[playerIdx].leader = best;
      draft.availableLeaders = draft.availableLeaders.filter((c) => c.name !== best.name);
    } else {
      draft.players[playerIdx].lore.push(best);
      draft.availableLore = draft.availableLore.filter((c) => c.name !== best.name);
    }

    if (isDraftComplete()) {
      draft.active = false;
    } else {
      advanceDrafter();
    }
  }

  el.undoBtn.disabled = draft.history.length === 0;
  renderDraft();
}

// ========== Draft Rendering ==========
function renderDraft() {
  el.saveDraftImg.style.display = draft.active ? "none" : "";
  renderPhaseLabel();
  renderPlayerBoards();
  renderAvailableCards();
}

function renderPhaseLabel() {
  if (!draft.active) {
    el.draftPhaseLabel.textContent = "Draft Complete!";
    return;
  }
  const drafter = getCurrentDrafter();
  const isYou = drafter === draft.mySeat;
  const player = draft.players[drafter - 1];
  const needs = [];
  if (!player.leader) needs.push("Leader");
  const loreLeft = draft.lorePerPlayer - player.lore.length;
  if (loreLeft > 0) needs.push(`Lore (${loreLeft} left)`);
  const pickNum = draft.history.length + 1;
  el.draftPhaseLabel.innerHTML = `Pick #${pickNum} <strong>Player ${drafter}${isYou ? " (You)" : ""}</strong> · Needs: ${needs.join(", ")}`;
}

function renderPlayerBoards() {
  el.playerBoards.innerHTML = "";
  el.playerBoards.dataset.players = draft.numPlayers;

  for (let i = 0; i < draft.numPlayers; i++) {
    const player = draft.players[i];
    const playerNum = i + 1;
    const isYou = playerNum === draft.mySeat;
    const isActive = draft.active && getCurrentDrafter() === playerNum;

    const board = document.createElement("div");
    board.className = "player-board";
    if (isActive) board.classList.add("active-drafter");
    if (isYou) board.classList.add("is-you");

    const score = playerTotalScore(player).toFixed(1);

    let picksHTML = "";

    // Leader slot
    if (player.leader) {
      const imgUrl = player.leader.card ? getImageUrl(player.leader.card) : null;
      const imgTag = imgUrl ? `<img class="player-pick-img" src="${imgUrl}" alt="${player.leader.name}" />` : "";
      picksHTML += `<div class="player-pick">
        ${imgTag}
        <div class="player-pick-details">
          <span class="pick-type">Lead</span>
          <span class="tier-badge tier-${player.leader.tier.toLowerCase()}">${player.leader.tier}</span>
          <span class="pick-name">${player.leader.name}</span>
        </div>
      </div>`;
    } else {
      picksHTML += `<div class="player-pick-empty">No leader yet</div>`;
    }

    // Lore slots
    for (let j = 0; j < draft.lorePerPlayer; j++) {
      if (player.lore[j]) {
        const imgUrl = player.lore[j].card ? getImageUrl(player.lore[j].card) : null;
        const imgTag = imgUrl ? `<img class="player-pick-img" src="${imgUrl}" alt="${player.lore[j].name}" />` : "";
        picksHTML += `<div class="player-pick">
          ${imgTag}
          <div class="player-pick-details">
            <span class="pick-type">Lore</span>
            <span class="tier-badge tier-${player.lore[j].tier.toLowerCase()}">${player.lore[j].tier}</span>
            <span class="pick-name">${player.lore[j].name}</span>
          </div>
        </div>`;
      } else {
        picksHTML += `<div class="player-pick-empty">Lore ${j + 1}</div>`;
      }
    }

    board.innerHTML = `
      <div class="player-name">
        <span>Player ${playerNum} ${isYou ? '<span class="player-you-badge">YOU</span>' : ""}</span>
        <span class="player-score">${score} pts</span>
      </div>
      <div class="player-picks">${picksHTML}</div>
    `;

    el.playerBoards.appendChild(board);
  }
}

function renderAvailableCards() {
  el.availableCards.innerHTML = "";

  if (!draft.active) {
    // Show completion summary
    const myPlayer = draft.players[draft.mySeat - 1];
    const myScore = playerTotalScore(myPlayer).toFixed(1);

    const scores = draft.players.map((p, i) => ({
      player: i + 1,
      score: playerTotalScore(p),
    })).sort((a, b) => b.score - a.score);

    const rank = scores.findIndex((s) => s.player === draft.mySeat) + 1;

    const summary = document.createElement("div");
    summary.className = "draft-complete";
    summary.innerHTML = `
      <h3>Draft Complete!</h3>
      <div class="draft-result-score">${myScore} pts</div>
      <p>Your draft ranked <strong>#${rank}</strong> of ${draft.numPlayers} players</p>
    `;
    el.availableCards.appendChild(summary);
    return;
  }

  const drafterIdx = getCurrentDrafter() - 1;
  const pickable = getPickableCards(drafterIdx);
  const best = getBestPick(drafterIdx);

  // Split into leaders and lore for display
  const leaderCards = pickable.filter((c) => c.pickType === "leader").sort((a, b) => b.value - a.value);
  const loreCards = pickable.filter((c) => c.pickType === "lore").sort((a, b) => b.value - a.value);

  function renderCardGroup(cards, label) {
    if (cards.length === 0) return;
    const sep = document.createElement("div");
    sep.className = "draft-separator";
    sep.textContent = label;
    el.availableCards.appendChild(sep);

    for (const card of cards) {
      const isRec = best && card.name === best.name && card.pickType === best.pickType;
      const imgUrl = card.card ? getImageUrl(card.card) : null;
      const score = getWeightedScore(card, card.pickType).toFixed(1);

      const div = document.createElement("div");
      div.className = `draft-card draft-${card.pickType}${isRec ? " recommended" : ""}`;

      let imgHTML = "";
      if (imgUrl) {
        imgHTML = `<img class="draft-card-img" src="${imgUrl}" alt="${card.name}" loading="lazy" />`;
      } else {
        imgHTML = `<div class="draft-card-img" style="display:flex;align-items:center;justify-content:center;background:var(--bg-solid);font-size:0.7rem;color:var(--text-muted);padding:8px;">${card.name}</div>`;
      }

      div.innerHTML = `
        ${isRec ? '<div class="draft-card-rec-badge">Best</div>' : ""}
        ${imgHTML}
        <div class="draft-card-info">
          <div class="draft-card-name">${card.name}</div>
          <div class="draft-card-score">${score} pts · ${card.tier}</div>
        </div>
      `;

      div.addEventListener("click", () => makePick(card));
      el.availableCards.appendChild(div);
    }
  }

  renderCardGroup(leaderCards, "Leaders");
  renderCardGroup(loreCards, "Lore");
}

async function loadCustomTierData() {
  try {
    el.customTierStatus.textContent = "Loading…";
    el.customTierStatus.style.color = "var(--text-muted)";
    let csvText = el.customTierText.value.trim();
    const url = el.customTierUrl.value.trim();

    if (url && !csvText) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);
      csvText = await res.text();
    }

    if (!csvText) {
      el.customTierStatus.textContent = "Provide a URL or paste CSV.";
      el.customTierStatus.style.color = "var(--red, #f87171)";
      return;
    }

    const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: false });
    const rows = parsed.data ?? [];
    const cards = await loadCards();
    const result = parseTierData(rows, cards);

    if (result.leaders.length === 0 && result.lore.length === 0) {
      el.customTierStatus.textContent = "No valid tier data found.";
      el.customTierStatus.style.color = "var(--red, #f87171)";
      return;
    }

    customLeaders = result.leaders;
    customLore = result.lore;
    el.customTierStatus.textContent = `Loaded ${customLeaders.length} leaders, ${customLore.length} lore ✓`;
    el.customTierStatus.style.color = "var(--accent)";
    applyTierSource();
  } catch (err) {
    console.error(err);
    el.customTierStatus.textContent = `Error: ${err.message}`;
    el.customTierStatus.style.color = "var(--red, #f87171)";
  }
}

function applyTierSource() {
  if (draft.tierSource === "data") {
    allLeaders = dataLeaders;
    allLore = dataLore;
  } else if (draft.tierSource === "community3p") {
    allLeaders = community3pLeaders;
    allLore = community3pLore;
  } else if (draft.tierSource === "community4p") {
    allLeaders = community4pLeaders;
    allLore = community4pLore;
  } else if (draft.tierSource === "custom") {
    allLeaders = customLeaders;
    allLore = customLore;
  } else {
    allLeaders = personalLeaders;
    allLore = personalLore;
  }
  // Re-assign values with current scoring mode
  assignValues(allLeaders);
  assignValues(allLore);
  // Clear selections that don't exist in the new source
  const leaderNames = new Set(allLeaders.map((e) => e.name));
  const loreNames = new Set(allLore.map((e) => e.name));
  for (const name of [...selectedLeaders]) {
    if (!leaderNames.has(name)) selectedLeaders.delete(name);
  }
  for (const name of [...selectedLore]) {
    if (!loreNames.has(name)) selectedLore.delete(name);
  }
  renderPoolCards();
  updatePoolCounts();
  validateStartButton();
}

// ========== Export Image ==========
async function saveDraftAsImage() {
  const btn = el.saveDraftImg;
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const target = el.playerBoards;

    // Wait for all images to finish loading
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

    const blob = await toBlob(target, {
      pixelRatio: 2,
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
    a.download = `arcs-draft-${draft.numPlayers}p.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Save failed:", err);
    alert("Failed to save draft image. Try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// ========== Init ==========
async function init() {
  initTheme();
  el.themeToggle.addEventListener("click", toggleTheme);

  el.resetDraft.addEventListener("click", resetDraftToSetup);
  el.autoDraftBtn.addEventListener("click", autoDraft);
  el.undoBtn.addEventListener("click", undoPick);
  el.saveDraftImg.addEventListener("click", saveDraftAsImage);

  try {
    setStatus("Loading cards & tier data…");
    const [cards, tierRows, rankedRows] = await Promise.all([
      loadCards(),
      loadTierList(),
      loadRankedSheet(),
    ]);

    const personal = parseTierData(tierRows, cards);
    personalLeaders = personal.leaders;
    personalLore = personal.lore;

    const ranked = parseRankedData(rankedRows, cards);
    dataLeaders = ranked.leaders;
    dataLore = ranked.lore;

    // Parse community tier data (static, no fetch needed)
    const comm3p = parseCommunityTierData("3p", cards);
    community3pLeaders = comm3p.leaders;
    community3pLore = comm3p.lore;

    const comm4p = parseCommunityTierData("4p", cards);
    community4pLeaders = comm4p.leaders;
    community4pLore = comm4p.lore;

    if (personalLeaders.length === 0 && personalLore.length === 0 &&
        dataLeaders.length === 0 && dataLore.length === 0 &&
        community4pLeaders.length === 0 && community4pLore.length === 0) {
      setStatus("No tier list data found.", { isError: true });
      return;
    }

    // Apply default source
    applyTierSource();

    setStatus("");
    initSetupUI();
    renderPoolCards();
    updatePoolCounts();
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, { isError: true });
  }
}

init();
