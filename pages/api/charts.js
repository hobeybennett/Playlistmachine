import { sql } from "../../lib/db.js";

const PAGE_SIZE = 100;
const MAX_TRACKS = 500;

export default async function handler(req, res) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  if (offset >= MAX_TRACKS) {
    return res.status(400).json({ error: "Page out of range (max 5)" });
  }

  try {
    const [{ rows }, { rows: [totalRow] }] = await Promise.all([
      sql`
        SELECT
          t.id,
          t.spotify_track_id,
          t.spotify_uri,
          t.name,
          t.artists,
          t.album_name,
          t.image_url,
          t.preview_url,
          t.external_url,
          t.popularity,
          t.genres,
          t.final_score,
          t.popularity_score,
          t.growth_score,
          t.vote_score,
          t.score_components,
          t.release_date,
          t.explicit,
          (SELECT COUNT(*)::int FROM votes v WHERE v.track_id = t.id) AS vote_count,
          (SELECT COUNT(*)::int FROM track_adds ta WHERE ta.spotify_track_id = t.spotify_track_id) AS add_count,
          (SELECT MIN(ta.detected_at) FROM track_adds ta WHERE ta.spotify_track_id = t.spotify_track_id) AS first_seen
        FROM tracks t
        WHERE t.popularity > 0
        ORDER BY t.final_score DESC, t.popularity DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::int AS total FROM tracks WHERE popularity > 0`,
    ]);

    const total = Math.min(totalRow?.total || 0, MAX_TRACKS);
    const totalPages = Math.ceil(total / PAGE_SIZE);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({ tracks: rows, page, pageSize: PAGE_SIZE, total, totalPages });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
