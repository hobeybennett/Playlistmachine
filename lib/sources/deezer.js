// Deezer public chart API — no auth, no key, works from any server IP.
// /chart/0/tracks returns the global top 100 with chart position.

const ENDPOINTS = [
  "https://api.deezer.com/chart/0/tracks?limit=100",
  "https://api.deezer.com/chart/0/albums?limit=50",  // albums → extract track title + artist
];

function positionScore(index, total) {
  return Math.max(1, Math.round(100 * (1 - index / total)));
}

export async function fetchDeezerTracks() {
  const tracks = [];
  const errors = [];

  // Top tracks
  try {
    const res = await fetch(ENDPOINTS[0], {
      headers: { "User-Agent": "PlaylistMachine/1.0" },
    });
    if (!res.ok) {
      errors.push({ endpoint: "tracks", status: res.status });
    } else {
      const data = await res.json();
      const items = data?.data || [];
      for (let i = 0; i < items.length; i++) {
        const t = items[i];
        if (!t?.title || !t?.artist?.name) continue;
        tracks.push({
          artist: t.artist.name,
          title: t.title,
          chartScore: positionScore(i, items.length),
        });
      }
    }
  } catch (e) {
    errors.push({ endpoint: "tracks", error: e.message });
  }

  return { tracks, errors };
}
