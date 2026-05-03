import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

// Fake track objects in the same shape Spotify search returns
const MOCK_TRACKS = [
  { id: "mock_track_1", name: "Test Track Alpha", uri: "spotify:track:mock_track_1", popularity: 72, duration_ms: 210000, explicit: false, preview_url: null, external_urls: { spotify: "https://open.spotify.com/track/mock_track_1" }, artists: [{ id: "mock_artist_1", name: "Mock Artist A" }], album: { id: "mock_album_1", name: "Mock Album", release_date: "2025-01-15", images: [{ url: "https://via.placeholder.com/300" }] } },
  { id: "mock_track_2", name: "Test Track Beta", uri: "spotify:track:mock_track_2", popularity: 65, duration_ms: 195000, explicit: true, preview_url: null, external_urls: { spotify: "https://open.spotify.com/track/mock_track_2" }, artists: [{ id: "mock_artist_2", name: "Mock Artist B" }], album: { id: "mock_album_2", name: "Mock Album 2", release_date: "2025-02-20", images: [] } },
  { id: "mock_track_3", name: "Test Track Gamma", uri: "spotify:track:mock_track_3", popularity: 58, duration_ms: 240000, explicit: false, preview_url: null, external_urls: { spotify: "https://open.spotify.com/track/mock_track_3" }, artists: [{ id: "mock_artist_1", name: "Mock Artist A" }, { id: "mock_artist_3", name: "Mock Artist C" }], album: { id: "mock_album_3", name: "Mock Album 3", release_date: "2025-03-10", images: [] } },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = { steps: [] };

  try {
    const t0 = Date.now();
    const ingested = await ingestTrackObjects(MOCK_TRACKS);
    results.steps.push({ step: "ingest", ok: true, ingested, ms: Date.now() - t0 });
  } catch (err) {
    results.steps.push({ step: "ingest", ok: false, error: err.message });
    return res.status(200).json({ ok: false, ...results });
  }

  try {
    const t0 = Date.now();
    const refreshed = await refreshTrackPopularities();
    results.steps.push({ step: "popularityRefresh", ok: true, refreshed, ms: Date.now() - t0 });
  } catch (err) {
    results.steps.push({ step: "popularityRefresh", ok: false, error: err.message });
  }

  try {
    const t0 = Date.now();
    const snapshots = await takeDailySnapshots();
    results.steps.push({ step: "snapshots", ok: true, snapshots, ms: Date.now() - t0 });
  } catch (err) {
    results.steps.push({ step: "snapshots", ok: false, error: err.message });
  }

  try {
    const t0 = Date.now();
    await recomputeAllTrackScores();
    results.steps.push({ step: "recompute", ok: true, ms: Date.now() - t0 });
  } catch (err) {
    results.steps.push({ step: "recompute", ok: false, error: err.message });
  }

  const allOk = results.steps.every((s) => s.ok);
  return res.status(200).json({ ok: allOk, ...results });
}
