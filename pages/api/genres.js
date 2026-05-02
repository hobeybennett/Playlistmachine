import { sql } from "../../lib/db.js";

const ALL_GENRES = ["all", "rock", "pop", "alternative", "rap", "metal", "hardcore", "punk", "electronic", "dance"];

export default async function handler(req, res) {
  try {
    // Get track count per canonical genre
    const { rows } = await sql`
      SELECT
        unnest(genres) AS genre,
        COUNT(DISTINCT spotify_track_id)::int AS track_count
      FROM tracks
      WHERE popularity > 0
      GROUP BY 1
    `;

    const countMap = Object.fromEntries(rows.map((r) => [r.genre, r.track_count]));
    const { rows: [{ total }] } = await sql`SELECT COUNT(*)::int AS total FROM tracks WHERE popularity > 0`;

    const genres = ALL_GENRES.map((g) => ({
      id: g,
      label: g === "all" ? "All" : g.charAt(0).toUpperCase() + g.slice(1),
      count: g === "all" ? total : (countMap[g] || 0),
    }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ genres });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
