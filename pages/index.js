import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

const VOTE_STORAGE_KEY = "pm_voted_tracks";

function getVotedTracks() {
  try {
    return new Set(JSON.parse(localStorage.getItem(VOTE_STORAGE_KEY) || "[]"));
  } catch { return new Set(); }
}
function markVoted(id) {
  try {
    const set = getVotedTracks();
    set.add(id);
    localStorage.setItem(VOTE_STORAGE_KEY, JSON.stringify([...set]));
  } catch {}
}

function daysAgo(iso) {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function RankMovement({ current, yesterday }) {
  if (!yesterday) return <span style={{ fontSize: 8, color: "var(--accent)", letterSpacing: "0.04em" }}>NEW</span>;
  const diff = yesterday - current;
  if (diff === 0) return <span style={{ fontSize: 9, color: "var(--faint)" }}>—</span>;
  const up = diff > 0;
  return (
    <span style={{ fontSize: 8, color: up ? "var(--accent)" : "var(--hot)", letterSpacing: "0.02em" }}>
      {up ? "▲" : "▼"}{Math.abs(diff)}
    </span>
  );
}

function GrowthBadge({ growthScore }) {
  if (!growthScore || growthScore < 5) return null;
  const hot = growthScore >= 50;
  return (
    <span style={{
      display: "inline-block",
      fontSize: 8,
      padding: "2px 6px",
      borderRadius: 2,
      background: hot ? "rgba(255,85,85,0.15)" : "rgba(184,240,80,0.1)",
      color: hot ? "var(--hot)" : "var(--accent)",
      border: `1px solid ${hot ? "var(--hot)" : "var(--accent)"}`,
      letterSpacing: "0.05em",
      marginLeft: 6,
      verticalAlign: "middle",
    }}>
      {hot ? "↑↑ HOT" : "↑ RISING"}
    </span>
  );
}

function GenreBadge({ genre }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 8,
      padding: "1px 5px",
      borderRadius: 2,
      background: "var(--surface2)",
      color: "var(--muted)",
      border: "1px solid var(--border2)",
      letterSpacing: "0.04em",
      marginRight: 3,
      verticalAlign: "middle",
    }}>
      {genre}
    </span>
  );
}

function UpvoteButton({ trackId, spotifyId, initialCount, onVoted }) {
  const [count, setCount] = useState(initialCount || 0);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setVoted(getVotedTracks().has(spotifyId));
    setCount(initialCount || 0);
  }, [spotifyId, initialCount]);

  const handleVote = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (voted || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/votes/${spotifyId}`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setCount(data.voteCount);
        setVoted(true);
        markVoted(spotifyId);
        onVoted?.();
      } else if (data.alreadyVoted) {
        setVoted(true);
        markVoted(spotifyId);
        setCount(data.voteCount);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <button
      onClick={handleVote}
      disabled={voted || loading}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        background: "none", border: `1px solid ${voted ? "var(--accent)" : "var(--border2)"}`,
        borderRadius: 3, padding: "4px 8px", cursor: voted ? "default" : "pointer",
        color: voted ? "var(--accent)" : "var(--muted)",
        minWidth: 36, transition: "all 0.15s",
      }}
      title={voted ? "Already boosted" : "Boost this track"}
    >
      <span style={{ fontSize: 10, lineHeight: 1 }}>{voted ? "▲" : "△"}</span>
      <span style={{ fontSize: 8, marginTop: 2, letterSpacing: "0.03em" }}>{count}</span>
    </button>
  );
}

function TrackRow({ track, rank }) {
  const isHot = track.growth_score >= 50;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "52px 48px 1fr auto auto",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        borderLeft: isHot ? "2px solid var(--hot)" : "2px solid transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Rank + movement */}
      <div style={{ textAlign: "center", flexShrink: 0 }}>
        <div style={{
          fontSize: rank <= 3 ? 11 : 13,
          fontWeight: 700,
          color: rank <= 3 ? "var(--accent)" : "var(--muted)",
          lineHeight: 1,
        }}>
          {rank}
        </div>
        <div style={{ marginTop: 3 }}>
          <RankMovement current={rank} yesterday={track.rank_yesterday} />
        </div>
      </div>

      {/* Art */}
      {track.image_url ? (
        <img src={track.image_url} alt="" width={42} height={42}
          style={{ borderRadius: 3, objectFit: "cover", display: "block", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 42, height: 42, background: "var(--surface2)", borderRadius: 3, flexShrink: 0 }} />
      )}

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <a
            href={track.external_url || `https://open.spotify.com/track/${track.spotify_track_id}`}
            target="_blank" rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {track.name}
          </a>
          <GrowthBadge growthScore={track.growth_score} />
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {track.artists}
        </div>
        <div style={{ marginTop: 4, display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          {(track.genres || []).map((g) => <GenreBadge key={g} genre={g} />)}
          {track.first_seen && (
            <span style={{ fontSize: 11, color: "var(--faint)" }}>
              Added {daysAgo(track.first_seen)}
            </span>
          )}
        </div>
      </div>

      {/* Score */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 44 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: isHot ? "var(--hot)" : "var(--text)", lineHeight: 1 }}>
          {Math.round(track.final_score)}
        </div>
        <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 3 }}>
          {track.release_date ? `${Math.max(0, Math.floor((Date.now() - new Date(track.release_date)) / 86400000))}d old` : ""}
        </div>
      </div>

      {/* Upvote */}
      <UpvoteButton
        trackId={track.id}
        spotifyId={track.spotify_track_id}
        initialCount={track.vote_count}
      />
    </div>
  );
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, padding: "20px 16px", borderTop: "1px solid var(--border)" }}>
      <button
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        style={{ background: "none", border: "1px solid var(--border2)", color: "var(--muted)", padding: "5px 10px", fontSize: 10, cursor: page > 1 ? "pointer" : "default", borderRadius: 2, opacity: page > 1 ? 1 : 0.3 }}
      >
        ← Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPage(p)}
          style={{
            background: p === page ? "var(--accent)" : "none",
            border: `1px solid ${p === page ? "var(--accent)" : "var(--border2)"}`,
            color: p === page ? "#000" : "var(--muted)",
            padding: "5px 10px", fontSize: 10, cursor: "pointer", borderRadius: 2, fontWeight: p === page ? 700 : 400,
          }}
        >
          {p}
        </button>
      ))}
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
        style={{ background: "none", border: "1px solid var(--border2)", color: "var(--muted)", padding: "5px 10px", fontSize: 10, cursor: page < totalPages ? "pointer" : "default", borderRadius: 2, opacity: page < totalPages ? 1 : 0.3 }}
      >
        Next →
      </button>
    </div>
  );
}

const GENRES = ["rock", "pop", "alternative", "rap", "electronic", "dance", "metal", "punk", "hardcore"];

export default function Home() {
  const router = useRouter();
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1, genreCounts: {} });
  const [genre, setGenre] = useState(null);

  const page = Math.max(1, parseInt(router.query.page || "1", 10));

  const loadChart = useCallback(async (p, g) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: p });
      if (g) params.set("genre", g);
      const res = await fetch(`/api/charts?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load chart");
      setTracks(data.tracks);
      setMeta({ total: data.total, totalPages: data.totalPages, genreCounts: data.genreCounts || {} });
    } catch (e) {
      setError(e.message);
      setTracks([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    loadChart(page, genre);
  }, [page, genre, router.isReady, loadChart]);

  const navigate = (newPage) => {
    const query = newPage > 1 ? { page: newPage } : {};
    router.push({ pathname: "/", query }, undefined, { shallow: true });
  };

  const selectGenre = (g) => {
    setGenre(g);
    router.push({ pathname: "/" }, undefined, { shallow: true });
  };

  return (
    <>
      <Head>
        <title>Playlist Machine — Emerging Indie</title>
        <meta name="description" content="Daily-updated chart of emerging indie tracks, ranked by Spotify signals and community votes." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{ minHeight: "100vh" }}>
        {/* Grid background */}
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: "linear-gradient(rgba(184,240,80,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(184,240,80,0.018) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

        {/* Nav */}
        <nav style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(9,9,11,0.97)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 16,
          padding: "0 16px", height: 54,
        }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0, textDecoration: "none" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", animation: "glow 2s infinite" }} />
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15, letterSpacing: -0.3, color: "var(--text)" }}>
              PLAYLIST<span style={{ color: "var(--accent)" }}>MACHINE</span>
            </span>
          </Link>
          <div style={{ flex: 1 }} />
          <Link href="/admin" style={{ fontSize: 10, color: "var(--faint)", letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>
            Admin
          </Link>
        </nav>

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Genre tabs */}
          <div style={{
            display: "flex", alignItems: "center", gap: 2,
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "0 12px",
            position: "sticky", top: 54, zIndex: 99,
            overflowX: "auto", scrollbarWidth: "none",
          }}>
            {[null, ...GENRES].map((g) => {
              const active = genre === g;
              const count = g ? meta.genreCounts[g] : meta.total;
              return (
                <button
                  key={g ?? "all"}
                  onClick={() => selectGenre(g)}
                  style={{
                    flexShrink: 0,
                    background: "none", border: "none", cursor: "pointer",
                    padding: "10px 10px 8px",
                    fontSize: 10, fontWeight: active ? 700 : 400,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    color: active ? "var(--accent)" : "var(--muted)",
                    borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
                    transition: "color 0.15s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {g ?? "All"}{count > 0 ? ` ${count}` : ""}
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: "#1a0f0f", borderBottom: "1px solid var(--hot)", color: "#ff8888", padding: "10px 16px", fontSize: 11 }}>
              ⚠ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: "80px 16px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 5, height: 44 }}>
                {[0,1,2,3,4,5,6].map((i) => (
                  <div key={i} style={{ width: 4, background: "var(--accent)", borderRadius: 2, animation: `wave 1.2s ${i * 0.1}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && tracks.length === 0 && (
            <div style={{ padding: "100px 16px", textAlign: "center" }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "var(--surface2)", marginBottom: 16 }}>
                Chart loading
              </div>
              <div style={{ fontSize: 11, color: "var(--faint)", lineHeight: 1.8 }}>
                Tracks appear here after the next poll cycle.
              </div>
            </div>
          )}

          {/* Track list */}
          {!loading && tracks.map((track, i) => (
            <TrackRow
              key={track.spotify_track_id}
              track={track}
              rank={(page - 1) * 100 + i + 1}
              index={i}
            />
          ))}

          {/* Pagination */}
          {!loading && (
            <Pagination
              page={page}
              totalPages={meta.totalPages}
              onPage={(p) => navigate(p)}
            />
          )}
        </div>

        <footer style={{
          borderTop: "1px solid var(--border)",
          padding: "14px 16px",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
          fontSize: 9, color: "var(--faint)", letterSpacing: "0.05em",
          position: "relative", zIndex: 1,
        }}>
          <span>PLAYLIST MACHINE</span>
          <span>Ranking: 50% buzz · 30% recency · 20% votes</span>
          <span>Indie · updated every 6h</span>
        </footer>
      </div>
    </>
  );
}
