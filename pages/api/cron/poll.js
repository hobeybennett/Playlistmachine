import { searchTracks } from "../../../lib/spotify.js";
import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

// Broad queries that return real tracks with actual Spotify popularity.
// Genre-keyword searches ("indie 2025") return 0-popularity underground tracks.
// Year + genre-tag searches hit tracks with established audience.
const SEARCH_QUERIES = [
  "year:2026",
  "year:2025",
  "genre:indie year:2026",
  "genre:indie year:2025",
  "genre:alternative year:2026",
  "genre:alternative year:2025",
  "new indie 2026",
  "new indie 2025",
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    queriesRun: 0,
    tracksFound: 0,
    newTracksIngested: 0,
    popularityRefreshed: 0,
    snapshotsTaken: 0,
    queryStats: [],
    errors: [],
  };

  try {
    // ── Step 1: Search in parallel ────────────────────────────────────────────
    const seen = new Set();
    const allTracks = [];

    const searchResults = await Promise.allSettled(
      SEARCH_QUERIES.map((query) =>
        searchTracks(query, 10).then((tracks) => ({ query, tracks }))
      )
    );

    for (const result of searchResults) {
      if (result.status === "fulfilled") {
        const { query, tracks } = result.value;
        let added = 0;
        for (const t of tracks) {
          if (!seen.has(t.id)) { seen.add(t.id); allTracks.push(t); added++; }
        }
        results.queryStats.push({ query, found: tracks.length, added });
      } else {
        results.errors.push({ step: "search", error: result.reason?.message });
      }
    }

    results.tracksFound = allTracks.length;

    // ── Step 2: Ingest ────────────────────────────────────────────────────────
    try {
      results.newTracksIngested = await ingestTrackObjects(allTracks);
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
