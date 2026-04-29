import { sql } from "../../../lib/db.js";
import { fetchPlaylist } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { rows } = await sql`
      SELECT
        id, name, owner_name, follower_count, score,
        hit_accuracy, lead_time_score, call_volume,
        spotify_playlist_id, approved_at
      FROM curators
      WHERE status = 'approved'
      ORDER BY score DESC
      LIMIT 50
    `;
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate");
    return res.status(200).json({ curators: rows });
  }

  if (req.method === "POST") {
    const { playlistUrl } = req.body || {};
    if (!playlistUrl) return res.status(400).json({ error: "playlistUrl required" });

    const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) return res.status(400).json({ error: "Invalid Spotify playlist URL" });
    const playlistId = match[1];

    const { rows: existing } = await sql`
      SELECT id, status FROM curators WHERE spotify_playlist_id = ${playlistId}
    `;
    if (existing.length) {
      return res.status(409).json({
        error: `This playlist has already been ${existing[0].status}`,
        status: existing[0].status,
      });
    }

    let playlist;
    try {
      playlist = await fetchPlaylist(playlistId);
    } catch {
      return res.status(400).json({ error: "Could not fetch playlist from Spotify — is the URL correct and the playlist public?" });
    }

    if (!playlist.public) {
      return res.status(400).json({ error: "Playlist must be public to be tracked" });
    }

    const followers = playlist.followers?.total ?? 0;
    const status = followers >= 100 ? "approved" : "pending";

    const { rows: [curator] } = await sql`
      INSERT INTO curators (spotify_playlist_id, name, owner_name, follower_count, status, approved_at)
      VALUES (
        ${playlistId},
        ${playlist.name},
        ${playlist.owner?.display_name || playlist.owner?.id || "Unknown"},
        ${followers},
        ${status},
        ${status === "approved" ? new Date().toISOString() : null}
      )
      RETURNING id, status, name
    `;

    return res.status(201).json({
      id: curator.id,
      status: curator.status,
      name: curator.name,
      followers,
      message:
        status === "approved"
          ? "Approved — your playlist will be tracked from the next poll cycle."
          : "Submitted for review — playlists with fewer than 100 followers are reviewed manually.",
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
