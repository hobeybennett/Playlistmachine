import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";

const daysAgo = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

function TrackRow({ track, rank, index }) {
  const isHot = rank <= 2;
  return (
    <Link href={`/track/${track.spotify_track_id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "32px 44px 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          borderLeft: isHot ? "3px solid var(--hot)" : "3px solid transparent",
          transition: "background 0.12s",
          animation: `fadeIn 0.3s ${index * 0.04}s both`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{
          textAlign: "center",
          fontFamily: "Georgia, serif",
          fontSize: rank <= 3 ? 9 : 12,
          fontWeight: 700,
          color: rank <= 3 ? "var(--accent)" : "var(--faint)",
          letterSpacing: rank <= 3 ? "0.06em" : 0,
        }}>
          {rank <= 3 ? "NEW" : rank}
        </div>

        {track.album_art ? (
          <img src={track.album_art} alt="" width={40} height={40}
            style={{ borderRadius: 2, objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: 40, height: 40, background: "var(--surface2)", borderRadius: 2 }} />
        )}

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {track.track_name}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {track.artist}
          </div>
          <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1 }}>
            {track.album} · First seen {daysAgo(track.first_seen)}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: "Georgia, serif",
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1,
            color: isHot ? "var(--hot)" : "var(--text)",
          }}>
            {Math.round(track.weighted_score)}
          </div>
          <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 1 }}>
            score
          </div>
          <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 4 }}>
            {track.add_count} {track.add_count === 1 ? "add" : "adds"}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Home() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeWindow, setActiveWindow] = useState("72h");
  const [error, setError] = useState(null);

  const loadChart = useCallback(async (w) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chart?window=${w}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load chart");
      setTracks(data.tracks);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadChart(activeWindow); }, [activeWindow, loadChart]);

  return (
    <>
      <Head>
        <title>Playlist Machine — Emerging Music Intelligence</title>
        <meta name="description" content="Track which playlist curators are adding tracks before they blow up." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div style={{ minHeight: "100vh", position: "relative" }}>
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: "linear-gradient(rgba(184,240,80,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(184,240,80,0.018) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

        <nav style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(9,9,11,0.97)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 24,
          padding: "0 24px", height: 54,
        }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0, textDecoration: "none" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", animation: "glow 2s infinite" }} />
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15, letterSpacing: -0.3, color: "var(--text)" }}>
              PLAYLIST<span style={{ color: "var(--accent)" }}>MACHINE</span>
            </span>
          </Link>

          <div style={{ flex: 1 }} />

          <Link href="/curators" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>
            Curators
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--hot)", flexShrink: 0 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--hot)" }} />
            LIVE
          </div>
        </nav>

        {error && (
          <div style={{ background: "#1a0f0f", borderBottom: "1px solid var(--hot)", color: "#ff8888", padding: "10px 24px", fontSize: 11, position: "relative", zIndex: 1 }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 24px", borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
              Emerging Tracks — Ranked by Curator Score
            </span>
            <div style={{ display: "flex" }}>
              {["24h", "72h", "7d"].map((w) => (
                <button key={w} onClick={() => setActiveWindow(w)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "4px 10px", fontSize: 9,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: activeWindow === w ? "var(--text)" : "var(--muted)",
                  borderBottom: activeWindow === w ? "2px solid var(--accent)" : "2px solid transparent",
                }}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div style={{ padding: "80px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 24 }}>
                Loading chart...
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 5, height: 44 }}>
                {[0,1,2,3,4,5,6].map((i) => (
                  <div key={i} style={{ width: 4, background: "var(--accent)", borderRadius: 2, animation: `wave 1.2s ${i * 0.1}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          )}

          {!loading && tracks.length === 0 && !error && (
            <div style={{ padding: "100px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "var(--surface2)", marginBottom: 16 }}>
                No tracks yet
              </div>
              <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 24 }}>
                Submit a curator playlist to start tracking emerging music.
              </div>
              <Link href="/curators" style={{
                display: "inline-block", fontSize: 10, fontWeight: 700,
                letterSpacing: "0.1em", textTransform: "uppercase",
                color: "#000", background: "var(--accent)",
                padding: "10px 24px", borderRadius: 3, textDecoration: "none",
              }}>
                Add a Curator →
              </Link>
            </div>
          )}

          {!loading && tracks.map((track, i) => (
            <TrackRow key={track.spotify_track_id} track={track} rank={i + 1} index={i} />
          ))}
        </div>

        <footer style={{
          borderTop: "1px solid var(--border)",
          padding: "14px 24px",
          display: "flex", justifyContent: "space-between",
          fontSize: 9, color: "var(--faint)", letterSpacing: "0.05em",
          position: "relative", zIndex: 1,
        }}>
          <span>PLAYLIST MACHINE — BETA</span>
          <span>Powered by Spotify Web API</span>
          <span>Curator scores updated every 6hrs</span>
        </footer>
      </div>
    </>
  );
}
