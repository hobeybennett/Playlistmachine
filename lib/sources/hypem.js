// Hype Machine aggregates 100s of music blogs and tracks what they post.
// posted_count = number of blogs that featured the track (strong tastemaker signal).
// loved_count  = user saves/hearts on Hype Machine.
// Endpoint is unofficial — wrapped in try/catch so failures degrade gracefully.
// Requires browser-like headers; cloud IPs may be blocked (403 = soft-blocked).

const HYPEM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://hypem.com/",
  "Origin": "https://hypem.com",
};

export async function fetchHypemTracks(pages = 3) {
  const results = [];
  const errors = [];

  for (let page = 1; page <= pages; page++) {
    try {
      const res = await fetch(
        `https://hypem.com/playlist/popular/3day/json/${page}/data.js`,
        { headers: HYPEM_HEADERS }
      );
      if (!res.ok) { errors.push({ page, status: res.status }); continue; }
      const data = await res.json();
      for (const [key, track] of Object.entries(data)) {
        // Skip non-track keys (e.g. "version")
        if (!/^\d+$/.test(key)) continue;
        if (!track?.artist || !track?.title) continue;
        results.push({
          artist: track.artist,
          title: track.title,
          loved_count: track.loved_count || 0,
          posted_count: track.posted_count || 0,
          url: track.posturl || null,
        });
      }
    } catch (e) {
      errors.push({ page, error: e.message });
    }
  }

  return { tracks: results, errors };
}
