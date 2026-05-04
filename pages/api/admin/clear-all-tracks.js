import { sql } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await sql`DELETE FROM votes`;
    await sql`DELETE FROM track_adds`;
    await sql`DELETE FROM daily_snapshots`;
    const { rows } = await sql`DELETE FROM tracks RETURNING id`;
    return res.status(200).json({ ok: true, deleted: rows.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
