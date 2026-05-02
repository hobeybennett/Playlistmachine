import { sql } from "../../../../lib/db.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { trackId } = req.query;

  try {
    const [{ rows: tracks }, { rows: snapshots }, { rows: voteRows }] = await Promise.all([
      sql`
        SELECT t.*,
          (SELECT COUNT(*)::int FROM track_adds ta WHERE ta.spotify_track_id = t.spotify_track_id) AS add_count,
          (SELECT MIN(ta.detected_at) FROM track_adds ta WHERE ta.spotify_track_id = t.spotify_track_id) AS first_seen,
          (SELECT array_agg(c.name) FROM track_adds ta JOIN curators c ON c.id = ta.curator_id WHERE ta.spotify_track_id = t.spotify_track_id) AS curator_names
        FROM tracks t
        WHERE t.spotify_track_id = ${trackId}
      `,
      sql`
        SELECT snapshot_date, spotify_popularity, vote_count, final_score, score_components
        FROM daily_snapshots ds
        JOIN tracks t ON t.id = ds.track_id
        WHERE t.spotify_track_id = ${trackId}
        ORDER BY snapshot_date DESC
        LIMIT 30
      `,
      sql`
        SELECT COUNT(*)::int AS total FROM votes v
        JOIN tracks t ON t.id = v.track_id
        WHERE t.spotify_track_id = ${trackId}
      `,
    ]);

    if (!tracks.length) return res.status(404).json({ error: "Track not found" });

    return res.status(200).json({
      track: tracks[0],
      snapshots,
      totalVotes: voteRows[0]?.total || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
