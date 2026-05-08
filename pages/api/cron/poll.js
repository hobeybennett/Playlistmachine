import { fetchBlogTracks } from "../../../lib/sources/blogs.js";
import { searchTracks, getSpotifyUserId, createPlaylist, updatePlaylist } from "../../../lib/spotify.js";
import { ingestTrackObjects, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";
import { sql, getSetting, setSetting } from "../../../lib/db.js";

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    blogsChecked: 0,
    listSource: null,
    blogTracksFound: 0,
    blogStats: [],
    candidatesBeforeMatch: 0,
    spotifyMatched: 0,
    newTracksIngested: 0,
    snapshotsTaken: 0,
    playlistSynced: 0,
    playlistId: null,
    errors: [],
  };

  try {
    // ── Step 1: Fetch blog tracks ─────────────────────────────────────────────
    let blogResult;
    try {
      blogResult = await fetchBlogTracks();
    } catch (err) {
      results.errors.push({ step: "blogs", error: err.message });
      blogResult = { tracks: [], errors: [], blogsChecked: 0 };
    }

    if (blogResult.errors?.length) results.sourceErrors = blogResult.errors;
    results.blogsChecked    = blogResult.blogsChecked ?? 0;
    results.listSource      = blogResult.listSource ?? null;
    results.blogTracksFound = blogResult.tracks.length;
    results.blogStats       = blogResult.blogStats ?? [];

    // ── Step 2: Deduplicate candidates (already done inside fetchBlogTracks) ──
    const candidates = blogResult.tracks;
    results.candidatesBeforeMatch = candidates.length;

    // ── Step 3: Spotify-match each candidate ─────────────────────────────────
    const seen = new Set();
    const tracksToIngest = [];

    for (const candidate of candidates) {
      let tracks = [];
      try {
        tracks = await searchTracks(`artist:${candidate.artist} track:${candidate.title}`, 1, 0);
      } catch {}
      if (!tracks.length) {
        try {
          tracks = await searchTracks(`${candidate.artist} ${candidate.title}`, 1, 0);
        } catch {}
      }
      if (!tracks.length || !tracks[0]?.id) continue;
      const track = tracks[0];
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      track.popularity = candidate.chartScore;
      tracksToIngest.push(track);
    }

    results.spotifyMatched = tracksToIngest.length;

    // ── Step 4: Ingest ────────────────────────────────────────────────────────
    try {
      results.newTracksIngested = await ingestTrackObjects(tracksToIngest);
    } catch (err) {
      results.errors.push({ step: "ingest", error: err.message });
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

    // ── Step 7: Sync Spotify playlist ─────────────────────────────────────────
    try {
      let playlistId = await getSetting("chart_playlist_id");
      if (!playlistId) {
        const userId = await getSpotifyUserId();
        const pl = await createPlaylist(userId, "Playlist Machine Chart", "Auto-updated emerging music chart");
        playlistId = pl.id;
        await setSetting("chart_playlist_id", playlistId);
      }
      const { rows } = await sql`
        SELECT spotify_uri FROM tracks
        WHERE spotify_uri IS NOT NULL
        ORDER BY final_score DESC NULLS LAST
        LIMIT 50
      `;
      const uris = rows.map((r) => r.spotify_uri).filter(Boolean);
      if (uris.length) {
        await updatePlaylist(playlistId, uris);
        results.playlistSynced = uris.length;
        results.playlistId = playlistId;
      }
    } catch (err) {
      results.errors.push({ step: "playlist-sync", error: err.message });
    }

    return res.status(200).json({ ok: results.errors.length === 0, ...results });
  } catch (err) {
    return res.status(500).json({ error: err.message, ...results });
  }
}
