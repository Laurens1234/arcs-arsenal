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
  // Modal
  modal: document.getElementById("cardModal"),
  modalImg: document.getElementById("modalImg"),
  modalName: document.getElementById("modalName"),
  modalText: document.getElementById("modalText"),
  modalClose: document.querySelector(".modal-close"),
  modalBackdrop: document.querySelector(".modal-backdrop"),
};

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

function buildTierListHTML(entries, container) {
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
    const items = grouped.get(tier);
    if (items.length === 0 && tier === "SS") continue; // Only show SS if items exist

    const row = document.createElement("div");
    row.className = "personal-tier-row";

    const label = document.createElement("div");
    label.className = `personal-tier-label tier-${tier.toLowerCase()}`;
    label.textContent = tier;

    const cardsDiv = document.createElement("div");
    cardsDiv.className = "personal-tier-cards";

    for (const entry of items) {
      const cardEl = document.createElement("div");
      cardEl.className = "personal-tier-card";

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

      // Click to open modal
      if (entry.card) {
        cardEl.addEventListener("click", () => openModal(entry.card));
      }

      cardsDiv.appendChild(cardEl);
    }

    row.appendChild(label);
    row.appendChild(cardsDiv);
    container.appendChild(row);
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

  // Modal events
  el.modalClose.addEventListener("click", closeModal);
  el.modalBackdrop.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  try {
    setStatus("Loading cards & tier list…");
    const [cards, rows] = await Promise.all([loadCards(), loadTierListSheet()]);
    const { leaders, lore } = parseTierListSheet(rows, cards);

    if (leaders.length === 0 && lore.length === 0) {
      setStatus("No tier list data found. Check the spreadsheet.", { isError: true });
      return;
    }

    buildTierListHTML(leaders, el.leadersTierList);
    buildTierListHTML(lore, el.loreTierList);

    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, { isError: true });
  }
}

init();
