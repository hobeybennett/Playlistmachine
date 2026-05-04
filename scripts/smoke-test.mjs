#!/usr/bin/env node
// Integration test — runs lib functions directly against the real DB + Spotify.
// Run: node scripts/smoke-test.mjs

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq);
    const v = trimmed.slice(eq + 1);
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  console.error("✗ Missing .env.local");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function pass(label, detail = "") {
  console.log(`  ✓ ${label}${detail ? `  (${detail})` : ""}`);
  passed++;
}
function fail(label, detail = "") {
  console.error(`  ✗ ${label}${detail ? `  — ${detail}` : ""}`);
  failed++;
}

// ── 1. Database ───────────────────────────────────────────────────────────────
console.log("\n── Database");
try {
  const { sql } = await import("../lib/db.js");

  const { rows: [r] } = await sql`SELECT 1 AS ok`;
  if (r?.ok) pass("DB connection");
  else fail("DB connection", "unexpected response");

  const { rows: [counts] } = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM curators WHERE status='approved') AS curators,
      (SELECT COUNT(*)::int FROM tracks)                           AS tracks,
      (SELECT COUNT(*)::int FROM tracks WHERE popularity > 0)      AS tracks_with_pop,
      (SELECT COUNT(*)::int FROM track_adds)                       AS adds
  `;
  pass("DB tables readable");
  console.log(`     curators=${counts.curators}  tracks=${counts.tracks}  tracks_with_pop=${counts.tracks_with_pop}  adds=${counts.adds}`);

  if (counts.curators === 0) fail("approved curators", "0 — add curators first");
  else pass("approved curators", String(counts.curators));

  if (counts.tracks_with_pop === 0) fail("tracks with popularity > 0", "0 — ingestion hasn't run yet");
  else pass("tracks with popularity > 0", String(counts.tracks_with_pop));

} catch (e) {
  fail("DB connection", e.message);
}

// ── 2. Spotify auth ───────────────────────────────────────────────────────────
console.log("\n── Spotify");
let spotifyToken = null;
try {
  const { getSpotifyToken, getUserToken } = await import("../lib/spotify.js");

  try {
    spotifyToken = await getUserToken();
    pass("OAuth user token");
  } catch (e) {
    fail("OAuth user token", e.message.slice(0, 80));
    try {
      spotifyToken = await getSpotifyToken();
      pass("client-credentials fallback token");
    } catch (e2) {
      fail("client-credentials token", e2.message.slice(0, 80));
    }
  }
} catch (e) {
  fail("Spotify import", e.message);
}

// ── 3. Spotify playlist read ──────────────────────────────────────────────────
if (spotifyToken) {
  try {
    const res = await fetch("https://api.spotify.com/v1/playlists/37i9dQZF1DX4JAvHpjipBk/tracks?limit=3", {
      headers: { Authorization: `Bearer ${spotifyToken}` },
    });
    if (res.status === 200) {
      const data = await res.json();
      pass("playlist tracks read", `${data.items?.length ?? 0} items`);
    } else if (res.status === 429) {
      fail("playlist tracks read", "429 rate-limited — wait a few minutes and retry");
    } else {
      fail("playlist tracks read", `HTTP ${res.status}`);
    }
  } catch (e) {
    fail("playlist tracks read", e.message);
  }
}

// ── 4. Poll one curator ───────────────────────────────────────────────────────
console.log("\n── Poll (one curator sample)");
try {
  const { sql } = await import("../lib/db.js");
  const { fetchPlaylistTracks } = await import("../lib/spotify.js");
  const { ingestPlaylistItems } = await import("../lib/ingestion.js");

  const { rows: [curator] } = await sql`
    SELECT id, spotify_playlist_id FROM curators WHERE status='approved' LIMIT 1
  `;

  if (!curator) {
    fail("curator available", "none approved in DB");
  } else {
    const items = await fetchPlaylistTracks(curator.spotify_playlist_id);
    if (items.length === 0) {
      fail("playlist returned tracks", `0 from ${curator.spotify_playlist_id}`);
    } else {
      pass("playlist returned tracks", `${items.length} from curator ${curator.id}`);
      const ingested = await ingestPlaylistItems(items);
      pass("ingestion ran", `${ingested} new tracks inserted`);
    }
  }
} catch (e) {
  fail("poll sample", e.message);
}

// ── 5. Chart query ────────────────────────────────────────────────────────────
console.log("\n── Chart");
try {
  const { sql } = await import("../lib/db.js");
  const { rows } = await sql`
    SELECT name, artists, popularity, final_score
    FROM tracks WHERE popularity > 0
    ORDER BY final_score DESC, popularity DESC
    LIMIT 5
  `;
  if (rows.length === 0) {
    fail("chart has tracks", "0 results — poll hasn't completed yet");
  } else {
    pass("chart has tracks", `top: "${rows[0].name}" — ${rows[0].artists} (pop=${rows[0].popularity} score=${Math.round(rows[0].final_score)})`);
  }
} catch (e) {
  fail("chart query", e.message);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
if (failed === 0) {
  console.log(`All ${passed} checks passed ✓`);
} else {
  console.log(`${passed} passed  ${failed} failed ✗`);
  process.exit(1);
}
