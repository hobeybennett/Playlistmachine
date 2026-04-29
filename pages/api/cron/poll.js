import { sql } from "../../../lib/db.js";
import { fetchPlaylistTracks } from "../../../lib/spotify.js";
import { recomputeAllScores } from "../../../lib/scoring.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { rows: curators } = await sql`
    SELECT id, spotify_playlist_id FROM curators WHERE status = 'approved'
  `;

  let totalAdds = 0;

  for (const curator of curators) {
    try {
      const items = await fetchPlaylistTracks(curator.spotify_playlist_id);

      const { rows: existing } = await sql`
        SELECT spotify_track_id FROM track_adds WHERE curator_id = ${curator.id}
      `;
      const existingIds = new Set(existing.map((r) => r.spotify_track_id));
      const newItems = items.filter((item) => !existingIds.has(item.track.id));

      for (const item of newItems) {
        const t = item.track;
        const albumArt =
          t.album.images?.[1]?.url || t.album.images?.[0]?.url || null;
        await sql`
          INSERT INTO track_adds (
            spotify_track_id, curator_id, track_name, artist, album,
            album_art, spotify_url, preview_url, playlist_added_at, popularity
          ) VALUES (
            ${t.id}, ${curator.id}, ${t.name},
            ${t.artists.map((a) => a.name).join(", ")},
            ${t.album.name}, ${albumArt},
            ${t.external_urls?.spotify || null},
            ${t.preview_url || null},
            ${item.added_at || null},
            ${t.popularity || 0}
          )
          ON CONFLICT (spotify_track_id, curator_id) DO NOTHING
        `;
        totalAdds++;
      }

      // Save lightweight snapshot (track IDs only via snapshot_tracks)
      const { rows: [snap] } = await sql`
        INSERT INTO snapshots (curator_id) VALUES (${curator.id}) RETURNING id
      `;
      for (const item of items.slice(0, 100)) {
        const t = item.track;
        const albumArt =
          t.album.images?.[1]?.url || t.album.images?.[0]?.url || null;
        await sql`
          INSERT INTO snapshot_tracks (
            snapshot_id, spotify_track_id, track_name, artist, album,
            album_art, spotify_url, playlist_added_at
          ) VALUES (
            ${snap.id}, ${t.id}, ${t.name},
            ${t.artists.map((a) => a.name).join(", ")},
            ${t.album.name}, ${albumArt},
            ${t.external_urls?.spotify || null},
            ${item.added_at || null}
          )
        `;
      }
    } catch (err) {
      console.error(`Poll error for curator ${curator.id}:`, err.message);
    }
  }

  await recomputeAllScores();

  return res.status(200).json({ ok: true, totalAdds, curators: curators.length });
}
