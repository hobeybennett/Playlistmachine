import { sql, getSetting } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const [
      { rows: [tracks] },
      { rows: [withPop] },
      { rows: [votes] },
      chartPlaylistId,
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int AS total FROM tracks WHERE name IS NOT NULL`,
      sql`SELECT COUNT(*)::int AS total, ROUND(AVG(popularity))::int AS avg_pop FROM tracks WHERE popularity > 0`,
      sql`SELECT COUNT(*)::int AS total FROM votes`,
      getSetting("chart_playlist_id"),
    ]);
    return res.status(200).json({ tracks, withPop, votes, chartPlaylistId: chartPlaylistId || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
