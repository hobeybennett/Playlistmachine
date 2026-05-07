// Fetches music blogs from the Hype Machine blog list, pulls their RSS feeds,
// and scores tracks by how many blogs mention them (replicating the HypeM signal).

const HYPEM_LIST = "https://hypem.com/list";
const MAX_BLOGS = 30;
const CONCURRENCY = 6;
const FETCH_MS = 6000;

// If HypeM list is blocked, use these well-known tracked blogs as fallback.
const FALLBACK_BLOGS = [
  "https://www.stereogum.com",
  "https://consequenceofsound.net",
  "https://www.brooklynvegan.com",
  "https://www.thefader.com",
  "https://www.nme.com",
  "https://www.thelineofbestfit.com",
  "https://exclaim.ca",
  "https://www.earmilk.com",
  "https://uproxx.com",
  "https://www.factmag.com",
  "https://www.xxlmag.com",
  "https://hotnewhiphop.com",
  "https://www.spin.com",
  "https://clashmusic.com",
  "https://pigeons-and-planes.com",
  "https://saidthegramophone.com",
  "https://www.musicfeeds.com.au",
  "https://www.xlr8r.com",
  "https://www.tinymixtapes.com",
  "https://www.pitchfork.com",
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Common music blog post title patterns:
// "Artist – Title", "New: Artist – Title", "Video: Artist - 'Title'"
const TRACK_RE = /^(?:(?:new|video|audio|stream|listen|premiere|single|track|mp3|song|music|exclusive|download|feature|clip)[:\s]+)?(.+?)\s*[–—]\s*['""“”]?(.+?)['""“”]?\s*(?:[\[\(\|\/].*)?$/i;

function timed(url, opts, ms = FETCH_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function getBlogUrls() {
  try {
    const res = await timed(HYPEM_LIST, { headers: HEADERS });
    if (res.ok) {
      const html = await res.text();
      const seen = new Set();
      const urls = [];
      // Look for external links (not hypem.com, not social/streaming)
      const SKIP = /hypem|twitter|facebook|instagram|google|spotify|soundcloud|youtube|tumblr|apple|amazon/i;
      const re = /href="(https?:\/\/[^"]+)"/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        try {
          const origin = new URL(m[1]).origin;
          if (!SKIP.test(origin) && !seen.has(origin)) {
            seen.add(origin);
            urls.push(origin);
            if (urls.length >= MAX_BLOGS) break;
          }
        } catch {}
      }
      if (urls.length >= 5) return urls;
    }
  } catch {}
  return FALLBACK_BLOGS.slice(0, MAX_BLOGS);
}

async function findRSSUrl(blogOrigin) {
  // Try homepage first — look for <link rel="alternate" type="application/rss+xml">
  try {
    const res = await timed(blogOrigin, { headers: HEADERS }, 5000);
    if (res.ok) {
      const html = await res.text().then(t => t.slice(0, 8000)); // only need the <head>
      const m = /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i.exec(html)
             || /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(?:rss|atom)\+xml["']/i.exec(html);
      if (m) {
        const href = m[1];
        return href.startsWith("http") ? href : `${blogOrigin}${href.startsWith("/") ? "" : "/"}${href}`;
      }
    }
  } catch {}

  // Fall back to common paths
  for (const path of ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/feeds/posts/default"]) {
    try {
      const res = await timed(blogOrigin + path, { headers: HEADERS }, 3000);
      if (res.ok) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("xml") || ct.includes("rss") || ct.includes("atom")) return blogOrigin + path;
      }
    } catch {}
  }
  return null;
}

function parseRSSItems(xml) {
  const tracks = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const titleM = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(m[1]);
    if (!titleM) continue;
    const raw = titleM[1].trim()
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
    const parsed = TRACK_RE.exec(raw);
    if (!parsed) continue;
    const artist = parsed[1].trim();
    const title  = parsed[2].trim();
    // Skip if either part looks like a nav/section label
    if (artist.length < 2 || title.length < 2 || artist.split(" ").length > 6) continue;
    tracks.push({ artist, title });
  }
  return tracks;
}

async function scrapeBlog(blogOrigin) {
  const rssUrl = await findRSSUrl(blogOrigin);
  if (!rssUrl) return [];
  try {
    const res = await timed(rssUrl, { headers: { "User-Agent": HEADERS["User-Agent"] } });
    if (!res.ok) return [];
    return parseRSSItems(await res.text());
  } catch {
    return [];
  }
}

async function inBatches(items, fn, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = await Promise.allSettled(items.slice(i, i + size).map(fn));
    out.push(...batch.map(r => r.status === "fulfilled" ? r.value : []));
  }
  return out;
}

export async function fetchBlogTracks() {
  const blogUrls = await getBlogUrls();

  const allItems = await inBatches(blogUrls, scrapeBlog, CONCURRENCY);

  // Count blog mentions per track — the core HypeM signal
  const mentionMap = new Map();
  for (const items of allItems) {
    for (const { artist, title } of items) {
      const k = `${artist.toLowerCase()}|||${title.toLowerCase()}`;
      if (!mentionMap.has(k)) mentionMap.set(k, { artist, title, count: 0 });
      mentionMap.get(k).count++;
    }
  }

  const tracks = [...mentionMap.values()].map(({ artist, title, count }) => ({
    artist,
    title,
    // 1 blog = 52, 3 blogs = 76, 5 blogs = 100
    chartScore: Math.min(100, 40 + count * 12),
    blogMentions: count,
  }));

  return {
    tracks,
    errors: [],
    blogsChecked: blogUrls.length,
  };
}
