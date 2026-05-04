import { getUserToken, getSpotifyToken } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Test with Synth Pop Sugar — 62k followers, definitely has tracks
  const playlistId = req.query.id || "1K4EjTQOh9ko8ek0PFAT3Q";

  const results = {};

  // 1. Check user token
  try {
    const userToken = await getUserToken();
    results.userTokenOk = true;
    results.userTokenPrefix = userToken.slice(0, 12) + "...";

    // 2. Fetch playlist with user token
    const r = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    results.playlistStatus = r.status;
    const data = await r.json();
    results.playlistName = data.name;
    results.tracksTotal = data.tracks?.total;
    results.itemsLength = data.tracks?.items?.length;
    results.firstItem = data.tracks?.items?.[0]
      ? { trackId: data.tracks.items[0].track?.id, trackName: data.tracks.items[0].track?.name }
      : null;
  } catch (e) {
    results.userTokenOk = false;
    results.userTokenError = e.message;

    // 3. Fallback: try client creds
    try {
      const clientToken = await getSpotifyToken();
      const r = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });
      results.clientCredsStatus = r.status;
      const data = await r.json();
      results.clientItemsLength = data.tracks?.items?.length;
    } catch (e2) {
      results.clientCredsError = e2.message;
    }
  }

  return res.status(200).json(results);
}
