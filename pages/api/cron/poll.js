import { searchTracks } from "../../../lib/spotify.js";
import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

// Dev-mode Spotify apps can't read playlist tracks, so we discover via search.
// Each query returns up to 10 tracks; we paginate with offsets to get breadth.
const QUERIES = [
  { q: "year:2026" },
  { q: "year:2025" },
  { q: "genre:indie year:2026" },
  { q: "genre:indie year:2025" },
  { q: "genre:pop year:2026" },
  { q: "genre:pop year:2025" },
  { q: "genre:hip-hop year:2026" },
  { q: "genre:hip-hop year:2025" },
  { q: "genre:electronic year:2026" },
  { q: "genre:electronic year:2025" },
  { q: "genre:r&b year:2026" },
  { q: "genre:r&b year:2025" },
  { q: "genre:rock year:2026" },
  { q: "genre:rock year:2025" },
  { q: "genre:alternative year:2025" },
  { q: "genre:soul year:2025" },
  { q: "genre:dance year:2026" },
  { q: "genre:punk year:2025" },
  { q: "genre:country year:2025" },
  { q: "genre:metal year:2025" },
  // Second page of broad queries for more variety
  { q: "year:2026", offset: 10 },
  { q: "year:2025", offset: 10 },
  { q: "genre:indie year:2025", offset: 10 },
  { q: "genre:pop year:2025", offset: 10 },
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
    // ── Step 1: Search across queries ────────────────────────────────────────
    const seen = new Set();
    const allTracks = [];

    const searchResults = await Promise.allSettled(
      QUERIES.map(({ q, offset = 0 }) =>
        searchTracks(q, 10, offset).then((tracks) => ({ q, offset, tracks }))
      )
    );

    for (const result of searchResults) {
      if (result.status === "fulfilled") {
        const { q, offset, tracks } = result.value;
        let fresh = 0;
        for (const t of tracks) {
          if (!seen.has(t.id)) {
            seen.add(t.id);
            allTracks.push(t);
            fresh++;
          }
        }
        results.queryStats.push({ q, offset: offset || 0, found: tracks.length, unique: fresh });
      } else {
        results.errors.push({ step: "search", error: result.reason?.message });
      }
    }

    results.tracksFound = allTracks.length;

    // ── Step 2: Ingest ───────────────────────────────────────────────────────
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
