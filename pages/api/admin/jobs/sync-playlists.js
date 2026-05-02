import { sql } from "../../../../lib/db.js";
import { getUserToken, updatePlaylist, createPlaylist, getSpotifyUserId } from "../../../../lib/spotify.js";

const GENRES = ["all", "rock", "pop", "alternative", "rap", "metal", "hardcore", "punk", "electronic", "dance"];
const MAX_PER_PLAYLIST = 500;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Check user token is configured before starting
  try {
    await getUserToken();
  } catch (err) {
    return res.status(400).json({ error: `Cannot sync playlists: ${err.message}` });
  }

  const results = [];

  for (const genre of GENRES) {
    const logRow = await startSyncLog(genre);
    try {
      // Get current top tracks for this genre
      const uris = await getTopTrackUris(genre, MAX_PER_PLAYLIST);
      if (!uris.length) {
        await finishSyncLog(logRow, "skipped", 0, null, "No tracks found");
        results.push({ genre, status: "skipped", reason: "no tracks" });
        continue;
      }

      // Ensure we have a playlist ID for this genre
      let playlistId = await ensurePlaylist(genre);
      if (!playlistId) {
        await finishSyncLog(logRow, "error", 0, null, "Failed to create/find playlist");
        results.push({ genre, status: "error", reason: "no playlist ID" });
        continue;
      }

      const snapshotId = await updatePlaylist(playlistId, uris);
      await finishSyncLog(logRow, "success", uris.length, snapshotId, null);
      await sql`
        UPDATE playlist_mappings SET
          last_synced_at = NOW(), last_sync_status = 'success',
          last_error = NULL, item_count = ${uris.length}
        WHERE genre = ${genre}
      `;
      results.push({ genre, status: "success", tracks: uris.length, snapshotId });
    } catch (err) {
      console.error(`[sync-playlists] ${genre} failed:`, err.message);
      await finishSyncLog(logRow, "error", 0, null, err.message);
      await sql`
        UPDATE playlist_mappings SET last_sync_status = 'error', last_error = ${err.message}
        WHERE genre = ${genre}
      `;
      results.push({ genre, status: "error", error: err.message });
    }
  }

  return res.status(200).json({ ok: true, results });
}

async function getTopTrackUris(genre, limit) {
  let rows;
  if (genre === "all") {
    ({ rows } = await sql`
      SELECT spotify_uri FROM tracks
      WHERE popularity > 0 AND spotify_uri IS NOT NULL
      ORDER BY final_score DESC, popularity DESC
      LIMIT ${limit}
    `);
  } else {
    ({ rows } = await sql`
      SELECT spotify_uri FROM tracks
      WHERE popularity > 0 AND spotify_uri IS NOT NULL AND ${genre} = ANY(genres)
      ORDER BY final_score DESC, popularity DESC
      LIMIT ${limit}
    `);
  }
  return rows.map((r) => r.spotify_uri).filter(Boolean);
}

async function ensurePlaylist(genre) {
  const { rows } = await sql`SELECT spotify_playlist_id FROM playlist_mappings WHERE genre = ${genre}`;
  if (rows[0]?.spotify_playlist_id) return rows[0].spotify_playlist_id;

  // Create a new playlist
  try {
    const userId = await getSpotifyUserId();
    const label = genre === "all" ? "All" : genre.charAt(0).toUpperCase() + genre.slice(1);
    const playlist = await createPlaylist(userId, `Playlist Machine — ${label}`, `Top emerging ${label} tracks curated by Playlist Machine`);
    await sql`
      UPDATE playlist_mappings SET spotify_playlist_id = ${playlist.id}
      WHERE genre = ${genre}
    `;
    return playlist.id;
  } catch (err) {
    console.error(`[sync-playlists] createPlaylist failed for ${genre}:`, err.message);
    return null;
  }
}

async function startSyncLog(genre) {
  const { rows } = await sql`
    INSERT INTO playlist_sync_logs (genre, started_at, status)
    VALUES (${genre}, NOW(), 'running')
    RETURNING id
  `;
  return rows[0]?.id;
}

async function finishSyncLog(id, status, itemCount, snapshotId, errorMessage) {
  if (!id) return;
  await sql`
    UPDATE playlist_sync_logs SET
      finished_at = NOW(),
      status = ${status},
      item_count = ${itemCount},
      spotify_snapshot_id = ${snapshotId},
      error_message = ${errorMessage}
    WHERE id = ${id}
  `;
}
