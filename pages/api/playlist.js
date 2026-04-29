// pages/api/playlist.js
// Server-side API route — credentials never exposed to browser

const getSpotifyToken = async () => {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify auth failed: ${err}`);
  }

  const data = await res.json();
  return data.access_token;
};

const fetchPlaylistData = async (token, playlistId) => {
  const [playlistRes, tracksRes] = await Promise.all([
    fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name,description,followers,owner,images,tracks.total,public`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50&fields=items(added_at,track(id,name,artists,album(name,images),external_urls,preview_url)),next`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);

  if (!playlistRes.ok) {
    const err = await playlistRes.text();
    throw new Error(`Playlist fetch failed: ${playlistRes.status} ${err}`);
  }

  const playlist = await playlistRes.json();
  const tracksData = await tracksRes.json();

  const tracks = (tracksData.items || [])
    .filter((item) => item?.track?.id)
    .map((item) => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists.map((a) => a.name).join(", "),
      album: item.track.album.name,
      albumArt:
        item.track.album.images?.[1]?.url ||
        item.track.album.images?.[0]?.url ||
        null,
      addedAt: item.added_at,
      spotifyUrl: item.track.external_urls?.spotify || null,
      previewUrl: item.track.preview_url || null,
    }));

  return {
    playlist: {
      name: playlist.name,
      description: playlist.description || "",
      owner: playlist.owner?.display_name || playlist.owner?.id || "Unknown",
      followers: playlist.followers?.total ?? 0,
      totalTracks: playlist.tracks?.total ?? tracks.length,
      image: playlist.images?.[0]?.url || null,
      public: playlist.public,
    },
    tracks,
  };
};

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { playlistId } = req.query;

  if (!playlistId || !/^[a-zA-Z0-9]+$/.test(playlistId)) {
    return res.status(400).json({ error: "Invalid playlist ID" });
  }

  try {
    const token = await getSpotifyToken();
    const data = await fetchPlaylistData(token, playlistId);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Spotify API error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
