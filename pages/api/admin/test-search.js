import { searchTracks } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const start = Date.now();
  try {
    const tracks = await searchTracks("year:2025", 10);
    return res.status(200).json({
      ok: true,
      elapsedMs: Date.now() - start,
      trackCount: tracks.length,
      sample: tracks.slice(0, 3).map((t) => ({ id: t.id, name: t.name, artist: t.artists?.[0]?.name })),
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      elapsedMs: Date.now() - start,
      error: err.message,
    });
  }
}
