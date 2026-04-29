import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";

const daysAgo = (iso) => {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
};

function VelocityBar({ velocity }) {
  if (!velocity?.length) return <div style={{ fontSize: 10, color: "var(--faint)" }}>No data</div>;
  const max = Math.max(...velocity.map((v) => v.adds), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48 }}>
      {velocity.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{
            width: "100%",
            height: `${Math.max((v.adds / max) * 100, 5)}%`,
            background: v.adds === max ? "var(--hot)" : "var(--accent)",
            borderRadius: "2px 2px 0 0",
            opacity: 0.85,
          }} />
        </div>
      ))}
    </div>
  );
}

export default function TrackDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/tracks/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [id]);

  return (
    <>
      <Head>
        <title>{data ? `${data.track.name} — Playlist Machine` : "Track — Playlist Machine"}</title>
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
          <Link href="/curators" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>
            Curators
          </Link>
        </nav>

        <div style={{ position: "relative", zIndex: 1 }}>
          {loading && (
            <div style={{ padding: "80px 24px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 5, height: 44 }}>
                {[0,1,2,3,4,5,6].map((i) => (
                  <div key={i} style={{ width: 4, background: "var(--accent)", borderRadius: 2, animation: `wave 1.2s ${i * 0.1}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: "80px 24px", textAlign: "center", color: "#ff8888", fontSize: 12 }}>
              ⚠ {error}
            </div>
          )}

          {data && (
            <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
              {/* Track header */}
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, alignItems: "center", marginBottom: 40 }}>
                {data.track.albumArt ? (
                  <img src={data.track.albumArt} alt="" width={100} height={100}
                    style={{ borderRadius: 4, objectFit: "cover", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }} />
                ) : (
                  <div style={{ width: 100, height: 100, background: "var(--surface2)", borderRadius: 4 }} />
                )}

                <div>
                  <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
                    // Track Detail
                  </div>
                  <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: "var(--text)", marginBottom: 8 }}>
                    {data.track.name}
                  </h1>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    {data.track.artist} · {data.track.album}
                  </div>
                  {data.track.spotifyUrl && (
                    <a href={data.track.spotifyUrl} target="_blank" rel="noreferrer" style={{
                      display: "inline-block", marginTop: 12,
                      fontSize: 9, color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase",
                      border: "1px solid var(--accent)", padding: "5px 12px", borderRadius: 2,
                    }}>
                      Open in Spotify ↗
                    </a>
                  )}
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
                    Weighted Score
                  </div>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: 56, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
                    {data.weightedScore}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
                    {data.addCount} curator {data.addCount === 1 ? "add" : "adds"}
                  </div>
                </div>
              </div>

              {/* Spotify embed */}
              <div style={{ marginBottom: 40 }}>
                <iframe
                  src={`https://open.spotify.com/embed/track/${id}?utm_source=generator&theme=0`}
                  width="100%"
                  height="80"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  style={{ borderRadius: 4 }}
                />
              </div>

              {/* Stats grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 40 }}>
                {/* Velocity chart */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 20 }}>
                  <div style={{ fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 16 }}>
                    Add Velocity (by day)
                  </div>
                  <VelocityBar velocity={data.velocity} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 8, color: "var(--faint)" }}>
                    {data.velocity.length > 0 && (
                      <>
                        <span>{new Date(data.velocity[0].day).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                        <span>{new Date(data.velocity[data.velocity.length - 1].day).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Score breakdown */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 20 }}>
                  <div style={{ fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 16 }}>
                    Score Breakdown
                  </div>
                  {[
                    ["Curator Trust", data.curatorAdds.reduce((s, c) => s + (c.curatorScore || 0), 0) / Math.max(data.curatorAdds.length, 1), "Avg score of adding curators"],
                    ["Add Count", Math.min(100, data.addCount * 20), `${data.addCount} tracked adds`],
                    ["Popularity", data.track.popularity, `Spotify popularity ${data.track.popularity}/100`],
                  ].map(([label, val, desc]) => (
                    <div key={label} style={{ marginBottom: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: "var(--text)" }}>{label}</span>
                        <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "Georgia, serif", fontWeight: 700 }}>
                          {Math.round(val)}
                        </span>
                      </div>
                      <div style={{ height: 2, background: "var(--border2)", borderRadius: 1 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, val)}%`, background: "var(--accent)", borderRadius: 1, opacity: 0.6 }} />
                      </div>
                      <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 3 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Curator adds table */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}>
                <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
                    Curators Who Added This
                  </div>
                </div>
                {data.curatorAdds.map((c, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "1fr auto auto",
                    alignItems: "center", gap: 16,
                    padding: "12px 20px",
                    borderBottom: i < data.curatorAdds.length - 1 ? "1px solid var(--border)" : "none",
                  }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{c.curatorName}</div>
                      <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 2 }}>
                        Added {daysAgo(c.playlistAddedAt || c.detectedAt)}
                        {i === 0 && <span style={{ color: "var(--accent)", marginLeft: 8 }}>← first</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>Score</div>
                      <div style={{ fontFamily: "Georgia, serif", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                        {Math.round(c.curatorScore)}
                      </div>
                    </div>
                    <a
                      href={`https://open.spotify.com/playlist/${c.playlistId}`}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: 9, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", border: "1px solid var(--border2)", padding: "4px 10px", borderRadius: 2 }}
                    >
                      Playlist ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
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
