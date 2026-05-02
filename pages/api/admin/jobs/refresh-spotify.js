import { sql } from "../../../../lib/db.js";
import { fetchPlaylistTracks } from "../../../../lib/spotify.js";
import { ingestPlaylistItems, refreshTrackPopularities, takeDailySnapshots } from "../../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../../lib/ranking.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = { curatorsPolled: 0, newAdds: 0, ingested: 0, popularityRefreshed: 0, snapshotsTaken: 0, errors: [] };

  try {
    const { rows: curators } = await sql`SELECT id, spotify_playlist_id FROM curators WHERE status = 'approved'`;
    results.curatorsPolled = curators.length;

    for (const curator of curators) {
      try {
        const items = await fetchPlaylistTracks(curator.spotify_playlist_id);
        const { rows: existing } = await sql`SELECT spotify_track_id FROM track_adds WHERE curator_id = ${curator.id}`;
        const existingIds = new Set(existing.map((r) => r.spotify_track_id));

        for (const item of items.filter((i) => !existingIds.has(i.track?.id))) {
          const t = item.track;
          if (!t?.id) continue;
          const albumArt = t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null;
          await sql`
            INSERT INTO track_adds (spotify_track_id, curator_id, track_name, artist, album, album_art, spotify_url, preview_url, playlist_added_at, popularity)
            VALUES (${t.id}, ${curator.id}, ${t.name}, ${(t.artists||[]).map(a=>a.name).join(", ")}, ${t.album?.name||null}, ${albumArt}, ${t.external_urls?.spotify||null}, ${t.preview_url||null}, ${item.added_at||null}, ${t.popularity||0})
            ON CONFLICT (spotify_track_id, curator_id) DO NOTHING
          `;
          results.newAdds++;
        }
        results.ingested += await ingestPlaylistItems(items);
      } catch (err) {
        results.errors.push({ curatorId: curator.id, error: err.message });
      }
    }

    results.popularityRefreshed = await refreshTrackPopularities();
    results.snapshotsTaken = await takeDailySnapshots();
    await recomputeAllTrackScores();

    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message, ...results });
  }
}
