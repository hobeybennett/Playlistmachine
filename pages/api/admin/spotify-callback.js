import { setSetting } from "../../../lib/db.js";

// Exchanges the Spotify OAuth authorization code for a refresh token.
// Spotify redirects here with ?code=... after the user authorizes the app.
// This page also accepts a GET request directly from the browser.
export default async function handler(req, res) {
  const { code, error: oauthError, state } = req.query;

  if (oauthError) {
    return res.status(400).send(`<html><body><h2>Spotify auth error: ${oauthError}</h2></body></html>`);
  }

  if (!code) {
    return res.status(400).send(`<html><body><h2>Missing code parameter</h2></body></html>`);
  }

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI
    || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}/api/admin/spotify-callback`;

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(500).send(`<html><body><h2>Token exchange failed</h2><pre>${err}</pre></body></html>`);
    }

    const data = await tokenRes.json();
    const refreshToken = data.refresh_token;

    if (!refreshToken) {
      return res.status(500).send(`<html><body><h2>No refresh token in response</h2><pre>${JSON.stringify(data)}</pre></body></html>`);
    }

    // Store the refresh token in the DB
    await setSetting("spotify_refresh_token", refreshToken);

    // Also store the access token temporarily (it'll be refreshed as needed)
    console.log("[spotify-callback] Refresh token stored successfully");

    return res.status(200).send(`
      <html>
      <head><title>Spotify Connected — Playlist Machine</title></head>
      <body style="font-family:monospace;background:#09090b;color:#f0ede8;padding:40px;max-width:500px;margin:0 auto">
        <h2 style="color:#b8f050">✓ Spotify connected</h2>
        <p>Refresh token saved to database. You can close this window.</p>
        <p style="color:#666">The app will now use this token to read curator playlists and sync genre playlists.</p>
        <p style="margin-top:24px"><a href="/admin" style="color:#b8f050">← Back to Admin</a></p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("[spotify-callback] error:", err.message);
    return res.status(500).send(`<html><body><h2>Error: ${err.message}</h2></body></html>`);
  }
}
