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

  const testPlaylistId = "37i9dQZF1DX4JAvHpjipBk"; // New Music Friday

  try {
    const { token, type } = await getTestToken();

    // Sequential requests to minimise rate-limit pressure during diagnostics
    const r1 = await fetch(`https://api.spotify.com/v1/playlists/${testPlaylistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const playlistBody = await r1.text();

    const r2 = await fetch(`https://api.spotify.com/v1/playlists/${testPlaylistId}/tracks?limit=3`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const tracksBody = await r2.text();

    // Fetch the first real track from the playlist (no hardcoded ID, no market param)
    let trackStatus = null;
    let trackBody = null;
    try {
      const firstTrackId = JSON.parse(tracksBody)?.items?.[0]?.track?.id;
      if (firstTrackId) {
        const r3 = await fetch(`https://api.spotify.com/v1/tracks/${firstTrackId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        trackStatus = r3.status;
        trackBody = (await r3.text()).slice(0, 300);
      }
    } catch {}

    return res.status(200).json({
      tokenType: type,
      playlistStatus: r1.status,
      playlistBody: playlistBody.slice(0, 600),
      tracksStatus: r2.status,
      tracksBody: tracksBody.slice(0, 400),
      trackStatus,
      trackBody,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
