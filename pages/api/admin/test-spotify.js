import { getSpotifyToken } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const testId = "37i9dQZF1DX4JAvHpjipBk";
  try {
    const token = await getSpotifyToken();

    const r1 = await fetch(`https://api.spotify.com/v1/playlists/${testId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const playlist = await r1.text();

    const r2 = await fetch(`https://api.spotify.com/v1/playlists/${testId}/tracks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tracks = await r2.text();

    const r3 = await fetch(`https://api.spotify.com/v1/tracks/3n3Ppam7vgaVa1iaRUIOKE`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const track = await r3.text();

    return res.status(200).json({
      playlistStatus: r1.status,
      playlistBody: playlist.slice(0, 500),
      tracksStatus: r2.status,
      tracksBody: tracks.slice(0, 500),
      trackStatus: r3.status,
      trackBody: track.slice(0, 200),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
