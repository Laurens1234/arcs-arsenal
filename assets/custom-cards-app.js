// ========== GitHub API Config ==========
const REPO_OWNER = "Laurens1234";
const REPO_NAME = "Arcs-Leader-Generator";
const BRANCH = "main";
const LEADERS_PATH = "results";
const LORE_PATH = "results/lore";

const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

// Base URL for files that live next to this script (i.e., under this repo's /assets/ folder).
const ASSETS_BASE_URL = (() => {
  try {
    return new URL("./", import.meta.url).href;
  } catch (e) {
    return "";
  }
})();

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
  "Brainbox",
  "Brain Box"
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
  themeToggle: document.getElementById("themeToggle"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightboxImg"),
  lightboxTitle: document.getElementById("lightboxTitle"),
  lightboxMeta: document.getElementById("lightboxMeta"),
  lightboxAbilities: document.getElementById("lightboxAbilities"),
  lightboxBackdrop: document.querySelector(".lightbox-backdrop"),
  historyBtn: document.getElementById("historyBtn"),
  historyModal: document.getElementById("historyModal"),
  historyModalBackdrop: document.querySelector(".history-modal-backdrop"),
  historyModalContent: document.querySelector(".history-modal-content"),
  historyModalClose: document.getElementById("historyModalClose"),
  historyModalTitle: document.getElementById("historyModalTitle"),
  historyModalStatus: document.getElementById("historyModalStatus"),
  historyModalGrid: document.getElementById("historyModalGrid"),
  randomDraftCount: document.getElementById("randomDraftCount"),
  randomDraftBtn: document.getElementById("randomDraftBtn"),
};

let lastChangedHelpBtn = null;

function showGitHubTokenHelp() {
  const msg = "To enable 'Last changed' / History: open DevTools Console and run: localStorage.setItem('arcs-github-token','YOUR_TOKEN'); then reload the page.";
  if (el.status) {
    el.status.textContent = msg;
    el.status.classList.add("error");
    setTimeout(() => {
      if (!el.status) return;
      if (String(el.status.textContent || "") === msg) {
        el.status.textContent = "";
        el.status.classList.remove("error");
      }
    }, 8000);
  } else {
    alert(msg);
  }
}

function ensureLastChangedHelpBtn() {
  if (lastChangedHelpBtn || !el.sortSelect) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn-compare";
  btn.textContent = "?";
  btn.title = "How to enable Last changed";
  btn.setAttribute("aria-label", "How to enable Last changed");
  btn.style.padding = "8px 10px";
  btn.style.fontSize = "0.9rem";
  btn.style.minWidth = "unset";
  btn.addEventListener("click", showGitHubTokenHelp);
  el.sortSelect.insertAdjacentElement("afterend", btn);
  lastChangedHelpBtn = btn;
}

// ========== State ==========
let allCards = [];
let activeTab = "leaders";
let selectMode = false;
let selectedCards = new Set(); // stores card imageUrl as unique key
let draftViewActive = false; // when true, only render selected cards (used by Random Draft)
let currentLightboxCard = null;

// Lightbox History state
let historyLoadedForPath = null;
const commitHistoryCache = new Map(); // path -> commits[]
const commitHistoryInFlight = new Map(); // cacheKey -> Promise
let lightboxSwapToken = 0;

// Sorting: last changed
const lastChangedMsByPath = new Map(); // path -> number|null (ms since epoch)
const lastChangedInFlightByPath = new Map(); // path -> Promise<number|null>
let lastChangedPrefetchToken = 0;

async function fetchLastChangedMsForPath(path) {
  if (!path) return null;
  if (lastChangedMsByPath.has(path)) return lastChangedMsByPath.get(path);
  if (lastChangedInFlightByPath.has(path)) return lastChangedInFlightByPath.get(path);

  // Restrict last-changed to authenticated GitHub usage to avoid timeouts/403s.
  if (!getGitHubToken()) {
    lastChangedMsByPath.set(path, null);
    return null;
  }

  const p = (async () => {
    try {
      // Fallback: latest commit date for that file.
      const commits = await fetchGitHubCommitHistory(path, 1);
      const c = Array.isArray(commits) && commits.length ? commits[0] : null;
      const iso = c?.commit?.author?.date || c?.commit?.committer?.date;
      const apiMs = iso ? Date.parse(iso) : null;
      lastChangedMsByPath.set(path, Number.isFinite(apiMs) ? apiMs : null);
      return lastChangedMsByPath.get(path);
    } catch (e) {
      // Cache as unknown to avoid hammering the API.
      lastChangedMsByPath.set(path, null);
      return null;
    }
  })();

  lastChangedInFlightByPath.set(path, p);
  try {
    return await p;
  } finally {
    lastChangedInFlightByPath.delete(path);
  }
}

function prefetchLastChangedDatesForCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return;
  if (!getGitHubToken()) return;
  const token = ++lastChangedPrefetchToken;

  const paths = [];
  const seen = new Set();
  for (const c of cards) {
    const p = getGithubFilePathForCard(c);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    if (!lastChangedMsByPath.has(p)) paths.push(p);
  }
  if (paths.length === 0) return;

  const total = paths.length;
  let done = 0;
  if (el.status) el.status.textContent = `Loading change dates… (0/${total})`;

  const concurrency = 6;
  let index = 0;

  const worker = async () => {
    while (true) {
      const i = index++;
      if (i >= paths.length) return;
      await fetchLastChangedMsForPath(paths[i]);
      done++;

      if (token === lastChangedPrefetchToken && el.status) {
        if (done === total || done % 12 === 0) {
          el.status.textContent = `Loading change dates… (${done}/${total})`;
        }
      }
    }
  };

  (async () => {
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
    } finally {
      if (token !== lastChangedPrefetchToken) return;
      if (el.status && String(el.status.textContent || "").startsWith("Loading change dates")) {
        el.status.textContent = "";
      }
      const sortMode = getLeaderSortMode();
      const isLeaderTab = activeTab === "leaders" || activeTab === "beyond";
      if (isLeaderTab && sortMode === "lastChanged") {
        render();
      }
    }
  })();
}

function updateLastChangedSortAvailability() {
  if (!el.sortSelect) return;
  ensureLastChangedHelpBtn();
  const opt = el.sortSelect.querySelector('option[value="lastChanged"]');
  if (!opt) return;

  const hasToken = Boolean(getGitHubToken());
  opt.disabled = !hasToken;
  opt.textContent = hasToken ? "Order: Last changed" : "Order: Last changed (token required)";

  if (lastChangedHelpBtn) {
    const showHelp = !hasToken && (activeTab === "leaders" || activeTab === "beyond");
    lastChangedHelpBtn.style.display = showHelp ? "" : "none";
  }

  if (!hasToken && el.sortSelect.value === "lastChanged") {
    el.sortSelect.value = "number";
  }
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
const DIR_LIST_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getGitHubToken() {
  try {
    return localStorage.getItem("arcs-github-token") || "";
  } catch (e) {
    return "";
  }
}

function githubApiHeaders() {
  const token = getGitHubToken();
  const headers = {
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function dirListCacheKey(path) {
  return `arcs-dirlist-v1:${REPO_OWNER}/${REPO_NAME}@${BRANCH}:${path}`;
}

function readDirListCache(path, { allowStale = false } = {}) {
  try {
    const raw = localStorage.getItem(dirListCacheKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = parsed?.ts;
    const data = parsed?.data;
    if (!Array.isArray(data) || !Number.isFinite(ts)) return null;
    const isFresh = (Date.now() - ts) <= DIR_LIST_CACHE_TTL_MS;
    if (!allowStale && !isFresh) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function writeDirListCache(path, data) {
  try {
    if (!Array.isArray(data)) return;
    localStorage.setItem(dirListCacheKey(path), JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    // ignore quota / privacy mode
  }
}

let localManifestCache = null;
let localManifestInFlight = null;

function localManifestUrl() {
  if (!ASSETS_BASE_URL) return "";
  return new URL("leader-generator-manifest.json", ASSETS_BASE_URL).href;
}

async function fetchLocalManifest() {
  if (localManifestCache) return localManifestCache;
  if (localManifestInFlight) return localManifestInFlight;

  const url = localManifestUrl();
  if (!url) throw new Error("Local manifest URL unavailable");

  const p = (async () => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Local manifest fetch error ${res.status}`);
    const json = await res.json();
    const leaders = json?.leaders;
    const lore = json?.lore;
    if (!Array.isArray(leaders) || !Array.isArray(lore)) {
      throw new Error("Local manifest invalid");
    }
    localManifestCache = { leaders, lore };
    return localManifestCache;
  })();

  localManifestInFlight = p;
  try {
    return await p;
  } finally {
    localManifestInFlight = null;
  }
}

async function fetchLocalManifestDir(path) {
  if (path !== LEADERS_PATH && path !== LORE_PATH) return null;
  const manifest = await fetchLocalManifest();
  const names = path === LEADERS_PATH ? manifest.leaders : manifest.lore;
  // Normalize to GitHub /contents-style entries that our UI expects.
  return names.map((name) => ({ name, type: "file" }));
}

let jsDelivrPackageTreeCache = null; // full tree JSON from data.jsdelivr.com
let jsDelivrPackageTreeInFlight = null;

async function fetchJsDelivrPackageTree(ref) {
  if (jsDelivrPackageTreeCache) return jsDelivrPackageTreeCache;
  if (jsDelivrPackageTreeInFlight) return jsDelivrPackageTreeInFlight;

  const url = `https://data.jsdelivr.com/v1/package/gh/${REPO_OWNER}/${REPO_NAME}@${encodeURIComponent(ref)}`;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`jsDelivr API error ${res.status}`);
    }
    const json = await res.json();
    jsDelivrPackageTreeCache = json;
    return json;
  })();

  jsDelivrPackageTreeInFlight = p;
  try {
    return await p;
  } finally {
    jsDelivrPackageTreeInFlight = null;
  }
}

function findJsDelivrDirEntry(files, name) {
  if (!Array.isArray(files)) return null;
  for (const f of files) {
    if (f && f.type === "directory" && f.name === name) return f;
  }
  return null;
}

async function fetchJsDelivrDir(path) {
  const tree = await fetchJsDelivrPackageTree(BRANCH);
  let curFiles = Array.isArray(tree?.files) ? tree.files : [];
  const segs = String(path)
    .split("/")
    .filter(Boolean);

  for (const seg of segs) {
    const dir = findJsDelivrDirEntry(curFiles, seg);
    if (!dir) return [];
    curFiles = Array.isArray(dir.files) ? dir.files : [];
  }

  // Normalize to GitHub /contents-style entries that our UI expects.
  return curFiles
    .filter((f) => f && typeof f.name === "string" && (f.type === "file" || f.type === "directory"))
    .map((f) => ({
      name: f.name,
      type: f.type === "directory" ? "dir" : "file",
    }));
}

async function fetchGitHubDir(path) {
  const cached = readDirListCache(path);
  if (cached) return cached;

  // Most reliable: use a local, pre-generated manifest bundled with this site.
  // This avoids CORS and external rate limits entirely.
  try {
    const list = await fetchLocalManifestDir(path);
    if (list) {
      writeDirListCache(path, list);
      return list;
    }
  } catch (e) {
    // fall back to remote sources below
  }

  // Prefer jsDelivr for anonymous users to avoid GitHub API rate limits.
  // This also reduces pressure on GitHub even when a token is configured.
  try {
    const list = await fetchJsDelivrDir(path);
    writeDirListCache(path, list);
    return list;
  } catch (e) {
    // fall back to GitHub API below
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;
  let res;
  try {
    res = await fetch(url, {
      headers: githubApiHeaders(),
    });
  } catch (e) {
    // Network errors: try stale cache, then mirror.
    const stale = readDirListCache(path, { allowStale: true });
    if (stale) return stale;
    throw e;
  }

  if (res.ok) {
    const json = await res.json();
    const list = Array.isArray(json) ? json : [];
    writeDirListCache(path, list);
    return list;
  }

  let extra = "";
  try {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (res.status === 403 && remaining === "0") {
      const resetMs = reset ? (parseInt(reset, 10) * 1000) : null;
      const mins = resetMs && Number.isFinite(resetMs) ? Math.max(1, Math.ceil((resetMs - Date.now()) / 60000)) : null;
      const resetText = mins ? `; try again in ~${mins} min` : "";
      if (!getGitHubToken()) {
        extra = `${resetText}. Optional fix: set a GitHub token in localStorage key 'arcs-github-token' to raise rate limits.`;
      } else {
        extra = resetText;
      }
    }
  } catch (e) {
    // ignore
  }

  // Rate limit / abuse protection: fall back to stale cache if possible.
  const stale = readDirListCache(path, { allowStale: true });
  if (stale) return stale;

  // If the GitHub API fails (often due to rate limits), try jsDelivr as a last resort.
  try {
    const list = await fetchJsDelivrDir(path);
    writeDirListCache(path, list);
    return list;
  } catch (e) {
    // ignore, report GitHub failure below
  }
  throw new Error(`GitHub API error ${res.status} for ${path}${extra ? " (" + extra + ")" : ""}`);
}

function encodePath(path) {
  return String(path)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

function getGithubFilePathForCard(card) {
  if (!card) return "";
  if (card.githubPath) return String(card.githubPath);
  if (card.type === "Lore") return `${LORE_PATH}/${card.filename}`;
  return `${LEADERS_PATH}/${card.filename}`;
}

function rawUrlForRef(ref, path) {
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}/${encodePath(path)}`;
}

function githubRawUrlForRef(ref, path) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/raw/${ref}/${encodePath(path)}`;
}

function jsDelivrUrlForRef(ref, path) {
  // jsDelivr supports GitHub repos by commit/tag/branch.
  return `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${ref}/${encodePath(path)}`;
}

function getHistoricalImageCandidateUrls(ref, path) {
  // Try a few equivalent CDNs/hosts to reduce the chance of user-side blocking.
  return [
    rawUrlForRef(ref, path),
    githubRawUrlForRef(ref, path),
    jsDelivrUrlForRef(ref, path),
  ];
}

async function fetchGitHubCommitHistory(path, perPage = 12) {
  if (!path) return [];
  const cacheKey = `${path}|${perPage}`;
  if (commitHistoryCache.has(cacheKey)) return commitHistoryCache.get(cacheKey);

  if (commitHistoryInFlight.has(cacheKey)) return commitHistoryInFlight.get(cacheKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=${encodeURIComponent(
    BRANCH
  )}&path=${encodeURIComponent(path)}&per_page=${encodeURIComponent(perPage)}`;

  const p = (async () => {
    let res;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: githubApiHeaders(),
      });
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error("GitHub request timed out; try again.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      let extra = "";
      try {
        const remaining = res.headers.get("x-ratelimit-remaining");
        if (res.status === 403 && remaining === "0") {
          extra = " (GitHub rate limit reached; try again later)";
        }
      } catch (e) {
        // ignore
      }
      throw new Error(`GitHub commits API error ${res.status} for ${path}${extra}`);
    }

    const commits = await res.json();
    const list = Array.isArray(commits) ? commits : [];
    commitHistoryCache.set(cacheKey, list);
    return list;
  })();

  commitHistoryInFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    commitHistoryInFlight.delete(cacheKey);
  }
}

async function fetchGitHubCommitHistoryAll(path) {
  if (!path) return [];
  const cacheKey = `${path}|all`;
  if (commitHistoryCache.has(cacheKey)) return commitHistoryCache.get(cacheKey);

  if (commitHistoryInFlight.has(cacheKey)) return commitHistoryInFlight.get(cacheKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  const p = (async () => {
    const all = [];
    const perPage = 100;
    const maxPages = 10; // safety cap (1000 commits)

    try {
      for (let page = 1; page <= maxPages; page++) {
        const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=${encodeURIComponent(
          BRANCH
        )}&path=${encodeURIComponent(path)}&per_page=${perPage}&page=${page}`;

        const res = await fetch(url, {
          signal: controller.signal,
          headers: githubApiHeaders(),
        });

        if (!res.ok) {
          let extra = "";
          try {
            const remaining = res.headers.get("x-ratelimit-remaining");
            if (res.status === 403 && remaining === "0") {
              extra = " (GitHub rate limit reached; try again later)";
            }
          } catch (e) {
            // ignore
          }
          throw new Error(`GitHub commits API error ${res.status} for ${path}${extra}`);
        }

        const pageCommits = await res.json();
        const list = Array.isArray(pageCommits) ? pageCommits : [];
        if (list.length === 0) break;
        all.push(...list);
        if (list.length < perPage) break;
      }
    } catch (e) {
      if (controller.signal.aborted) {
        throw new Error("GitHub request timed out; try again.");
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }

    commitHistoryCache.set(cacheKey, all);
    return all;
  })();

  commitHistoryInFlight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    commitHistoryInFlight.delete(cacheKey);
  }
}

function resetHistoryUi() {
  historyLoadedForPath = null;
  if (el.historyBtn) el.historyBtn.setAttribute("aria-expanded", "false");
  if (el.historyModal) {
    el.historyModal.classList.add("hidden");
    el.historyModal.setAttribute("aria-hidden", "true");
  }
  if (el.historyModalStatus) el.historyModalStatus.textContent = "";
  if (el.historyModalGrid) el.historyModalGrid.innerHTML = "";
}

function setHistoryUiVisible(visible) {
  if (!el.historyModal || !el.historyBtn) return;
  el.historyModal.classList.toggle("hidden", !visible);
  el.historyModal.setAttribute("aria-hidden", visible ? "false" : "true");
  el.historyBtn.setAttribute("aria-expanded", visible ? "true" : "false");
  document.body.style.overflow = visible ? "hidden" : (el.lightbox && !el.lightbox.classList.contains("hidden") ? "hidden" : "");
}

function formatCommitCaption(commitObj) {
  const iso = commitObj?.commit?.author?.date || commitObj?.commit?.committer?.date;
  if (!iso) return "";
  // Keep it compact and consistent across locales.
  return new Date(iso).toISOString().slice(0, 10);
}

function selectHistoryItem(btn) {
  if (!el.historyModalGrid) return;
  for (const child of el.historyModalGrid.querySelectorAll(".history-item.selected")) {
    child.classList.remove("selected");
  }
  if (btn) btn.classList.add("selected");
}

function swapLightboxImage(nextUrl, opts = {}) {
  if (!el.lightboxImg) return;

  const {
    statusText = "",
    onErrorFallbackUrl = null,
    onErrorMessage = "",
  } = opts;

  if (el.historyModalStatus && statusText) el.historyModalStatus.textContent = statusText;

  const img = el.lightboxImg;
  const prevOnLoad = img.onload;
  const prevOnError = img.onerror;

  img.onload = () => {
    if (el.historyModalStatus && statusText) el.historyModalStatus.textContent = "";
    img.onload = prevOnLoad;
    img.onerror = prevOnError;
    if (typeof prevOnLoad === "function") prevOnLoad();
  };

  img.onerror = () => {
    if (el.historyModalStatus) {
      el.historyModalStatus.textContent = onErrorMessage || "Could not load that version.";
    }
    img.onload = prevOnLoad;
    img.onerror = prevOnError;
    if (onErrorFallbackUrl) {
      // Avoid leaving a broken URL stuck in the lightbox.
      img.src = onErrorFallbackUrl;
    }
    if (typeof prevOnError === "function") prevOnError();
  };

  // Assigning the same URL twice can re-trigger requests in some browsers.
  if (img.src === nextUrl) return;
  img.src = nextUrl;
}

function swapLightboxImageWithFallback(urls, opts = {}) {
  if (!el.lightboxImg) return;
  const img = el.lightboxImg;

  const token = ++lightboxSwapToken;
  const {
    statusText = "",
    onErrorFallbackUrl = null,
    onErrorMessage = "Could not load that version.",
  } = opts;

  let index = 0;
  let lastTried = "";

  const prevOnLoad = img.onload;
  const prevOnError = img.onerror;

  function cleanup() {
    img.onload = prevOnLoad;
    img.onerror = prevOnError;
  }

  function tryNext() {
    if (token !== lightboxSwapToken) return;

    if (!Array.isArray(urls) || index >= urls.length) {
      if (el.historyModalStatus) {
        el.historyModalStatus.textContent = `${onErrorMessage}${lastTried ? " Tried: " + lastTried : ""}`;
      }
      cleanup();
      if (onErrorFallbackUrl) img.src = onErrorFallbackUrl;
      return;
    }

    const nextUrl = urls[index++];
    lastTried = nextUrl;

    if (el.historyModalStatus && statusText) {
      el.historyModalStatus.textContent = statusText;
    }

    img.onload = () => {
      if (token !== lightboxSwapToken) return;
      if (el.historyModalStatus && statusText) el.historyModalStatus.textContent = "";
      cleanup();
      if (typeof prevOnLoad === "function") prevOnLoad();
    };

    img.onerror = () => {
      if (token !== lightboxSwapToken) return;
      tryNext();
    };

    img.src = nextUrl;
  }

  tryNext();
}

function setImgSrcWithFallback(imgEl, urls) {
  if (!imgEl) return;
  if (!Array.isArray(urls) || urls.length === 0) return;

  let index = 0;
  function tryNext() {
    if (index >= urls.length) return;
    const next = urls[index++];
    imgEl.src = next;
  }

  imgEl.addEventListener(
    "error",
    () => {
      tryNext();
    },
    { once: false }
  );

  tryNext();
}

async function showHistoryForCurrentCard() {
  const card = currentLightboxCard;
  if (!card || !el.historyModalGrid || !el.historyModalStatus) return;

  if (!getGitHubToken()) {
    setHistoryUiVisible(true);
    if (el.historyModalTitle) el.historyModalTitle.textContent = `Previous Versions: ${card.name}`;
    el.historyModalGrid.innerHTML = "";
    el.historyModalStatus.textContent = "History requires a GitHub token (set localStorage key 'arcs-github-token').";
    return;
  }

  const path = getGithubFilePathForCard(card);
  setHistoryUiVisible(true);

  if (el.historyModalTitle) el.historyModalTitle.textContent = `Previous Versions: ${card.name}`;

  if (el.historyBtn) el.historyBtn.disabled = true;
  try {
    // If we've already loaded this card's history, just keep it open.
    if (historyLoadedForPath === path && el.historyModalGrid.childElementCount > 0) return;

    el.historyModalStatus.textContent = "Loading versions…";
    el.historyModalGrid.innerHTML = "";

    let commits = [];
    try {
      commits = await fetchGitHubCommitHistoryAll(path);
    } catch (e) {
      el.historyModalStatus.textContent = `Could not load previous versions: ${e.message}`;
      return;
    }

    historyLoadedForPath = path;

    // Current version
    const currentBtn = document.createElement("button");
    currentBtn.type = "button";
    currentBtn.className = "history-item selected";
    currentBtn.addEventListener("click", () => {
      swapLightboxImage(card.imageUrl, { statusText: "" });
      selectHistoryItem(currentBtn);
    });
    const curImg = document.createElement("img");
    curImg.className = `history-thumb ${card.type === "Lore" ? "lore" : "leader"}`;
    curImg.loading = "lazy";
    curImg.alt = `${card.name} (current)`;
    curImg.src = card.imageUrl;
    const curCap = document.createElement("div");
    curCap.className = "history-caption";
    const currentDate = commits.length ? formatCommitCaption(commits[0]) : "";
    curCap.textContent = currentDate ? `Current — ${currentDate}` : "Current";
    currentBtn.appendChild(curImg);
    currentBtn.appendChild(curCap);
    el.historyModalGrid.appendChild(currentBtn);

    if (!commits.length) {
      el.historyModalStatus.textContent = "No older versions found.";
      return;
    }

    el.historyModalStatus.textContent = `${commits.length} version(s)`;

    for (const c of commits) {
      const sha = c?.sha;
      if (!sha) continue;
      const candidates = getHistoricalImageCandidateUrls(sha, path);
      const previewUrl = candidates[0];

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-item";
      btn.addEventListener("click", () => {
        swapLightboxImageWithFallback(candidates, {
          statusText: `Loading ${card.name} @ ${sha.slice(0, 7)}…`,
          onErrorFallbackUrl: card.imageUrl,
          onErrorMessage: `Could not load ${card.name} @ ${sha.slice(0, 7)}.`,
        });
        selectHistoryItem(btn);
      });

      const img = document.createElement("img");
      img.className = `history-thumb ${card.type === "Lore" ? "lore" : "leader"}`;
      img.loading = "lazy";
      img.alt = `${card.name} (${sha.slice(0, 7)})`;
      // Use fallback hosts for thumbnail too; prevents endless 404 spam.
      setImgSrcWithFallback(img, candidates);

      // If the first candidate works, great; if it doesn't, error handler will advance.
      // Ensure we start at a deterministic URL to avoid any browser prefetch oddities.
      if (!img.src) img.src = previewUrl;

      const cap = document.createElement("div");
      cap.className = "history-caption";
      const caption = formatCommitCaption(c);
      cap.textContent = caption;

      btn.appendChild(img);
      btn.appendChild(cap);
      el.historyModalGrid.appendChild(btn);
    }
  } finally {
    if (el.historyBtn) el.historyBtn.disabled = false;
  }
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
        githubPath: `${LEADERS_PATH}/${f.name}`,
        imageUrl: `${RAW_BASE}/${LEADERS_PATH}/${encodeURIComponent(f.name)}`,
      }));

    const lore = loreFiles
      .filter((f) => f.type === "file" && f.name.toLowerCase().endsWith(".png"))
      .map((f) => ({
        name: nameFromFile(f.name, "Lore"),
        type: "Lore",
        filename: f.name,
        githubPath: `${LORE_PATH}/${f.name}`,
        imageUrl: `${RAW_BASE}/${LORE_PATH}/${encodeURIComponent(f.name)}`,
      }));

    allCards = [...leaders, ...lore].sort((a, b) => a.name.localeCompare(b.name));

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
  // Prefer local pre-generated metadata to avoid cross-origin fetch/parsing issues.
  try {
    if (ASSETS_BASE_URL) {
      const url = new URL("leader-generator-metadata.json", ASSETS_BASE_URL).href;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const entries = Array.isArray(json?.entries) ? json.entries : null;
        if (entries) {
          const nextOrderMap = new Map();
          const nextAbilityMap = new Map();
          const nextAbilityTextMap = new Map();
          const nextResourcesMap = new Map();
          const nextResourceListMap = new Map();
          const nextTwoSameMap = new Map();
          const nextSetupMap = new Map();

          for (const e of entries) {
            const key = typeof e?.key === "string" ? e.key : "";
            if (!key) continue;
            if (typeof e?.order === "number" && Number.isFinite(e.order)) nextOrderMap.set(key, e.order);
            if (typeof e?.abilitiesText === "string" && e.abilitiesText) {
              nextAbilityTextMap.set(key, e.abilitiesText);
              if (typeof e?.abilityChars === "number" && Number.isFinite(e.abilityChars)) {
                nextAbilityMap.set(key, e.abilityChars);
              } else {
                nextAbilityMap.set(key, computeAbilityCharCount(e.abilitiesText));
              }
            }
            const resources = Array.isArray(e?.resources) ? e.resources.filter(Boolean) : [];
            if (resources.length) {
              nextResourceListMap.set(key, resources);
              nextResourcesMap.set(key, new Set(resources));
              nextTwoSameMap.set(key, e?.hasTwoSameResource === true);
            }
            if (typeof e?.setupKey === "string" && e.setupKey) {
              nextSetupMap.set(key, e.setupKey);
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
          return;
        }
      }
    }
  } catch (e) {
    // Fall back to fetching/parsing the generator output below.
  }

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

  if (lastChangedHelpBtn) lastChangedHelpBtn.style.display = show ? "" : "none";
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
  const mode = getSearchMode();
  if (q) {
    cards = cards.filter((c) => cardMatchesQuery(c, q, mode));
  }

  // Sorting (leader-based tabs only)
  if (activeTab === "leaders" || activeTab === "beyond") {
    const sortMode = getLeaderSortMode();
    if (sortMode === "number") {
      cards = [...cards].sort((a, b) => {
        const aNum = leaderOrderByName.get(normalizeName(a.name)) ?? Number.POSITIVE_INFINITY;
        const bNum = leaderOrderByName.get(normalizeName(b.name)) ?? Number.POSITIVE_INFINITY;
        if (aNum !== bNum) return aNum - bNum;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === "lastChanged") {
      // Kick off background fetches; sorting will improve as dates arrive.
      prefetchLastChangedDatesForCards(cards);

      cards = [...cards].sort((a, b) => {
        const aPath = getGithubFilePathForCard(a);
        const bPath = getGithubFilePathForCard(b);
        const aMs = lastChangedMsByPath.has(aPath) ? lastChangedMsByPath.get(aPath) : null;
        const bMs = lastChangedMsByPath.has(bPath) ? lastChangedMsByPath.get(bPath) : null;

        const aKnown = typeof aMs === "number" && Number.isFinite(aMs);
        const bKnown = typeof bMs === "number" && Number.isFinite(bMs);
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        if (!aKnown && !bKnown) return a.name.localeCompare(b.name);

        if (aMs !== bMs) return bMs - aMs; // newest first
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
  let cards = getFilteredCards();
  if (draftViewActive && selectedCards.size > 0) {
    cards = cards.filter((c) => selectedCards.has(c.imageUrl));
  }

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
  resetHistoryUi();
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
  resetHistoryUi();
  document.body.style.overflow = "";
  clearUrlCardName();
}

function closeHistoryModal() {
  setHistoryUiVisible(false);
  if (el.historyModalStatus) el.historyModalStatus.textContent = "";
}

// ========== Selection ==========
function syncSelectModeUi() {
  const selectBtn = document.getElementById("selectBtn");
  const selectActions = document.getElementById("selectActions");
  if (selectBtn) selectBtn.textContent = selectMode ? "✅ Done" : "☑ Select";
  if (selectActions) selectActions.style.display = selectMode ? "inline-flex" : "none";
}

function toggleSelectMode() {
  selectMode = !selectMode;
  syncSelectModeUi();
  if (!selectMode) {
    // Keep selections but exit visual mode
    draftViewActive = false;
  }
  render();
}

function pickRandomSubset(array, count) {
  const n = Math.max(0, Math.min(count, array.length));
  // Partial Fisher-Yates shuffle (only first n positions)
  const arr = array.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

function getRandomDraftCount() {
  const raw = el.randomDraftCount?.value;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

function randomDraft() {
  const pool = getFilteredCards();
  if (pool.length === 0) return;

  const desired = getRandomDraftCount();
  const n = Math.max(1, Math.min(desired, pool.length));

  if (!selectMode) {
    selectMode = true;
    syncSelectModeUi();
  }

  draftViewActive = true;

  selectedCards.clear();
  const picked = pickRandomSubset(pool, n);
  for (const card of picked) selectedCards.add(card.imageUrl);
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
  draftViewActive = false;
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

  // Random draft
  el.randomDraftBtn?.addEventListener("click", randomDraft);
  el.randomDraftCount?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") randomDraft();
  });

  // Tabs
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeTab = tab.dataset.tab;
      draftViewActive = false;
      // reflect tab in the URL
      setUrlTab(activeTab);
      updateSortControlVisibility();
      updateLastChangedSortAvailability();
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
  updateLastChangedSortAvailability();

  // Sort
  if (el.sortSelect) {
    el.sortSelect.addEventListener("change", () => {
      // Prevent selecting last-changed without a token.
      if (el.sortSelect.value === "lastChanged" && !getGitHubToken()) {
        el.sortSelect.value = "number";
        if (el.status) {
          el.status.textContent = "Last changed requires a GitHub token (set localStorage key 'arcs-github-token').";
          el.status.classList.add("error");
          setTimeout(() => {
            if (el.status && String(el.status.textContent || "").startsWith("Last changed requires a GitHub token")) {
              el.status.textContent = "";
              el.status.classList.remove("error");
            }
          }, 5000);
        }
      }
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

  // Lightbox history
  if (el.historyBtn) {
    el.historyBtn.addEventListener("click", async () => {
      const isOpen = el.historyModal && !el.historyModal.classList.contains("hidden");
      if (isOpen) {
        closeHistoryModal();
        return;
      }
      await showHistoryForCurrentCard();
    });
  }

  if (el.historyModalClose) {
    el.historyModalClose.addEventListener("click", closeHistoryModal);
  }
  if (el.historyModalBackdrop) {
    el.historyModalBackdrop.addEventListener("click", closeHistoryModal);
  }
  if (el.historyModalContent) {
    el.historyModalContent.addEventListener("click", (e) => {
      // Clicking the empty gutters (transparent sides) should dismiss.
      if (e.target === el.historyModalContent) closeHistoryModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (el.historyModal && !el.historyModal.classList.contains("hidden")) {
      closeHistoryModal();
      return;
    }
    closeLightbox();
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
