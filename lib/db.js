import { neon } from "@neondatabase/serverless";

let _neon = null;
function getDb() {
  if (!_neon) {
    if (!process.env.POSTGRES_URL)
      throw new Error("POSTGRES_URL environment variable is not set");
    _neon = neon(process.env.POSTGRES_URL);
  }
  return _neon;
}

export function sql(strings, ...values) {
  return getDb()(strings, ...values).then((rows) => ({ rows }));
}

export async function runMigrations() {
  // ── Existing tables (kept for backward-compat / curator tracking) ──────────
  await sql`
    CREATE TABLE IF NOT EXISTS curators (
      id              SERIAL PRIMARY KEY,
      spotify_playlist_id VARCHAR(100) UNIQUE NOT NULL,
      name            VARCHAR(500),
      owner_name      VARCHAR(500),
      follower_count  INTEGER DEFAULT 0,
      status          VARCHAR(20) DEFAULT 'pending',
      score           FLOAT DEFAULT 50,
      call_volume     INTEGER DEFAULT 0,
      avg_popularity  FLOAT DEFAULT 0,
      predictive_lift FLOAT DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      approved_at     TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS track_adds (
      id                   SERIAL PRIMARY KEY,
      spotify_track_id     VARCHAR(100) NOT NULL,
      curator_id           INTEGER REFERENCES curators(id) ON DELETE CASCADE,
      track_name           VARCHAR(500),
      artist               VARCHAR(500),
      album                VARCHAR(500),
      album_art            TEXT,
      spotify_url          TEXT,
      preview_url          TEXT,
      playlist_added_at    TIMESTAMPTZ,
      detected_at          TIMESTAMPTZ DEFAULT NOW(),
      popularity           INTEGER DEFAULT 0,
      UNIQUE(spotify_track_id, curator_id)
    )
  `;

  // Legacy snapshot tables (kept but not actively used in new flow)
  await sql`
    CREATE TABLE IF NOT EXISTS snapshots (
      id         SERIAL PRIMARY KEY,
      curator_id INTEGER REFERENCES curators(id) ON DELETE CASCADE,
      taken_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS snapshot_tracks (
      id                 SERIAL PRIMARY KEY,
      snapshot_id        INTEGER REFERENCES snapshots(id) ON DELETE CASCADE,
      spotify_track_id   VARCHAR(100) NOT NULL,
      track_name         VARCHAR(500),
      artist             VARCHAR(500),
      album              VARCHAR(500),
      album_art          TEXT,
      spotify_url        TEXT,
      playlist_added_at  TIMESTAMPTZ
    )
  `;

  // ── New canonical tracks table ──────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS tracks (
      id                   SERIAL PRIMARY KEY,
      spotify_track_id     VARCHAR(100) UNIQUE NOT NULL,
      spotify_uri          VARCHAR(200),
      name                 VARCHAR(500),
      artists              TEXT,
      primary_artist_id    VARCHAR(100),
      album_id             VARCHAR(100),
      album_name           VARCHAR(500),
      release_date         VARCHAR(50),
      duration_ms          INTEGER,
      explicit             BOOLEAN DEFAULT false,
      popularity           INTEGER DEFAULT 0,
      preview_url          TEXT,
      external_url         TEXT,
      image_url            TEXT,
      isrc                 VARCHAR(50),
      genres               TEXT[] DEFAULT '{}',
      raw_json             JSONB,
      last_spotify_fetch_at TIMESTAMPTZ,
      popularity_score     FLOAT DEFAULT 0,
      growth_score         FLOAT DEFAULT 0,
      vote_score           FLOAT DEFAULT 0,
      final_score          FLOAT DEFAULT 0,
      score_components     JSONB,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS tracks_final_score_idx ON tracks(final_score DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS tracks_genres_idx ON tracks USING GIN(genres)`;

  // ── Artist metadata ─────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS artists (
      id                   SERIAL PRIMARY KEY,
      spotify_artist_id    VARCHAR(100) UNIQUE NOT NULL,
      name                 VARCHAR(500),
      genres               TEXT[] DEFAULT '{}',
      popularity           INTEGER DEFAULT 0,
      followers_total      INTEGER DEFAULT 0,
      image_url            TEXT,
      external_url         TEXT,
      raw_json             JSONB,
      last_spotify_fetch_at TIMESTAMPTZ
    )
  `;

  // ── Configurable genre keyword mapping ─────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS genre_keywords (
      id               SERIAL PRIMARY KEY,
      keyword          VARCHAR(100) NOT NULL,
      canonical_genre  VARCHAR(50)  NOT NULL,
      UNIQUE(keyword, canonical_genre)
    )
  `;

  // ── Daily popularity snapshots (for growth calculation) ─────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id                 SERIAL PRIMARY KEY,
      track_id           INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      snapshot_date      DATE NOT NULL DEFAULT CURRENT_DATE,
      spotify_popularity INTEGER,
      vote_count         INTEGER DEFAULT 0,
      final_score        FLOAT,
      score_components   JSONB,
      rank_all           INTEGER,
      UNIQUE(track_id, snapshot_date)
    )
  `;

  // ── Visitor upvotes ─────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS votes (
      id            SERIAL PRIMARY KEY,
      track_id      INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
      visitor_hash  VARCHAR(64) NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(track_id, visitor_hash)
    )
  `;

  // ── Spotify playlist mappings per genre ─────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS playlist_mappings (
      id                   SERIAL PRIMARY KEY,
      genre                VARCHAR(50) UNIQUE NOT NULL,
      spotify_playlist_id  VARCHAR(100),
      playlist_name        VARCHAR(500),
      last_synced_at       TIMESTAMPTZ,
      last_sync_status     VARCHAR(20),
      last_error           TEXT,
      item_count           INTEGER
    )
  `;

  // ── Playlist sync logs ──────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS playlist_sync_logs (
      id                   SERIAL PRIMARY KEY,
      genre                VARCHAR(50) NOT NULL,
      started_at           TIMESTAMPTZ DEFAULT NOW(),
      finished_at          TIMESTAMPTZ,
      status               VARCHAR(20),
      item_count           INTEGER,
      spotify_snapshot_id  VARCHAR(200),
      error_message        TEXT
    )
  `;

  // ── ADD COLUMN guards for any existing installations ───────────────────────
  const alters = [
    sql`ALTER TABLE curators ADD COLUMN IF NOT EXISTS avg_popularity FLOAT DEFAULT 0`,
    sql`ALTER TABLE curators ADD COLUMN IF NOT EXISTS predictive_lift FLOAT DEFAULT 0`,
    sql`ALTER TABLE curators ADD COLUMN IF NOT EXISTS call_volume INTEGER DEFAULT 0`,
    sql`ALTER TABLE track_adds ADD COLUMN IF NOT EXISTS popularity_current INTEGER`,
    sql`ALTER TABLE track_adds ADD COLUMN IF NOT EXISTS popularity_refreshed_at TIMESTAMPTZ`,
  ];
  await Promise.all(alters);

  // Key-value settings store (spotify_refresh_token etc.)
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await seedGenreKeywords();
  await seedPlaylistMappings();

  return { ok: true };
}

export async function getSetting(key) {
  const { rows } = await sql`SELECT value FROM app_settings WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value) {
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

async function seedGenreKeywords() {
  const entries = [
    // rock
    ["rock", "rock"], ["indie rock", "rock"], ["classic rock", "rock"],
    ["hard rock", "rock"], ["garage rock", "rock"], ["art rock", "rock"],
    ["psychedelic rock", "rock"], ["folk rock", "rock"], ["alternative rock", "rock"],
    // pop
    ["pop", "pop"], ["synthpop", "pop"], ["bedroom pop", "pop"],
    ["indie pop", "pop"], ["electropop", "pop"], ["dream pop", "pop"],
    ["pop rock", "pop"], ["bubblegum pop", "pop"], ["k-pop", "pop"],
    // alternative
    ["alternative", "alternative"], ["alt rock", "alternative"],
    ["indie", "alternative"], ["shoegaze", "alternative"],
    ["grunge", "alternative"], ["post-punk", "alternative"],
    ["post punk", "alternative"], ["lo-fi", "alternative"],
    ["lo fi", "alternative"], ["emo", "alternative"],
    // rap
    ["rap", "rap"], ["hip hop", "rap"], ["hip-hop", "rap"],
    ["trap", "rap"], ["grime", "rap"], ["drill", "rap"],
    ["conscious hip hop", "rap"], ["southern hip hop", "rap"],
    ["east coast hip hop", "rap"], ["west coast hip hop", "rap"],
    ["uk hip hop", "rap"], ["cloud rap", "rap"],
    // metal
    ["metal", "metal"], ["death metal", "metal"], ["black metal", "metal"],
    ["metalcore", "metal"], ["nu metal", "metal"], ["doom metal", "metal"],
    ["thrash metal", "metal"], ["power metal", "metal"],
    ["progressive metal", "metal"], ["heavy metal", "metal"],
    // hardcore
    ["hardcore", "hardcore"], ["post-hardcore", "hardcore"],
    ["melodic hardcore", "hardcore"], ["beatdown", "hardcore"],
    ["hardcore punk", "hardcore"], ["deathcore", "hardcore"],
    // punk
    ["punk", "punk"], ["pop punk", "punk"], ["skate punk", "punk"],
    ["punk rock", "punk"], ["anarcho-punk", "punk"],
    // electronic
    ["electronic", "electronic"], ["electronica", "electronic"],
    ["techno", "electronic"], ["house", "electronic"],
    ["ambient", "electronic"], ["idm", "electronic"],
    ["synthwave", "electronic"], ["chillwave", "electronic"],
    ["vaporwave", "electronic"], ["downtempo", "electronic"],
    ["trip hop", "electronic"], ["experimental", "electronic"],
    // dance
    ["dance", "dance"], ["edm", "dance"], ["dance pop", "dance"],
    ["club", "dance"], ["trance", "dance"], ["drum and bass", "dance"],
    ["dnb", "dance"], ["dubstep", "dance"], ["garage", "dance"],
    ["future bass", "dance"], ["deep house", "dance"],
    ["progressive house", "dance"],
  ];
  for (const [keyword, canonical_genre] of entries) {
    await sql`
      INSERT INTO genre_keywords (keyword, canonical_genre)
      VALUES (${keyword}, ${canonical_genre})
      ON CONFLICT (keyword, canonical_genre) DO NOTHING
    `;
  }
}

const CANONICAL_GENRES = ["all", "rock", "pop", "alternative", "rap", "metal", "hardcore", "punk", "electronic", "dance"];

async function seedPlaylistMappings() {
  for (const genre of CANONICAL_GENRES) {
    if (genre === "all") continue; // "all" is a virtual genre — skip
    const envKey = `PLAYLIST_ID_${genre.toUpperCase()}`;
    const playlistId = process.env[envKey] || null;
    await sql`
      INSERT INTO playlist_mappings (genre, spotify_playlist_id, playlist_name)
      VALUES (${genre}, ${playlistId}, ${"Playlist Machine — " + genre.charAt(0).toUpperCase() + genre.slice(1)})
      ON CONFLICT (genre) DO NOTHING
    `;
  }
  // Also seed "all" genre mapping
  const allPlaylistId = process.env.PLAYLIST_ID_ALL || null;
  await sql`
    INSERT INTO playlist_mappings (genre, spotify_playlist_id, playlist_name)
    VALUES ('all', ${allPlaylistId}, 'Playlist Machine — All')
    ON CONFLICT (genre) DO NOTHING
  `;
}
