import { searchTracks } from "../../../lib/spotify.js";
import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

// Spotify search queries that work without Extended Quota.
// Genre filters don't apply to track search, so we use descriptive terms + year tags.
const SEARCH_QUERIES = [
  "year:2025",
  "year:2024",
  "indie rock 2025",
  "electronic dance 2025",
  "hip hop rap 2025",
  "pop 2025",
  "synthwave synthpop 2025",
  "house techno 2025",
  "metal hardcore 2025",
  "punk alternative 2025",
  "indie pop 2025",
  "trap drill 2025",
  "shoegaze dreampop 2025",
  "edm festival 2025",
  "rnb soul 2025",
  "ambient downtempo 2025",
  "indie 2025",
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
    errors: [],
  };

  try {
    // ── Step 1: Search for tracks across genre queries (parallel) ─────────────
    const seen = new Set();
    const allTracks = [];

    const searchResults = await Promise.allSettled(
      SEARCH_QUERIES.map((query) => searchTracks(query, 10).then((tracks) => ({ query, tracks })))
    );

    for (const result of searchResults) {
      results.queriesRun++;
      if (result.status === "fulfilled") {
        const { query, tracks } = result.value;
        let newForQuery = 0;
        for (const t of tracks) {
          if (!seen.has(t.id)) { seen.add(t.id); allTracks.push(t); newForQuery++; }
        }
        results.errors.push({ query, found: tracks.length, new: newForQuery });
      } else {
        const query = SEARCH_QUERIES[searchResults.indexOf(result)];
        results.errors.push({ query, error: result.reason?.message });
      }
    }

    results.tracksFound = allTracks.length;

    // ── Step 2: Ingest all discovered tracks ─────────────────────────────────
    try {
      results.newTracksIngested = await ingestTrackObjects(allTracks);
    } catch (err) {
      results.errors.push({ step: "ingest", error: err.message });
    }

    // ── Step 3: Refresh stale popularity scores ───────────────────────────────
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
