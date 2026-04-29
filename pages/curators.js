import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";

function CuratorCard({ curator, rank }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderLeft: rank <= 3 ? "3px solid var(--accent)" : "3px solid var(--border)",
      borderRadius: 4,
      padding: 20,
      animation: `fadeIn 0.3s ${rank * 0.05}s both`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>
            #{rank}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", fontFamily: "Georgia, serif" }}>
            {curator.name}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
            by {curator.owner_name} · {Number(curator.follower_count).toLocaleString()} followers
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 36, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
            {Math.round(curator.score)}
          </div>
          <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Track Record</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        {[
          ["Hit Accuracy", `${Math.round(curator.hit_accuracy)}%`, "Adds that hit 1M+ streams"],
          ["Lead Time", Math.round(curator.lead_time_score), "How early vs others"],
          ["Call Volume", curator.call_volume, "Total tracks scored"],
        ].map(([label, val, desc]) => (
          <div key={label}>
            <div style={{ fontSize: 9, color: "var(--faint)", marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "Georgia, serif" }}>{val}</div>
            <div style={{ fontSize: 8, color: "var(--faint)" }}>{desc}</div>
          </div>
        ))}
      </div>

      <a
        href={`https://open.spotify.com/playlist/${curator.spotify_playlist_id}`}
        target="_blank" rel="noreferrer"
        style={{ fontSize: 9, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", border: "1px solid var(--border2)", padding: "4px 10px", borderRadius: 2, display: "inline-block" }}
      >
        View Playlist ↗
      </a>
    </div>
  );
}

export default function Curators() {
  const [curators, setCurators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitUrl, setSubmitUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  useEffect(() => {
    fetch("/api/curators")
      .then((r) => r.json())
      .then((d) => { setCurators(d.curators || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!submitUrl.trim()) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await fetch("/api/curators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistUrl: submitUrl }),
      });
      const data = await res.json();
      setSubmitResult({ ok: res.ok, message: data.message || data.error, status: data.status });
      if (res.ok) setSubmitUrl("");
    } catch {
      setSubmitResult({ ok: false, message: "Network error — please try again" });
    }
    setSubmitting(false);
  };

  return (
    <>
      <Head>
        <title>Curators — Playlist Machine</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
          <span style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Curators
          </span>
        </nav>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
          {/* Submit form */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 28, marginBottom: 40 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
              // Submit a Curator
            </div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              Add your playlist
            </h2>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20, lineHeight: 1.7 }}>
              Paste a public Spotify playlist URL. Playlists with 100+ followers are approved automatically. Others are reviewed manually.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
              <input
                value={submitUrl}
                onChange={(e) => setSubmitUrl(e.target.value)}
                placeholder="https://open.spotify.com/playlist/..."
                style={{
                  flex: 1,
                  background: "var(--surface2)",
                  border: "1px solid var(--border2)",
                  color: "var(--text)",
                  fontSize: 11,
                  padding: "8px 14px",
                  borderRadius: 3,
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
              />
              <button
                type="submit"
                disabled={submitting || !submitUrl.trim()}
                style={{
                  background: submitting || !submitUrl.trim() ? "var(--surface2)" : "var(--accent)",
                  color: "#000",
                  border: "none",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "8px 20px",
                  cursor: submitting || !submitUrl.trim() ? "default" : "pointer",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderRadius: 3,
                  opacity: submitting ? 0.6 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                {submitting ? "···" : "Submit →"}
              </button>
            </form>

            {submitResult && (
              <div style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 3,
                fontSize: 11,
                background: submitResult.ok ? "rgba(184,240,80,0.08)" : "rgba(255,85,85,0.08)",
                border: `1px solid ${submitResult.ok ? "var(--accent)" : "var(--hot)"}`,
                color: submitResult.ok ? "var(--accent)" : "#ff8888",
              }}>
                {submitResult.message}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 16 }}>
              Curator Leaderboard
            </div>

            {loading && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 5, height: 44 }}>
                  {[0,1,2,3,4].map((i) => (
                    <div key={i} style={{ width: 4, background: "var(--accent)", borderRadius: 2, animation: `wave 1.2s ${i * 0.1}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}

            {!loading && curators.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--faint)", fontSize: 12 }}>
                No curators yet — submit the first one above.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {curators.map((c, i) => (
                <CuratorCard key={c.id} curator={c} rank={i + 1} />
              ))}
            </div>
          </div>
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
