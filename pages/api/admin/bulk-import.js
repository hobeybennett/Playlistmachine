import { sql } from "../../../lib/db.js";
import { searchPlaylists, fetchPlaylist } from "../../../lib/spotify.js";

const SEARCH_QUERIES = [
  "new music friday",
  "fresh finds",
  "emerging artists",
  "new music discovery",
  "indie new releases",
  "underground hip hop new",
  "new artists 2025",
  "music discovery playlist",
  "up and coming artists",
  "new indie pop",
  "fresh rap",
  "new r&b",
  "new electronic music",
  "bedroom pop new",
  "alternative new releases",
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const minFollowers = Number(req.body?.minFollowers) || 1000;
  const queries = req.body?.queries || SEARCH_QUERIES;

  // Collect unique playlist IDs across all search queries
  // Verify Spotify credentials first
  const { getSpotifyToken } = await import("../../../lib/spotify.js");
  try {
    await getSpotifyToken();
  } catch (err) {
    return res.status(500).json({ error: `Spotify auth failed — check SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Railway Variables. (${err.message})` });
  }

  const seen = new Set();
  const candidates = [];
  const searchErrors = [];
  const searchCounts = {};
  for (const query of queries) {
    try {
      const results = await searchPlaylists(query);
      searchCounts[query] = results.length;
      for (const p of results) {
        if (p?.id && !seen.has(p.id)) {
          seen.add(p.id);
          candidates.push(p.id);
        }
      }
    } catch (err) {
      searchErrors.push(`"${query}": ${err.message}`);
    }
  }

  // Fetch full details and filter by follower count
  let imported = 0;
  let skippedFollowers = 0;
  let skippedExisting = 0;
  let errors = 0;

  for (const playlistId of candidates) {
    try {
      // Skip if already tracked
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
    searchErrors,
    searchCounts,
  });
}
