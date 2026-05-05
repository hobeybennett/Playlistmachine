import { fetchRedditTracks } from "../../../lib/sources/reddit.js";
import { fetchHypemTracks } from "../../../lib/sources/hypem.js";
import { fetchLastfmTracks } from "../../../lib/sources/lastfm.js";
import { searchTracks, getSpotifyUserId, createPlaylist, updatePlaylist } from "../../../lib/spotify.js";
import { ingestTrackObjects, takeDailySnapshots } from "../../../lib/ingestion.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";
import { sql, getSetting, setSetting } from "../../../lib/db.js";

export const config = { maxDuration: 120 };

// Normalize each source's signal to 0-100
function redditScore(upvotes) {
  return Math.min(100, (Math.log(1 + upvotes) / Math.log(1001)) * 100);
}
function hypemScore(loved, posted) {
  return Math.min(100, (loved / 5) + (posted * 10));
}
function lastfmScore(listeners) {
  return Math.min(100, (Math.log(1 + listeners) / Math.log(1_000_001)) * 100);
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = {
    redditPostsFound: 0,
    hypemTracksFound: 0,
    lastfmTracksFound: 0,
    candidatesBeforeMatch: 0,
    spotifyMatched: 0,
    newTracksIngested: 0,
    snapshotsTaken: 0,
    playlistSynced: 0,
    playlistId: null,
    errors: [],
  };

  try {
    // ── Step 1: Fetch all sources in parallel ─────────────────────────────────
    const [redditResult, hypemResult, lastfmResult] = await Promise.allSettled([
      fetchRedditTracks(),
      fetchHypemTracks(3),
      fetchLastfmTracks(process.env.LASTFM_API_KEY),
    ]);

    const redditPosts = redditResult.status === "fulfilled" ? redditResult.value.posts : [];
    const hypemTracks = hypemResult.status === "fulfilled" ? hypemResult.value.tracks : [];
    const lastfmTracks = lastfmResult.status === "fulfilled" ? lastfmResult.value.tracks : [];

    if (redditResult.status === "rejected") results.errors.push({ step: "reddit", error: redditResult.reason?.message });
    if (hypemResult.status === "rejected") results.errors.push({ step: "hypem", error: hypemResult.reason?.message });
    if (lastfmResult.status === "rejected") results.errors.push({ step: "lastfm", error: lastfmResult.reason?.message });

    // Surface internal per-source errors (e.g. individual subreddit/page failures)
    const sourceErrors = [
      ...(redditResult.value?.errors || []).map(e => ({ source: "reddit", ...e })),
      ...(hypemResult.value?.errors || []).map(e => ({ source: "hypem", ...e })),
      ...(lastfmResult.value?.errors || []).map(e => ({ source: "lastfm", ...e })),
    ];
    if (sourceErrors.length) results.sourceErrors = sourceErrors;

    results.redditPostsFound = redditPosts.length;
    results.hypemTracksFound = hypemTracks.length;
    results.lastfmTracksFound = lastfmTracks.length;

    // ── Step 2: Merge and deduplicate by artist+title ─────────────────────────
    // Map of normalised key → { artist, title, scores[] }
    const candidateMap = new Map();

    const key = (artist, title) =>
      `${artist.toLowerCase().trim()}|||${title.toLowerCase().trim()}`;

    for (const p of redditPosts) {
      const k = key(p.artist, p.title);
      if (!candidateMap.has(k)) candidateMap.set(k, { artist: p.artist, title: p.title, scores: [] });
      candidateMap.get(k).scores.push(redditScore(p.upvotes));
    }
    for (const t of hypemTracks) {
      const k = key(t.artist, t.title);
      if (!candidateMap.has(k)) candidateMap.set(k, { artist: t.artist, title: t.title, scores: [] });
      candidateMap.get(k).scores.push(hypemScore(t.loved_count, t.posted_count));
    }
    for (const t of lastfmTracks) {
      const k = key(t.artist, t.title);
      if (!candidateMap.has(k)) candidateMap.set(k, { artist: t.artist, title: t.title, scores: [] });
      candidateMap.get(k).scores.push(lastfmScore(t.listeners));
    }

    // Average available scores → final buzz score
    const candidates = [...candidateMap.values()].map((c) => ({
      ...c,
      buzzScore: Math.round(c.scores.reduce((a, b) => a + b, 0) / c.scores.length),
    }));

    results.candidatesBeforeMatch = candidates.length;

    // ── Step 3: Spotify-match each candidate (serial — throttle handles rate) ─
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
      track.popularity = candidate.buzzScore;
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
