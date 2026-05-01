export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations, sql } = await import("./lib/db.js");
    const { discoverPlaylists, fetchPlaylist } = await import("./lib/spotify.js");
    const { recomputeAllScores } = await import("./lib/scoring.js");
    const { default: pollHandler } = await import("./pages/api/cron/poll.js");

    // 1. Migrations
    await runMigrations().catch((e) => console.error("[startup] migrations failed:", e.message));

    // 2. Discover & import playlists
    try {
      const candidates = await discoverPlaylists();
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
            VALUES (${playlistId}, ${playlist.name}, ${playlist.owner?.display_name || "Unknown"}, ${followers}, 'approved', ${new Date().toISOString()})
            ON CONFLICT (spotify_playlist_id) DO NOTHING
          `;
        } catch {}
      }
      console.log("[startup] playlist discovery complete");
    } catch (e) {
      console.error("[startup] discovery failed:", e.message);
    }

    // 3. Poll all approved curators for new tracks
    try {
      const { fetchPlaylistTracks, fetchTrackPopularities } = await import("./lib/spotify.js");
      const { rows: curators } = await sql`SELECT id, spotify_playlist_id FROM curators WHERE status = 'approved'`;
      for (const curator of curators) {
        try {
          const items = await fetchPlaylistTracks(curator.spotify_playlist_id);
          const { rows: existing } = await sql`SELECT spotify_track_id FROM track_adds WHERE curator_id = ${curator.id}`;
          const existingIds = new Set(existing.map((r) => r.spotify_track_id));
          for (const item of items.filter((i) => !existingIds.has(i.track.id))) {
            const t = item.track;
            const albumArt = t.album.images?.[1]?.url || t.album.images?.[0]?.url || null;
            await sql`
              INSERT INTO track_adds (spotify_track_id, curator_id, track_name, artist, album, album_art, spotify_url, preview_url, playlist_added_at, popularity)
              VALUES (${t.id}, ${curator.id}, ${t.name}, ${t.artists.map((a) => a.name).join(", ")}, ${t.album.name}, ${albumArt}, ${t.external_urls?.spotify || null}, ${t.preview_url || null}, ${item.added_at || null}, ${t.popularity || 0})
              ON CONFLICT (spotify_track_id, curator_id) DO NOTHING
            `;
          }
        } catch {}
      }

      // Refresh popularity_current
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { rows: stale } = await sql`
        SELECT DISTINCT spotify_track_id FROM track_adds
        WHERE popularity_refreshed_at IS NULL OR popularity_refreshed_at < ${sevenDaysAgo}
        LIMIT 500
      `;
      if (stale.length) {
        const pops = await fetchTrackPopularities(stale.map((r) => r.spotify_track_id));
        const now = new Date().toISOString();
        for (const [id, pop] of Object.entries(pops)) {
          await sql`UPDATE track_adds SET popularity_current = ${pop}, popularity_refreshed_at = ${now} WHERE spotify_track_id = ${id}`;
        }
      }

      await recomputeAllScores();
      console.log("[startup] poll complete");
    } catch (e) {
      console.error("[startup] poll failed:", e.message);
    }
  }
}
