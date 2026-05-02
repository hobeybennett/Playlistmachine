import { sql } from "./db.js";
import { fetchArtistsBatch } from "./spotify.js";
import { classifyGenresSync, loadKeywordMap } from "./genre.js";

export async function ingestPlaylistItems(items) {
  if (!items?.length) return 0;

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

  // Only fetch artists we don't already have fresh data for (< 7 days old)
  const freshCutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const artistIdList = [...artistIds];
  let unknownArtistIds = artistIdList;

  if (artistIdList.length) {
    const { rows: knownArtists } = await sql`
      SELECT spotify_artist_id FROM artists
      WHERE spotify_artist_id = ANY(${artistIdList})
      AND last_spotify_fetch_at > ${freshCutoff}
    `;
    const knownSet = new Set(knownArtists.map((r) => r.spotify_artist_id));
    unknownArtistIds = artistIdList.filter((id) => !knownSet.has(id));
  }

  const [fetchedArtists, genreMap] = await Promise.all([
    unknownArtistIds.length ? fetchArtistsBatch(unknownArtistIds) : Promise.resolve({}),
    loadKeywordMap(),
  ]);

  // Upsert newly fetched artists
  for (const artist of Object.values(fetchedArtists)) {
    await sql`
      INSERT INTO artists (spotify_artist_id, name, genres, popularity, followers_total, image_url, external_url, raw_json, last_spotify_fetch_at)
      VALUES (
        ${artist.id}, ${artist.name}, ${artist.genres || []},
        ${artist.popularity || 0}, ${artist.followers?.total || 0},
        ${artist.images?.[0]?.url || null}, ${artist.external_urls?.spotify || null},
        ${JSON.stringify(artist)}, NOW()
      )
      ON CONFLICT (spotify_artist_id) DO UPDATE SET
        name = EXCLUDED.name, genres = EXCLUDED.genres,
        popularity = EXCLUDED.popularity, followers_total = EXCLUDED.followers_total,
        image_url = EXCLUDED.image_url, raw_json = EXCLUDED.raw_json,
        last_spotify_fetch_at = NOW()
    `;
  }

  // Load all artist genres from DB for classification (covers both fresh + newly fetched)
  const { rows: artistRows } = await sql`
    SELECT spotify_artist_id, genres FROM artists
    WHERE spotify_artist_id = ANY(${artistIdList})
  `;
  const artistGenreMap = Object.fromEntries(artistRows.map((r) => [r.spotify_artist_id, r.genres || []]));

  let inserted = 0;

  for (const [trackId, t] of trackMap.entries()) {
    // Use the track object from the playlist endpoint directly — it has everything
    const image = t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null;
    const isrc = t.external_ids?.isrc || null;
    const uri = t.uri || `spotify:track:${trackId}`;
    const primaryArtistId = t.artists?.[0]?.id || null;

    const allArtistGenres = [];
    for (const a of t.artists || []) {
      if (artistGenreMap[a.id]) allArtistGenres.push(...artistGenreMap[a.id]);
    }
    const genres = classifyGenresSync(allArtistGenres, genreMap);

    const { rows: existing } = await sql`SELECT id FROM tracks WHERE spotify_track_id = ${trackId}`;
    const isNew = !existing.length;

    await sql`
      INSERT INTO tracks (
        spotify_track_id, spotify_uri, name, artists, primary_artist_id,
        album_id, album_name, release_date, duration_ms, explicit,
        popularity, preview_url, external_url, image_url, isrc,
        genres, raw_json, last_spotify_fetch_at
      ) VALUES (
        ${trackId}, ${uri}, ${t.name},
        ${(t.artists || []).map((a) => a.name).join(", ")},
        ${primaryArtistId},
        ${t.album?.id || null}, ${t.album?.name || null},
        ${t.album?.release_date || null}, ${t.duration_ms || null},
        ${t.explicit || false}, ${t.popularity || 0},
        ${t.preview_url || null}, ${t.external_urls?.spotify || null},
        ${image}, ${isrc}, ${genres}, ${JSON.stringify(t)}, NOW()
      )
      ON CONFLICT (spotify_track_id) DO UPDATE SET
        name = EXCLUDED.name, artists = EXCLUDED.artists,
        primary_artist_id = EXCLUDED.primary_artist_id,
        album_id = EXCLUDED.album_id, album_name = EXCLUDED.album_name,
        popularity = EXCLUDED.popularity, preview_url = EXCLUDED.preview_url,
        external_url = EXCLUDED.external_url, image_url = EXCLUDED.image_url,
        isrc = EXCLUDED.isrc, genres = EXCLUDED.genres,
        raw_json = EXCLUDED.raw_json,
        last_spotify_fetch_at = NOW(), updated_at = NOW()
    `;

    if (isNew) inserted++;
  }

  return inserted;
}

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

export async function takeDailySnapshots() {
  const { rows: tracks } = await sql`SELECT id, popularity FROM tracks`;
  const today = new Date().toISOString().slice(0, 10);
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
