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

export async function fetchPlaylist(playlistId) {
  const token = await getSpotifyToken();
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,followers,owner,images,tracks.total,public`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Playlist fetch failed: ${res.status}`);
  return res.json();
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
