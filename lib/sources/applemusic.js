// Apple Music RSS feeds — free, no auth, works from any server IP.
// Returns chart position as signal (position 1 = score 100, last = ~1).

const FEEDS = [
  "https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/songs.json",
  "https://rss.applemarketingtools.com/api/v2/gb/music/most-played/50/songs.json",
  "https://rss.applemarketingtools.com/api/v2/us/music/hot-tracks/50/songs.json",
];

function positionScore(index, total) {
  return Math.max(1, Math.round(100 * (1 - index / total)));
}

export async function fetchAppleMusicTracks() {
  const tracks = [];
  const errors = [];

  for (const url of FEEDS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "PlaylistMachine/1.0" },
      });
      if (!res.ok) { errors.push({ url, status: res.status }); continue; }
      const data = await res.json();
      const songs = data?.feed?.results || [];
      for (let i = 0; i < songs.length; i++) {
        const s = songs[i];
        if (!s?.artistName || !s?.name) continue;
        tracks.push({
          artist: s.artistName,
          title: s.name,
          chartScore: positionScore(i, songs.length),
        });
      }
    } catch (e) {
      errors.push({ url, error: e.message });
    }
  }

  return { tracks, errors };
}
