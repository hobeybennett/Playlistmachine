# Playlist Machine — Claude Code Guide

## What this is

A Next.js app that tracks emerging music by monitoring Spotify playlist curators. Each time a curator adds a track, it's recorded. Tracks that appear across many high-reputation playlists early rise to the top of the chart.

## MCP Servers

This project is configured with two MCP servers in `.claude/settings.json`:

- **Spotify** (`https://mcp.spotify.com/sse`) — search playlists, get currently playing, create playlists
- **Vercel** (`https://mcp.vercel.com/sse`) — list deployments, check logs, deploy

### Using Spotify MCP to find curators

The main workflow is discovering good curator playlists and adding them via the API:

```
Search: "emerging indie music curators with high followers"
→ get playlist ID from result URI (e.g. spotify:playlist/37i9dQZF1DX...)
→ POST /api/curators { playlistUrl: "https://open.spotify.com/playlist/..." }
```

Playlists with 100+ followers are auto-approved and tracked from the next cron cycle.

## Key files

| File | Purpose |
|------|---------|
| `pages/api/cron/poll.js` | Polls all approved curators, detects new track adds |
| `pages/api/curators/index.js` | GET leaderboard, POST submit new curator |
| `pages/api/chart.js` | Weighted emerging-tracks chart (24h/72h/7d windows) |
| `lib/scoring.js` | Curator score computation |
| `lib/spotify.js` | Spotify client-credentials helpers |
| `lib/db.js` | Neon postgres wrapper |

## Environment variables

See `.env.example` for all required vars. Set them in Vercel dashboard or a local `.env.local`.

## Database

Run migrations once after setting `POSTGRES_URL`:

```
GET /api/migrate
```

Creates tables: `curators`, `snapshots`, `snapshot_tracks`, `track_adds`.

## Cron

`vercel.json` schedules `/api/cron/poll` every 6 hours. Authenticated via `Authorization: Bearer $CRON_SECRET` header set by Vercel.
