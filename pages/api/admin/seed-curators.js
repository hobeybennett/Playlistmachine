import { sql } from "../../../lib/db.js";

// Vetted curator list seeded from external playlist analytics tool.
// All playlists confirmed public and active as of May 2026.
const CURATORS = [
  { playlistId: "1K4EjTQOh9ko8ek0PFAT3Q", name: "Synth Pop Sugar | Best Retro & Modern Synthpop", ownerName: "Andy Korg", followers: 62633 },
  { playlistId: "53ZxnhxOrCxM7OyyLQV4tn", name: "Endless Summer", ownerName: "Goldroom", followers: 11235 },
  { playlistId: "0FGvb9h86ekDggMIQ0eY1C", name: "Funk Me I'm Famous!", ownerName: "Groover Obsessions", followers: 8518 },
  { playlistId: "7u8Iff4kR8CwW3z3lB8Tw9", name: "The Synth Dimension", ownerName: "Groover Obsessions", followers: 7999 },
  { playlistId: "5NmjndXiVxc4RWLQe6v1MQ", name: "Rolitas chill para vibrar acá chido ✨", ownerName: "memelistasmx", followers: 7286 },
  { playlistId: "64UZHUGqkpbewanecNwcKy", name: "brunchin' at federal", ownerName: "federal café", followers: 6646 },
  { playlistId: "0ATGNwGB3WNMWw4H5Pz4kh", name: "feel gOOd happy vibes", ownerName: "Zman Zbrah", followers: 5461 },
  { playlistId: "3dZhOiBYFca8OUSOwovrUV", name: "Dreamy Indie", ownerName: "kldscps", followers: 2893 },
  { playlistId: "0jOb5kvsusW0QcVYiC9CU5", name: "Just Kill Me", ownerName: "bxbby jxhnsxn", followers: 2367 },
  { playlistId: "25C8eXJZIrCkIJKEyqStKh", name: "Chill House Bangers 26", ownerName: "introvertdisco", followers: 2137 },
  { playlistId: "5QXxvezbtYCzc2b9BtBAGi", name: "INDIETRONICA GEMS - MKMGA Playlist", ownerName: "GA", followers: 2025 },
  { playlistId: "76b6NYdN8ct6Npd5OqwJIU", name: "mallsoft :: liminal vaporwave", ownerName: "gay and tired", followers: 920 },
  { playlistId: "1VqitzS2fk0ZUDIvjmkYOy", name: "Is This Shuttle ?", ownerName: "SHTTL", followers: 735 },
  { playlistId: "4W4Q6D0KMtdgDxGqyi5zPX", name: "TBS 2026", ownerName: "janispenka", followers: 457 },
  { playlistId: "5qgUPJLqzE2BWZNICMCAT4", name: "Hed Kandi The Summer Mix 2025", ownerName: "Chris Romero", followers: 456 },
  { playlistId: "58oWXRYhjUxAM0hrh5LRds", name: "Main 2026", ownerName: "Forky", followers: 451 },
  { playlistId: "7GeqJfnPznHcXt55piPWPZ", name: "California Back in Time | Nu Disco | French House", ownerName: "Letné", followers: 287 },
  { playlistId: "4B88HtNSnTmTsXVGT7F1Fr", name: "Música electrónica para vibrar alto 😎🪩", ownerName: "ANDREA GC", followers: 231 },
  { playlistId: "2BqZvzNSl98fpOwD8JkCom", name: "Mykonos Summer 🌀 ΜYΚΘΝΘΣ 😎", ownerName: "Ezquerro DJ ☑️", followers: 230 },
  { playlistId: "6CPLZ8ObUeDHWGLR1em7EE", name: "INDIETRONICA GEMS - CA Playlist", ownerName: "claudioamati-au", followers: 219 },
  { playlistId: "37i9dQZF1DZ06evO3rD7s9", name: "This Is Shuttle", ownerName: "Spotify", followers: 200 },
  { playlistId: "5raC2jW8U4PbyPReTXTW0Y", name: "VINYLSSHOP", ownerName: "Sjoerd Hilbrink", followers: 148 },
  { playlistId: "6wT1Mo9Ohmaz5AGUQHChoF", name: "federal spring sounds 25", ownerName: "federal café", followers: 139 },
  { playlistId: "7gtErVdEqOGSBo2WnUIunT", name: "Close My Eyes", ownerName: "Forky", followers: 129 },
  { playlistId: "1NgeplBrWFUjV76wVE1yed", name: "Soultronic Bounce", ownerName: "Adam Mcdowell", followers: 86 },
  { playlistId: "7fjs5XZMnJzzB7ZUXpBD0I", name: "Stradivarius October 2025", ownerName: "Stradivarius", followers: 66 },
  { playlistId: "6p8zIDMg5VRG07CGjUnidF", name: "Asal-Headache", ownerName: "Alexandre", followers: 66 },
  { playlistId: "6RI2bSuaJSqPTKtmipnlRH", name: "Hed Kandi Chilled 2026", ownerName: "georgemugen", followers: 37 },
  { playlistId: "0i4NYXjMRwnlFfF869Zi5Z", name: "impetu", ownerName: "sofiamedranop", followers: 31 },
  { playlistId: "1j9Pm9dUqHbfo0uGJREn8n", name: "Bakerman", ownerName: "Yuyun Simca", followers: 30 },
  { playlistId: "37i9dQZF1DZ06evO1FP6Bu", name: "This Is Lemonade Baby", ownerName: "Spotify", followers: 22 },
  { playlistId: "6XPGUmVW9GXvcexgMhZTEg", name: "Beginnings Radio", ownerName: "Mark Isi", followers: 17 },
  { playlistId: "3nEJvwANXULJtEF47CZ0q1", name: "Random", ownerName: "Tolga Yıldırım", followers: 11 },
  { playlistId: "7KM39xwVJM5oWYt1OrQq45", name: "SUGARbISTRO", ownerName: "Kevin Ten", followers: 10 },
  { playlistId: "6WS2Ywy3VeJBYEtKM7VXX6", name: "1. Radio Real Center Market", ownerName: "Curada Studio", followers: 7 },
  { playlistId: "0KcYVWrK0HDdmQrPnWFkR9", name: "Lilly Barrack Mix", ownerName: "lillymusic1104", followers: 7 },
  { playlistId: "2rk1JhjUgncvD0wfBVMKKK", name: "Isla golden hour", ownerName: "jan jan", followers: 6 },
  { playlistId: "1IqdBW7yXYODwOXEJJwOf8", name: "Pop house soft 2026 🌵", ownerName: "cris", followers: 1 },
  { playlistId: "55zfc2TrrRkIeNM6WjVMZa", name: "Eclectic Electric Vibeybops", ownerName: "Travers", followers: 0 },
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const results = { inserted: 0, skipped: 0, errors: [] };

  for (const c of CURATORS) {
    try {
      const { rows } = await sql`
        INSERT INTO curators (spotify_playlist_id, name, owner_name, follower_count, status, approved_at)
        VALUES (
          ${c.playlistId},
          ${c.name},
          ${c.ownerName},
          ${c.followers},
          'approved',
          NOW()
        )
        ON CONFLICT (spotify_playlist_id) DO UPDATE SET
          name          = EXCLUDED.name,
          owner_name    = EXCLUDED.owner_name,
          follower_count = EXCLUDED.follower_count,
          status        = 'approved',
          approved_at   = COALESCE(curators.approved_at, NOW())
        RETURNING id, (xmax = 0) AS inserted
      `;
      if (rows[0]?.inserted) results.inserted++;
      else results.skipped++;
    } catch (e) {
      results.errors.push({ playlistId: c.playlistId, error: e.message });
    }
  }

  return res.status(200).json({ ok: results.errors.length === 0, total: CURATORS.length, ...results });
}
