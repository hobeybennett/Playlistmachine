import { fetchNewReleaseAlbumIds, fetchAlbumTrackIds, fetchTracksFull, searchTracks } from "../../../lib/spotify.js";
import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

// Only ingest tracks with measurable Spotify popularity
const MIN_POPULARITY = 10;

// Supplemental search queries for genre/style variety
const SEARCH_QUERIES = [
  "year:2026",
  "year:2025",
  "genre:indie year:2026",
  "genre:indie year:2025",
  "genre:pop year:2026",
  "genre:hip-hop year:2025",
  "genre:electronic year:2025",
  "genre:r&b year:2025",
  "genre:rock year:2025",
  "genre:alternative year:2025",
];

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    albumsScanned: 0,
    tracksFound: 0,
    tracksAboveThreshold: 0,
    newTracksIngested: 0,
    popularityRefreshed: 0,
    snapshotsTaken: 0,
    queryStats: [],
    errors: [],
  };

  try {
    const seen = new Set();
    let allTrackIds = [];

    // ── Step 1: New releases — gets real popular tracks ───────────────────────
    try {
      const albumIds = await fetchNewReleaseAlbumIds(50);
      results.albumsScanned = albumIds.length;

      const albumTrackResults = await Promise.allSettled(
        albumIds.map((id) => fetchAlbumTrackIds(id))
      );

      for (const r of albumTrackResults) {
        if (r.status === "fulfilled") {
          for (const id of r.value) {
            if (!seen.has(id)) { seen.add(id); allTrackIds.push(id); }
          }
        }
      }
      results.queryStats.push({ source: "new-releases", trackIds: allTrackIds.length });
    } catch (err) {
      results.errors.push({ step: "new-releases", error: err.message });
    }

    // ── Step 2: Search queries — genre/year variety ───────────────────────────
    const searchResults = await Promise.allSettled(
      SEARCH_QUERIES.map((q) => searchTracks(q, 10).then((tracks) => ({ q, tracks })))
    );

    for (const r of searchResults) {
      if (r.status === "fulfilled") {
        const { q, tracks } = r.value;
        let fresh = 0;
        for (const t of tracks) {
          if (!seen.has(t.id)) { seen.add(t.id); allTrackIds.push(t.id); fresh++; }
        }
        results.queryStats.push({ source: "search", q, found: tracks.length, unique: fresh });
      } else {
        results.errors.push({ step: "search", error: r.reason?.message });
      }
    }

    results.tracksFound = allTrackIds.length;

    // ── Step 3: Batch-fetch full track objects (with popularity) ──────────────
    let tracksWithPopularity = [];
    try {
      const full = await fetchTracksFull(allTrackIds);
      const allFull = Object.values(full);
      tracksWithPopularity = allFull.filter((t) => (t.popularity || 0) >= MIN_POPULARITY);
      results.tracksAboveThreshold = tracksWithPopularity.length;
    } catch (err) {
      results.errors.push({ step: "fetch-full", error: err.message });
    }

    // ── Step 4: Ingest ────────────────────────────────────────────────────────
    try {
      results.newTracksIngested = await ingestTrackObjects(tracksWithPopularity);
    } catch (err) {
      results.errors.push({ step: "ingest", error: err.message });
    }

    // ── Step 5: Refresh stale popularities ────────────────────────────────────
    try {
      results.popularityRefreshed = await refreshTrackPopularities();
    } catch (err) {
      results.errors.push({ step: "popularity", error: err.message });
    }

    // ── Step 6: Daily snapshots ───────────────────────────────────────────────
    try {
      results.snapshotsTaken = await takeDailySnapshots();
    } catch (err) {
      results.errors.push({ step: "snapshots", error: err.message });
    }

    // ── Step 7: Recompute scores ──────────────────────────────────────────────
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
