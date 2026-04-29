import { sql } from "../../../lib/db.js";

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid track ID" });
  }

  const [addsRes, velocityRes] = await Promise.all([
    sql`
      SELECT
        ta.spotify_track_id,
        ta.track_name,
        ta.artist,
        ta.album,
        ta.album_art,
        ta.spotify_url,
        ta.preview_url,
        ta.playlist_added_at,
        ta.detected_at,
        ta.popularity,
        c.name AS curator_name,
        c.score AS curator_score,
        c.spotify_playlist_id,
        c.hit_accuracy,
        c.lead_time_score
      FROM track_adds ta
      JOIN curators c ON c.id = ta.curator_id
      WHERE ta.spotify_track_id = ${id}
        AND c.status = 'approved'
      ORDER BY ta.detected_at ASC
    `,
    sql`
      SELECT
        DATE_TRUNC('day', detected_at)::date AS day,
        COUNT(*)::int AS adds
      FROM track_adds
      WHERE spotify_track_id = ${id}
      GROUP BY DATE_TRUNC('day', detected_at)
      ORDER BY day ASC
    `,
  ]);

  if (!addsRes.rows.length) {
    return res.status(404).json({ error: "Track not found" });
  }

  const first = addsRes.rows[0];
  const weightedScore = addsRes.rows.reduce((s, r) => s + (r.curator_score || 0), 0);

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
  return res.status(200).json({
    track: {
      spotifyId: first.spotify_track_id,
      name: first.track_name,
      artist: first.artist,
      album: first.album,
      albumArt: first.album_art,
      spotifyUrl: first.spotify_url,
      previewUrl: first.preview_url,
      popularity: first.popularity,
    },
    curatorAdds: addsRes.rows.map((r) => ({
      curatorName: r.curator_name,
      curatorScore: r.curator_score,
      curatorHitAccuracy: r.hit_accuracy,
      curatorLeadTime: r.lead_time_score,
      playlistId: r.spotify_playlist_id,
      detectedAt: r.detected_at,
      playlistAddedAt: r.playlist_added_at,
    })),
    velocity: velocityRes.rows,
    weightedScore: Math.round(weightedScore),
    addCount: addsRes.rows.length,
  });
}
