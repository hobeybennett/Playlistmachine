import { getSpotifyToken } from "../../../lib/spotify.js";
import { getSetting } from "../../../lib/db.js";

async function getTestToken() {
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || await getSetting("spotify_refresh_token");
  if (refreshToken) {
    const credentials = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    });
    if (res.ok) {
      const data = await res.json();
      return { token: data.access_token, type: "user_oauth" };
    }
  }
  const token = await getSpotifyToken();
  return { token, type: "client_credentials" };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const market = process.env.SPOTIFY_MARKET || "AU";
  const testPlaylistId = "37i9dQZF1DX4JAvHpjipBk"; // New Music Friday
  const testTrackId = "3n3Ppam7vgaVa1iaRUIOKE"; // Shape of You

  try {
    const { token, type } = await getTestToken();

    const [r1, r2, r3] = await Promise.all([
      fetch(`https://api.spotify.com/v1/playlists/${testPlaylistId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`https://api.spotify.com/v1/playlists/${testPlaylistId}/tracks?market=${market}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`https://api.spotify.com/v1/tracks/${testTrackId}?market=${market}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const [playlist, tracks, track] = await Promise.all([r1.text(), r2.text(), r3.text()]);

    return res.status(200).json({
      tokenType: type,
      playlistStatus: r1.status,
      playlistBody: playlist.slice(0, 600),
      tracksStatus: r2.status,
      tracksBody: tracks.slice(0, 600),
      trackStatus: r3.status,
      trackBody: track.slice(0, 300),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
