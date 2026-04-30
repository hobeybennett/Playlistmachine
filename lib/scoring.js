import { sql } from "./db.js";

export async function recomputeAllScores() {
  const { rows: curators } = await sql`
    SELECT id FROM curators WHERE status = 'approved'
  `;
  for (const c of curators) {
    await recomputeCuratorScore(c.id);
  }
}

export async function recomputeCuratorScore(curatorId) {
  const { rows: adds } = await sql`
    SELECT spotify_track_id, detected_at, popularity, popularity_current
    FROM track_adds
    WHERE curator_id = ${curatorId}
  `;

  if (!adds.length) return;

  // Average current popularity across all tracks (falls back to add-time popularity)
  const popularities = adds.map((a) => a.popularity_current ?? a.popularity ?? 0);
  const avgPopularity = popularities.reduce((s, v) => s + v, 0) / popularities.length;

  // Predictive lift: for tracks added 30+ days ago, how much did popularity grow?
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const matureTracks = adds.filter(
    (a) =>
      new Date(a.detected_at) < thirtyDaysAgo &&
      a.popularity_current != null &&
      a.popularity != null
  );

  const predictiveLift = matureTracks.length
    ? matureTracks.reduce((s, a) => s + Math.max(0, a.popularity_current - a.popularity), 0) /
      matureTracks.length
    : null;

  // Scale lift: a 20-point average lift scores 100
  const liftScore = predictiveLift != null ? Math.min(100, (predictiveLift / 20) * 100) : null;

  // Once we have mature tracks, weight predictive lift heavily; otherwise use avg popularity
  const score =
    liftScore != null
      ? avgPopularity * 0.4 + liftScore * 0.6
      : avgPopularity;

  await sql`
    UPDATE curators SET
      score = ${score},
      avg_popularity = ${avgPopularity},
      predictive_lift = ${predictiveLift ?? 0},
      call_volume = ${adds.length}
    WHERE id = ${curatorId}
  `;
}
