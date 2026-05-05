import { searchTracks, getSpotifyToken } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const q = req.query.q || "year:2025";
  const start = Date.now();
  try {
    const tracks = await searchTracks(q, 5);
    const token = await getSpotifyToken();

    // Test GET /artists — this is how we get popularity as proxy
    let artistResult = null;
    if (tracks.length > 0) {
      const artistIds = [...new Set(tracks.flatMap((t) => t.artists?.map((a) => a.id) || []))].slice(0, 5).join(",");
      try {
        const r = await fetch(`https://api.spotify.com/v1/artists?ids=${artistIds}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await r.json();
        artistResult = {
          status: r.status,
          sample: (data.artists || []).map((a) => ({
            name: a?.name,
            popularity: a?.popularity,
            followers: a?.followers?.total,
          })),
        };
      } catch (e) {
        artistResult = { error: e.message };
      }
    }

    return res.status(200).json({
      ok: true,
      elapsedMs: Date.now() - start,
      query: q,
      trackCount: tracks.length,
      trackSample: tracks.map((t) => ({ name: t.name, trackPopularity: t.popularity })),
      artistResult,
    });
  } catch (err) {
    return res.status(200).json({ ok: false, elapsedMs: Date.now() - start, error: err.message });
  }
}
