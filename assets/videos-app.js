// YouTube videos grid config.
// 0) OPTIONAL (no API key): manually list video URLs.
// If this list is non-empty, the page will render this list and skip RSS/API.
// You can paste any mix of:
//   - "https://www.youtube.com/watch?v=VIDEO_ID"
//   - "https://youtu.be/VIDEO_ID"
//   - "https://www.youtube.com/shorts/VIDEO_ID"
// Or objects like: { url, title, published, thumbnail }
const MANUAL_VIDEOS = [];

// OPTIONAL: your YouTube handle (without the @). Used only when an API key is set.
// This lets the page discover the UC... channel ID automatically.
const YT_CHANNEL_HANDLE = "Yan_Yannik";

// 1) REQUIRED for accurate channel feed: your channel ID (starts with "UC")
const YT_CHANNEL_ID = "";

// 2) OPTIONAL: If you want to load the *full* channel history (not just recent uploads),
// you can use a YouTube Data API v3 key.
// NOTE: This key will be visible in the browser on a static site.
const YT_API_KEY = "AIzaSyBejw9TmrDHZKYBDzojuOd7-M1MB2zOqjc";

// Fallback query if YT_CHANNEL_ID isn't set (not channel-accurate).
const YT_SEARCH_QUERY = "Yan_Yannik";

const YT_CHANNEL_URL = "https://www.youtube.com/@Yan_Yannik";

function $(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  const el = $("videoStatus");
  if (el) el.textContent = String(text || "");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtmlEntities(s) {
  // YouTube API titles can include HTML entities like "&amp;".
  // Decode them for display, then escape when inserting into HTML.
  const str = String(s ?? "");
  if (!str.includes("&")) return str;
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

function formatDate(isoLike) {
  const d = new Date(isoLike);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderVideos(videos) {
  const grid = $("videosGrid");
  if (!grid) return;
  if (!Array.isArray(videos) || videos.length === 0) {
    grid.innerHTML = "";
    return;
  }

  grid.innerHTML = videos
    .map((v) => {
      const href = v.url || "#";
      const title = decodeHtmlEntities(v.title || "");
      const thumb = v.thumbnail || "";
      const date = v.published ? formatDate(v.published) : "";
      return `
        <a class="video-card" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">
          <img class="video-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}" loading="lazy" />
          <div class="video-meta">
            <div class="video-name">${escapeHtml(title)}</div>
            <div class="video-date">${escapeHtml(date)}</div>
          </div>
        </a>`;
    })
    .join("");
}

function isValidChannelId(id) {
  return Boolean(id && /^UC[\w-]{10,}$/.test(String(id)));
}

function tryExtractYouTubeVideoId(inputUrl) {
  if (!inputUrl) return "";
  try {
    const u = new URL(String(inputUrl));
    const host = (u.hostname || "").toLowerCase();
    const path = u.pathname || "";

    // youtu.be/<id>
    if (host === "youtu.be") {
      const id = path.replace(/^\//, "").split("/")[0] || "";
      return id;
    }

    // youtube.com/watch?v=<id>
    const v = u.searchParams.get("v");
    if (v) return v;

    // youtube.com/shorts/<id>, /embed/<id>, /live/<id>
    const parts = path.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => ["shorts", "embed", "live"].includes(p));
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];

    return "";
  } catch {
    return "";
  }
}

function normalizeManualVideos(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    const obj = typeof it === "string" ? { url: it } : (it && typeof it === "object" ? it : null);
    if (!obj?.url) continue;
    const videoId = tryExtractYouTubeVideoId(obj.url);
    if (!videoId) continue;
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const thumbnail = obj.thumbnail || `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
    out.push({
      videoId,
      url,
      thumbnail,
      title: obj.title || "YouTube video",
      published: obj.published || "",
    });
  }
  return out;
}

async function fetchYouTubeRssVideos(channelId) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`RSS request failed (${res.status})`);
  const xmlText = await res.text();
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");

  const entries = Array.from(doc.getElementsByTagName("entry"));
  return entries
    .map((entry) => {
      const title = entry.getElementsByTagName("title")[0]?.textContent?.trim() || "";
      const videoId = entry.getElementsByTagName("yt:videoId")[0]?.textContent?.trim() || "";
      const published = entry.getElementsByTagName("published")[0]?.textContent?.trim() || "";

      // media:thumbnail is in the media namespace, but DOMParser often keeps the prefix.
      const mediaThumb = entry.getElementsByTagName("media:thumbnail")[0];
      const thumbnail = mediaThumb?.getAttribute("url") || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");

      const url = videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : "";
      return { title, published, thumbnail, url, videoId };
    })
    .filter((v) => v.videoId && v.url && v.thumbnail);
}

async function fetchAllYouTubeApiVideos({ channelId, apiKey, maxPages = 30 }) {
  // Uses YouTube Data API v3 search endpoint to paginate through all videos.
  // Docs: https://developers.google.com/youtube/v3/docs/search/list
  let pageToken = "";
  /** @type {Array<any>} */
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      key: apiKey,
      channelId,
      part: "snippet",
      order: "date",
      type: "video",
      maxResults: "50",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`YouTube API request failed (${res.status})`);
    const json = await res.json();

    const items = Array.isArray(json?.items) ? json.items : [];
    for (const it of items) {
      const videoId = it?.id?.videoId;
      const snip = it?.snippet;
      const title = snip?.title || "";
      const published = snip?.publishedAt || "";
      const thumbnail = snip?.thumbnails?.high?.url || snip?.thumbnails?.medium?.url || "";
      if (!videoId || !thumbnail) continue;
      out.push({
        videoId,
        title,
        published,
        thumbnail,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      });
    }

    pageToken = json?.nextPageToken || "";
    if (!pageToken) break;
  }
  return out;
}

async function fetchChannelIdForHandle({ handle, apiKey }) {
  // Uses YouTube Data API v3 channels endpoint.
  // Docs: https://developers.google.com/youtube/v3/docs/channels/list
  const clean = String(handle || "").replace(/^@/, "").trim();
  if (!clean) return "";

  const params = new URLSearchParams({
    key: apiKey,
    part: "id",
    forHandle: clean,
    maxResults: "1",
  });

  const url = `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`;
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`YouTube API request failed (${res.status})`);
  const json = await res.json();
  const id = Array.isArray(json?.items) && json.items[0]?.id ? String(json.items[0].id) : "";
  return isValidChannelId(id) ? id : "";
}

function init() {
  // Theme init
  const saved = localStorage.getItem("arcs-theme");
  if (saved) document.documentElement.dataset.theme = saved;

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme || "dark";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("arcs-theme", next);
    });
  }

  const link = document.getElementById("youtubeChannelLink");
  if (link) link.href = YT_CHANNEL_URL;

  // Load videos into grid
  (async () => {
    try {
      // Manual mode: no API key, no channel ID.
      const manual = normalizeManualVideos(MANUAL_VIDEOS);
      if (manual.length > 0) {
        setStatus(`Showing ${manual.length} videos.`);
        renderVideos(manual);
        return;
      }

      // API-key mode can auto-discover the channel id from the handle.
      if (!isValidChannelId(YT_CHANNEL_ID) && YT_API_KEY && YT_CHANNEL_HANDLE) {
        setStatus("Discovering channel…");
        const discovered = await fetchChannelIdForHandle({
          handle: YT_CHANNEL_HANDLE,
          apiKey: YT_API_KEY,
        });
        if (isValidChannelId(discovered)) {
          setStatus("Loading all channel videos…");
          const vids = await fetchAllYouTubeApiVideos({
            channelId: discovered,
            apiKey: YT_API_KEY,
          });
          renderVideos(vids);
          setStatus(vids.length ? `Showing ${vids.length} videos.` : "No videos found.");
          return;
        }
      }

      // Preferred: accurate channel listing (requires channel id)
      if (isValidChannelId(YT_CHANNEL_ID)) {
        if (YT_API_KEY) {
          setStatus("Loading all channel videos…");
          const vids = await fetchAllYouTubeApiVideos({
            channelId: YT_CHANNEL_ID,
            apiKey: YT_API_KEY,
          });
          renderVideos(vids);
          setStatus(vids.length ? `Showing ${vids.length} videos.` : "No videos found.");
        } else {
          setStatus("Loading recent channel videos…");
          const vids = await fetchYouTubeRssVideos(YT_CHANNEL_ID);
          renderVideos(vids);
          setStatus(vids.length ? `Showing ${vids.length} recent videos.` : "No videos found.");
        }
        return;
      }

      // Fallback: not channel-accurate (but still gives a grid)
      setStatus("No manual videos set — add URLs to MANUAL_VIDEOS (or set YT_CHANNEL_ID for RSS). See assets/videos-app.js.");
      renderVideos([]);
    } catch (e) {
      console.error(e);
      setStatus(`Failed to load videos. ${e?.message || e}`);
      renderVideos([]);
    }
  })();
}

init();
