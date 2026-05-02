#!/usr/bin/env node
// Smoke test against the live Railway deployment.
// Run: node scripts/smoke-test.js
//
// Requires .env.local with:
//   BASE_URL=https://playlistmachine-production.up.railway.app
//   CRON_SECRET=your_secret_here

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.trim().split("=");
    if (k && !k.startsWith("#") && v.length) process.env[k] = v.join("=");
  }
} catch {
  console.error("✗ Missing .env.local — create it with BASE_URL and CRON_SECRET");
  process.exit(1);
}

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

if (!BASE_URL || !SECRET) {
  console.error("✗ .env.local must contain BASE_URL and CRON_SECRET");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${SECRET}` };
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

async function get(path, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  let body;
  try { body = await res.json(); } catch { body = {}; }
  return { status: res.status, body };
}

async function post(path, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers });
  let body;
  try { body = await res.json(); } catch { body = {}; }
  return { status: res.status, body };
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function testSpotify() {
  console.log("\n── Spotify connectivity");
  const { status, body } = await get("/api/admin/test-spotify", auth);
  if (status !== 200) return fail("test-spotify responded", `HTTP ${status}`);

  if (body.tokenType === "user_oauth") pass("OAuth token active");
  else fail("OAuth token", `got ${body.tokenType} — run Connect Spotify in admin`);

  if (body.playlistStatus === 200) pass("playlist read OK");
  else fail("playlist read", `HTTP ${body.playlistStatus}`);

  if (body.tracksStatus === 200) pass("playlist tracks read OK");
  else fail("playlist tracks", `HTTP ${body.tracksStatus}`);
}

async function testPoll() {
  console.log("\n── Poll");
  const { status, body } = await get("/api/cron/poll", auth);
  if (status !== 200) return fail("poll responded", `HTTP ${status} — ${body.error || ""}`);

  pass("poll completed without crash");

  if (body.errors?.length) fail("poll errors", JSON.stringify(body.errors.slice(0, 2)));
  else pass("no per-curator errors");

  if (body.curatorsEmpty === body.curators && body.curators > 0) {
    fail("curators returned tracks", `all ${body.curators} came back empty — Spotify may still be rate-limiting`);
  } else {
    pass("curators with tracks", `${body.curatorsWithTracks} / ${body.curators}`);
  }

  if (body.tracksInDb > 0) pass("tracks in DB", `${body.tracksInDb} tracks`);
  else fail("tracks in DB", "0 — ingestion has not run or all tracks have popularity=0");

  console.log(`     newAdds=${body.newTrackAdds}  newIngested=${body.newTracksIngested}  refreshed=${body.popularityRefreshed}  snapshots=${body.snapshotsTaken}`);
}

async function testChart() {
  console.log("\n── Chart API");
  const { status, body } = await get("/api/charts?genre=all&page=1");
  if (status !== 200) return fail("charts responded", `HTTP ${status}`);
  pass("charts API responded");

  if (body.tracks?.length > 0) {
    pass("chart has tracks", `${body.tracks.length} on page 1, ${body.total} total`);
    const sample = body.tracks[0];
    if (sample.popularity > 0) pass("tracks have popularity scores");
    else fail("tracks have popularity", "first track has popularity=0");
    if (sample.final_score !== undefined) pass("tracks have final_score");
    else fail("tracks missing final_score");
  } else {
    fail("chart has tracks", "0 returned — run poll first");
  }
}

async function testHomepage() {
  console.log("\n── Homepage");
  const res = await fetch(BASE_URL);
  if (res.status === 200) pass("homepage loads", `HTTP ${res.status}`);
  else fail("homepage loads", `HTTP ${res.status}`);
}

// ── Run ────────────────────────────────────────────────────────────────────

console.log(`Smoke test → ${BASE_URL}`);

await testHomepage();
await testSpotify();
await testPoll();
await testChart();

console.log(`\n${"─".repeat(40)}`);
if (failed === 0) {
  console.log(`All ${passed} checks passed ✓`);
} else {
  console.log(`${passed} passed, ${failed} failed ✗`);
  process.exit(1);
}
