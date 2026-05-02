import { sql } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const [
      { rows: [curators] },
      { rows: [trackAdds] },
      { rows: [tracks] },
      { rows: [votes] },
      { rows: recent },
    ] = await Promise.all([
      sql`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE status='approved')::int as approved FROM curators`,
      sql`SELECT COUNT(*)::int as total FROM track_adds`,
      sql`SELECT COUNT(*)::int as total FROM tracks WHERE popularity > 0`,
      sql`SELECT COUNT(*)::int as total FROM votes`,
      sql`SELECT track_name, artist, detected_at FROM track_adds ORDER BY detected_at DESC LIMIT 5`,
    ]);
    return res.status(200).json({ curators, adds: trackAdds, tracks, votes, recent });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
