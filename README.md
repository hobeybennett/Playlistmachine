# Playlist Machine

> Track which playlist curators are adding tracks before they blow up.

A Hype Machine-style app for the streaming era — instead of tracking music blogs, it tracks playlist adds and scores curators by their historical ability to spot hits early.

## Stack

- **Next.js 15** (React + API routes)
- **Vercel** (hosting + serverless functions + cron)
- **Neon** (Postgres database)
- **Spotify Web API** (playlist + track data)

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/hobeybennett/Playlistmachine.git
cd Playlistmachine
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in all four values — see `.env.example` for details:
- `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` from [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
- `POSTGRES_URL` from [neon.tech](https://neon.tech)
- `CRON_SECRET` — any random string (e.g. `openssl rand -hex 32`)

### 3. Run migrations

```bash
curl -X POST http://localhost:3000/api/migrate \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 4. Add curator playlists

Go to `/curators` and paste in public Spotify playlist URLs. Playlists with 100+ followers auto-approve.

### 5. Run locally

```bash
npm run dev
```

---

## How It Works

### The Score

Each track gets a **Weighted Score** based on which curators added it and how good those curators' track records are:

| Factor | Weight | Description |
|--------|--------|-------------|
| Hit Accuracy | 50% | % of this curator's adds that later hit 1M+ streams |
| Lead Time | 35% | How many days early they added vs. other curators |
| Call Volume | 15% | Consistency — total number of tracks scored |

### The Feed

A cron job (`/api/cron/poll`) runs every 6 hours, diffs each approved curator's playlist, and records new adds to `track_adds`. Tracks rise on the chart when multiple curators add them within a rolling time window.

### Architecture

```
Vercel Cron (6h)
  → /api/cron/poll
  → Spotify API: fetch each curator's playlist
  → Diff against known track_adds
  → INSERT new adds → Neon Postgres
  → Recompute curator scores

Browser → / (chart, 24h/72h/7d windows)
       → /curators (leaderboard + submission)
       → /track/[id] (detail + velocity)
         ↓
       /api/chart, /api/curators, /api/tracks/[id]
         ↓
       Neon Postgres
```

## Claude Code / MCP

This project is configured for Claude Code with Spotify and Vercel MCP servers — see `.claude/settings.json` and `CLAUDE.md`.
