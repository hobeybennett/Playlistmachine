import { searchTracks, fetchTracksFull } from "../../../lib/spotify.js";
import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

// Only year: filter works reliably in dev-mode Spotify. genre: and tag:new return nothing.
// Popularity is absent from search results — we batch-fetch via GET /tracks after ingesting.
const SEARCH_QUERIES = [
  { q: "year:2026" },
  { q: "year:2026", offset: 10 },
  { q: "year:2026", offset: 20 },
  { q: "year:2026", offset: 30 },
  { q: "year:2026", offset: 40 },
  { q: "year:2026", offset: 50 },
  { q: "year:2026", offset: 60 },
  { q: "year:2026", offset: 70 },
  { q: "year:2026", offset: 80 },
  { q: "year:2026", offset: 90 },
  { q: "year:2025" },
  { q: "year:2025", offset: 10 },
  { q: "year:2025", offset: 20 },
  { q: "year:2025", offset: 30 },
  { q: "year:2025", offset: 40 },
  { q: "year:2025", offset: 50 },
  { q: "year:2025", offset: 60 },
  { q: "year:2025", offset: 70 },
  { q: "year:2025", offset: 80 },
  { q: "year:2025", offset: 90 },
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    tracksFound: 0,
    newTracksIngested: 0,
    popularityRefreshed: 0,
    snapshotsTaken: 0,
    queryStats: [],
    errors: [],
  };

  try {
    // ── Step 1: Search ────────────────────────────────────────────────────────
    const seen = new Set();
    const allTracks = [];

    const searchResults = await Promise.allSettled(
      SEARCH_QUERIES.map(({ q, offset = 0 }) =>
        searchTracks(q, 10, offset).then((tracks) => ({ q, offset, tracks }))
      )
    );

    for (const r of searchResults) {
      if (r.status === "fulfilled") {
        const { q, offset, tracks } = r.value;
        let unique = 0;
        for (const t of tracks) {
          if (t?.id && !seen.has(t.id)) {
            seen.add(t.id);
            allTracks.push(t);
            unique++;
          }
        }
        results.queryStats.push({ q, offset, found: tracks.length, unique });
      } else {
        results.errors.push({ step: "search", error: r.reason?.message });
      }
    }

    results.tracksFound = allTracks.length;

    // ── Step 2: Batch-fetch full track objects to get popularity ──────────────
    // Search omits popularity for dev-mode apps; GET /tracks returns the full object.
    let tracksToIngest = allTracks;
    try {
      const ids = allTracks.map((t) => t.id);
      const full = await fetchTracksFull(ids);
      if (Object.keys(full).length > 0) {
        // Merge popularity back onto track objects; fall back to search object if missing
        tracksToIngest = allTracks.map((t) => full[t.id] || t);
      }
      results.popularitySample = tracksToIngest
        .filter((t) => (t.popularity || 0) > 0)
        .slice(0, 5)
        .map((t) => ({ name: t.name, artist: t.artists?.[0]?.name, popularity: t.popularity }));
      results.batchFetchCount = Object.keys(full).length;
    } catch (err) {
      results.errors.push({ step: "batch-fetch", error: err.message });
    }

    // ── Step 3: Ingest ────────────────────────────────────────────────────────
    try {
      results.newTracksIngested = await ingestTrackObjects(tracksToIngest);
    } catch (err) {
      results.errors.push({ step: "ingest", error: err.message });
    }

    // ── Step 3: Refresh stale popularities ────────────────────────────────────
    try {
      results.popularityRefreshed = await refreshTrackPopularities();
    } catch (err) {
      results.errors.push({ step: "popularity", error: err.message });
    }

    // ── Step 4: Daily snapshots ───────────────────────────────────────────────
    try {
      results.snapshotsTaken = await takeDailySnapshots();
    } catch (err) {
      results.errors.push({ step: "snapshots", error: err.message });
    }

    // ── Step 5: Recompute scores ──────────────────────────────────────────────
    try {
      await recomputeAllTrackScores();
    } catch (err) {
      results.errors.push({ step: "recompute", error: err.message });
    }

    return res.status(200).json({ ok: results.errors.length === 0, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message, ...results });
  }
}

