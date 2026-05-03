import { sql } from "../../../lib/db.js";
import { loadKeywordMap } from "../../../lib/genre.js";
import { fetchArtistsBatch } from "../../../lib/spotify.js";
import { ingestTrackObjects, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

const MOCK_TRACKS = [
  { id: "mock_track_1", name: "Test Track Alpha", uri: "spotify:track:mock_track_1", popularity: 72, duration_ms: 210000, explicit: false, preview_url: null, external_urls: { spotify: "https://open.spotify.com/track/mock_track_1" }, artists: [{ id: "mock_artist_1", name: "Mock Artist A" }], album: { id: "mock_album_1", name: "Mock Album", release_date: "2025-01-15", images: [{ url: "https://via.placeholder.com/300" }] } },
  { id: "mock_track_2", name: "Test Track Beta", uri: "spotify:track:mock_track_2", popularity: 65, duration_ms: 195000, explicit: false, preview_url: null, external_urls: { spotify: "https://open.spotify.com/track/mock_track_2" }, artists: [{ id: "mock_artist_2", name: "Mock Artist B" }], album: { id: "mock_album_2", name: "Mock Album 2", release_date: "2025-02-20", images: [] } },
];

function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const steps = [];

  // Step 1: plain DB query
  try {
    const t0 = Date.now();
    const { rows } = await withTimeout(sql`SELECT COUNT(*) FROM tracks`, 5000, "db-ping");
    steps.push({ step: "db-ping", ok: true, trackCount: Number(rows[0].count), ms: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "db-ping", ok: false, error: err.message });
    return res.status(200).json({ ok: false, steps });
  }

  // Step 2: genre keyword map (DB)
  try {
    const t0 = Date.now();
    const map = await withTimeout(loadKeywordMap(), 5000, "loadKeywordMap");
    steps.push({ step: "loadKeywordMap", ok: true, keywords: map.size, ms: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "loadKeywordMap", ok: false, error: err.message });
    return res.status(200).json({ ok: false, steps });
  }

  // Step 3: Spotify artist fetch (expect fail/timeout while rate limited)
  try {
    const t0 = Date.now();
    const artists = await withTimeout(fetchArtistsBatch(["mock_artist_1"]), 6000, "fetchArtistsBatch");
    steps.push({ step: "fetchArtistsBatch", ok: true, count: Object.keys(artists).length, ms: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "fetchArtistsBatch", ok: false, error: err.message });
  }

  // Step 4: ingest mock tracks
  try {
    const t0 = Date.now();
    const ingested = await withTimeout(ingestTrackObjects(MOCK_TRACKS), 10000, "ingestTrackObjects");
    steps.push({ step: "ingestTrackObjects", ok: true, ingested, ms: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "ingestTrackObjects", ok: false, error: err.message });
    return res.status(200).json({ ok: false, steps });
  }

  // Step 5: snapshots
  try {
    const t0 = Date.now();
    const snapshots = await withTimeout(takeDailySnapshots(), 10000, "takeDailySnapshots");
    steps.push({ step: "takeDailySnapshots", ok: true, snapshots, ms: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "takeDailySnapshots", ok: false, error: err.message });
  }

  // Step 6: recompute scores
  try {
    const t0 = Date.now();
    await withTimeout(recomputeAllTrackScores(), 10000, "recomputeAllTrackScores");
    steps.push({ step: "recomputeAllTrackScores", ok: true, ms: Date.now() - t0 });
  } catch (err) {
    steps.push({ step: "recomputeAllTrackScores", ok: false, error: err.message });
  }

  const allOk = steps.every((s) => s.ok);
  return res.status(200).json({ ok: allOk, steps });
}
