import { sql } from "../../../lib/db.js";
import { getSpotifyToken, getUserToken, fetchPlaylistTracks } from "../../../lib/spotify.js";
import { ingestPlaylistItems } from "../../../lib/ingestion.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = [];
  const pass = (label, detail) => results.push({ status: "pass", label, detail });
  const fail = (label, detail) => results.push({ status: "fail", label, detail });

  // ── DB ─────────────────────────────────────────────────────────────────────
  try {
    const { rows: [counts] } = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM curators WHERE status='approved') AS curators,
        (SELECT COUNT(*)::int FROM tracks)                           AS tracks,
        (SELECT COUNT(*)::int FROM tracks WHERE popularity > 0)      AS tracks_with_pop,
        (SELECT COUNT(*)::int FROM track_adds)                       AS adds
    `;
    pass("db_connection", counts);
    if (counts.curators === 0) fail("curators", "0 approved");
    else pass("curators", counts.curators);
    if (counts.tracks_with_pop === 0) fail("tracks_with_pop", "0 — poll hasn't ingested yet");
    else pass("tracks_with_pop", counts.tracks_with_pop);
  } catch (e) {
    fail("db_connection", e.message);
  }

  // ── Spotify auth ───────────────────────────────────────────────────────────
  let token = null;
  let tokenType = null;
  try {
    token = await getUserToken();
    tokenType = "user_oauth";
    pass("spotify_auth", "user_oauth");
  } catch (e) {
    fail("spotify_oauth", e.message.slice(0, 120));
    try {
      token = await getSpotifyToken();
      tokenType = "client_credentials";
      pass("spotify_auth", "client_credentials (OAuth not set up)");
    } catch (e2) {
      fail("spotify_auth", e2.message.slice(0, 120));
    }
  }

  // ── Playlist read ──────────────────────────────────────────────────────────
  if (token) {
    try {
      const r = await fetch("https://api.spotify.com/v1/playlists/37i9dQZF1DX4JAvHpjipBk/tracks?limit=3", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await r.text();
      if (r.status === 200) {
        const d = JSON.parse(body);
        pass("playlist_read", `${d.items?.length ?? 0} items`);
      } else {
        fail("playlist_read", `HTTP ${r.status}: ${body.slice(0, 200)}`);
      }
    } catch (e) {
      fail("playlist_read", e.message);
    }
  }

  // ── Poll one curator ───────────────────────────────────────────────────────
  try {
    const { rows: [curator] } = await sql`
      SELECT id, spotify_playlist_id FROM curators WHERE status='approved' LIMIT 1
    `;
    if (!curator) {
      fail("poll_sample", "no approved curators");
    } else {
      const items = await fetchPlaylistTracks(curator.spotify_playlist_id);
      if (items.length === 0) {
        fail("poll_sample", `0 tracks from curator ${curator.id} (${curator.spotify_playlist_id})`);
      } else {
        pass("poll_sample_fetch", `${items.length} tracks from curator ${curator.id}`);
        const ingested = await ingestPlaylistItems(items);
        pass("poll_sample_ingest", `${ingested} new tracks inserted`);
      }
    }
  } catch (e) {
    fail("poll_sample", e.message);
  }

  // ── Chart ──────────────────────────────────────────────────────────────────
  try {
    const { rows } = await sql`
      SELECT name, artists, popularity, final_score
      FROM tracks WHERE popularity > 0
      ORDER BY final_score DESC, popularity DESC LIMIT 3
    `;
    if (rows.length === 0) {
      fail("chart", "0 tracks with popularity > 0");
    } else {
      pass("chart", `${rows.length} tracks; top: "${rows[0].name}" — ${rows[0].artists} pop=${rows[0].popularity} score=${Math.round(rows[0].final_score)}`);
    }
  } catch (e) {
    fail("chart", e.message);
  }

  const allPassed = results.every((r) => r.status === "pass");
  return res.status(200).json({ ok: allPassed, tokenType, results });
}
