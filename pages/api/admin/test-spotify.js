import { getSpotifyToken } from "../../../lib/spotify.js";

// Tests whether Spotify returns embedded tracks via the playlist metadata endpoint.
// Uses a real curator from the seed list (Synth Pop Sugar, 62k followers).
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const playlistId = "1K4EjTQOh9ko8ek0PFAT3Q"; // Synth Pop Sugar — 62k followers, confirmed public

  try {
    const token = await getSpotifyToken();

    // Test 1: metadata endpoint — does it return tracks?
    const r1 = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?market=AU`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const playlistBody = await r1.text();
    let tracksEmbedded = null;
    let tracksTotal = null;
    if (r1.status === 200) {
      try {
        const d = JSON.parse(playlistBody);
        tracksEmbedded = d.tracks?.items?.length ?? null;
        tracksTotal = d.tracks?.total ?? null;
      } catch {}
    }

    // Test 2: /tracks sub-endpoint — still 403?
    const r2 = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const tracksBody = await r2.text();

    // Test 3: single track lookup (sanity check for token)
    const r3 = await fetch(
      `https://api.spotify.com/v1/tracks/3n3Ppam7vgaVa1iaRUIOKE?market=AU`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const trackBody = await r3.text();

    return res.status(200).json({
      metadataStatus: r1.status,
      tracksEmbeddedInMetadata: tracksEmbedded,
      tracksTotal,
      metadataSample: playlistBody.slice(0, 600),
      tracksEndpointStatus: r2.status,
      tracksEndpointBody: tracksBody.slice(0, 300),
      trackLookupStatus: r3.status,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
