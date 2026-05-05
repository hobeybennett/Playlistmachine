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

export async function fetchRedditTracks(subreddits = SUBREDDITS, sort = "hot", limit = 25) {
  const results = [];
  const errors = [];

  for (const sub of subreddits) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/${sort}.json?limit=${limit}&t=week`,
        { headers: { "User-Agent": "PlaylistMachine/1.0" } }
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
    // Be courteous to Reddit's servers
    await new Promise((r) => setTimeout(r, 1000));
  }

  return { posts: results, errors };
}
