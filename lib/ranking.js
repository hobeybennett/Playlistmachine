import { sql } from "./db.js";

const W_RECENCY = () => parseFloat(process.env.SCORE_WEIGHT_RECENCY || "0.60");
const W_VOTES   = () => parseFloat(process.env.SCORE_WEIGHT_VOTES   || "0.40");

// ── Individual score components ──────────────────────────────────────────────

// Tracks released today score 100, decaying to 0 at 90 days. Beyond 90 days = 0.
function recencyScore(releaseDate) {
  if (!releaseDate) return 0;
  const ageDays = (Date.now() - new Date(releaseDate).getTime()) / 86400000;
  if (ageDays < 0) return 100; // future-dated (shouldn't happen)
  if (ageDays > 90) return 0;
  return Math.round(100 * (1 - ageDays / 90));
}

function voteScore(voteCount) {
  if (!voteCount) return 0;
  // log(1 + votes) / log(101) * 100  → 100 votes ≈ 100 score
  return Math.min(100, (Math.log(1 + voteCount) / Math.log(101)) * 100);
}

// ── Compute and persist scores for all tracks ────────────────────────────────

export async function recomputeAllTrackScores() {
  const [{ rows: tracks }, { rows: allVotes }] = await Promise.all([
    sql`SELECT id, release_date FROM tracks`,
    sql`SELECT track_id, COUNT(*)::int AS cnt FROM votes GROUP BY track_id`,
  ]);

  if (!tracks.length) return;

  const voteMap = new Map(allVotes.map((v) => [v.track_id, v.cnt]));
  const wRecency = W_RECENCY(), wVotes = W_VOTES();
  const ids = [], recencies = [], votesArr = [], finals = [], comps = [];

  for (const track of tracks) {
    const recency = recencyScore(track.release_date);
    const cnt     = voteMap.get(track.id) || 0;
    const votes   = voteScore(cnt);
    const final   = wRecency * recency + wVotes * votes;
    ids.push(track.id);
    recencies.push(recency);
    votesArr.push(votes);
    finals.push(final);
    comps.push(JSON.stringify({
      recency_score: recency,
      vote_score:    Math.round(votes * 10) / 10,
      vote_count:    cnt,
      weights: { recency: wRecency, votes: wVotes },
    }));
  }

  await sql`
    UPDATE tracks SET
      popularity_score = d.recency,
      growth_score     = 0,
      vote_score       = d.votes,
      final_score      = d.final,
      score_components = d.comp::jsonb,
      updated_at       = NOW()
    FROM UNNEST(
      ${ids}::int[],
      ${recencies}::float[],
      ${votesArr}::float[],
      ${finals}::float[],
      ${comps}::text[]
    ) AS d(id, recency, votes, final, comp)
    WHERE tracks.id = d.id
  `;
}

export async function recomputeTrackScore(trackId) {
  const [{ rows: trackRows }, { rows: voteRows }] = await Promise.all([
    sql`SELECT release_date FROM tracks WHERE id = ${trackId}`,
    sql`SELECT COUNT(*)::int AS cnt FROM votes WHERE track_id = ${trackId}`,
  ]);

  if (!trackRows.length) return;

  const recency = recencyScore(trackRows[0].release_date);
  const votes   = voteScore(voteRows[0]?.cnt || 0);
  const final   = W_RECENCY() * recency + W_VOTES() * votes;

  await sql`
    UPDATE tracks SET
      popularity_score  = ${recency},
      growth_score      = 0,
      vote_score        = ${votes},
      final_score       = ${final},
      score_components  = ${JSON.stringify({ recency_score: recency, vote_score: Math.round(votes * 10) / 10, vote_count: voteRows[0]?.cnt || 0 })},
      updated_at        = NOW()
    WHERE id = ${trackId}
  `;
}

// ── Legacy curator scoring (kept for curators leaderboard) ───────────────────
export { recomputeAllScores, recomputeCuratorScore } from "./scoring.js";
