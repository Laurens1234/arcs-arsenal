import yaml from "https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm";
import Papa from "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm";
import { buildCommunityStats } from "./community-data.js";
import { CONFIG } from "./config.js";

// ========== DOM Elements ==========
const el = {
  status: document.getElementById("status"),
  allCards: document.getElementById("allCards"),
  leaderCards: document.getElementById("leaderCards"),
  loreCards: document.getElementById("loreCards"),
  allSection: document.getElementById("allSection"),
  leadersSection: document.getElementById("leadersSection"),
  loreSection: document.getElementById("loreSection"),
  query: document.getElementById("query"),
  metric: document.getElementById("metric"),
  tabs: document.querySelectorAll(".tab"),
  // Theme
  themeToggle: document.getElementById("themeToggle"),
  // Modal
  modal: document.getElementById("cardModal"),
  modalImg: document.getElementById("modalImg"),
  modalName: document.getElementById("modalName"),
  modalStats: document.getElementById("modalStats"),
  modalText: document.getElementById("modalText"),
  modalClose: document.querySelector(".modal-close"),
  modalBackdrop: document.querySelector(".modal-backdrop"),
  modalShareBtn: document.getElementById("modalShareBtn"),
  // Compare
  compareBtn: document.getElementById("compareBtn"),
  comparePanel: document.getElementById("comparePanel"),
  closeCompare: document.getElementById("closeCompare"),
  compareSlots: document.getElementById("compareSlots"),
  // Insights - All
  allScatterChart: document.getElementById("allScatterChart"),
  allHistogram: document.getElementById("allHistogram"),
  allAnalysis: document.getElementById("allAnalysis"),
  allTierList: document.getElementById("allTierList"),
  // Insights - Leaders
  leaderScatterChart: document.getElementById("leaderScatterChart"),
  leaderHistogram: document.getElementById("leaderHistogram"),
  leaderAnalysis: document.getElementById("leaderAnalysis"),
  leaderTierList: document.getElementById("leaderTierList"),
  // Insights - Lore
  loreScatterChart: document.getElementById("loreScatterChart"),
  loreHistogram: document.getElementById("loreHistogram"),
  loreAnalysis: document.getElementById("loreAnalysis"),
  loreTierList: document.getElementById("loreTierList"),
  // Histogram titles/subtitles/help buttons
  leaderHistogramTitle: document.getElementById("leaderHistogramTitle"),
  leaderHistogramSubtitle: document.getElementById("leaderHistogramSubtitle"),
  leaderHistogramHelp: document.getElementById("leaderHistogramHelp"),
  loreHistogramTitle: document.getElementById("loreHistogramTitle"),
  loreHistogramSubtitle: document.getElementById("loreHistogramSubtitle"),
  loreHistogramHelp: document.getElementById("loreHistogramHelp"),
  allHistogramTitle: document.getElementById("allHistogramTitle"),
  allHistogramSubtitle: document.getElementById("allHistogramSubtitle"),
  allHistogramHelp: document.getElementById("allHistogramHelp"),
  // Data source toggle
  dataSourceGroup: document.getElementById("dataSourceGroup"),
  playerCountGroup: document.getElementById("playerCountGroup"),
  dataSourceLabel: document.getElementById("dataSourceLabel"),
  pageTagline: document.getElementById("pageTagline"),
};

// ========== State ==========
let appState = {
  leaders: [],
  lore: [],
  allCards: [],
  compareMode: false,
  compareCards: [null, null],
  insights: null,
  dataSource: "league",      // "league" | "Community"
  playerCount: "3p",         // "3p" | "4p" (for Community)
  yamlCards: [],              // loaded card definitions
  leagueCards: null,          // { leaders, lore } from league data
  currentModalCard: null,     // current card in modal
};

// ========== Utilities ==========
function setStatus(message, { isError = false } = {}) {
  el.status.textContent = message;
  el.status.classList.toggle("error", isError);
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatCardText(text) {
  if (!text) return "";
  // Escape HTML first
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Bold: **text** → <strong>text</strong>
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic: *text* → <em>text</em>
  formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return formatted;
}

function getImageUrl(card) {
  if (!card?.image) return null;
  return `${CONFIG.cardImagesBaseUrl}${encodeURIComponent(card.image)}.png`;
}

// ========== Theme Toggle ==========
function initTheme() {
  const saved = localStorage.getItem("arcs-theme");
  if (saved) {
    document.documentElement.dataset.theme = saved;
  }
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("arcs-theme", next);
}

// ========== Data Loading ==========
async function fetchText(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
    const text = await res.text();
    
    if (text.includes("accounts.google.com") && text.includes("Sign in")) {
      throw new Error("Google requires login. Make the sheet public.");
    }
    return text;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Fetch timed out: ${url}`);
    }
    throw err;
  }
}

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
      imageClass: c.imageClass ?? "",
      tags: Array.isArray(c.tags) ? c.tags : [],
      text: c.text ?? "",
    }));
}

async function loadSheet() {
  const text = await fetchText(CONFIG.sheetCsvUrl);
  const parsed = Papa.parse(text, { header: false, skipEmptyLines: false });
  return parsed.data ?? [];
}

function parseLeadersLoreSheet(rows) {
  const stats = [];
  
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (row && normalizeText(row[0]) === "leader") {
      headerRowIdx = i;
      break;
    }
  }
  
  if (headerRowIdx === -1) return stats;
  
  const headerRow = rows[headerRowIdx];
  let loreColIdx = -1;
  for (let i = 0; i < headerRow.length; i++) {
    if (normalizeText(headerRow[i]) === "lore") {
      loreColIdx = i;
      break;
    }
  }
  
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    
    const leaderName = (row[0] ?? "").trim();
    if (leaderName) {
      stats.push({
        name: leaderName,
        type: "Leader",
        timesPicked: parseInt(row[1], 10) || 0,
        wins: parseInt(row[2], 10) || 0,
        winRate: parseFloat((row[3] ?? "").replace("%", "")) || 0,
      });
    }
    
    if (loreColIdx > 0) {
      const loreName = (row[loreColIdx] ?? "").trim();
      if (loreName) {
        stats.push({
          name: loreName,
          type: "Lore",
          timesPicked: parseInt(row[loreColIdx + 1], 10) || 0,
          wins: parseInt(row[loreColIdx + 2], 10) || 0,
          winRate: parseFloat((row[loreColIdx + 3] ?? "").replace("%", "")) || 0,
        });
      }
    }
  }
  
  return stats;
}

function joinCardsWithStats(cards, sheetRows) {
  const stats = parseLeadersLoreSheet(sheetRows);
  const statsIndex = new Map(stats.map((s) => [normalizeText(s.name), s]));
  
  const joined = [];
  for (const card of cards) {
    const stat = statsIndex.get(normalizeText(card.name));
    if (stat) {
      joined.push({ ...card, stats: stat });
    }
  }
  
  return { cards: joined, totalStats: stats.length };
}

// ========== Data Insights ==========
function calculateInsights(leaders, lore, gamesOverride) {
  const allCards = [...leaders, ...lore];
  const isCommunity = allCards[0]?.stats?.isCommunity;
  
  // Calculate averages
  const avgWinRate = allCards.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / allCards.length;
  const avgPicks = isCommunity ? 0 : allCards.reduce((sum, c) => sum + (c.stats?.timesPicked ?? 0), 0) / allCards.length;
  
  const leaderAvgWR = leaders.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / leaders.length;
  const loreAvgWR = lore.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / lore.length;
  
  // Total games - use override if provided, else estimate from leader picks
  const totalPicks = isCommunity ? 0 : leaders.reduce((sum, c) => sum + (c.stats?.timesPicked ?? 0), 0);
  const estimatedGames = gamesOverride ?? Math.round(totalPicks / 4);
  
  let underrated = [];
  let overrated = [];
  let meta = [];
  let consistent = [];
  
  if (isCommunity) {
    // For Community data, use rank position vs win rate for insights
    const avgRank = allCards.reduce((sum, c) => sum + (c.stats?.rankPosition ?? 0), 0) / allCards.length;
    // Hidden gems: high WR but drafted late (high rank number)
    underrated = allCards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.rankPosition > avgRank)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Overrated: low WR but drafted early (low rank number)
    overrated = allCards
      .filter(c => c.stats?.winRate < avgWinRate && c.stats?.rankPosition < avgRank)
      .sort((a, b) => (a.stats?.winRate ?? 0) - (b.stats?.winRate ?? 0))
      .slice(0, 3);
    // Meta: high WR AND drafted early
    meta = allCards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.rankPosition < avgRank)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Most consistent (closest to expected average WR)
    consistent = allCards
      .sort((a, b) => Math.abs((a.stats?.winRate ?? 0) - avgWinRate) - Math.abs((b.stats?.winRate ?? 0) - avgWinRate))
      .slice(0, 3);
  } else {
    // Find underrated cards (high win rate, low picks)
    underrated = allCards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.timesPicked < avgPicks)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Find overrated cards (low win rate, high picks)
    overrated = allCards
      .filter(c => c.stats?.winRate < avgWinRate && c.stats?.timesPicked > avgPicks)
      .sort((a, b) => (a.stats?.winRate ?? 0) - (b.stats?.winRate ?? 0))
      .slice(0, 3);
    // Find meta cards (high win rate AND high picks)
    meta = allCards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.timesPicked > avgPicks)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Most consistent (closest to 25% win rate with decent sample)
    const minPicks = avgPicks * 0.5;
    consistent = allCards
      .filter(c => c.stats?.timesPicked >= minPicks)
      .sort((a, b) => Math.abs((a.stats?.winRate ?? 0) - 25) - Math.abs((b.stats?.winRate ?? 0) - 25))
      .slice(0, 3);
  }
  
  return {
    avgWinRate,
    avgPicks,
    leaderAvgWR,
    loreAvgWR,
    estimatedGames,
    underrated,
    overrated,
    meta,
    consistent,
  };
}

function getCardBadge(card, insights) {
  const wr = card.stats?.winRate ?? 0;
  // Community data has no picks – badges based on picks don't apply
  if (card.stats?.isCommunity) return null;
  const picks = card.stats?.timesPicked ?? 0;
  
  if (wr > insights.avgWinRate + 5 && picks < insights.avgPicks * 0.8) {
    return { type: "underrated", label: "Hidden Gem 💎" };
  }
  if (wr < insights.avgWinRate - 5 && picks > insights.avgPicks * 1.2) {
    return { type: "overrated", label: "Overrated 📉" };
  }
  if (wr > insights.avgWinRate + 3 && picks > insights.avgPicks * 1.2) {
    return { type: "meta", label: "Meta 🔥" };
  }
  return null;
}

function renderScatterChart(cards, container, dotClass = "leader") {
  const isCommunity = cards[0]?.stats?.isCommunity;
  
  // X-axis: rank position (inverted so rank 1 is rightmost) for Community, times picked for league
  const xValues = cards.map(c => isCommunity ? (c.stats?.rankPosition ?? 0) : (c.stats?.timesPicked ?? 0));
  const maxX = Math.max(...xValues);
  const minX = isCommunity ? 1 : Math.min(...xValues);
  const maxWR = Math.max(...cards.map(c => c.stats?.winRate ?? 0));
  const minWR = Math.min(...cards.map(c => c.stats?.winRate ?? 0));
  
  const width = 280;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  
  // Scale functions - for Community, invert X so rank 1 is on the right
  // For league (non-community), map minX to left and maxX to right so axis starts at leftmost dot
  const spanX = (maxX - minX) || 1;
  const xScale = isCommunity
    ? (rank) => padding.left + ((maxX - rank) / (maxX - minX || 1)) * chartW
    : (picks) => padding.left + ((picks - minX) / spanX) * chartW;
  const yScale = (wr) => padding.top + chartH - ((wr - minWR) / ((maxWR - minWR) || 1)) * chartH;
  
  // Create SVG
  let svg = `<svg viewBox="0 0 ${width} ${height}" class="scatter-svg">`;
  
  // Grid lines
  svg += `<g class="grid">`;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.1"/>`;
  }
  svg += `</g>`;
  
  // Axes
  svg += `<line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="currentColor" stroke-opacity="0.3"/>`;
  svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="currentColor" stroke-opacity="0.3"/>`;
  
  // Axis labels
  const xLabel = isCommunity ? "Draft Rank " : "Times Picked";
  svg += `<text x="${width / 2}" y="${height - 5}" text-anchor="middle" class="axis-label">${xLabel}</text>`;
  svg += `<text x="12" y="${height / 2}" text-anchor="middle" transform="rotate(-90, 12, ${height / 2})" class="axis-label">Win Rate %</text>`;
  
  // Average lines (dashed)
  const avgX = xValues.reduce((sum, v) => sum + v, 0) / xValues.length;
  const avgWR = cards.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / cards.length;
  svg += `<line x1="${xScale(avgX)}" y1="${padding.top}" x2="${xScale(avgX)}" y2="${padding.top + chartH}" stroke="var(--accent)" stroke-opacity="0.4" stroke-dasharray="4"/>`;
  svg += `<line x1="${padding.left}" y1="${yScale(avgWR)}" x2="${width - padding.right}" y2="${yScale(avgWR)}" stroke="var(--accent)" stroke-opacity="0.4" stroke-dasharray="4"/>`;
  
  // Plot points - use card type for "all" view, otherwise use dotClass
  cards.forEach(card => {
    const xVal = isCommunity ? (card.stats?.rankPosition ?? 0) : (card.stats?.timesPicked ?? 0);
    const x = xScale(xVal);
    const y = yScale(card.stats?.winRate ?? 0);
    const cardType = dotClass === "all" ? (card.stats?.type === "Leader" ? "leader" : "lore") : dotClass;
    const dataExtra = isCommunity ? `data-rank="${card.stats?.rankPosition}"` : `data-picks="${card.stats?.timesPicked}"`;
    svg += `<circle cx="${x}" cy="${y}" r="5" class="dot ${cardType}" data-name="${card.name}" data-wr="${card.stats?.winRate?.toFixed(1)}" ${dataExtra} data-type="${card.stats?.type || ''}" data-Community="${isCommunity ? '1' : '0'}"/>`;
  });
  
  svg += `</svg>`;
  
  // Add legend for "all" view
  if (dotClass === "all") {
    svg += `<div class="chart-legend"><span class="legend-item"><span class="legend-dot leader"></span>Leaders</span><span class="legend-item"><span class="legend-dot lore"></span>Lore</span></div>`;
  }
  
  const tooltipId = `tooltip-${dotClass}-${Date.now()}`;
  svg += `<div class="scatter-tooltip" id="${tooltipId}"></div>`;
  
  container.innerHTML = svg;
  
  // Add hover tooltips
  const tooltip = document.getElementById(tooltipId);
  container.querySelectorAll(".dot").forEach(dot => {
    dot.addEventListener("mouseenter", (e) => {
      const name = e.target.dataset.name;
      const wr = e.target.dataset.wr;
      if (e.target.dataset.Community === "1") {
        const rank = e.target.dataset.rank;
        tooltip.innerHTML = `<strong>${name}</strong><br>${wr}% WR · Rank #${rank}`;
      } else {
        const picks = e.target.dataset.picks;
        tooltip.innerHTML = `<strong>${name}</strong><br>${wr}% WR · ${picks} picks`;
      }
      tooltip.classList.add("visible");
    });
    dot.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left + 10}px`;
      tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    });
    dot.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
    // Click to open card modal
    dot.addEventListener("click", () => {
      const name = dot.dataset.name;
      const card = appState.allCards.find(c => c.name === name);
      if (card) openModal(card);
    });
  });
}

function renderHistogram(cards, container, barClass = "leader", metric = "winRate") {
  // Get metric configuration
  const metricConfig = {
    winRate: {
      title: "Win Rate Distribution",
      subtitle: "How spread out are the win rates?",
      tooltip: "Histogram showing how win rates are distributed. In a 4-player game, 25% is expected average. Bars show how many cards fall into each win rate bracket.",
      getValue: (c) => c.stats?.winRate ?? 0,
      binSize: 5,
      formatLabel: (val) => `${val}%`,
      showExpectedLine: true,
      expectedValue: 25,
    },
    wins: {
      title: "Total Wins Distribution",
      subtitle: "How are wins distributed across cards?",
      tooltip: "Histogram showing how total wins are distributed. Bars show how many cards fall into each win count bracket.",
      getValue: (c) => c.stats?.wins ?? 0,
      binSize: null, // Auto-calculate
      formatLabel: (val) => `${val}`,
      showExpectedLine: false,
    },
    timesPicked: {
      title: "Times Picked Distribution",
      subtitle: "How popular are the cards?",
      tooltip: "Histogram showing how often cards are picked. Bars show how many cards fall into each pick count bracket.",
      getValue: (c) => c.stats?.timesPicked ?? 0,
      binSize: null, // Auto-calculate
      formatLabel: (val) => `${val}`,
      showExpectedLine: false,
    },
    draftRank: {
      title: "Draft Rank Distribution",
      subtitle: "How are draft positions distributed?",
      tooltip: "Histogram showing how draft ranks are distributed. Lower numbers indicate cards picked earlier in drafts.",
      getValue: (c) => c.stats?.rankPosition ?? 0,
      binSize: 5,
      formatLabel: (val) => `${val}`,
      showExpectedLine: false,
    },
  };
  
  const config = metricConfig[metric] || metricConfig.winRate;
  
  // Update titles based on section
  if (barClass === "leader") {
    el.leaderHistogramTitle.textContent = config.title;
    el.leaderHistogramSubtitle.textContent = config.subtitle;
    el.leaderHistogramHelp.dataset.tooltip = config.tooltip;
  } else if (barClass === "lore") {
    el.loreHistogramTitle.textContent = config.title;
    el.loreHistogramSubtitle.textContent = config.subtitle;
    el.loreHistogramHelp.dataset.tooltip = config.tooltip;
  } else if (barClass === "all") {
    el.allHistogramTitle.textContent = config.title;
    el.allHistogramSubtitle.textContent = config.subtitle;
    el.allHistogramHelp.dataset.tooltip = config.tooltip;
  }
  
  const values = cards.map(c => config.getValue(c));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  
  // Auto-calculate bin size if not specified
  let binSize = config.binSize;
  if (!binSize) {
    const range = maxVal - minVal;
    // Aim for ~8-12 bins
    binSize = Math.ceil(range / 10);
    // Round to nice numbers
    if (binSize > 50) binSize = Math.ceil(binSize / 50) * 50;
    else if (binSize > 10) binSize = Math.ceil(binSize / 10) * 10;
    else if (binSize > 5) binSize = Math.ceil(binSize / 5) * 5;
    else binSize = Math.max(1, binSize);
  }
  
  const minBin = Math.floor(minVal / binSize) * binSize;
  const maxBin = Math.ceil(maxVal / binSize) * binSize;
  
  const bins = [];
  for (let start = minBin; start < maxBin; start += binSize) {
    const end = start + binSize;
    const cardsInBin = cards.filter(c => {
      const val = config.getValue(c);
      return val >= start && val < end;
    });
    bins.push({ start, end, count: cardsInBin.length, cards: cardsInBin });
  }
  
  // Handle edge case where max value equals the last bin start
  if (bins.length > 0) {
    const lastBin = bins[bins.length - 1];
    const cardsAtMax = cards.filter(c => config.getValue(c) === maxBin);
    if (cardsAtMax.length > 0 && lastBin.end === maxBin) {
      lastBin.cards = [...lastBin.cards, ...cardsAtMax.filter(c => !lastBin.cards.includes(c))];
      lastBin.count = lastBin.cards.length;
    }
  }
  
  const maxCount = Math.max(...bins.map(b => b.count), 1);
  
  const width = 280;
  const height = 160;
  const padding = { top: 15, right: 15, bottom: 35, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  
  const barWidth = Math.max(8, chartW / bins.length - 4);
  const barGap = 4;
  
  // Create SVG
  let svg = `<svg viewBox="0 0 ${width} ${height}" class="histogram-svg">`;
  
  // Grid lines
  svg += `<g class="grid">`;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="currentColor" stroke-opacity="0.1"/>`;
  }
  svg += `</g>`;
  
  // Expected line (only for win rate)
  if (config.showExpectedLine) {
    const expectedBin = bins.findIndex(b => b.start <= config.expectedValue && b.end > config.expectedValue);
    if (expectedBin >= 0) {
      const xExpected = padding.left + (expectedBin + 0.5) * (barWidth + barGap);
      svg += `<line x1="${xExpected}" y1="${padding.top}" x2="${xExpected}" y2="${padding.top + chartH}" stroke="var(--accent)" stroke-opacity="0.4" stroke-dasharray="4"/>`;
    }
  }
  
  // Bars
  bins.forEach((bin, i) => {
    const x = padding.left + i * (barWidth + barGap);
    const barH = (bin.count / maxCount) * chartH;
    const y = padding.top + chartH - barH;
    const cardNames = bin.cards.map(c => c.name).join(", ");
    const rangeLabel = `${config.formatLabel(bin.start)}-${config.formatLabel(bin.end)}`;
    
    svg += `<rect 
      x="${x}" y="${y}" 
      width="${barWidth}" height="${barH}" 
      class="bar ${barClass}" 
      rx="2"
      data-range="${rangeLabel}"
      data-count="${bin.count}"
      data-cards="${cardNames}"
    />`;
    
    // X-axis label (only show some labels to avoid crowding)
    if (bins.length <= 10 || i % 2 === 0) {
      svg += `<text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle" class="axis-label">${config.formatLabel(bin.start)}</text>`;
    }
  });
  
  // Axes
  svg += `<line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="currentColor" stroke-opacity="0.3"/>`;
  svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="currentColor" stroke-opacity="0.3"/>`;
  
  // Y-axis label
  svg += `<text x="10" y="${height / 2 - 10}" text-anchor="middle" transform="rotate(-90, 10, ${height / 2 - 10})" class="axis-label">Cards</text>`;
  
  svg += `</svg>`;
  const tooltipId = `histogram-tooltip-${barClass}`;
  svg += `<div class="histogram-tooltip" id="${tooltipId}"></div>`;
  
  container.innerHTML = svg;
  
  // Add hover tooltips
  const tooltip = document.getElementById(tooltipId);
  container.querySelectorAll(".bar").forEach(bar => {
    bar.addEventListener("mouseenter", (e) => {
      const range = e.target.dataset.range;
      const count = e.target.dataset.count;
      const cardNames = e.target.dataset.cards;
      tooltip.innerHTML = `<strong>${range}</strong><br>${count} card${count !== "1" ? "s" : ""}${cardNames ? `<br><span class="tooltip-cards">${cardNames}</span>` : ""}`;
      tooltip.classList.add("visible");
    });
    bar.addEventListener("mousemove", (e) => {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left + 10}px`;
      tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    });
    bar.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  });
}

function renderCardAnalysis(cards, container) {
  const isCommunity = cards[0]?.stats?.isCommunity;
  const avgWinRate = cards.reduce((sum, c) => sum + (c.stats?.winRate ?? 0), 0) / cards.length;
  
  let underrated, overrated, meta;
  
  if (isCommunity) {
    const avgRank = cards.reduce((sum, c) => sum + (c.stats?.rankPosition ?? 0), 0) / cards.length;
    // Hidden gems: high WR but drafted late (high rank number)
    underrated = cards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.rankPosition > avgRank)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    // Overrated: low WR but drafted early (low rank number)
    overrated = cards
      .filter(c => c.stats?.winRate < avgWinRate && c.stats?.rankPosition < avgRank)
      .sort((a, b) => (a.stats?.winRate ?? 0) - (b.stats?.winRate ?? 0))
      .slice(0, 3);
    // Meta: high WR AND drafted early
    meta = cards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.rankPosition < avgRank)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
  } else {
    const avgPicks = cards.reduce((sum, c) => sum + (c.stats?.timesPicked ?? 0), 0) / cards.length;
    underrated = cards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.timesPicked < avgPicks)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
    overrated = cards
      .filter(c => c.stats?.winRate < avgWinRate && c.stats?.timesPicked > avgPicks)
      .sort((a, b) => (a.stats?.winRate ?? 0) - (b.stats?.winRate ?? 0))
      .slice(0, 3);
    meta = cards
      .filter(c => c.stats?.winRate > avgWinRate && c.stats?.timesPicked > avgPicks)
      .sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
      .slice(0, 3);
  }
  
  const gemDesc = isCommunity ? "High win rate, drafted late" : "High win rate, low picks";
  const overDesc = isCommunity ? "Drafted early but underperforming" : "Popular but underperforming";
  const metaDesc = isCommunity ? "Drafted early AND winning" : "Popular AND winning";
  
  let html = "";
  
  if (underrated.length > 0) {
    html += `<div class="analysis-section">
      <h5 class="analysis-title">\u{1F48E} Hidden Gems</h5>
      <p class="analysis-desc">${gemDesc}</p>
      <ul class="analysis-list">
        ${underrated.map(c => `<li class="analysis-item" data-card="${c.name}"><span class="analysis-name">${c.name}</span> <span class="analysis-stat">${c.stats?.winRate?.toFixed(1)}% WR</span></li>`).join("")}
      </ul>
    </div>`;
  }
  
  if (overrated.length > 0) {
    html += `<div class="analysis-section">
      <h5 class="analysis-title">\u{1F4C9} Overrated</h5>
      <p class="analysis-desc">${overDesc}</p>
      <ul class="analysis-list">
        ${overrated.map(c => `<li class="analysis-item" data-card="${c.name}"><span class="analysis-name">${c.name}</span> <span class="analysis-stat">${c.stats?.winRate?.toFixed(1)}% WR</span></li>`).join("")}
      </ul>
    </div>`;
  }
  
  if (meta.length > 0) {
    html += `<div class="analysis-section">
      <h5 class="analysis-title">\u{1F525} Meta Picks</h5>
      <p class="analysis-desc">${metaDesc}</p>
      <ul class="analysis-list">
        ${meta.map(c => `<li class="analysis-item" data-card="${c.name}"><span class="analysis-name">${c.name}</span> <span class="analysis-stat">${c.stats?.winRate?.toFixed(1)}% WR</span></li>`).join("")}
      </ul>
    </div>`;
  }
  
  if (!html) {
    html = `<p class="analysis-desc">Not enough data variance for analysis</p>`;
  }
  
  container.innerHTML = html;
  
  // Add click handlers to analysis items
  container.querySelectorAll(".analysis-item").forEach(item => {
    item.addEventListener("click", () => {
      const name = item.dataset.card;
      const card = appState.allCards.find(c => c.name === name);
      if (card) openModal(card);
    });
  });
}

function getCardTier(card, sortedCards) {
  const index = sortedCards.findIndex(c => c.name === card.name);
  const percentile = (index / sortedCards.length) * 100;
  
  if (percentile <= 10) return { tier: "S", label: "S", color: "tier-s" };
  if (percentile <= 30) return { tier: "A", label: "A", color: "tier-a" };
  if (percentile <= 70) return { tier: "B", label: "B", color: "tier-b" };
  if (percentile <= 90) return { tier: "C", label: "C", color: "tier-c" };
  return { tier: "D", label: "D", color: "tier-d" };
}

function renderTierList(cards, container) {
  // Sort cards by win rate descending
  const sorted = [...cards].sort((a, b) => (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0));
  
  // Group cards by tier
  const tiers = {
    S: { cards: [], label: "S", desc: "Exceptional" },
    A: { cards: [], label: "A", desc: "Strong" },
    B: { cards: [], label: "B", desc: "Average" },
    C: { cards: [], label: "C", desc: "Weak" },
    D: { cards: [], label: "D", desc: "Struggling" },
  };
  
  sorted.forEach(card => {
    const tierInfo = getCardTier(card, sorted);
    tiers[tierInfo.tier].cards.push(card);
  });
  
  let html = "";
  
  for (const [key, tier] of Object.entries(tiers)) {
    if (tier.cards.length === 0) continue;
    
    html += `
      <div class="tier-row">
        <div class="tier-label tier-${key.toLowerCase()}">${tier.label}</div>
        <div class="tier-cards">
          ${tier.cards.map(card => `
            <div class="tier-card" data-card="${card.name}" title="${card.name}: ${card.stats?.winRate?.toFixed(1)}% WR">
              <span class="tier-card-name">${card.name}</span>
              <span class="tier-card-wr">${card.stats?.winRate?.toFixed(1)}%</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Add click handlers to tier cards
  container.querySelectorAll(".tier-card").forEach(tierCard => {
    tierCard.addEventListener("click", () => {
      const name = tierCard.dataset.card;
      const card = appState.allCards.find(c => c.name === name);
      if (card) openModal(card);
    });
  });
}

function renderInsights(leaders, lore, gamesOverride, metric) {
  metric = metric || el.metric?.value || "winRate";
  const insights = calculateInsights(leaders, lore, gamesOverride);
  const allCards = [...leaders, ...lore];
  
  // Store insights in state for badge rendering
  appState.insights = insights;
  
  // Render All Cards insights
  renderScatterChart(allCards, el.allScatterChart, "all");
  renderHistogram(allCards, el.allHistogram, "all", metric);
  renderCardAnalysis(allCards, el.allAnalysis);
  renderTierList(allCards, el.allTierList);
  
  // Render Leader insights
  renderScatterChart(leaders, el.leaderScatterChart, "leader");
  renderHistogram(leaders, el.leaderHistogram, "leader", metric);
  renderCardAnalysis(leaders, el.leaderAnalysis);
  renderTierList(leaders, el.leaderTierList);
  
  // Render Lore insights
  renderScatterChart(lore, el.loreScatterChart, "lore");
  renderHistogram(lore, el.loreHistogram, "lore", metric);
  renderCardAnalysis(lore, el.loreAnalysis);
  renderTierList(lore, el.loreTierList);
}

function refreshHistograms(metric) {
  const allCards = [...appState.leaders, ...appState.lore];
  renderHistogram(allCards, el.allHistogram, "all", metric);
  renderHistogram(appState.leaders, el.leaderHistogram, "leader", metric);
  renderHistogram(appState.lore, el.loreHistogram, "lore", metric);
}

// ========== Card Rendering ==========
function getScore(card, metric) {
  if (metric === "draftRank") {
    // For draft rank, lower rankPosition is better (earlier pick)
    // Return negative rankPosition so lower positions sort first
    return -(card.stats?.rankPosition ?? 999);
  }
  return card.stats?.[metric] ?? 0;
}

function sortCards(cards, metric) {
  return [...cards].sort((a, b) => {
    const diff = getScore(b, metric) - getScore(a, metric);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

function matchesFilter(card, query) {
  if (!query) return true;
  return normalizeText(card.name).includes(normalizeText(query));
}

function createCardElement(card, rank, metric) {
  const div = document.createElement("div");
  div.className = "card";
  div.dataset.cardName = card.name;
  
  const imgUrl = getImageUrl(card);
  const isRotated = normalizeText(card.imageClass) === "rotated";
  const winRate = card.stats?.winRate ?? 0;
  const isCommunity = card.stats?.isCommunity;
  
  let rankClass = "";
  if (rank === 1) rankClass = "rank-1";
  else if (rank === 2) rankClass = "rank-2";
  else if (rank === 3) rankClass = "rank-3";
  
  // Check if card is selected for comparison
  const isSelected = appState.compareCards.some((c) => c?.name === card.name);
  if (isSelected) div.classList.add("selected");
  
  let statsHtml;
  if (isCommunity) {
    const pos = card.stats?.rankPosition ?? "–";
    statsHtml = `
        <div class="stat">
          <span class="stat-value ${metric === 'winRate' ? 'highlight' : ''}">${winRate.toFixed(1)}%</span>
          <span class="stat-label">Win Rate</span>
        </div>
        <div class="stat">
          <span class="stat-value ${metric === 'draftRank' ? 'highlight' : ''}">${pos}</span>
          <span class="stat-label">Draft Rank</span>
        </div>
    `;
  } else {
    const picks = card.stats?.timesPicked ?? 0;
    const wins = card.stats?.wins ?? 0;
    statsHtml = `
        <div class="stat">
          <span class="stat-value ${metric === 'winRate' ? 'highlight' : ''}">${winRate.toFixed(1)}%</span>
          <span class="stat-label">Win Rate</span>
        </div>
        <div class="stat">
          <span class="stat-value ${metric === 'wins' ? 'highlight' : ''}">${wins}</span>
          <span class="stat-label">Wins</span>
        </div>
        <div class="stat">
          <span class="stat-value ${metric === 'timesPicked' ? 'highlight' : ''}">${picks}</span>
          <span class="stat-label">Picked</span>
        </div>
    `;
  }
  
  div.innerHTML = `
    <div class="card-rank ${rankClass}">${rank}</div>
    <div class="card-image">
      ${imgUrl ? `<img src="${imgUrl}" alt="${card.name}" loading="lazy" ${isRotated ? 'class="rotated"' : ''}>` : ""}
    </div>
    <div class="card-info">
      <div class="card-name">${card.name}</div>
      <div class="card-stats">
        ${statsHtml}
      </div>
    </div>
  `;
  
  // Click handler
  div.addEventListener("click", () => {
    if (appState.compareMode) {
      toggleCompareCard(card);
    } else {
      openModal(card);
    }
  });
  
  return div;
}

function renderCards(cards, container, metric, query) {
  const filtered = cards.filter((c) => matchesFilter(c, query));
  const sorted = sortCards(filtered, metric);
  
  container.innerHTML = "";
  sorted.forEach((card, i) => {
    container.appendChild(createCardElement(card, i + 1, metric));
  });
}

// ========== Modal ==========
function openModal(card) {
  appState.currentModalCard = card;
  const imgUrl = getImageUrl(card);
  
  // Update page title and meta tags for sharing
  document.title = `${card.name} - Arcs Arsenal`;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', `${card.name} - Arcs Arsenal`);
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) twitterTitle.setAttribute('content', `${card.name} - Arcs Arsenal`);
  const desc = `View stats for ${card.name} in Arcs. Win rate: ${card.stats?.winRate?.toFixed(1)}%`;
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
  const twitterDesc = document.querySelector('meta[name="twitter:description"]');
  if (twitterDesc) twitterDesc.setAttribute('content', desc);
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && imgUrl) ogImage.setAttribute('content', imgUrl);
  const twitterImage = document.querySelector('meta[name="twitter:image"]');
  if (twitterImage && imgUrl) twitterImage.setAttribute('content', imgUrl);
  
  el.modalImg.src = imgUrl || "";
  el.modalImg.alt = card.name;
  el.modalName.textContent = card.name;
  el.modalText.innerHTML = formatCardText(card.text);
  
  const winRate = card.stats?.winRate ?? 0;
  const isCommunity = card.stats?.isCommunity;
  
  if (isCommunity) {
    const pos = card.stats?.rankPosition ?? "–";
    el.modalStats.innerHTML = `
      <div class="stat">
        <span class="stat-value highlight">${winRate.toFixed(1)}%</span>
        <span class="stat-label">Win Rate</span>
      </div>
      <div class="stat">
        <span class="stat-value">${pos}</span>
        <span class="stat-label">Draft Rank</span>
      </div>
    `;
  } else {
    const wins = card.stats?.wins ?? 0;
    const picks = card.stats?.timesPicked ?? 0;
    el.modalStats.innerHTML = `
      <div class="stat">
        <span class="stat-value highlight">${winRate.toFixed(1)}%</span>
        <span class="stat-label">Win Rate</span>
      </div>
      <div class="stat">
        <span class="stat-value">${wins}</span>
        <span class="stat-label">Wins</span>
      </div>
      <div class="stat">
        <span class="stat-value">${picks}</span>
        <span class="stat-label">Times Picked</span>
      </div>
    `;
  }
  
  el.modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  el.modal.classList.add("hidden");
  document.body.style.overflow = "";
  
  // Reset page title and meta tags
  document.title = "Arcs Arsenal - Rankings";
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', 'Arcs Arsenal - Rankings');
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle) twitterTitle.setAttribute('content', 'Arcs Arsenal - Rankings');
  const desc = "Arcs cards ranked with win rates and pick statistics.";
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
  const twitterDesc = document.querySelector('meta[name="twitter:description"]');
  if (twitterDesc) twitterDesc.setAttribute('content', desc);
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage) ogImage.setAttribute('content', './favicon.svg');
  const twitterImage = document.querySelector('meta[name="twitter:image"]');
  if (twitterImage) twitterImage.setAttribute('content', './favicon.svg');
}

function shareCard(card) {
  const url = new URL(window.location);
  url.searchParams.set('card', encodeURIComponent(card.name));
  navigator.clipboard.writeText(url.toString()).then(() => {
    alert('Shareable link copied to clipboard!');
  }).catch(() => {
    alert(`Shareable link:\n${url.toString()}`);
  });
}

// ========== Compare Mode ==========
function toggleCompareMode() {
  appState.compareMode = !appState.compareMode;
  el.compareBtn.classList.toggle("active", appState.compareMode);
  el.comparePanel.classList.toggle("hidden", !appState.compareMode);
  
  if (!appState.compareMode) {
    appState.compareCards = [null, null];
    renderCompareSlots();
    // Re-render to remove selection styling
    refreshCards();
  }
}

function toggleCompareCard(card) {
  const idx = appState.compareCards.findIndex((c) => c?.name === card.name);
  
  if (idx >= 0) {
    // Remove from comparison
    appState.compareCards[idx] = null;
  } else {
    // Add to comparison
    const emptySlot = appState.compareCards.findIndex((c) => c === null);
    if (emptySlot >= 0) {
      appState.compareCards[emptySlot] = card;
    } else {
      // Replace first slot
      appState.compareCards[0] = card;
    }
  }
  
  renderCompareSlots();
  refreshCards();
}

function renderCompareSlots() {
  const slots = el.compareSlots.querySelectorAll(".compare-slot");
  
  appState.compareCards.forEach((card, i) => {
    const slot = slots[i];
    
    if (card) {
      const imgUrl = getImageUrl(card);
      slot.classList.remove("empty");
      slot.classList.add("filled");
      slot.innerHTML = `
        <div class="slot-card">
          ${imgUrl ? `<img class="slot-img" src="${imgUrl}" alt="${card.name}">` : ""}
          <div class="slot-info">
            <div class="slot-name">${card.name}</div>
            <div class="slot-stats">
              <span><span class="slot-stat-value">${(card.stats?.winRate ?? 0).toFixed(1)}%</span> WR</span>
              <span><span class="slot-stat-value">${card.stats?.wins ?? 0}</span> Wins</span>
              <span><span class="slot-stat-value">${card.stats?.timesPicked ?? 0}</span> Picks</span>
            </div>
          </div>
        </div>
      `;
    } else {
      slot.classList.add("empty");
      slot.classList.remove("filled");
      slot.innerHTML = `<span>Select a card</span>`;
    }
  });
}

// ========== UI Wiring ==========
let refreshCards;

function wireUi(state) {
  appState.leaders = state.leaders;
  appState.lore = state.lore;
  appState.allCards = [...state.leaders, ...state.lore];
  
  let currentTab = "leaders";
  
  refreshCards = () => {
    const metric = el.metric.value;
    const query = el.query.value;
    renderCards(appState.allCards, el.allCards, metric, query);
    renderCards(appState.leaders, el.leaderCards, metric, query);
    renderCards(appState.lore, el.loreCards, metric, query);
  };
  
  const onMetricChange = () => {
    refreshCards();
    // Also update histograms when metric changes
    refreshHistograms(el.metric.value);
  };
  
  el.metric.addEventListener("change", onMetricChange);
  el.query.addEventListener("input", refreshCards);
  
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      
      // Hide all sections first
      el.allSection.classList.add("hidden");
      el.leadersSection.classList.add("hidden");
      el.loreSection.classList.add("hidden");
      
      // Show the selected section
      if (tab.dataset.tab === "all") {
        el.allSection.classList.remove("hidden");
      } else if (tab.dataset.tab === "leaders") {
        el.leadersSection.classList.remove("hidden");
      } else {
        el.loreSection.classList.remove("hidden");
      }
    });
  });
  
  // Theme toggle
  el.themeToggle.addEventListener("click", toggleTheme);
  
  // Modal
  el.modalClose.addEventListener("click", closeModal);
  el.modalBackdrop.addEventListener("click", closeModal);
  el.modalShareBtn.addEventListener("click", () => {
    if (appState.currentModalCard) shareCard(appState.currentModalCard);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
  
  // Compare mode
  el.compareBtn.addEventListener("click", toggleCompareMode);
  el.closeCompare.addEventListener("click", toggleCompareMode);
  
  return refreshCards;
}

// ========== Community Data ==========
function buildCommunityCards(yamlCards, playerCount) {
  const { stats, games } = buildCommunityStats(playerCount);
  const statsIndex = new Map(stats.map((s) => [normalizeText(s.name), s]));

  const cards = [];
  for (const card of yamlCards) {
    const stat = statsIndex.get(normalizeText(card.name));
    if (stat) {
      cards.push({ ...card, stats: stat });
    }
  }

  const leaders = cards.filter((c) => c.stats?.type === "Leader");
  const lore = cards.filter((c) => c.stats?.type === "Lore");
  return { leaders, lore, games };
}

function switchDataSource(source, playerCount) {
  appState.dataSource = source;
  appState.playerCount = playerCount || appState.playerCount;

  let leaders, lore, games;
  if (source === "league") {
    leaders = appState.leagueCards.leaders;
    lore = appState.leagueCards.lore;
    games = null; // will be estimated by calculateInsights
    const totalPicks = leaders.reduce((sum, c) => sum + (c.stats?.timesPicked ?? 0), 0);
    const estimatedGames = Math.round(totalPicks / 4);
    if (el.dataSourceLabel) {
      el.dataSourceLabel.innerHTML = `Data from <a href="https://docs.google.com/spreadsheets/d/13Wb-JoX7L2-o3Q-ejvepsx11MW--yhTN5oJ-I4Hp2DU/edit?gid=1136087345" target="_blank">Arcs League Tracker</a> (${estimatedGames} games)`;
    }
    if (el.pageTagline) {
      el.pageTagline.textContent = "Leaders & Lore win rates from Arcs League games";
    }
  } else {
    const { stats, games } = buildCommunityStats(appState.playerCount);
    const communityCards = appState.yamlCards
      .map((yamlCard) => {
        const stat = stats.find((s) => s.name === yamlCard.name);
        return stat ? { ...yamlCard, stats: stat } : null;
      })
      .filter(Boolean);
    leaders = communityCards.filter((c) => c.stats.type === "Leader");
    lore = communityCards.filter((c) => c.stats.type === "Lore");
    if (el.dataSourceLabel) {
      const label = appState.playerCount === "3p" ? "3-player" : "4-player";
      el.dataSourceLabel.innerHTML = `Community ${label} data (${games} games) from <a href="https://boardgamegeek.com/thread/3604653/leaders-and-lore-ranking-and-winrates" target="_blank">BGG</a>`;
    }
    if (el.pageTagline) {
      const label = appState.playerCount === "3p" ? "3-player" : "4-player";
      el.pageTagline.textContent = `Leaders & Lore win rates from Community ${label} games`;
    }
  }

  if (leaders.length === 0 && lore.length === 0) return;

  // Update state
  appState.leaders = leaders;
  appState.lore = lore;
  appState.allCards = [...leaders, ...lore];
  appState.compareCards = [null, null];

  // Configure metric options based on data source
  if (source === "Community") {
    el.metric.value = "winRate";
    // For Community data: enable winRate and draftRank, disable wins/timesPicked
    el.metric.querySelector('option[value="winRate"]').disabled = false;
    el.metric.querySelector('option[value="draftRank"]').disabled = false;
    el.metric.querySelector('option[value="wins"]').disabled = true;
    el.metric.querySelector('option[value="timesPicked"]').disabled = true;
  } else {
    el.metric.value = "winRate";
    // For league data: enable winRate/wins/timesPicked, disable draftRank
    el.metric.querySelector('option[value="winRate"]').disabled = false;
    el.metric.querySelector('option[value="wins"]').disabled = false;
    el.metric.querySelector('option[value="timesPicked"]').disabled = false;
    el.metric.querySelector('option[value="draftRank"]').disabled = true;
  }

  // Re-render everything
  renderInsights(leaders, lore, games);
  if (refreshCards) refreshCards();
}

function wireDataSourceToggle() {
  if (!el.dataSourceGroup) return;

  el.dataSourceGroup.querySelectorAll(".ds-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.dataSourceGroup.querySelectorAll(".ds-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const value = btn.dataset.value;
      if (value === "Community") {
        el.playerCountGroup.classList.remove("hidden");
        switchDataSource("Community", appState.playerCount);
      } else {
        el.playerCountGroup.classList.add("hidden");
        switchDataSource("league");
      }
    });
  });

  el.playerCountGroup.querySelectorAll(".ds-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.playerCountGroup.querySelectorAll(".ds-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      switchDataSource("Community", btn.dataset.value);
    });
  });
}

// ========== Main ==========
async function main() {
  initTheme();
  setStatus("Loading…");
  
  try {
    const [allCards, sheetRows] = await Promise.all([loadCards(), loadSheet()]);
    appState.yamlCards = allCards;

    const { cards } = joinCardsWithStats(allCards, sheetRows);
    
    if (cards.length === 0) {
      setStatus("No matching cards found.", { isError: true });
      return;
    }
    
    const leaders = cards.filter((c) => c.stats?.type === "Leader");
    const lore = cards.filter((c) => c.stats?.type === "Lore");
    
    // Store league data for switching
    appState.leagueCards = { leaders, lore };
    
    setStatus("");
    
    // Render insights first (sets appState.insights for badges)
    renderInsights(leaders, lore);
    
    const refresh = wireUi({ leaders, lore });
    refresh();

    // Check for card URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const cardName = urlParams.get('card');
    if (cardName) {
      const card = appState.allCards.find(c => c.name === decodeURIComponent(cardName));
      if (card) {
        openModal(card);
      }
    }

    // Wire up data source toggle
    wireDataSourceToggle();

    // Ensure initial data source UI/footer is populated (show league totals)
    switchDataSource("league");
    
    // Configure initial metric options for league data source
    el.metric.querySelector('option[value="winRate"]').disabled = false;
    el.metric.querySelector('option[value="wins"]').disabled = false;
    el.metric.querySelector('option[value="timesPicked"]').disabled = false;
    el.metric.querySelector('option[value="draftRank"]').disabled = true;
  } catch (err) {
    setStatus(err.message, { isError: true });
  }
}

main();
