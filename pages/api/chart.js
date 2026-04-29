import { sql } from "../../lib/db.js";

const WINDOW_HOURS = { "24h": 24, "72h": 72, "7d": 168 };

export default async function handler(req, res) {
  const { window = "72h" } = req.query;
  const hours = WINDOW_HOURS[window] || 72;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  try { const { rows } = await sql`
    SELECT
      ta.spotify_track_id,
      ta.track_name,
      ta.artist,
      ta.album,
      ta.album_art,
      ta.spotify_url,
      ta.preview_url,
      COUNT(ta.curator_id)::int AS add_count,
      COALESCE(SUM(c.score), 0) AS weighted_score,
      MIN(ta.detected_at) AS first_seen,
      MAX(ta.popularity) AS popularity
    FROM track_adds ta
    JOIN curators c ON c.id = ta.curator_id
    WHERE ta.detected_at >= ${since}
      AND c.status = 'approved'
    GROUP BY
      ta.spotify_track_id, ta.track_name, ta.artist,
      ta.album, ta.album_art, ta.spotify_url, ta.preview_url
    ORDER BY weighted_score DESC
    LIMIT 50
  `;

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
  return res.status(200).json({ tracks: rows, window });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
