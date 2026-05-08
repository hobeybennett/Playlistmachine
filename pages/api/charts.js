import { sql } from "../../lib/db.js";

const PAGE_SIZE = 100;
const MAX_TRACKS = 500;

export default async function handler(req, res) {
  const page  = Math.max(1, parseInt(req.query.page  || "1",  10));
  const genre = req.query.genre || null;
  const offset = (page - 1) * PAGE_SIZE;

  if (offset >= MAX_TRACKS) {
    return res.status(400).json({ error: "Page out of range (max 5)" });
  }

  const trackCols = sql`
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
      COALESCE(
        (SELECT MIN(ta.detected_at) FROM track_adds ta WHERE ta.spotify_track_id = t.spotify_track_id),
        t.created_at
      ) AS first_seen,
      (SELECT COUNT(*)::int FROM votes v WHERE v.track_id = t.id) AS vote_count,
      (SELECT ds.rank_all FROM daily_snapshots ds
        WHERE ds.track_id = t.id
          AND ds.snapshot_date = (CURRENT_DATE - INTERVAL '1 day')
        LIMIT 1
      ) AS rank_yesterday
    FROM tracks t
  `;

  try {
    const [trackResult, totalResult, genreCountResult] = await Promise.all([
      genre
        ? sql`${trackCols} WHERE t.name IS NOT NULL AND t.genres @> ARRAY[${genre}]::text[]
              ORDER BY t.final_score DESC NULLS LAST, t.popularity DESC, t.created_at DESC
              LIMIT ${PAGE_SIZE} OFFSET ${offset}`
        : sql`${trackCols} WHERE t.name IS NOT NULL
              ORDER BY t.final_score DESC NULLS LAST, t.popularity DESC, t.created_at DESC
              LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      genre
        ? sql`SELECT COUNT(*)::int AS total FROM tracks WHERE name IS NOT NULL AND genres @> ARRAY[${genre}]::text[]`
        : sql`SELECT COUNT(*)::int AS total FROM tracks WHERE name IS NOT NULL`,
      sql`SELECT unnest(genres) AS genre, COUNT(*)::int AS count
          FROM tracks WHERE name IS NOT NULL AND array_length(genres, 1) > 0
          GROUP BY genre ORDER BY count DESC`,
    ]);

    const total = Math.min(totalResult.rows[0]?.total || 0, MAX_TRACKS);
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const genreCounts = Object.fromEntries(genreCountResult.rows.map(r => [r.genre, r.count]));

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json({
      tracks: trackResult.rows,
      page, pageSize: PAGE_SIZE, total, totalPages,
      genre: genre || null,
      genreCounts,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
