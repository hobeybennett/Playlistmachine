import { searchTracks, getSpotifyToken } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const q = req.query.q || "tag:new";
  const start = Date.now();
  try {
    const tracks = await searchTracks(q, 10);

    // Batch-fetch the first 5 track IDs via GET /tracks to check if popularity is returned there
    let batchFetchResult = null;
    if (tracks.length > 0) {
      try {
        const token = await getSpotifyToken();
        const ids = tracks.slice(0, 5).map((t) => t.id).join(",");
        const r = await fetch(`https://api.spotify.com/v1/tracks?ids=${ids}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        batchFetchResult = {
          status: r.status,
          firstTrackFull: data.tracks?.[0] || null,
          popularitySample: (data.tracks || []).map((t) => ({
            name: t?.name, popularity: t?.popularity,
          })),
        };
      } catch (e) {
        batchFetchResult = { error: e.message };
      }
    }

    return res.status(200).json({
      ok: true,
      elapsedMs: Date.now() - start,
      query: q,
      trackCount: tracks.length,
      firstTrackRaw: tracks[0] || null,
      searchPopularitySample: tracks.slice(0, 5).map((t) => ({ name: t.name, popularity: t.popularity })),
      batchFetch: batchFetchResult,
    });
  } catch (err) {
    return res.status(200).json({ ok: false, elapsedMs: Date.now() - start, error: err.message });
  }
}
