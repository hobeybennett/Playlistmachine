import { sql } from "../../../lib/db.js";
import { discoverPlaylists, fetchPlaylist } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const minFollowers = Number(req.body?.minFollowers) || 1000;

  let candidates;
  try {
    candidates = await discoverPlaylists();
  } catch (err) {
    return res.status(500).json({ error: `Discovery failed: ${err.message}` });
  }

  let imported = 0;
  let skippedFollowers = 0;
  let skippedExisting = 0;
  let errors = 0;

  for (const playlistId of candidates) {
    try {
      const { rows: existing } = await sql`
        SELECT id FROM curators WHERE spotify_playlist_id = ${playlistId}
      `;
      if (existing.length) { skippedExisting++; continue; }

      const playlist = await fetchPlaylist(playlistId);
      if (!playlist.public) continue;

      const followers = playlist.followers?.total ?? 0;
      if (followers < minFollowers) { skippedFollowers++; continue; }

      await sql`
        INSERT INTO curators (spotify_playlist_id, name, owner_name, follower_count, status, approved_at)
        VALUES (
          ${playlistId},
          ${playlist.name},
          ${playlist.owner?.display_name || playlist.owner?.id || "Unknown"},
          ${followers},
          'approved',
          ${new Date().toISOString()}
        )
        ON CONFLICT (spotify_playlist_id) DO NOTHING
      `;
      imported++;
    } catch (err) {
      console.error(`Failed to import ${playlistId}:`, err.message);
      errors++;
    }
  }

  return res.status(200).json({
    ok: true,
    candidates: candidates.length,
    imported,
    skippedFollowers,
    skippedExisting,
    errors,
  });
}
