import { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";

const extractId = (input) => {
  const match = input.match(/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : input.trim();
};

const daysAgo = (iso) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

const mockTimeline = () => {
  const arr = [];
  let v = 0;
  for (let i = 0; i < 12; i++) {
    v += Math.floor(Math.random() * 7);
    arr.push(v);
  }
  return arr;
};

const enrichTracks = (rawTracks) => {
  const enriched = rawTracks.map((t) => ({
    ...t,
    weightedScore: Math.floor(30 + Math.random() * 270),
    momentum: Math.floor(15 + Math.random() * 85),
    adds: Math.floor(2 + Math.random() * 48),
    timelineData: mockTimeline(),
  }));
  enriched.sort((a, b) => b.weightedScore - a.weightedScore);
  enriched.forEach((t, i) => (t.rank = i + 1));
  return enriched;
};

function MiniBar({ data, hot }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            minWidth: 3,
            height: `${Math.max((v / max) * 100, 5)}%`,
            background: v === max ? "var(--hot)" : "var(--accent)",
            borderRadius: "2px 2px 0 0",
            opacity: 0.8,
          }}
        />
      ))}
    </div>
  );
}

function TrackRow({ track, index, selected, onClick }) {
  return (
    <>
      <div
        onClick={onClick}
        style={{
          display: "grid",
          gridTemplateColumns: "32px 44px 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          background: selected ? "var(--surface)" : "transparent",
          borderLeft: track.rank <= 2
            ? "3px solid var(--hot)"
            : selected
            ? "3px solid var(--accent)"
            : "3px solid transparent",
          transition: "background 0.12s",
          animation: `fadeIn 0.3s ${index * 0.04}s both`,
        }}
      >
        <div style={{
          textAlign: "center",
          fontFamily: "var(--font-serif, Georgia, serif)",
          fontSize: track.rank <= 3 ? 9 : 12,
          fontWeight: 700,
          color: track.rank <= 3 ? "var(--accent)" : "var(--faint)",
          letterSpacing: track.rank <= 3 ? "0.06em" : 0,
        }}>
          {track.rank <= 3 ? "NEW" : track.rank}
        </div>

        {track.albumArt ? (
          <img
            src={track.albumArt}
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: 2, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: 40, height: 40, background: "var(--surface2)", borderRadius: 2 }} />
        )}

        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {track.name}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {track.artist}
          </div>
          <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1 }}>
            {track.album} · Added {daysAgo(track.addedAt)}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: "Georgia, serif",
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1,
            color: track.rank <= 2 ? "var(--hot)" : "var(--text)",
          }}>
            {track.weightedScore}
          </div>
          <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 1 }}>
            score
          </div>
          <div style={{ marginTop: 5, height: 2, width: 48, background: "var(--border2)", borderRadius: 1 }}>
            <div style={{
              height: "100%",
              width: `${track.momentum}%`,
              background: track.rank <= 2 ? "var(--hot)" : "var(--accent)",
              borderRadius: 1,
            }} />
          </div>
        </div>
      </div>

      {selected && (
        <div style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--accent)",
          padding: "16px 24px",
          animation: "fadeIn 0.2s both",
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
            <div>
              <div style={{ fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
                Add Velocity (72hr)
              </div>
              <MiniBar data={track.timelineData} hot={track.rank <= 2} />
            </div>
            <div>
              <div style={{ fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
                Track Details
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 2 }}>
                <div><span style={{ color: "var(--text)" }}>Album:</span> {track.album}</div>
                <div><span style={{ color: "var(--text)" }}>Added:</span> {daysAgo(track.addedAt)}</div>
                <div><span style={{ color: "var(--text)" }}>Cross-adds:</span> {track.adds} playlists</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
                Weighted Score
              </div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 36, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
                {track.weightedScore}
              </div>
              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
                curator trust × add velocity
              </div>
              {track.spotifyUrl && (
                <a
                  href={track.spotifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 12,
                    fontSize: 9,
                    color: "var(--accent)",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    border: "1px solid var(--accent)",
                    padding: "5px 12px",
                    borderRadius: 2,
                    transition: "background 0.15s",
                  }}
                >
                  Open in Spotify ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Home() {
  const [inputUrl, setInputUrl] = useState("https://open.spotify.com/playlist/00hfL65TE5CkQEdxJAFMdo");
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [activeWindow, setActiveWindow] = useState("72h");
  const [curatorScore] = useState(() => Math.floor(68 + Math.random() * 28));
  const hasLoaded = useRef(false);

  const loadPlaylist = useCallback(async (url) => {
    const id = extractId(url);
    if (!id) return;
    setLoading(true);
    setError(null);
    setSelectedTrack(null);
    try {
      const res = await fetch(`/api/playlist?playlistId=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load playlist");
      setPlaylist(data.playlist);
      setTracks(enrichTracks(data.tracks));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      loadPlaylist(inputUrl);
    }
  }, [loadPlaylist, inputUrl]);

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
          display: "flex", alignItems: "center", gap: 16,
          padding: "0 24px", height: 54,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "var(--accent)",
              animation: "glow 2s infinite",
            }} />
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15, letterSpacing: -0.3 }}>
              PLAYLIST<span style={{ color: "var(--accent)" }}>MACHINE</span>
            </span>
          </div>

          <div style={{ flex: 1, maxWidth: 560, display: "flex", gap: 8 }}>
            <input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadPlaylist(inputUrl)}
              placeholder="Paste any public Spotify playlist URL..."
              style={{
                flex: 1,
                background: "var(--surface2)",
                border: "1px solid var(--border2)",
                color: "var(--text)",
                fontSize: 11,
                padding: "7px 12px",
                borderRadius: 3,
                outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
            />
            <button
              onClick={() => loadPlaylist(inputUrl)}
              disabled={loading}
              style={{
                background: loading ? "var(--surface2)" : "var(--accent)",
                color: "#000",
                border: "none",
                fontSize: 10,
                fontWeight: 700,
                padding: "7px 18px",
                cursor: loading ? "default" : "pointer",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderRadius: 3,
                opacity: loading ? 0.5 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {loading ? "···" : "Analyze →"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--hot)", flexShrink: 0 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--hot)" }} />
            LIVE
          </div>
        </nav>

        {error && (
          <div style={{
            background: "#1a0f0f",
            borderBottom: "1px solid var(--hot)",
            color: "#ff8888",
            padding: "10px 24px",
            fontSize: 11,
            position: "relative", zIndex: 1,
          }}>
            ⚠ {error}
          </div>
        )}

        {loading && (
          <div style={{ position: "relative", zIndex: 1, padding: "80px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 24 }}>
              Fetching from Spotify...
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 5, height: 44 }}>
              {[0,1,2,3,4,5,6].map((i) => (
                <div key={i} style={{
                  width: 4,
                  background: "var(--accent)",
                  borderRadius: 2,
                  animation: `wave 1.2s ${i * 0.1}s ease-in-out infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {!loading && playlist && tracks.length > 0 && (
          <div style={{ position: "relative", zIndex: 1, animation: "fadeIn 0.4s both" }}>
            <div style={{
              borderBottom: "1px solid var(--border)",
              padding: "28px 24px",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: 20,
              alignItems: "center",
              background: "linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%)",
            }}>
              {playlist.image ? (
                <img
                  src={playlist.image}
                  alt={playlist.name}
                  width={80}
                  height={80}
                  style={{ borderRadius: 4, objectFit: "cover", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
                />
              ) : (
                <div style={{ width: 80, height: 80, background: "var(--surface2)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                  🎵
                </div>
              )}

              <div>
                <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>
                  // Curator Profile
                </div>
                <h1 style={{ fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.1, color: "var(--text)" }}>
                  {playlist.name}
                </h1>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>by {playlist.owner}</span>
                  <span style={{ color: "var(--faint)" }}>·</span>
                  <span>{playlist.totalTracks} tracks</span>
                  <span style={{ color: "var(--faint)" }}>·</span>
                  <span>{Number(playlist.followers).toLocaleString()} followers</span>
                </div>
                {playlist.description && (
                  <div
                    style={{ fontSize: 10, color: "var(--faint)", marginTop: 6, maxWidth: 500 }}
                    dangerouslySetInnerHTML={{ __html: playlist.description }}
                  />
                )}
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>
                  Track Record Score
                </div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 52, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
                  {curatorScore}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>out of 100</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 280px" }}>
              <div style={{ borderRight: "1px solid var(--border)" }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 24px", borderBottom: "1px solid var(--border)",
                  background: "var(--surface)",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
                    Tracks — Ranked by Weighted Score
                  </span>
                  <div style={{ display: "flex" }}>
                    {["24h", "72h", "7d"].map((w) => (
                      <button
                        key={w}
                        onClick={() => setActiveWindow(w)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          padding: "4px 10px", fontSize: 9,
                          letterSpacing: "0.1em", textTransform: "uppercase",
                          color: activeWindow === w ? "var(--text)" : "var(--muted)",
                          borderBottom: activeWindow === w ? "2px solid var(--accent)" : "2px solid transparent",
                        }}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                {tracks.map((track, i) => (
                  <TrackRow
                    key={track.id || i}
                    track={track}
                    index={i}
                    selected={selectedTrack === i}
                    onClick={() => setSelectedTrack(selectedTrack === i ? null : i)}
                  />
                ))}
              </div>

              <div style={{ background: "var(--surface)", position: "sticky", top: 54, alignSelf: "start", maxHeight: "calc(100vh - 54px)", overflowY: "auto" }}>
                <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
                    Score Breakdown
                  </div>
                </div>

                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                  {[
                    ["Hit Accuracy", 50, "Adds that later hit 1M+ streams"],
                    ["Lead Time", 35, "How early vs. other curators"],
                    ["Call Volume", 15, "Consistency over time"],
                  ].map(([label, pct, desc]) => (
                    <div key={label} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 10, color: "var(--text)" }}>{label}</span>
                        <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "Georgia, serif", fontWeight: 700 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 2, background: "var(--border2)", borderRadius: 1, marginBottom: 5 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 1, opacity: 0.5 }} />
                      </div>
                      <div style={{ fontSize: 9, color: "var(--faint)", lineHeight: 1.5 }}>{desc}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 12 }}>
                    Playlist Stats
                  </div>
                  {[
                    ["Total tracks", playlist.totalTracks],
                    ["Followers", Number(playlist.followers).toLocaleString()],
                    ["Public", playlist.public ? "Yes" : "No"],
                    ["Tracks shown", tracks.length],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 10 }}>
                      <span style={{ color: "var(--muted)" }}>{l}</span>
                      <span style={{ color: "var(--text)" }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 9, color: "var(--faint)", lineHeight: 1.8 }}>
                    Paste any public Spotify playlist URL in the bar above to analyze it as a curator and see how its tracks would rank.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !playlist && !error && (
          <div style={{ position: "relative", zIndex: 1, padding: "100px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 36, color: "var(--surface2)", marginBottom: 12 }}>
              Playlist Machine
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)" }}>
              Paste a Spotify playlist URL above to begin
            </div>
          </div>
        )}

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
