import { searchTracks } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const q = req.query.q || "tag:new";
  const start = Date.now();
  try {
    const tracks = await searchTracks(q, 10);
    return res.status(200).json({
      ok: true,
      elapsedMs: Date.now() - start,
      query: q,
      trackCount: tracks.length,
      // Full first track object so we can see every field Spotify returns
      firstTrackRaw: tracks[0] || null,
      popularitySample: tracks.map((t) => ({ name: t.name, artist: t.artists?.[0]?.name, popularity: t.popularity })),
    });
  } catch (err) {
    return res.status(200).json({ ok: false, elapsedMs: Date.now() - start, error: err.message });
  }
}
