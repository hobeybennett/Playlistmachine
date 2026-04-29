import { sql } from "@vercel/postgres";
export { sql };

export async function runMigrations() {
  await sql`
    CREATE TABLE IF NOT EXISTS curators (
      id SERIAL PRIMARY KEY,
      spotify_playlist_id VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(500),
      owner_name VARCHAR(500),
      follower_count INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      score FLOAT DEFAULT 50,
      hit_accuracy FLOAT DEFAULT 0,
      lead_time_score FLOAT DEFAULT 0,
      call_volume INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS snapshots (
      id SERIAL PRIMARY KEY,
      curator_id INTEGER REFERENCES curators(id) ON DELETE CASCADE,
      taken_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS snapshot_tracks (
      id SERIAL PRIMARY KEY,
      snapshot_id INTEGER REFERENCES snapshots(id) ON DELETE CASCADE,
      spotify_track_id VARCHAR(100) NOT NULL,
      track_name VARCHAR(500),
      artist VARCHAR(500),
      album VARCHAR(500),
      album_art TEXT,
      spotify_url TEXT,
      playlist_added_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS track_adds (
      id SERIAL PRIMARY KEY,
      spotify_track_id VARCHAR(100) NOT NULL,
      curator_id INTEGER REFERENCES curators(id) ON DELETE CASCADE,
      track_name VARCHAR(500),
      artist VARCHAR(500),
      album VARCHAR(500),
      album_art TEXT,
      spotify_url TEXT,
      preview_url TEXT,
      playlist_added_at TIMESTAMPTZ,
      detected_at TIMESTAMPTZ DEFAULT NOW(),
      popularity INTEGER DEFAULT 0,
      UNIQUE(spotify_track_id, curator_id)
    )
  `;

  return { ok: true };
}
