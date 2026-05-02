import { sql } from "./db.js";
import { fetchArtistsBatch, fetchTracksFull } from "./spotify.js";
import { classifyGenresSync, loadKeywordMap } from "./genre.js";

/**
 * Given raw playlist item objects from Spotify's /playlists/{id}/tracks endpoint,
 * upsert them into the canonical `tracks` table (with artist genres classified).
 *
 * Returns the number of new tracks inserted.
 */
export async function ingestPlaylistItems(items) {
  if (!items?.length) return 0;

  // Collect unique track IDs and artist IDs
  const trackMap = new Map();
  const artistIds = new Set();

  for (const item of items) {
    const t = item?.track;
    if (!t?.id) continue;
    trackMap.set(t.id, t);
    for (const a of t.artists || []) {
      if (a?.id) artistIds.add(a.id);
    }
  }

  if (!trackMap.size) return 0;

  // Fetch full track details (popularity, ISRC, etc.) and artist details (genres) in parallel
  const [fullTracks, artists, genreMap] = await Promise.all([
    fetchTracksFull([...trackMap.keys()]),
    fetchArtistsBatch([...artistIds]),
    loadKeywordMap(),
  ]);

  // Upsert artists
  for (const artist of Object.values(artists)) {
    await sql`
      INSERT INTO artists (spotify_artist_id, name, genres, popularity, followers_total, image_url, external_url, raw_json, last_spotify_fetch_at)
      VALUES (
        ${artist.id},
        ${artist.name},
        ${artist.genres || []},
        ${artist.popularity || 0},
        ${artist.followers?.total || 0},
        ${artist.images?.[0]?.url || null},
        ${artist.external_urls?.spotify || null},
        ${JSON.stringify(artist)},
        NOW()
      )
      ON CONFLICT (spotify_artist_id) DO UPDATE SET
        name               = EXCLUDED.name,
        genres             = EXCLUDED.genres,
        popularity         = EXCLUDED.popularity,
        followers_total    = EXCLUDED.followers_total,
        image_url          = EXCLUDED.image_url,
        raw_json           = EXCLUDED.raw_json,
        last_spotify_fetch_at = NOW()
    `;
  }

  let inserted = 0;

  for (const [trackId, rawTrack] of trackMap.entries()) {
    const full = fullTracks[trackId] || rawTrack;
    const primaryArtist = full.artists?.[0];
    const artistData = primaryArtist ? artists[primaryArtist.id] : null;

    // Collect all artist genres for this track
    const allArtistGenres = [];
    for (const a of full.artists || []) {
      const artistInfo = artists[a.id];
      if (artistInfo?.genres) allArtistGenres.push(...artistInfo.genres);
    }
    const genres = classifyGenresSync(allArtistGenres, genreMap);

    const image = full.album?.images?.[1]?.url || full.album?.images?.[0]?.url || null;
    const isrc = full.external_ids?.isrc || null;
    const uri = full.uri || `spotify:track:${trackId}`;

    const { rows: existing } = await sql`SELECT id FROM tracks WHERE spotify_track_id = ${trackId}`;
    const isNew = !existing.length;

    await sql`
      INSERT INTO tracks (
        spotify_track_id, spotify_uri, name, artists, primary_artist_id,
        album_id, album_name, release_date, duration_ms, explicit,
        popularity, preview_url, external_url, image_url, isrc,
        genres, raw_json, last_spotify_fetch_at
      ) VALUES (
        ${trackId},
        ${uri},
        ${full.name},
        ${(full.artists || []).map((a) => a.name).join(", ")},
        ${primaryArtist?.id || null},
        ${full.album?.id || null},
        ${full.album?.name || null},
        ${full.album?.release_date || null},
        ${full.duration_ms || null},
        ${full.explicit || false},
        ${full.popularity || 0},
        ${full.preview_url || null},
        ${full.external_urls?.spotify || null},
        ${image},
        ${isrc},
        ${genres},
        ${JSON.stringify(full)},
        NOW()
      )
      ON CONFLICT (spotify_track_id) DO UPDATE SET
        name               = EXCLUDED.name,
        artists            = EXCLUDED.artists,
        primary_artist_id  = EXCLUDED.primary_artist_id,
        album_id           = EXCLUDED.album_id,
        album_name         = EXCLUDED.album_name,
        popularity         = EXCLUDED.popularity,
        preview_url        = EXCLUDED.preview_url,
        external_url       = EXCLUDED.external_url,
        image_url          = EXCLUDED.image_url,
        isrc               = EXCLUDED.isrc,
        genres             = EXCLUDED.genres,
        raw_json           = EXCLUDED.raw_json,
        last_spotify_fetch_at = NOW(),
        updated_at         = NOW()
    `;

    if (isNew) inserted++;
  }

  return inserted;
}

/**
 * Refresh popularity for stale tracks (not updated in the last N hours).
 * Also takes a daily snapshot for each refreshed track.
 */
export async function refreshTrackPopularities(staleHours = 23) {
  const cutoff = new Date(Date.now() - staleHours * 3600000).toISOString();
  const { rows: stale } = await sql`
    SELECT id, spotify_track_id FROM tracks
    WHERE last_spotify_fetch_at IS NULL OR last_spotify_fetch_at < ${cutoff}
    ORDER BY last_spotify_fetch_at ASC NULLS FIRST
    LIMIT 500
  `;

  if (!stale.length) return 0;

  const trackIdMap = Object.fromEntries(stale.map((r) => [r.spotify_track_id, r.id]));
  const { fetchTracksFull } = await import("./spotify.js");
  const full = await fetchTracksFull(Object.keys(trackIdMap));

  let updated = 0;
  for (const [spotifyId, track] of Object.entries(full)) {
    const internalId = trackIdMap[spotifyId];
    if (!internalId) continue;
    await sql`
      UPDATE tracks SET popularity = ${track.popularity || 0}, last_spotify_fetch_at = NOW(), updated_at = NOW()
      WHERE id = ${internalId}
    `;
    updated++;
  }

  return updated;
}

/**
 * Take daily snapshots for all tracks (idempotent — skips if today's snapshot exists).
 */
export async function takeDailySnapshots() {
  const { rows: tracks } = await sql`SELECT id, popularity FROM tracks`;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let taken = 0;
  for (const track of tracks) {
    const { rows: existing } = await sql`
      SELECT id FROM daily_snapshots WHERE track_id = ${track.id} AND snapshot_date = ${today}
    `;
    if (existing.length) continue;
    const { rows: voteRow } = await sql`SELECT COUNT(*)::int AS cnt FROM votes WHERE track_id = ${track.id}`;
    await sql`
      INSERT INTO daily_snapshots (track_id, snapshot_date, spotify_popularity, vote_count)
      VALUES (${track.id}, ${today}, ${track.popularity}, ${voteRow[0]?.cnt || 0})
      ON CONFLICT (track_id, snapshot_date) DO NOTHING
    `;
    taken++;
  }
  return taken;
}
