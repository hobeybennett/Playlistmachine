# Playlist Machine 🎵

> Track which playlist curators are adding tracks before they blow up.

A Hype Machine-style app for the streaming era — instead of tracking music blogs, it tracks playlist adds and scores curators by their historical ability to spot hits early.

## Stack

- **Next.js** (React + API routes)
- **Vercel** (hosting + serverless functions)
- **Spotify Web API** (playlist + track data)

## Local Development

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/playlistmachine.git
cd playlistmachine
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env.local` and fill in your Spotify credentials:

```bash
cp .env.example .env.local
```

```env
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

Get credentials at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard).

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

### Manual steps

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add environment variables in Vercel dashboard:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
4. Deploy — Vercel auto-detects Next.js

---

## How It Works

### The Score

Each track gets a **Weighted Score** based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| Hit Accuracy | 50% | % of this curator's adds that later hit 1M+ streams |
| Lead Time | 35% | How many days early they added vs. other curators |
| Call Volume | 15% | Consistency — total number of tracks scored |

### The Feed

The site polls tracked playlists on a schedule, diffs the track lists, and records new adds. A track enters the chart when it gets adds from enough tracked playlists in the rolling time window. It ages off when adds stop.

### Architecture

```
Browser → /api/playlist (Next.js API route)
               ↓
        Spotify Token (server-side, credentials never exposed)
               ↓
        Spotify REST API → playlist + tracks
               ↓
        Enriched JSON → React UI
```

---

## Roadmap

- [ ] Curator leaderboard (ranked by Track Record Score)
- [ ] Genre filtering
- [ ] Curator submission flow
- [ ] Time-window charts (24h / 72h / 7d)
- [ ] Email/RSS alerts for new chart entries
- [ ] Spotify OAuth for personal playlist analysis

---

## Contributing

PRs welcome. Open an issue first for big changes.
