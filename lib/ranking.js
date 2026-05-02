import { sql } from "./db.js";

const W_POP   = () => parseFloat(process.env.SCORE_WEIGHT_POPULARITY || "0.50");
const W_GROWTH = () => parseFloat(process.env.SCORE_WEIGHT_GROWTH    || "0.35");
const W_VOTES  = () => parseFloat(process.env.SCORE_WEIGHT_VOTES     || "0.15");

// ── Individual score components ──────────────────────────────────────────────

function popularityScore(popularity) {
  // Spotify popularity is already 0-100
  return Math.max(0, Math.min(100, popularity || 0));
}

function growthScore(snapshots) {
  if (!snapshots?.length) return 0;

  // Sort by date descending
  const sorted = [...snapshots].sort(
    (a, b) => new Date(b.snapshot_date) - new Date(a.snapshot_date)
  );
  const latest = sorted[0];
  if (latest?.spotify_popularity == null) return 0;

  const nowMs = new Date(latest.snapshot_date).getTime();
  const msDayMultipliers = [
    { days: 7,  weight: 1.0 },
    { days: 3,  weight: 0.8 },
    { days: 1,  weight: 0.5 },
  ];

  for (const { days, weight } of msDayMultipliers) {
    const targetMs = nowMs - days * 86400000;
    // Find the snapshot closest to (but not newer than) targetMs
    const baseline = sorted.find(
      (s) => new Date(s.snapshot_date).getTime() <= targetMs + 43200000 // ±12h
    );
    if (!baseline || baseline.spotify_popularity == null) continue;

    const delta = latest.spotify_popularity - baseline.spotify_popularity;
    // +20 points over the window = score of 100; scaled linearly, floored at 0
    const raw = Math.max(0, delta) * 5 * weight;
    return Math.min(100, raw);
  }

  return 0;
}

function voteScore(voteCount) {
  if (!voteCount) return 0;
  // log(1 + votes) / log(101) * 100  → 100 votes ≈ 100 score
  return Math.min(100, (Math.log(1 + voteCount) / Math.log(101)) * 100);
}

// ── Compute and persist scores for all tracks ────────────────────────────────

export async function recomputeAllTrackScores() {
  const { rows: tracks } = await sql`SELECT id FROM tracks`;
  for (const { id } of tracks) {
    await recomputeTrackScore(id);
  }
}

export async function recomputeTrackScore(trackId) {
  const [{ rows: trackRows }, { rows: snapRows }, { rows: voteRows }] = await Promise.all([
    sql`SELECT popularity FROM tracks WHERE id = ${trackId}`,
    sql`SELECT snapshot_date, spotify_popularity FROM daily_snapshots WHERE track_id = ${trackId} ORDER BY snapshot_date DESC LIMIT 10`,
    sql`SELECT COUNT(*)::int AS cnt FROM votes WHERE track_id = ${trackId}`,
  ]);

  if (!trackRows.length) return;

  const pop    = popularityScore(trackRows[0].popularity);
  const growth = growthScore(snapRows);
  const votes  = voteScore(voteRows[0]?.cnt || 0);
  const final  = W_POP() * pop + W_GROWTH() * growth + W_VOTES() * votes;

  const components = {
    popularity_score: Math.round(pop * 10) / 10,
    growth_score:     Math.round(growth * 10) / 10,
    vote_score:       Math.round(votes * 10) / 10,
    vote_count:       voteRows[0]?.cnt || 0,
    weights:          { popularity: W_POP(), growth: W_GROWTH(), votes: W_VOTES() },
  };

  await sql`
    UPDATE tracks SET
      popularity_score  = ${pop},
      growth_score      = ${growth},
      vote_score        = ${votes},
      final_score       = ${final},
      score_components  = ${JSON.stringify(components)},
      updated_at        = NOW()
    WHERE id = ${trackId}
  `;
}

// ── Legacy curator scoring (kept for curators leaderboard) ───────────────────
export { recomputeAllScores, recomputeCuratorScore } from "./scoring.js";
