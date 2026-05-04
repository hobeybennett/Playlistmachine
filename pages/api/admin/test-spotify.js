import { getSpotifyToken } from "../../../lib/spotify.js";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = await getSpotifyToken();

    // Test search — the endpoint we now depend on for track discovery
    const searchParams = new URLSearchParams({ q: "year:2025", type: "track", limit: "3" });
    const r1 = await fetch(`https://api.spotify.com/v1/search?${searchParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchBody = await r1.text();
    let searchTracks = null;
    if (r1.status === 200) {
      try { searchTracks = JSON.parse(searchBody).tracks?.items?.map(t => t.name) ?? []; } catch {}
    }

    // Test search with market param — in case market is the problem
    const searchParamsAU = new URLSearchParams({ q: "year:2025", type: "track", limit: "3", market: "AU" });
    const r2 = await fetch(`https://api.spotify.com/v1/search?${searchParamsAU}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchBodyAU = await r2.text();
    let searchTracksAU = null;
    if (r2.status === 200) {
      try { searchTracksAU = JSON.parse(searchBodyAU).tracks?.items?.map(t => t.name) ?? []; } catch {}
    }

    // Test tag:new
    const searchParamsNew = new URLSearchParams({ q: "tag:new", type: "track", limit: "3" });
    const r3 = await fetch(`https://api.spotify.com/v1/search?${searchParamsNew}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const searchBodyNew = await r3.text();
    let searchTracksNew = null;
    if (r3.status === 200) {
      try { searchTracksNew = JSON.parse(searchBodyNew).tracks?.items?.map(t => t.name) ?? []; } catch {}
    }

    // Single track lookup — baseline token check
    const r4 = await fetch("https://api.spotify.com/v1/tracks/3n3Ppam7vgaVa1iaRUIOKE", {
      headers: { Authorization: `Bearer ${token}` },
    });

    return res.status(200).json({
      tokenOk: true,
      search_year2025_status: r1.status,
      search_year2025_tracks: searchTracks,
      search_year2025_withMarket_status: r2.status,
      search_year2025_withMarket_tracks: searchTracksAU,
      search_tagNew_status: r3.status,
      search_tagNew_tracks: searchTracksNew,
      search_errorBody: r1.status !== 200 ? searchBody.slice(0, 300) : null,
      trackLookup_status: r4.status,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
