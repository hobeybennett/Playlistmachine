import { getRecommendations } from "../../../lib/spotify.js";
import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

// Genre batches — each batch is one Recommendations API call (max 5 seeds each)
const GENRE_BATCHES = [
  ["indie", "indie-pop", "indie-rock", "singer-songwriter", "folk"],
  ["dream-pop", "shoegaze", "lo-fi", "bedroom-pop", "alt-rock"],
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    batchesRun: 0,
    tracksFound: 0,
    newTracksIngested: 0,
    popularityRefreshed: 0,
    snapshotsTaken: 0,
    queryStats: [],
    errors: [],
  };

  try {
    // ── Step 1: Fetch recommendations for each genre batch (parallel) ──────────
    const seen = new Set();
    const allTracks = [];

    const batchResults = await Promise.allSettled(
      GENRE_BATCHES.map((genres) =>
        getRecommendations({ seedGenres: genres, minPopularity: 20, limit: 100 })
          .then((tracks) => ({ genres, tracks }))
      )
    );

    for (const result of batchResults) {
      results.batchesRun++;
      if (result.status === "fulfilled") {
        const { genres, tracks } = result.value;
        let added = 0;
        for (const t of tracks) {
          if (!seen.has(t.id)) { seen.add(t.id); allTracks.push(t); added++; }
        }
        results.queryStats.push({ genres: genres.join(","), found: tracks.length, added });
      } else {
        results.errors.push({ step: "recommendations", error: result.reason?.message });
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
