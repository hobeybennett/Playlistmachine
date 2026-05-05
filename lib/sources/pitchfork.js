// Pitchfork Best New Tracks RSS — free, public, no auth.
// All BNT tracks are ≥8.0 Pitchfork score; treat as a fixed high signal.

const FEED_URL = "https://pitchfork.com/rss/reviews/best/tracks/";
const BNT_SCORE = 85;

// Pitchfork BNT titles: "Artist Name: "Song Title"" (quotes vary)
const TITLE_RE = /^(?:[^:]+:\s*)?(.+?):\s*[""«'"](.+?)[""»'"]\s*$/;

function extractItems(xml) {
  const tracks = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const raw = m[1];
    // Title is either plain or wrapped in CDATA
    const titleM = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(raw);
    if (!titleM) continue;
    const titleStr = titleM[1].trim();
    const parsed = TITLE_RE.exec(titleStr);
    if (!parsed) continue;
    tracks.push({
      artist: parsed[1].trim(),
      title: parsed[2].trim(),
      chartScore: BNT_SCORE,
    });
  }
  return tracks;
}

export async function fetchPitchforkTracks() {
  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": "PlaylistMachine/1.0" },
    });
    if (!res.ok) return { tracks: [], errors: [{ status: res.status }] };
    const xml = await res.text();
    return { tracks: extractItems(xml), errors: [] };
  } catch (e) {
    return { tracks: [], errors: [{ error: e.message }] };
  }
}
