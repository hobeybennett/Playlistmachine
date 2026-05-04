import { fetchPlaylistTracks } from "../../../lib/spotify.js";
import { ingestPlaylistItems, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";
import { sql } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    curatorsPolled: 0,
    tracksFound: 0,
    newTracksIngested: 0,
    trackAddsRecorded: 0,
    popularityRefreshed: 0,
    snapshotsTaken: 0,
    queryStats: [],
    errors: [],
  };

  try {
    // ── Step 1: Load approved curators ───────────────────────────────────────
    const { rows: curators } = await sql`
      SELECT id, spotify_playlist_id, name FROM curators WHERE status = 'approved'
    `;

    // ── Step 2: Fetch all playlists in parallel (rate-limited by spotifyFetch) ─
    const pollResults = await Promise.allSettled(
      curators.map((c) =>
        fetchPlaylistTracks(c.spotify_playlist_id, 50).then((items) => ({ curator: c, items }))
      )
    );

    const seen = new Set();
    const allItems = [];
    const trackAddRows = [];

    for (const result of pollResults) {
      results.curatorsPolled++;
      if (result.status === "fulfilled") {
        const { curator, items } = result.value;
        results.queryStats.push({ playlist: curator.name, found: items.length });
        for (const item of items) {
          const track = item?.track;
          if (!track?.id) continue;
          if (!seen.has(track.id)) {
            seen.add(track.id);
            allItems.push(item);
          }
          trackAddRows.push({
            curatorId: curator.id,
            spotifyTrackId: track.id,
            trackName: track.name || null,
            artist: (track.artists || []).map((a) => a.name).join(", ") || null,
            album: track.album?.name || null,
            albumArt: track.album?.images?.[0]?.url || null,
            spotifyUrl: track.external_urls?.spotify || null,
            previewUrl: track.preview_url || null,
            popularity: track.popularity || 0,
            addedAt: item.added_at || null,
          });
        }
      } else {
        results.errors.push({ playlist: result.reason?.message });
      }
    }

    results.tracksFound = allItems.length;

    // ── Step 3: Ingest tracks ─────────────────────────────────────────────────
    try {
      results.newTracksIngested = await ingestPlaylistItems(allItems);
    } catch (err) {
      results.errors.push({ step: "ingest", error: err.message });
    }

    // ── Step 4: Record track_adds (skip duplicates) ───────────────────────────
    try {
      for (const r of trackAddRows) {
        await sql`
          INSERT INTO track_adds (
            curator_id, spotify_track_id, track_name, artist, album,
            album_art, spotify_url, preview_url, popularity, playlist_added_at, detected_at
          ) VALUES (
            ${r.curatorId}, ${r.spotifyTrackId}, ${r.trackName}, ${r.artist}, ${r.album},
            ${r.albumArt}, ${r.spotifyUrl}, ${r.previewUrl}, ${r.popularity}, ${r.addedAt}, NOW()
          )
          ON CONFLICT (spotify_track_id, curator_id) DO NOTHING
        `;
      }
      results.trackAddsRecorded = trackAddRows.length;
    } catch (err) {
      results.errors.push({ step: "track_adds", error: err.message });
    }

    // ── Step 5: Refresh stale popularities ────────────────────────────────────
    try {
      results.popularityRefreshed = await refreshTrackPopularities();
    } catch (err) {
      results.errors.push({ step: "popularity", error: err.message });
    }

    // ── Step 6: Daily snapshots ───────────────────────────────────────────────
    try {
      results.snapshotsTaken = await takeDailySnapshots();
    } catch (err) {
      results.errors.push({ step: "snapshots", error: err.message });
    }

    // ── Step 7: Recompute scores ──────────────────────────────────────────────
    try {
      await recomputeAllTrackScores();
    } catch (err) {
      results.errors.push({ step: "recompute", error: err.message });
    }

    return res.status(200).json({ ok: results.errors.length === 0, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message, ...results });
  }
}
