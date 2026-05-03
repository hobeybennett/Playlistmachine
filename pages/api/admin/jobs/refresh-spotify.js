import { searchTracks } from "../../../../lib/spotify.js";
import { ingestTrackObjects, refreshTrackPopularities, takeDailySnapshots } from "../../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../../lib/ranking.js";

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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = { queriesRun: 0, tracksFound: 0, newTracksIngested: 0, popularityRefreshed: 0, snapshotsTaken: 0, errors: [] };

  try {
    const seen = new Set();
    const allTracks = [];

    const searchResults = await Promise.allSettled(
      SEARCH_QUERIES.map((query) => searchTracks(query, 10).then((tracks) => ({ query, tracks })))
    );
    for (const result of searchResults) {
      results.queriesRun++;
      if (result.status === "fulfilled") {
        for (const t of result.value.tracks) {
          if (!seen.has(t.id)) { seen.add(t.id); allTracks.push(t); }
        }
      } else {
        results.errors.push({ query: result.reason?.message });
      }
    }

    results.tracksFound = allTracks.length;
    results.newTracksIngested = await ingestTrackObjects(allTracks);
    results.popularityRefreshed = await refreshTrackPopularities();
    results.snapshotsTaken = await takeDailySnapshots();
    try { await recomputeAllTrackScores(); } catch (err) {
      results.errors.push({ step: "recompute", error: err.message });
    }

    return res.status(200).json({ ok: results.errors.length === 0, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message, ...results });
  }
}
