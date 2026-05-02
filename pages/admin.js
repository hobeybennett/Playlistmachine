import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";

const btn = (label, onClick, disabled, loading) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      width: "100%",
      background: disabled ? "var(--surface2)" : "var(--accent)",
      color: "#000", border: "none", fontSize: 11, fontWeight: 700,
      padding: "12px 24px", cursor: disabled ? "default" : "pointer",
      letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: 3,
      opacity: loading ? 0.6 : 1, marginTop: 8,
    }}
  >
    {label}
  </button>
);

const fieldLabel = (label) => (
  <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
    {label}
  </div>
);

const resultBox = (result) => result && (
  <div style={{
    marginTop: 16, padding: "14px 16px", borderRadius: 3, fontSize: 11,
    background: result.ok ? "rgba(184,240,80,0.08)" : "rgba(255,85,85,0.08)",
    border: `1px solid ${result.ok ? "var(--accent)" : "var(--hot)"}`,
  }}>
    {result.ok
      ? <pre style={{ margin: 0, fontSize: 10, whiteSpace: "pre-wrap", color: "var(--text)" }}>{JSON.stringify(result.data, null, 2)}</pre>
      : <span style={{ color: "#ff8888" }}>{result.data?.error || JSON.stringify(result.data)}</span>}
  </div>
);

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "var(--surface2)", border: "1px solid var(--border2)",
  color: "var(--text)", fontSize: 12, padding: "8px 14px",
  borderRadius: 3, outline: "none",
};

const sectionHead = (tag, title) => (
  <>
    <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>{tag}</div>
    <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>{title}</h2>
  </>
);

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [minFollowers, setMinFollowers] = useState("1000");

  const [stats, setStats] = useState(null);
  const [syncs, setSyncs] = useState(null);

  const [spotifyAuthUrl, setSpotifyAuthUrl] = useState(null);
  const [spotifyAuthLoading, setSpotifyAuthLoading] = useState(false);

  const [smokeRunning, setSmokeRunning] = useState(false);
  const [smokeResult, setSmokeResult] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [refreshRunning, setRefreshRunning] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [pollRunning, setPollRunning] = useState(false);
  const [pollResult, setPollResult] = useState(null);

  const [scoreTrackId, setScoreTrackId] = useState("");
  const [scoreResult, setScoreResult] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("pm_admin_secret");
      if (stored) {
        setSecret(stored);
        loadStats(stored);
        loadSyncs(stored);
      }
    } catch {}
  }, []); // eslint-disable-line

  const loadStats = async (s = secret) => {
    if (!s) return;
    try {
      const res = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${s}` } });
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  const loadSyncs = async (s = secret) => {
    if (!s) return;
    try {
      const res = await fetch("/api/admin/playlist-syncs", { headers: { Authorization: `Bearer ${s}` } });
      if (res.ok) setSyncs(await res.json());
    } catch {}
  };

  const handleSpotifyAuth = async () => {
    setSpotifyAuthLoading(true);
    try {
      const res = await fetch("/api/admin/spotify-auth", { headers: { Authorization: `Bearer ${secret}` } });
      const data = await res.json();
      if (data.authUrl) setSpotifyAuthUrl(data.authUrl);
    } catch {}
    setSpotifyAuthLoading(false);
  };

  const handleSmoke = async () => {
    setSmokeRunning(true); setSmokeResult(null);
    try {
      const res = await fetch("/api/admin/smoke-test", { headers: { Authorization: `Bearer ${secret}` } });
      const data = await res.json();
      setSmokeResult({ ok: res.ok && data.ok, data });
    } catch { setSmokeResult({ ok: false, data: { error: "Network error" } }); }
    setSmokeRunning(false);
  };

  const handleTest = async () => {
    setTestResult("loading...");
    try {
      const res = await fetch("/api/admin/test-spotify", { headers: { Authorization: `Bearer ${secret}` } });
      const data = await res.json();
      setTestResult(JSON.stringify(data, null, 2));
    } catch (e) { setTestResult(e.message); }
  };

  const handlePoll = async () => {
    setPollRunning(true); setPollResult(null);
    try {
      const res = await fetch("/api/cron/poll", { headers: { Authorization: `Bearer ${secret}` } });
      const data = await res.json();
      setPollResult({ ok: res.ok, data });
    } catch { setPollResult({ ok: false, data: { error: "Network error" } }); }
    setPollRunning(false); loadStats();
  };

  const handleRefresh = async () => {
    setRefreshRunning(true); setRefreshResult(null);
    try {
      const res = await fetch("/api/admin/jobs/refresh-spotify", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      setRefreshResult({ ok: res.ok, data });
    } catch { setRefreshResult({ ok: false, data: { error: "Network error" } }); }
    setRefreshRunning(false); loadStats();
  };

  const handleImport = async (e) => {
    e.preventDefault();
    setImportRunning(true); setImportResult(null);
    try {
      const res = await fetch("/api/admin/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ minFollowers: Number(minFollowers) }),
      });
      const data = await res.json();
      setImportResult({ ok: res.ok, data });
    } catch { setImportResult({ ok: false, data: { error: "Network error" } }); }
    setImportRunning(false);
  };

  const handleSync = async () => {
    setSyncRunning(true); setSyncResult(null);
    try {
      const res = await fetch("/api/admin/jobs/sync-playlists", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      setSyncResult({ ok: res.ok, data });
    } catch { setSyncResult({ ok: false, data: { error: "Network error" } }); }
    setSyncRunning(false); loadSyncs();
  };

  const handleScoreLookup = async () => {
    if (!scoreTrackId.trim()) return;
    try {
      const res = await fetch(`/api/admin/scoring/${scoreTrackId.trim()}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      setScoreResult({ ok: res.ok, data });
    } catch (e) { setScoreResult({ ok: false, data: { error: e.message } }); }
  };

  return (
    <>
      <Head>
        <title>Admin — Playlist Machine</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ minHeight: "100vh" }}>
        <nav style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(9,9,11,0.97)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 24,
          padding: "0 24px", height: 54,
        }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", animation: "glow 2s infinite" }} />
            <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 15, letterSpacing: -0.3, color: "var(--text)" }}>
              PLAYLIST<span style={{ color: "var(--accent)" }}>MACHINE</span>
            </span>
          </Link>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Admin</span>
        </nav>

        <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Auth + Stats */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 12 }}>// Auth</div>
            {fieldLabel("Cron Secret")}
            <input
              type="password"
              value={secret}
              onChange={(e) => { setSecret(e.target.value); try { localStorage.setItem("pm_admin_secret", e.target.value); } catch {} }}
              placeholder="Required for all actions"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => { e.target.style.borderColor = "var(--border2)"; loadStats(e.target.value); loadSyncs(e.target.value); }}
            />
            {stats && (
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                {[
                  ["Curators", `${stats.curators?.approved ?? "—"} / ${stats.curators?.total ?? "—"}`],
                  ["Tracks", stats.tracks?.total ?? "—"],
                  ["Track Adds", stats.adds?.total ?? "—"],
                  ["Votes", stats.votes?.total ?? "—"],
                ].map(([label, val]) => (
                  <div key={label} style={{ background: "var(--surface2)", borderRadius: 3, padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "var(--accent)" }}>{val}</div>
                    <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
            {stats?.recent?.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 10, color: "var(--muted)" }}>
                <div style={{ marginBottom: 6, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 9 }}>Most recent adds</div>
                {stats.recent.map((t, i) => (
                  <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                    <span>{t.track_name} — {t.artist}</span>
                    <span style={{ color: "var(--faint)", fontSize: 9 }}>{new Date(t.detected_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Connect Spotify (OAuth) */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            {sectionHead("// Required", "Connect Spotify Account")}
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.7 }}>
              Spotify's API now requires user OAuth to read playlist tracks. Click below to authorize, then open the link in your browser.
            </p>
            <div style={{ fontSize: 10, color: "var(--faint)", marginBottom: 12, lineHeight: 1.8 }}>
              Before clicking, add this redirect URI to your Spotify app in the{" "}
              <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                Spotify Developer Dashboard
              </a>:
              <code style={{ display: "block", marginTop: 6, padding: "6px 10px", background: "var(--surface2)", borderRadius: 2, fontSize: 10, color: "var(--text)", wordBreak: "break-all" }}>
                {typeof window !== "undefined" ? `${window.location.origin}/api/admin/spotify-callback` : "/api/admin/spotify-callback"}
              </code>
            </div>
            {btn(spotifyAuthLoading ? "Loading..." : "Get Auth URL →", handleSpotifyAuth, !secret || spotifyAuthLoading, spotifyAuthLoading)}
            {spotifyAuthUrl && (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(184,240,80,0.08)", border: "1px solid var(--accent)", borderRadius: 3 }}>
                <div style={{ fontSize: 9, color: "var(--accent)", marginBottom: 8, letterSpacing: "0.1em" }}>OPEN THIS URL IN YOUR BROWSER:</div>
                <a href={spotifyAuthUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "var(--accent)", wordBreak: "break-all" }}>
                  {spotifyAuthUrl}
                </a>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 8 }}>
                  After authorizing, you'll be redirected to a page that says "Spotify connected". You only need to do this once.
                </div>
              </div>
            )}
          </div>

          {/* Smoke Test */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            {sectionHead("// Diagnose", "Run All Checks")}
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.7 }}>
              Tests DB, Spotify auth, playlist reads, ingestion, and chart query in one shot.
            </p>
            {btn(smokeRunning ? "Running..." : "Run Tests →", handleSmoke, smokeRunning || !secret, smokeRunning)}
            {smokeResult && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                  <button
                    onClick={() => { try { navigator.clipboard.writeText(JSON.stringify(smokeResult.data, null, 2)); } catch {} }}
                    style={{ fontSize: 9, padding: "3px 10px", background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--muted)", borderRadius: 2, cursor: "pointer", letterSpacing: "0.05em" }}
                  >
                    Copy JSON
                  </button>
                </div>
                {smokeResult.data?.results?.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 11, borderBottom: "1px solid var(--border)" }}>
                    <span style={{ color: r.status === "pass" ? "var(--accent)" : "var(--hot)", flexShrink: 0 }}>
                      {r.status === "pass" ? "✓" : "✗"}
                    </span>
                    <span style={{ color: "var(--text)", flexShrink: 0, minWidth: 140 }}>{r.label}</span>
                    <span style={{ color: "var(--muted)", fontSize: 10, wordBreak: "break-word" }}>
                      {typeof r.detail === "object" ? JSON.stringify(r.detail) : String(r.detail ?? "")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Spotify Test */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            {sectionHead("// Diagnose", "Test Spotify API")}
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.7 }}>
              Tests playlist and track endpoints and shows the raw Spotify response.
            </p>
            {btn("Run Test →", handleTest, !secret, false)}
            {testResult && (
              <pre style={{ marginTop: 12, fontSize: 9, color: "var(--muted)", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--surface2)", padding: 12, borderRadius: 3 }}>
                {testResult}
              </pre>
            )}
          </div>

          {/* Poll */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            {sectionHead("// Step 1", "Poll Playlists")}
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.7 }}>
              Fetches all approved curator playlists, ingests new tracks with artist genres, refreshes popularity, takes daily snapshots, and recomputes scores.
            </p>
            {btn(pollRunning ? "Polling..." : "Trigger Poll →", handlePoll, pollRunning || !secret, pollRunning)}
            {resultBox(pollResult)}
          </div>

          {/* Refresh Spotify data */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            {sectionHead("// Step 2", "Refresh Spotify Data")}
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.7 }}>
              Re-polls all curators, refreshes stale track popularity, takes today's snapshot, and recomputes all scores. Same as Poll but via admin job endpoint.
            </p>
            {btn(refreshRunning ? "Refreshing..." : "Refresh Spotify Data →", handleRefresh, refreshRunning || !secret, refreshRunning)}
            {resultBox(refreshResult)}
          </div>

          {/* Discover Playlists */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            {sectionHead("// Step 3 (optional)", "Discover Playlists")}
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.7 }}>
              Discovers new playlists from Spotify editorial and genre categories.
            </p>
            <form onSubmit={handleImport}>
              {fieldLabel("Min Followers")}
              <input
                type="number"
                value={minFollowers}
                onChange={(e) => setMinFollowers(e.target.value)}
                style={{ ...inputStyle, marginBottom: 8 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
              />
              {btn(importRunning ? "Importing..." : "Run Discovery →", handleImport, importRunning || !secret, importRunning)}
            </form>
            {resultBox(importResult)}
          </div>

          {/* Sync Playlists */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            {sectionHead("// Step 4", "Sync Spotify Playlists")}
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.7 }}>
              Updates the 10 genre Spotify playlists with current top-500 ranked tracks. Requires <code>SPOTIFY_REFRESH_TOKEN</code> env var.
            </p>
            {btn(syncRunning ? "Syncing..." : "Sync Playlists →", handleSync, syncRunning || !secret, syncRunning)}
            {resultBox(syncResult)}
            {/* Sync log table */}
            {syncs?.logs?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Recent Sync Logs</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                        {["Genre", "Status", "Tracks", "Started"].map((h) => (
                          <th key={h} style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {syncs.logs.slice(0, 20).map((log, i) => (
                        <tr key={i}>
                          <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--text)" }}>{log.genre}</td>
                          <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)", color: log.status === "success" ? "var(--accent)" : log.status === "error" ? "var(--hot)" : "var(--muted)" }}>{log.status}</td>
                          <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{log.item_count ?? "—"}</td>
                          <td style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--faint)" }}>{log.started_at ? new Date(log.started_at).toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {syncs?.mappings?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Playlist Mappings</div>
                {syncs.mappings.map((m) => (
                  <div key={m.genre} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 10 }}>
                    <span style={{ color: "var(--text)", textTransform: "capitalize" }}>{m.genre}</span>
                    <span style={{ color: m.spotify_playlist_id ? "var(--muted)" : "var(--faint)" }}>
                      {m.spotify_playlist_id || "No playlist ID"}
                    </span>
                    <span style={{ color: m.last_sync_status === "success" ? "var(--accent)" : m.last_sync_status === "error" ? "var(--hot)" : "var(--faint)", fontSize: 9 }}>
                      {m.last_sync_status || "never synced"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Score Debug */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            {sectionHead("// Debug", "Track Score Breakdown")}
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8, lineHeight: 1.7 }}>
              Enter a Spotify track ID to see score components and snapshot history.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={scoreTrackId}
                onChange={(e) => setScoreTrackId(e.target.value)}
                placeholder="Spotify track ID (e.g. 3n3Ppam7...)"
                style={{ ...inputStyle, flex: 1 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
                onKeyDown={(e) => e.key === "Enter" && handleScoreLookup()}
              />
              <button
                onClick={handleScoreLookup}
                disabled={!secret || !scoreTrackId.trim()}
                style={{ padding: "8px 16px", background: "var(--accent)", color: "#000", border: "none", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
              >
                Look Up
              </button>
            </div>
            {scoreResult && (
              <div style={{ marginTop: 12 }}>
                {scoreResult.ok && scoreResult.data.track && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[
                        ["Name", scoreResult.data.track.name],
                        ["Artists", scoreResult.data.track.artists],
                        ["Final Score", Math.round(scoreResult.data.track.final_score)],
                        ["Popularity", scoreResult.data.track.popularity],
                        ["Pop Score", Math.round(scoreResult.data.track.popularity_score)],
                        ["Growth Score", Math.round(scoreResult.data.track.growth_score)],
                        ["Vote Score", Math.round(scoreResult.data.track.vote_score)],
                        ["Total Votes", scoreResult.data.totalVotes],
                        ["Genres", (scoreResult.data.track.genres || []).join(", ") || "—"],
                        ["Add Count", scoreResult.data.track.add_count],
                      ].map(([k, v]) => (
                        <div key={k} style={{ background: "var(--surface2)", borderRadius: 2, padding: "6px 10px" }}>
                          <div style={{ fontSize: 8, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{k}</div>
                          <div style={{ fontSize: 11, color: "var(--text)", marginTop: 2 }}>{v ?? "—"}</div>
                        </div>
                      ))}
                    </div>
                    {scoreResult.data.snapshots?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Popularity Snapshots</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {scoreResult.data.snapshots.map((s, i) => (
                            <div key={i} style={{ background: "var(--surface2)", borderRadius: 2, padding: "4px 8px", fontSize: 9, color: "var(--muted)" }}>
                              {s.snapshot_date}: <span style={{ color: "var(--accent)" }}>{s.spotify_popularity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {(!scoreResult.ok || scoreResult.data.error) && (
                  <div style={{ color: "#ff8888", fontSize: 11 }}>{scoreResult.data?.error || "Error"}</div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
