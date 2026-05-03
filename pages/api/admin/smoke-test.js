import { sql } from "../../../lib/db.js";
import { getSpotifyToken, getUserToken, fetchPlaylistTracks } from "../../../lib/spotify.js";
import { ingestPlaylistItems } from "../../../lib/ingestion.js";

async function spotifyGet(token, path) {
  const r = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.text();
  return { status: r.status, body };
}

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

  if (token) {
    // ── /me (confirms token is live and shows scopes indirectly) ──────────────
    try {
      const { status, body } = await spotifyGet(token, "/me");
      if (status === 200) {
        const d = JSON.parse(body);
        pass("spotify_me", `${d.display_name || d.id} (${d.product || "unknown plan"})`);
      } else {
        fail("spotify_me", `HTTP ${status}: ${body.slice(0, 150)}`);
      }
    } catch (e) {
      fail("spotify_me", e.message);
    }

    // ── /me/playlists — confirms playlist-read-private scope is active ─────────
    try {
      const { status, body } = await spotifyGet(token, "/me/playlists?limit=1");
      if (status === 200) {
        const d = JSON.parse(body);
        pass("spotify_scope_playlist", `playlist-read-private confirmed (${d.total} playlists)`);
      } else {
        fail("spotify_scope_playlist", `HTTP ${status}: ${body.slice(0, 150)} — token may be missing playlist-read-private scope`);
      }
    } catch (e) {
      fail("spotify_scope_playlist", e.message);
    }

    // ── Curator playlist metadata (is the playlist public/accessible?) ─────────
    try {
      const { rows: [curator] } = await sql`
        SELECT id, spotify_playlist_id FROM curators WHERE status='approved' LIMIT 1
      `;
      if (curator) {
        const { status, body } = await spotifyGet(token, `/playlists/${curator.spotify_playlist_id}?fields=id,name,public,followers.total`);
        if (status === 200) {
          const d = JSON.parse(body);
          pass("curator_metadata", `"${d.name}" public=${d.public} followers=${d.followers?.total}`);
        } else {
          fail("curator_metadata", `curator ${curator.id} HTTP ${status}: ${body.slice(0, 150)}`);
        }
      }
    } catch (e) {
      fail("curator_metadata", e.message);
    }

    // ── Curator tracks via metadata endpoint (the workaround) ────────────────
    try {
      const { rows: [curator] } = await sql`
        SELECT id, spotify_playlist_id FROM curators WHERE status='approved' LIMIT 1
      `;
      if (curator) {
        const fields = "tracks(items(track(id,name)),total)";
        const { status, body } = await spotifyGet(token, `/playlists/${curator.spotify_playlist_id}?fields=${encodeURIComponent(fields)}`);
        if (status === 200) {
          const d = JSON.parse(body);
          pass("curator_tracks_via_metadata", `curator ${curator.id}: ${d.tracks?.items?.length ?? 0} tracks (${d.tracks?.total} total)`);
        } else {
          fail("curator_tracks_via_metadata", `curator ${curator.id} HTTP ${status}: ${body.slice(0, 200)}`);
        }
      }
    } catch (e) {
      fail("curator_tracks_via_metadata", e.message);
    }
  }

  // ── Poll one curator (full ingest) ─────────────────────────────────────────
  try {
    const { rows: [curator] } = await sql`
      SELECT id, spotify_playlist_id FROM curators WHERE status='approved' LIMIT 1
    `;
    if (!curator) {
      fail("poll_sample", "no approved curators");
    } else {
      const items = await fetchPlaylistTracks(curator.spotify_playlist_id);
      if (items.length === 0) {
        fail("poll_sample", `0 tracks from curator ${curator.id} — check curator_tracks above`);
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
      pass("chart", `top: "${rows[0].name}" — ${rows[0].artists} pop=${rows[0].popularity} score=${Math.round(rows[0].final_score)}`);
    }
  } catch (e) {
    fail("chart", e.message);
  }

  const allPassed = results.every((r) => r.status === "pass");
  return res.status(200).json({ ok: allPassed, tokenType, results });
}
