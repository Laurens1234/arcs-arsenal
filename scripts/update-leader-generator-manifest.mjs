import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_OWNER = "Laurens1234";
const REPO_NAME = "Arcs-Leader-Generator";
const BRANCH = "main";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const cacheRoot = path.join(repoRoot, ".cache");
const cloneDir = path.join(cacheRoot, REPO_NAME);

const resultsDir = path.join(cloneDir, "results");
const loreDir = path.join(cloneDir, "results", "lore");
const outFile = path.join(repoRoot, "assets", "leader-generator-manifest.json");
const metaOutFile = path.join(repoRoot, "assets", "leader-generator-metadata.json");

const BEYOND_NAMES = [
  "God's Hand",
  "Firebrand",
  "Scavenger",
  "Diplomat",
  "Imperator",
  "Ancient Wraith",
  "Poet",
  "Brainbox",
  "Brain Box",
];

function normalizeName(n) {
  if (!n) return "";
  let s = String(n).toLowerCase();
  s = s.replace(/[’‘]/g, "'");
  s = s.replace(/[^a-z0-9\s]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const BEYOND_SET = new Set(BEYOND_NAMES.map((n) => normalizeName(n)));

function decodeBackslashEscapes(s) {
  return String(s)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function stripMarkdownForCharCount(s) {
  return String(s)
    .replace(/\*\*|\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDoubleQuotedStrings(source) {
  const strings = [];
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '"') {
      i++;
      continue;
    }
    i++;
    let buf = "";
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\") {
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
        i++;
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
  let depth = 0;
  let inString = false;
  for (let i = openParenIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i++;
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

  if (matches.length === 0) {
    return stripMarkdownForCharCount(text).length;
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

function parseInto(text, opts) {
  const {
    includeKey = () => true,
    overwrite = false,
    writeOrder = false,
    orderCounter = { value: 1 },
    nameMap,
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
    nameMap.set(key, name);
    nameMatches.push({ key, index: match.index });
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
          const buildingsPattern = buildingsPattern3.endsWith("-") ? buildingsPattern3.slice(0, -1) : buildingsPattern3;
          setupMap.set(key, `${shipsPattern}|${buildingsPattern}`);
        }
      }
    }
  }
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function git(args, { cwd } = {}) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}

async function ensureClone() {
  await fs.mkdir(cacheRoot, { recursive: true });

  const hasGitDir = await pathExists(path.join(cloneDir, ".git"));
  const repoUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;

  if (!hasGitDir) {
    // Fresh shallow clone.
    await git(["clone", "--depth", "1", "--branch", BRANCH, repoUrl, cloneDir], { cwd: cacheRoot });
    return;
  }

  // Update existing clone.
  await git(["fetch", "origin", BRANCH, "--depth", "1"], { cwd: cloneDir });
  await git(["reset", "--hard", `origin/${BRANCH}`], { cwd: cloneDir });
}

async function listPngFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".png"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  await ensureClone();

  const leaders = await listPngFiles(resultsDir);
  const lore = await listPngFiles(loreDir);

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: BRANCH,
    },
    leaders,
    lore,
  };

  await fs.writeFile(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");

  // Metadata JSON (abilities/resources/setup/order)
  const leadersText = await fs.readFile(path.join(cloneDir, "scripts", "leadersFormatted.py"), "utf8");
  const btrText = await fs.readFile(path.join(cloneDir, "scripts", "btrFormatted.py"), "utf8");

  const nameMap = new Map();
  const orderMap = new Map();
  const abilityCharsMap = new Map();
  const abilityTextMap = new Map();
  const resourcesMap = new Map();
  const resourceListMap = new Map();
  const twoSameMap = new Map();
  const setupMap = new Map();
  const orderCounter = { value: 1 };

  parseInto(leadersText, {
    includeKey: (k) => !BEYOND_SET.has(k),
    overwrite: false,
    writeOrder: true,
    orderCounter,
    nameMap,
    orderMap,
    abilityCharsMap,
    abilityTextMap,
    resourcesMap,
    resourceListMap,
    twoSameMap,
    setupMap,
  });

  parseInto(btrText, {
    includeKey: (k) => BEYOND_SET.has(k),
    overwrite: true,
    writeOrder: false,
    orderCounter,
    nameMap,
    orderMap,
    abilityCharsMap,
    abilityTextMap,
    resourcesMap,
    resourceListMap,
    twoSameMap,
    setupMap,
  });

  const metaEntries = [];
  for (const [key, name] of nameMap.entries()) {
    metaEntries.push({
      key,
      name,
      order: orderMap.get(key) ?? null,
      abilitiesText: abilityTextMap.get(key) ?? "",
      abilityChars: abilityCharsMap.get(key) ?? null,
      resources: resourceListMap.get(key) ?? [],
      setupKey: setupMap.get(key) ?? "",
      hasTwoSameResource: twoSameMap.get(key) === true,
    });
  }
  metaEntries.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const metaPayload = {
    version: 1,
    generatedAt: payload.generatedAt,
    source: payload.source,
    entries: metaEntries,
  };

  await fs.writeFile(metaOutFile, JSON.stringify(metaPayload, null, 2) + "\n", "utf8");

  process.stdout.write(
    `Wrote ${path.relative(repoRoot, outFile)} (${leaders.length} leaders, ${lore.length} lore)\n` +
    `Wrote ${path.relative(repoRoot, metaOutFile)} (${metaEntries.length} entries)\n`
  );
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exitCode = 1;
});
