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

const EDITORIAL_PLAYLIST_IDS = [
  "37i9dQZF1DX4JAvHpjipBk",
  "37i9dQZF1DWWjGdmHm4h6p",
  "37i9dQZF1DX2Nc3B70tvx0",
  "37i9dQZF1DX2RxBh64BHjQ",
  "37i9dQZF1DXdbXrPNafg9d",
  "37i9dQZF1DX0XUsuxWHRQd",
  "37i9dQZF1DX4W3aJJYCDfV",
  "37i9dQZF1DX4dyzvuaRJ0n",
  "37i9dQZF1DWUa8ZRTfalHk",
  "37i9dQZF1DX1lVhptIYRda",
  "37i9dQZF1DXcBWIGoYBM5M",
  "37i9dQZF1DX10zKzsJ2jva",
  "37i9dQZF1DXWXRqgorJj26U",
  "37i9dQZF1DX4SBhb3fqCJd",
  "37i9dQZF1DX0h0QnLkMBl4",
  "37i9dQZF1DXcF6B6QPhFDv",
];

const CATEGORY_IDS = [
  "pop", "hiphop", "rock", "indie", "rnb",
  "electronic", "country", "latin", "punk", "metal",
];

export async function discoverPlaylists() {
  const token = await getSpotifyToken();
  const seen = new Set();
  const playlists = [];

  for (const id of EDITORIAL_PLAYLIST_IDS) {
    if (!seen.has(id)) { seen.add(id); playlists.push(id); }
  }

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
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Playlist fetch failed: ${res.status} ${await res.text()}`);
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
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;

  while (url && tracks.length < 200) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error(`fetchPlaylistTracks ${playlistId} failed: ${res.status} ${await res.text()}`);
      break;
    }
    const data = await res.json();
    for (const item of data.items || []) {
      if (item?.track?.id) tracks.push(item);
    }
    url = data.next;
  }
  return tracks;
}
