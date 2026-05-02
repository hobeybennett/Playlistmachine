// Returns the Spotify OAuth URL the admin needs to open in their browser.
// The user authorizes the app, then the callback URL receives the code.
export default function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "SPOTIFY_CLIENT_ID not set" });

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI
    || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}/api/admin/spotify-callback`;

  const scopes = [
    "playlist-read-private",
    "playlist-modify-public",
    "playlist-modify-private",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    state: "pm_oauth",
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params}`;

  return res.status(200).json({ authUrl, redirectUri });
}
