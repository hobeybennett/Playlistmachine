import { sql } from "../../../lib/db.js";
import { recomputeAllTrackScores } from "../../../lib/ranking.js";

const GENRES = ["rock", "pop", "alternative", "rap", "metal", "hardcore", "punk", "electronic", "dance"];

const TEST_TRACKS = [
  { id: "test_001", name: "Glass Ceiling", artist: "Pale Wave Theory", genres: ["rock", "alternative"], popularity: 84, growth: 72, explicit: false },
  { id: "test_002", name: "Carbon Night", artist: "MXNX", genres: ["electronic", "dance"], popularity: 91, growth: 88, explicit: false },
  { id: "test_003", name: "Dopamine Rush", artist: "Fever Channel", genres: ["pop"], popularity: 78, growth: 55, explicit: false },
  { id: "test_004", name: "No Signal", artist: "Static Bloom", genres: ["alternative", "rock"], popularity: 66, growth: 60, explicit: false },
  { id: "test_005", name: "Ultraviolet", artist: "Neon Colossus", genres: ["electronic"], popularity: 88, growth: 45, explicit: false },
  { id: "test_006", name: "Knife Song", artist: "Burial Mound", genres: ["metal", "hardcore"], popularity: 55, growth: 80, explicit: true },
  { id: "test_007", name: "Soft Machine", artist: "Lumen Drift", genres: ["pop", "alternative"], popularity: 73, growth: 30, explicit: false },
  { id: "test_008", name: "Pressure Drop", artist: "Sable Coast", genres: ["rock"], popularity: 61, growth: 20, explicit: false },
  { id: "test_009", name: "Boneyard Rave", artist: "VVULF", genres: ["dance", "electronic"], popularity: 80, growth: 65, explicit: true },
  { id: "test_010", name: "Porcelain Teeth", artist: "Narrow Gauge", genres: ["punk", "hardcore"], popularity: 48, growth: 90, explicit: true },
  { id: "test_011", name: "Second Skin", artist: "Halo Meridian", genres: ["pop"], popularity: 82, growth: 25, explicit: false },
  { id: "test_012", name: "Acid Rain Season", artist: "Dead Pivot", genres: ["rap"], popularity: 76, growth: 50, explicit: true },
  { id: "test_013", name: "Chrome Wolves", artist: "The Rust Assembly", genres: ["rock", "metal"], popularity: 58, growth: 40, explicit: false },
  { id: "test_014", name: "Low Earth Orbit", artist: "Subframe", genres: ["electronic", "alternative"], popularity: 69, growth: 35, explicit: false },
  { id: "test_015", name: "Heaven Adjacent", artist: "Bloom Protocol", genres: ["pop", "dance"], popularity: 85, growth: 70, explicit: false },
  { id: "test_016", name: "Trauma Bond", artist: "Kira Null", genres: ["rap", "alternative"], popularity: 74, growth: 55, explicit: true },
  { id: "test_017", name: "Flesh Signal", artist: "Body Count Rises", genres: ["metal"], popularity: 52, growth: 85, explicit: true },
  { id: "test_018", name: "Golden Ratio", artist: "Parallax Sound", genres: ["electronic"], popularity: 64, growth: 28, explicit: false },
  { id: "test_019", name: "Soft Power", artist: "Celeste Margin", genres: ["pop", "alternative"], popularity: 79, growth: 42, explicit: false },
  { id: "test_020", name: "Midnight Kernel", artist: "Sleep Data", genres: ["electronic", "dance"], popularity: 71, growth: 60, explicit: false },
  { id: "test_021", name: "Dirt Nap", artist: "Hollow Point Kids", genres: ["punk", "rock"], popularity: 45, growth: 75, explicit: true },
  { id: "test_022", name: "Serotonin Cycle", artist: "Patient Zero", genres: ["rap"], popularity: 83, growth: 45, explicit: true },
  { id: "test_023", name: "Glass Jaw", artist: "Nerve Damage", genres: ["hardcore", "punk"], popularity: 40, growth: 92, explicit: true },
  { id: "test_024", name: "Burn Rate", artist: "Compound Eye", genres: ["alternative"], popularity: 60, growth: 38, explicit: false },
  { id: "test_025", name: "North Star Protocol", artist: "Drift Engine", genres: ["electronic", "rock"], popularity: 72, growth: 55, explicit: false },
  { id: "test_026", name: "Velvet Guillotine", artist: "House of Ruin", genres: ["pop", "dance"], popularity: 88, growth: 30, explicit: false },
  { id: "test_027", name: "Fault Lines", artist: "Terra Breach", genres: ["rock", "alternative"], popularity: 65, growth: 48, explicit: false },
  { id: "test_028", name: "Machine Dream", artist: "Oxide Theory", genres: ["electronic"], popularity: 76, growth: 62, explicit: false },
  { id: "test_029", name: "Void Passenger", artist: "SABLE", genres: ["rap", "electronic"], popularity: 81, growth: 40, explicit: true },
  { id: "test_030", name: "Phantom Signal", artist: "Ghost Lattice", genres: ["alternative", "pop"], popularity: 70, growth: 35, explicit: false },
  { id: "test_031", name: "Frequency War", artist: "Jam Tide", genres: ["dance"], popularity: 86, growth: 68, explicit: false },
  { id: "test_032", name: "Surface Tension", artist: "Liquid Veil", genres: ["pop"], popularity: 77, growth: 22, explicit: false },
  { id: "test_033", name: "Basement Prophecy", artist: "The Long Funeral", genres: ["punk", "hardcore"], popularity: 38, growth: 78, explicit: true },
  { id: "test_034", name: "Signal Decay", artist: "Pattern Loss", genres: ["rock"], popularity: 55, growth: 30, explicit: false },
  { id: "test_035", name: "Open Wound Season", artist: "Ruin Collective", genres: ["metal", "hardcore"], popularity: 48, growth: 82, explicit: true },
  { id: "test_036", name: "Synthetic Bloom", artist: "Petal Circuit", genres: ["pop", "electronic"], popularity: 84, growth: 50, explicit: false },
  { id: "test_037", name: "Cascade Failure", artist: "System Down", genres: ["alternative", "rock"], popularity: 62, growth: 44, explicit: false },
  { id: "test_038", name: "Warm Static", artist: "Fever Tape", genres: ["electronic", "alternative"], popularity: 68, growth: 58, explicit: false },
  { id: "test_039", name: "Body Language", artist: "Mirror Stage", genres: ["rap", "pop"], popularity: 90, growth: 35, explicit: true },
  { id: "test_040", name: "Thin Air", artist: "Altitude Club", genres: ["dance"], popularity: 75, growth: 70, explicit: false },
  { id: "test_041", name: "Decade of Rain", artist: "Flood Season", genres: ["rock", "alternative"], popularity: 57, growth: 25, explicit: false },
  { id: "test_042", name: "Night Protocol", artist: "Covert Signal", genres: ["electronic"], popularity: 72, growth: 45, explicit: false },
  { id: "test_043", name: "Teeth and Thunder", artist: "Pale Riot", genres: ["punk", "metal"], popularity: 44, growth: 88, explicit: true },
  { id: "test_044", name: "Colour Me Blind", artist: "Spectrum Loss", genres: ["pop", "alternative"], popularity: 80, growth: 40, explicit: false },
  { id: "test_045", name: "Terminal Velocity", artist: "Last Override", genres: ["rap"], popularity: 78, growth: 55, explicit: true },
  { id: "test_046", name: "Liquid Architecture", artist: "Form Without Content", genres: ["electronic", "dance"], popularity: 66, growth: 62, explicit: false },
  { id: "test_047", name: "Static Noise Floor", artist: "Dead Channel", genres: ["rock"], popularity: 50, growth: 30, explicit: false },
  { id: "test_048", name: "Power Ballad for the End", artist: "Sundown Hymnal", genres: ["rock", "pop"], popularity: 73, growth: 20, explicit: false },
  { id: "test_049", name: "Scar Tissue Season", artist: "Wound Theory", genres: ["hardcore", "metal"], popularity: 42, growth: 95, explicit: true },
  { id: "test_050", name: "Forever Forward", artist: "Momentum Drive", genres: ["pop", "dance"], popularity: 92, growth: 60, explicit: false },
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Insert tracks
    let inserted = 0;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

    for (const t of TEST_TRACKS) {
      const releaseDate = `2025-0${Math.floor(Math.random() * 4) + 1}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
      const imageIndex = parseInt(t.id.replace("test_", ""), 10);

      const { rows } = await sql`
        INSERT INTO tracks (
          spotify_track_id, spotify_uri, name, artists, album_name,
          image_url, external_url, popularity, genres, release_date, explicit,
          duration_ms, popularity_score, growth_score, vote_score, final_score,
          last_spotify_fetch_at, created_at, updated_at
        ) VALUES (
          ${t.id},
          ${"spotify:track:" + t.id},
          ${t.name},
          ${t.artist},
          ${t.artist + " — Test Album"},
          ${"https://picsum.photos/seed/" + t.id + "/300/300"},
          ${"https://open.spotify.com/track/" + t.id},
          ${t.popularity},
          ${t.genres},
          ${releaseDate},
          ${t.explicit},
          ${180000 + Math.floor(Math.random() * 120000)},
          ${t.popularity},
          ${t.growth},
          ${0},
          ${0.5 * t.popularity + 0.35 * t.growth},
          NOW(), NOW(), NOW()
        )
        ON CONFLICT (spotify_track_id) DO UPDATE SET
          popularity = EXCLUDED.popularity,
          growth_score = EXCLUDED.growth_score,
          updated_at = NOW()
        RETURNING id, (xmax = 0) AS is_new
      `;
      if (rows[0]?.is_new) inserted++;

      const trackId = rows[0]?.id;
      if (!trackId) continue;

      // Seed 3 days of snapshots so growth score kicks in
      for (const [date, popOffset] of [
        [twoDaysAgo, -Math.floor(t.growth / 8)],
        [yesterday,  -Math.floor(t.growth / 16)],
        [today,      0],
      ]) {
        await sql`
          INSERT INTO daily_snapshots (track_id, snapshot_date, spotify_popularity, vote_count)
          VALUES (${trackId}, ${date}::date, ${Math.max(0, t.popularity + popOffset)}, 0)
          ON CONFLICT (track_id, snapshot_date) DO NOTHING
        `;
      }

      // Give some tracks a few votes
      if (t.growth >= 75) {
        const voteCount = Math.floor(t.growth / 10);
        for (let v = 0; v < voteCount; v++) {
          await sql`
            INSERT INTO votes (track_id, visitor_hash, created_at)
            VALUES (${trackId}, ${"test_visitor_" + t.id + "_" + v}, NOW())
            ON CONFLICT (track_id, visitor_hash) DO NOTHING
          `;
        }
      }
    }

    await recomputeAllTrackScores();

    return res.status(200).json({ ok: true, inserted, total: TEST_TRACKS.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
