import { fetchAppleMusicTracks } from "../../../lib/sources/applemusic.js";
import { fetchDeezerTracks } from "../../../lib/sources/deezer.js";
import { fetchPitchforkTracks } from "../../../lib/sources/pitchfork.js";
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
    appleMusicTracksFound: 0,
    deezerTracksFound: 0,
    pitchforkTracksFound: 0,
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
    const [appleResult, deezerResult, pitchforkResult] = await Promise.allSettled([
      fetchAppleMusicTracks(),
      fetchDeezerTracks(),
      fetchPitchforkTracks(),
    ]);

    const appleTracks    = appleResult.status    === "fulfilled" ? appleResult.value.tracks    : [];
    const deezerTracks   = deezerResult.status   === "fulfilled" ? deezerResult.value.tracks   : [];
    const pitchforkTracks = pitchforkResult.status === "fulfilled" ? pitchforkResult.value.tracks : [];

    if (appleResult.status    === "rejected") results.errors.push({ step: "apple",     error: appleResult.reason?.message });
    if (deezerResult.status   === "rejected") results.errors.push({ step: "deezer",    error: deezerResult.reason?.message });
    if (pitchforkResult.status === "rejected") results.errors.push({ step: "pitchfork", error: pitchforkResult.reason?.message });

    const sourceErrors = [
      ...(appleResult.value?.errors    || []).map(e => ({ source: "apple",     ...e })),
      ...(deezerResult.value?.errors   || []).map(e => ({ source: "deezer",    ...e })),
      ...(pitchforkResult.value?.errors || []).map(e => ({ source: "pitchfork", ...e })),
    ];
    if (sourceErrors.length) results.sourceErrors = sourceErrors;

    results.appleMusicTracksFound = appleTracks.length;
    results.deezerTracksFound     = deezerTracks.length;
    results.pitchforkTracksFound  = pitchforkTracks.length;

    // ── Step 2: Merge and deduplicate by artist+title ─────────────────────────
    const candidateMap = new Map();
    const key = (artist, title) =>
      `${artist.toLowerCase().trim()}|||${title.toLowerCase().trim()}`;

    for (const source of [appleTracks, deezerTracks, pitchforkTracks]) {
      for (const t of source) {
        const k = key(t.artist, t.title);
        if (!candidateMap.has(k)) candidateMap.set(k, { artist: t.artist, title: t.title, scores: [] });
        candidateMap.get(k).scores.push(t.chartScore);
      }
    }

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
