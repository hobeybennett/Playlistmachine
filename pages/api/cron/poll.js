import { searchTracks } from "../../../lib/spotify.js";
import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

// Spotify search supported filters: year:, tag:new, tag:hipster, artist:, track:
// genre: is NOT a supported filter — returns 0-popularity garbage.
// tag:new = tracks released in the last 2 weeks (most likely to have real popularity).
const SEARCH_QUERIES = [
  { q: "tag:new" },
  { q: "tag:new", offset: 10 },
  { q: "tag:new", offset: 20 },
  { q: "tag:new", offset: 30 },
  { q: "tag:new", offset: 40 },
  { q: "tag:new", offset: 50 },
  { q: "year:2026" },
  { q: "year:2026", offset: 10 },
  { q: "year:2026", offset: 20 },
  { q: "year:2026", offset: 30 },
  { q: "year:2026", offset: 40 },
  { q: "year:2025" },
  { q: "year:2025", offset: 10 },
  { q: "year:2025", offset: 20 },
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
    results.popularitySample = allTracks
      .filter((t) => t.popularity > 0)
      .slice(0, 5)
      .map((t) => ({ name: t.name, artist: t.artists?.[0]?.name, popularity: t.popularity }));

    // ── Step 2: Ingest all (chart ranking handles sorting by popularity) ───────
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


export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    tracksFound: 0,
    tracksAboveThreshold: 0,
    newTracksIngested: 0,
    popularityRefreshed: 0,
    snapshotsTaken: 0,
    queryStats: [],
    errors: [],
  };

  try {
    // ── Step 1: Search — returns full track objects with popularity ────────────
    const seen = new Set();
    const allTracks = [];

    const queries = SEARCH_QUERIES.map((entry) =>
      typeof entry === "string" ? { q: entry, offset: 0 } : entry
    );

    const searchResults = await Promise.allSettled(
      queries.map(({ q, offset }) =>
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

    // ── Step 2: Filter to tracks with measurable popularity ───────────────────
    const popularTracks = allTracks.filter((t) => (t.popularity || 0) >= MIN_POPULARITY);
    results.tracksAboveThreshold = popularTracks.length;
    results.popularityRange = popularTracks.length
      ? {
          min: Math.min(...popularTracks.map((t) => t.popularity)),
          max: Math.max(...popularTracks.map((t) => t.popularity)),
          sample: popularTracks.slice(0, 3).map((t) => ({ name: t.name, popularity: t.popularity })),
        }
      : null;

    // ── Step 3: Ingest ────────────────────────────────────────────────────────
    try {
      results.newTracksIngested = await ingestTrackObjects(popularTracks);
    } catch (err) {
      results.errors.push({ step: "ingest", error: err.message });
    }

    // ── Step 4: Refresh stale popularities ────────────────────────────────────
    try {
      results.popularityRefreshed = await refreshTrackPopularities();
    } catch (err) {
      results.errors.push({ step: "popularity", error: err.message });
    }

    // ── Step 5: Daily snapshots ───────────────────────────────────────────────
    try {
      results.snapshotsTaken = await takeDailySnapshots();
    } catch (err) {
      results.errors.push({ step: "snapshots", error: err.message });
    }

    // ── Step 6: Recompute scores ──────────────────────────────────────────────
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
