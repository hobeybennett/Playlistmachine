import { getSpotifyUserId, createPlaylist, updatePlaylist } from "../../../lib/spotify.js";
import { sql, getSetting, setSetting } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    let playlistId = await getSetting("chart_playlist_id");
    if (!playlistId) {
      const userId = await getSpotifyUserId();
      const pl = await createPlaylist(userId, "Playlist Machine Chart", "Auto-updated emerging music chart");
      playlistId = pl.id;
      await setSetting("chart_playlist_id", playlistId);
    }

    const { rows } = await sql`
      SELECT spotify_uri FROM tracks
      WHERE spotify_uri IS NOT NULL
      ORDER BY final_score DESC NULLS LAST
      LIMIT 50
    `;
    const uris = rows.map((r) => r.spotify_uri).filter(Boolean);

    if (!uris.length) return res.status(200).json({ ok: true, synced: 0, playlistId });

    await updatePlaylist(playlistId, uris);
    return res.status(200).json({ ok: true, synced: uris.length, playlistId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
