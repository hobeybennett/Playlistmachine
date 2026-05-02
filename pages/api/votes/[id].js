import { createHash } from "crypto";
import { sql } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { id } = req.query; // spotify_track_id
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) {
    return res.status(400).json({ error: "Invalid track ID" });
  }

  // Build a stable visitor hash from IP + User-Agent (no PII stored)
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.headers["x-real-ip"]
    || req.socket?.remoteAddress
    || "unknown";
  const ua = req.headers["user-agent"] || "";
  const visitorHash = createHash("sha256").update(`${ip}|${ua}|${id}`).digest("hex");

  try {
    const { rows: trackRows } = await sql`
      SELECT id FROM tracks WHERE spotify_track_id = ${id}
    `;
    if (!trackRows.length) {
      return res.status(404).json({ error: "Track not found" });
    }
    const trackId = trackRows[0].id;

    // Try to insert; unique constraint prevents duplicate votes
    const { rows } = await sql`
      INSERT INTO votes (track_id, visitor_hash)
      VALUES (${trackId}, ${visitorHash})
      ON CONFLICT (track_id, visitor_hash) DO NOTHING
      RETURNING id
    `;

    const voted = rows.length > 0;

    // Return current vote count regardless
    const { rows: [{ cnt }] } = await sql`
      SELECT COUNT(*)::int AS cnt FROM votes WHERE track_id = ${trackId}
    `;

    if (!voted) {
      return res.status(200).json({ ok: false, alreadyVoted: true, voteCount: cnt });
    }

    // Async: recompute this track's score (don't await — keep response fast)
    import("../../../lib/ranking.js")
      .then(({ recomputeTrackScore }) => recomputeTrackScore(trackId))
      .catch((e) => console.error("[votes] score recompute error:", e.message));

    return res.status(200).json({ ok: true, voteCount: cnt });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
