import { sql } from "../../../lib/db.js";
import { fetchPlaylistTracks } from "../../../lib/spotify.js";
import { ingestPlaylistItems, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores, recomputeCuratorScore } from "../../../lib/ranking.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    curators: 0,
    newTrackAdds: 0,
    newTracksIngested: 0,
    popularityRefreshed: 0,
    snapshotsTaken: 0,
    errors: [],
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    // ── Step 1: Poll each approved curator for new tracks ────────────────────
    const { rows: curators } = await sql`
      SELECT id, spotify_playlist_id FROM curators WHERE status = 'approved'
    `;
    results.curators = curators.length;

    for (const curator of curators) {
      await sleep(300); // avoid Spotify 429s
      try {
        const items = await fetchPlaylistTracks(curator.spotify_playlist_id);
        if (!items.length) {
          console.warn(`[poll] curator ${curator.id} (${curator.spotify_playlist_id}): 0 tracks returned`);
          continue;
        }

        // Insert new track_adds (event log — curator spotted this track)
        const { rows: existing } = await sql`
          SELECT spotify_track_id FROM track_adds WHERE curator_id = ${curator.id}
        `;
        const existingIds = new Set(existing.map((r) => r.spotify_track_id));
        const newItems = items.filter((item) => !existingIds.has(item.track?.id));

        for (const item of newItems) {
          const t = item.track;
          if (!t?.id) continue;
          const albumArt = t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null;
          await sql`
            INSERT INTO track_adds (
              spotify_track_id, curator_id, track_name, artist, album,
              album_art, spotify_url, preview_url, playlist_added_at, popularity
            ) VALUES (
              ${t.id}, ${curator.id}, ${t.name},
              ${(t.artists || []).map((a) => a.name).join(", ")},
              ${t.album?.name || null}, ${albumArt},
              ${t.external_urls?.spotify || null},
              ${t.preview_url || null},
              ${item.added_at || null},
              ${t.popularity || 0}
            )
            ON CONFLICT (spotify_track_id, curator_id) DO NOTHING
          `;
          results.newTrackAdds++;
        }

        // Ingest all items into canonical tracks table (upsert, enriches with artist genres)
        const ingested = await ingestPlaylistItems(items);
        results.newTracksIngested += ingested;

        // Update curator score based on track_adds
        await recomputeCuratorScore(curator.id);
      } catch (err) {
        console.error(`[poll] curator ${curator.id} error:`, err.message);
        results.errors.push({ curatorId: curator.id, error: err.message });
      }
    }

    // ── Step 2: Refresh stale Spotify popularity data ────────────────────────
    try {
      results.popularityRefreshed = await refreshTrackPopularities();
    } catch (err) {
      console.error("[poll] popularity refresh error:", err.message);
      results.errors.push({ step: "refresh", error: err.message });
    }

    // ── Step 3: Take daily snapshots ─────────────────────────────────────────
    try {
      results.snapshotsTaken = await takeDailySnapshots();
    } catch (err) {
      console.error("[poll] daily snapshots error:", err.message);
      results.errors.push({ step: "snapshots", error: err.message });
    }

    // ── Step 4: Recompute all track scores ───────────────────────────────────
    await recomputeAllTrackScores();

    return res.status(200).json({ ok: true, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message, ...results });
  }
}
