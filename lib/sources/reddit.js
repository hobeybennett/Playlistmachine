const SUBREDDITS = [
  "listentothis",
  "indieheads",
  "hiphopheads",
  "popheads",
  "rnb",
  "electronicmusic",
];

// r/listentothis enforces "Artist — Title [Genre] (Year)"; others are looser but mostly follow it.
const TITLE_RE = /^(.+?)\s*[-–—]\s*(.+?)(?:\s*[\[\(\|]|$)/;

function parseTitle(title) {
  const m = title.match(TITLE_RE);
  if (!m) return null;
  return { artist: m[1].trim(), title: m[2].trim() };
}

// Reddit blocks unauthenticated server requests. Use OAuth client_credentials when
// REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set; fall back to public API otherwise.
let _redditToken = null;
let _redditTokenExpiry = 0;

async function getRedditToken() {
  if (_redditToken && Date.now() < _redditTokenExpiry) return _redditToken;
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET } = process.env;
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET) return null;

  const credentials = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "PlaylistMachine/1.0 (server)",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit OAuth failed: ${res.status}`);
  const data = await res.json();
  _redditToken = data.access_token;
  _redditTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _redditToken;
}

export async function fetchRedditTracks(subreddits = SUBREDDITS, sort = "hot", limit = 25) {
  const results = [];
  const errors = [];

  let token = null;
  try { token = await getRedditToken(); } catch (e) { errors.push({ note: `Reddit OAuth: ${e.message}` }); }

  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const headers = {
    "User-Agent": "PlaylistMachine/1.0 (server)",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  for (const sub of subreddits) {
    try {
      const res = await fetch(
        `${base}/r/${sub}/${sort}.json?limit=${limit}&t=week`,
        { headers }
      );
      if (!res.ok) { errors.push({ sub, status: res.status }); continue; }
      const data = await res.json();
      for (const child of data?.data?.children || []) {
        const post = child?.data;
        if (!post?.title || post.is_self) continue;
        const parsed = parseTitle(post.title);
        if (!parsed) continue;
        results.push({
          artist: parsed.artist,
          title: parsed.title,
          upvotes: post.score || 0,
          url: `https://reddit.com${post.permalink}`,
          subreddit: sub,
          createdAt: new Date((post.created_utc || 0) * 1000).toISOString(),
        });
      }
    } catch (e) {
      errors.push({ sub, error: e.message });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return { posts: results, errors };
}
