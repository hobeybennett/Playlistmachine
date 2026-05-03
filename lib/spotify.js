import { getSetting, setSetting } from "./db.js";

// ── Request throttle — 5 req/s max across all Spotify API calls ──────────────
// Ticket-based: each caller atomically claims the next available slot, then
// waits until that slot's time before firing. Handles concurrent callers safely.
let _nextSlot = 0;
const SLOT_MS = 200; // 1000ms / 5 req/s

// All Spotify API calls go through this — enforces rate limit + 5s hard timeout.
async function spotifyFetch(url, options = {}, _isRetry = false) {
  // Claim a slot and wait for it
  const mySlot = Math.max(_nextSlot, Date.now());
  _nextSlot = mySlot + SLOT_MS;
  const wait = mySlot - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let res;
  try {
    res = await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429 && !_isRetry) {
    const retryAfter = parseInt(res.headers.get("Retry-After") || "10", 10);
    console.warn(`[spotify] 429 — waiting ${retryAfter}s then retrying once`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(url, options, true);
  }

  return res;
}

// ── Client-credentials token (for metadata reads: tracks, artists, albums) ───
let cachedToken = null;
let tokenExpiry = 0;
let tokenPromise = null;

export async function getSpotifyToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    const credentials = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let res;
    try {
      res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new Error(`Spotify auth failed: ${await res.text()}`);
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
  })().finally(() => { tokenPromise = null; });

  return tokenPromise;
}

// ── User OAuth token (for playlist reads AND writes) ─────────────────────────
// Loaded from env var SPOTIFY_REFRESH_TOKEN or from DB app_settings
let userToken = null;
let userTokenExpiry = 0;

export async function getUserToken() {
  if (userToken && Date.now() < userTokenExpiry) return userToken;

  // Prefer env var, fall back to DB-stored token (set via OAuth callback)
  let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  if (!refreshToken) {
    try { refreshToken = await getSetting("spotify_refresh_token"); } catch {}
  }
  if (!refreshToken) throw new Error("No Spotify refresh token — complete OAuth setup in Admin → Connect Spotify");

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });

  if (!res.ok) throw new Error(`Spotify user auth failed: ${await res.text()}`);
  const data = await res.json();
  userToken = data.access_token;
  userTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  // Persist rotated refresh token back to DB
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    console.log("[spotify] Refresh token rotated — saving new token to DB");
    try { await setSetting("spotify_refresh_token", data.refresh_token); } catch {}
  }
  return userToken;
}

// Returns user token if available, otherwise client-credentials token.
// Playlist read endpoints (403 with client creds) require user token.
async function getReadToken() {
  try { return await getUserToken(); } catch {}
  return getSpotifyToken();
}

const market = () => process.env.SPOTIFY_MARKET || "AU";

// ── Playlist discovery ───────────────────────────────────────────────────────
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
  const token = await getReadToken();
  const seen = new Set();
  const playlists = [];

  for (const id of EDITORIAL_PLAYLIST_IDS) {
    if (!seen.has(id)) { seen.add(id); playlists.push(id); }
  }

  // Featured playlists
  try {
    const res = await spotifyFetch(
      `https://api.spotify.com/v1/browse/featured-playlists?country=${market()}&limit=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      for (const p of data.playlists?.items || []) {
        if (p?.id && !seen.has(p.id)) { seen.add(p.id); playlists.push(p.id); }
      }
    } else {
      console.warn(`[spotify] featured-playlists ${res.status}`);
    }
  } catch (e) {
    console.warn("[spotify] featured-playlists error:", e.message);
  }

  // Category playlists
  for (const categoryId of CATEGORY_IDS) {
    try {
      const res = await spotifyFetch(
        `https://api.spotify.com/v1/browse/categories/${categoryId}/playlists?country=${market()}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        for (const p of data.playlists?.items || []) {
          if (p?.id && !seen.has(p.id)) { seen.add(p.id); playlists.push(p.id); }
        }
      } else {
        console.warn(`[spotify] category/${categoryId} ${res.status}`);
      }
    } catch {}
  }

  return playlists;
}

// ── Track discovery via search (no Extended Quota needed) ────────────────────
// Spotify dev mode rejects limit > 10. We paginate with offset to compensate.
export async function searchTracks(query, limit = 10, offset = 0) {
  const token = await getSpotifyToken();
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${Math.min(limit, 10)}&offset=${offset}`;

  let res;
  try {
    res = await spotifyFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    throw new Error(`search network error (${query}): ${e.message}`);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`search failed ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.tracks?.items || []).filter((t) => t?.id);
}

// ── Single playlist metadata ─────────────────────────────────────────────────
// No market param — market causes 404 on editorial playlists outside that region
export async function fetchPlaylist(playlistId) {
  const token = await getReadToken();
  const res = await spotifyFetch(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Playlist fetch failed [${playlistId}]: ${res.status} ${body}`);
  }
  return res.json();
}

// ── Playlist tracks via metadata endpoint (avoids Extended Quota restriction) ─
// GET /playlists/{id} embeds up to 100 tracks without needing Extended Quota.
// The /playlists/{id}/tracks sub-endpoint requires Extended Quota → 403.
export async function fetchPlaylistTracks(playlistId, maxTracks = 100) {
  const token = await getSpotifyToken();

  let res;
  try {
    res = await spotifyFetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?market=${market()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    console.error(`[spotify] fetchPlaylistTracks network error [${playlistId}]:`, e.message);
    return [];
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[spotify] fetchPlaylistTracks [${playlistId}] failed: ${res.status} ${body.slice(0, 200)}`);
    return [];
  }

  const data = await res.json();
  const items = (data.tracks?.items || [])
    .filter((item) => item?.track?.id && !item.is_local)
    .slice(0, maxTracks);

  console.log(`[spotify] fetchPlaylistTracks [${playlistId}]: ${items.length} tracks (total in playlist: ${data.tracks?.total ?? "?"})`);
  return items;
}

// ── Batch-fetch track popularities ──────────────────────────────────────────
export async function fetchTrackPopularities(trackIds) {
  const token = await getSpotifyToken(); // client creds fine for track metadata
  const results = {};
  for (let i = 0; i < trackIds.length; i += 50) {
    const batch = trackIds.slice(i, i + 50);
    try {
      const res = await spotifyFetch(
        `https://api.spotify.com/v1/tracks?ids=${batch.join(",")}&market=${market()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) { console.warn(`[spotify] fetchTrackPopularities batch failed: ${res.status}`); continue; }
      const data = await res.json();
      for (const track of data.tracks || []) {
        if (track) results[track.id] = { popularity: track.popularity, raw: track };
      }
    } catch (e) {
      console.warn("[spotify] fetchTrackPopularities error:", e.message);
    }
  }
  return results;
}

// ── Batch-fetch full track objects ───────────────────────────────────────────
export async function fetchTracksFull(trackIds) {
  const token = await getSpotifyToken(); // client creds fine for track metadata
  const results = {};
  for (let i = 0; i < trackIds.length; i += 50) {
    const batch = trackIds.slice(i, i + 50);
    try {
      const res = await spotifyFetch(
        `https://api.spotify.com/v1/tracks?ids=${batch.join(",")}&market=${market()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) { console.warn(`[spotify] fetchTracksFull batch failed: ${res.status}`); continue; }
      const data = await res.json();
      for (const track of data.tracks || []) {
        if (track) results[track.id] = track;
      }
    } catch (e) {
      console.warn("[spotify] fetchTracksFull error:", e.message);
    }
  }
  return results;
}

// ── Batch-fetch artist objects (for genres) ──────────────────────────────────
export async function fetchArtistsBatch(artistIds) {
  const token = await getSpotifyToken(); // client creds fine for artist metadata
  const results = {};
  const unique = [...new Set(artistIds)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    try {
      const res = await spotifyFetch(
        `https://api.spotify.com/v1/artists?ids=${batch.join(",")}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) { console.warn(`[spotify] fetchArtistsBatch failed: ${res.status}`); continue; }
      const data = await res.json();
      for (const artist of data.artists || []) {
        if (artist) results[artist.id] = artist;
      }
    } catch (e) {
      console.warn("[spotify] fetchArtistsBatch error:", e.message);
    }
  }
  return results;
}

// ── Spotify user ID ──────────────────────────────────────────────────────────
export async function getSpotifyUserId() {
  const token = await getUserToken();
  const res = await spotifyFetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get user profile: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

// ── Create a new playlist ────────────────────────────────────────────────────
export async function createPlaylist(userId, name, description = "") {
  const token = await getUserToken();
  const res = await spotifyFetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, description, public: true }),
  });
  if (!res.ok) throw new Error(`createPlaylist failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Replace playlist tracks (chunked, retry on 429) ──────────────────────────
export async function updatePlaylist(playlistId, trackUris) {
  const token = await getUserToken();

  if (!trackUris.length) {
    const res = await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [] }),
    });
    if (!res.ok) throw new Error(`clearPlaylist failed: ${res.status} ${await res.text()}`);
    return (await res.json()).snapshot_id;
  }

  const putRes = await spotifyRequest(token, "PUT", `/v1/playlists/${playlistId}/tracks`, {
    uris: trackUris.slice(0, 100),
  });
  let snapshotId = putRes.snapshot_id;

  for (let i = 100; i < trackUris.length; i += 100) {
    const addRes = await spotifyRequest(token, "POST", `/v1/playlists/${playlistId}/tracks`, {
      uris: trackUris.slice(i, i + 100),
    });
    snapshotId = addRes.snapshot_id;
  }

  return snapshotId;
}

// ── Helper: Spotify API call with retry on 429 ───────────────────────────────
async function spotifyRequest(token, method, path, body, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await spotifyFetch(`https://api.spotify.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get("Retry-After") || "5", 10);
      console.warn(`[spotify] 429 on ${method} ${path}, waiting ${wait}s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Spotify ${method} ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  }
  throw new Error(`Spotify ${method} ${path} failed after ${retries} retries`);
}
