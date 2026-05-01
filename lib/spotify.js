let cachedToken = null;
let tokenExpiry = 0;

export async function getSpotifyToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Spotify auth failed: ${await res.text()}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// Spotify editorial playlist IDs — stable, high-quality discovery sources
const EDITORIAL_PLAYLIST_IDS = [
  "37i9dQZF1DX4JAvHpjipBk", // New Music Friday
  "37i9dQZF1DWWjGdmHm4h6p", // Fresh Finds
  "37i9dQZF1DX2Nc3B70tvx0", // Fresh Finds: Indie
  "37i9dQZF1DX2RxBh64BHjQ", // Fresh Finds: Hip-Hop
  "37i9dQZF1DXdbXrPNafg9d", // All New Indie
  "37i9dQZF1DX0XUsuxWHRQd", // New in Hip-Hop
  "37i9dQZF1DX4W3aJJYCDfV", // New Music Friday UK
  "37i9dQZF1DX4dyzvuaRJ0n", // mint (Electronic)
  "37i9dQZF1DWUa8ZRTfalHk", // Radar: First Listens
  "37i9dQZF1DX1lVhptIYRda", // Hot Hits USA
  "37i9dQZF1DXcBWIGoYBM5M", // Today's Top Hits
  "37i9dQZF1DX10zKzsJ2jva", // Viva Latino
  "37i9dQZF1DWXRqgorJj26U", // Rock This
  "37i9dQZF1DX4SBhb3fqCJd", // Are & Be (R&B)
  "37i9dQZF1DX0h0QnLkMBl4", // Peaceful Piano
  "37i9dQZF1DXcF6B6QPhFDv", // Jazz Vibes
];

const CATEGORY_IDS = [
  "pop", "hiphop", "rock", "indie", "rnb",
  "electronic", "country", "latin", "punk", "metal",
];

export async function discoverPlaylists() {
  const token = await getSpotifyToken();
  const seen = new Set();
  const playlists = [];

  // Start with known editorial playlists
  for (const id of EDITORIAL_PLAYLIST_IDS) {
    if (!seen.has(id)) { seen.add(id); playlists.push(id); }
  }

  // Fetch featured playlists
  try {
    const res = await fetch(
      "https://api.spotify.com/v1/browse/featured-playlists?country=US",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      for (const p of data.playlists?.items || []) {
        if (p?.id && !seen.has(p.id)) { seen.add(p.id); playlists.push(p.id); }
      }
    }
  } catch {}

  // Fetch top playlists per category
  for (const categoryId of CATEGORY_IDS) {
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/browse/categories/${categoryId}/playlists?country=US`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const p of data.playlists?.items || []) {
          if (p?.id && !seen.has(p.id)) { seen.add(p.id); playlists.push(p.id); }
        }
      }
    } catch {}
  }

  return playlists;
}

export async function fetchPlaylist(playlistId) {
  const token = await getSpotifyToken();
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,followers,owner,images,tracks.total,public`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Playlist fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchTrackPopularities(trackIds) {
  const token = await getSpotifyToken();
  const results = {};
  for (let i = 0; i < trackIds.length; i += 50) {
    const batch = trackIds.slice(i, i + 50);
    const res = await fetch(
      `https://api.spotify.com/v1/tracks?ids=${batch.join(",")}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) continue;
    const data = await res.json();
    for (const track of data.tracks || []) {
      if (track) results[track.id] = track.popularity;
    }
  }
  return results;
}

export async function fetchPlaylistTracks(playlistId) {
  const token = await getSpotifyToken();
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(added_at,track(id,name,artists,album(name,images),external_urls,preview_url,popularity)),next`;

  while (url && tracks.length < 200) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    for (const item of data.items || []) {
      if (item?.track?.id) tracks.push(item);
    }
    url = data.next;
  }
  return tracks;
}
