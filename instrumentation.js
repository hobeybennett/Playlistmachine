export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations, sql } = await import("./lib/db.js");
    const { discoverPlaylists, fetchPlaylist, fetchPlaylistTracks } = await import("./lib/spotify.js");
    const { ingestPlaylistItems, refreshTrackPopularities, takeDailySnapshots } = await import("./lib/ingestion.js");
    const { recomputeAllTrackScores, recomputeCuratorScore } = await import("./lib/ranking.js");

    // ── 1. Migrations ──────────────────────────────────────────────────────────
    await runMigrations().catch((e) => console.error("[startup] migrations failed:", e.message));

    // ── 2. Discover & import new playlists ────────────────────────────────────
    try {
      const candidates = await discoverPlaylists();
      let imported = 0;
      for (const playlistId of candidates) {
        try {
          const { rows: existing } = await sql`SELECT id FROM curators WHERE spotify_playlist_id = ${playlistId}`;
          if (existing.length) continue;
          const playlist = await fetchPlaylist(playlistId);
          if (!playlist.public) continue;
          const followers = playlist.followers?.total ?? 0;
          if (followers < 1000) continue;
          await sql`
            INSERT INTO curators (spotify_playlist_id, name, owner_name, follower_count, status, approved_at)
            VALUES (${playlistId}, ${playlist.name}, ${playlist.owner?.display_name || playlist.owner?.id || "Unknown"}, ${followers}, 'approved', NOW())
            ON CONFLICT (spotify_playlist_id) DO NOTHING
          `;
          imported++;
        } catch (e) {
          console.warn(`[startup] import failed for ${playlistId}:`, e.message);
        }
      }
      console.log(`[startup] playlist discovery complete — ${imported} new playlists imported`);
    } catch (e) {
      console.error("[startup] discovery failed:", e.message);
    }

    // ── 3. Poll all approved curators ─────────────────────────────────────────
    try {
      const { rows: curators } = await sql`SELECT id, spotify_playlist_id FROM curators WHERE status = 'approved'`;
      let totalAdds = 0;
      let totalIngested = 0;

      for (const curator of curators) {
        try {
          const items = await fetchPlaylistTracks(curator.spotify_playlist_id);
          if (!items.length) {
            console.warn(`[startup] curator ${curator.id} (${curator.spotify_playlist_id}): 0 tracks`);
            continue;
          }

          const { rows: existing } = await sql`SELECT spotify_track_id FROM track_adds WHERE curator_id = ${curator.id}`;
          const existingIds = new Set(existing.map((r) => r.spotify_track_id));
          const newItems = items.filter((item) => !existingIds.has(item.track?.id));

          for (const item of newItems) {
            const t = item.track;
            if (!t?.id) continue;
            const albumArt = t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null;
            await sql`
              INSERT INTO track_adds (spotify_track_id, curator_id, track_name, artist, album, album_art, spotify_url, preview_url, playlist_added_at, popularity)
              VALUES (${t.id}, ${curator.id}, ${t.name}, ${(t.artists||[]).map(a=>a.name).join(", ")}, ${t.album?.name||null}, ${albumArt}, ${t.external_urls?.spotify||null}, ${t.preview_url||null}, ${item.added_at||null}, ${t.popularity||0})
              ON CONFLICT (spotify_track_id, curator_id) DO NOTHING
            `;
            totalAdds++;
          }

          totalIngested += await ingestPlaylistItems(items);
          await recomputeCuratorScore(curator.id);
        } catch (e) {
          console.error(`[startup] curator ${curator.id} poll error:`, e.message);
        }
      }
      console.log(`[startup] poll complete — ${totalAdds} new adds, ${totalIngested} new tracks ingested`);
    } catch (e) {
      console.error("[startup] poll failed:", e.message);
    }

    // ── 4. Refresh stale Spotify data ─────────────────────────────────────────
    try {
      const refreshed = await refreshTrackPopularities();
      console.log(`[startup] popularity refreshed for ${refreshed} tracks`);
    } catch (e) {
      console.error("[startup] popularity refresh failed:", e.message);
    }

    // ── 5. Daily snapshots ────────────────────────────────────────────────────
    try {
      const taken = await takeDailySnapshots();
      console.log(`[startup] ${taken} daily snapshots taken`);
    } catch (e) {
      console.error("[startup] daily snapshots failed:", e.message);
    }

    // ── 6. Recompute all track scores ─────────────────────────────────────────
    try {
      await recomputeAllTrackScores();
      console.log("[startup] track scores recomputed");
    } catch (e) {
      console.error("[startup] score recomputation failed:", e.message);
    }
  }
}
