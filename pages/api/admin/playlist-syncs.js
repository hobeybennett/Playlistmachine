import { sql } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const [{ rows: mappings }, { rows: logs }] = await Promise.all([
      sql`SELECT * FROM playlist_mappings ORDER BY genre`,
      sql`
        SELECT genre, status, item_count, started_at, finished_at, spotify_snapshot_id, error_message
        FROM playlist_sync_logs
        ORDER BY started_at DESC
        LIMIT 50
      `,
    ]);
    return res.status(200).json({ mappings, logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
