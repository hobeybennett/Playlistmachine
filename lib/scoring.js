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
    SELECT spotify_track_id, detected_at, popularity
    FROM track_adds
    WHERE curator_id = ${curatorId}
  `;

  if (!adds.length) return;

  const callVolume = adds.length;
  const hits = adds.filter((a) => a.popularity >= 60).length;
  const hitAccuracy = hits / callVolume;

  // Lead time: compare each add to the earliest known add for that track
  const trackIds = adds.map((a) => a.spotify_track_id);
  const { rows: firstAdds } = await sql`
    SELECT spotify_track_id, MIN(detected_at) as first_detected
    FROM track_adds
    WHERE spotify_track_id = ANY(${trackIds})
    GROUP BY spotify_track_id
  `;
  const firstAddMap = Object.fromEntries(firstAdds.map((r) => [r.spotify_track_id, r.first_detected]));

  let totalLeadScore = 0;
  for (const add of adds) {
    const first = firstAddMap[add.spotify_track_id];
    const daysLate = first
      ? Math.max(0, (new Date(add.detected_at) - new Date(first)) / 86400000)
      : 0;
    totalLeadScore += Math.max(0, 100 - daysLate * 7);
  }
  const leadTimeScore = totalLeadScore / adds.length;

  // Call volume normalized to 0-100 (cap at 200 adds)
  const callVolumeScore = Math.min(100, (callVolume / 200) * 100);

  const score =
    hitAccuracy * 100 * 0.5 + leadTimeScore * 0.35 + callVolumeScore * 0.15;

  await sql`
    UPDATE curators SET
      score = ${score},
      hit_accuracy = ${hitAccuracy * 100},
      lead_time_score = ${leadTimeScore},
      call_volume = ${callVolume}
    WHERE id = ${curatorId}
  `;
}
