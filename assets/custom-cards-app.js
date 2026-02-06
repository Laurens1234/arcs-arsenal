// ========== GitHub API Config ==========
const REPO_OWNER = "Laurens1234";
const REPO_NAME = "Arcs-Leader-Generator";
const BRANCH = "main";
const LEADERS_PATH = "results";
const LORE_PATH = "results/lore";

const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

// ========== DOM ==========
const el = {
  status: document.getElementById("status"),
  cardGrid: document.getElementById("cardGrid"),
  query: document.getElementById("query"),
  tabs: document.querySelectorAll(".tab"),
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

// ========== Rendering ==========
function getFilteredCards() {
  let cards = allCards;

  // Tab filter
  if (activeTab === "leaders") {
    cards = cards.filter((c) => c.type === "Leader");
  } else if (activeTab === "lore") {
    cards = cards.filter((c) => c.type === "Lore");
  }

  // Search filter
  const q = (el.query.value || "").trim().toLowerCase();
  if (q) {
    cards = cards.filter((c) => c.name.toLowerCase().includes(q));
  }

  return cards;
}

function render() {
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

// ========== Event Listeners ==========
function init() {
  initTheme();

  el.themeToggle.addEventListener("click", toggleTheme);

  // Print
  document.getElementById("printBtn").addEventListener("click", printCards);

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
      render();
    });
  });

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
