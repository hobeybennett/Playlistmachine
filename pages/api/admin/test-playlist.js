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

    // 2. Fetch playlist metadata (tracks embedded in data.tracks.items)
    const r = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?limit=5`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    results.playlistStatus = r.status;
    const rawBody = await r.text();
    let data;
    try { data = JSON.parse(rawBody); } catch { data = {}; results.rawBody = rawBody.slice(0, 300); }
    results.playlistName = data.name;
    results.tracksTotal = data.tracks?.total;
    results.itemsLength = data.tracks?.items?.length;
    results.tracksKeys = data.tracks ? Object.keys(data.tracks) : null;
    results.firstItem = data.tracks?.items?.[0]
      ? { trackId: data.tracks.items[0].track?.id, trackName: data.tracks.items[0].track?.name, popularity: data.tracks.items[0].track?.popularity }
      : null;

    // 3. Also try client credentials on same endpoint
    try {
      const clientToken = await getSpotifyToken();
      const r2 = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { Authorization: `Bearer ${clientToken}` },
      });
      results.clientStatus = r2.status;
      const d2 = await r2.json();
      results.clientTracksTotal = d2.tracks?.total;
      results.clientItemsLength = d2.tracks?.items?.length;
      results.clientFirstItem = d2.tracks?.items?.[0]
        ? { trackId: d2.tracks.items[0].track?.id, trackName: d2.tracks.items[0].track?.name }
        : null;
    } catch (e2) {
      results.clientError = e2.message;
    }
  } catch (e) {
    results.userTokenOk = false;
    results.userTokenError = e.message;
  }

  return res.status(200).json(results);
}
