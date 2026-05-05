// Last.fm free API — requires LASTFM_API_KEY env var (free registration at last.fm/api).
// Returns [] gracefully if no key is configured.
// listeners = unique listeners (strong signal); playcount = total plays.

const BASE = "https://ws.audioscrobbler.com/2.0/";
const TAGS = ["indie", "pop", "hip-hop", "electronic", "r&b", "rock", "alternative"];

async function lastfmGet(params) {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries({ ...params, format: "json" })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: { "User-Agent": "PlaylistMachine/1.0" } });
  if (!res.ok) throw new Error(`Last.fm ${params.method} → ${res.status}`);
  return res.json();
}

function parseTracks(items) {
  return (items || [])
    .filter((t) => t?.name && t?.artist)
    .map((t) => ({
      artist: typeof t.artist === "string" ? t.artist : t.artist?.name || "",
      title: t.name,
      listeners: parseInt(t.listeners || "0", 10),
      playcount: parseInt(t.playcount || "0", 10),
    }))
    .filter((t) => t.artist && t.title);
}

export async function fetchLastfmTracks(apiKey, limit = 50) {
  if (!apiKey) return { tracks: [], errors: [{ note: "LASTFM_API_KEY not set — skipping" }] };

  const results = [];
  const errors = [];

  // Global chart
  try {
    const data = await lastfmGet({ method: "chart.gettoptracks", api_key: apiKey, limit });
    results.push(...parseTracks(data.tracks?.track));
  } catch (e) {
    errors.push({ source: "chart.gettoptracks", error: e.message });
  }

  // Top tracks per genre tag
  for (const tag of TAGS) {
    try {
      const data = await lastfmGet({ method: "tag.gettoptracks", tag, api_key: apiKey, limit: 25 });
      results.push(...parseTracks(data.tracks?.track));
    } catch (e) {
      errors.push({ source: `tag.gettoptracks:${tag}`, error: e.message });
    }
  }

  return { tracks: results, errors };
}
