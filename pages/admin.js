import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";

const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 20 };
const label9 = (t) => <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>{t}</div>;

const btn = (extra = {}) => ({
  padding: "10px 16px", border: "none", borderRadius: 3,
  fontSize: 11, fontWeight: 700, cursor: "pointer",
  letterSpacing: "0.06em", textTransform: "uppercase",
  transition: "opacity 0.15s",
  ...extra,
});

function ResultBox({ result }) {
  if (!result) return null;
  const ok = result.ok !== false;
  const text = JSON.stringify(result.data, null, 2);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <button onClick={copy} style={{ ...btn({ background: "none", border: "1px solid var(--border2)", color: "var(--muted)", padding: "4px 10px", fontSize: 9 }) }}>
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>
      <pre style={{
        padding: "10px 12px", borderRadius: 3, fontSize: 10,
        background: ok ? "rgba(184,240,80,0.06)" : "rgba(255,85,85,0.07)",
        border: `1px solid ${ok ? "var(--accent)" : "#ff5555"}`,
        color: ok ? "var(--text)" : "#ff8888",
        whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
        maxHeight: 400, overflow: "auto",
      }}>
        {text}
      </pre>
    </div>
  );
}

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [stats, setStats] = useState(null);
  const [toast, setToast] = useState(null);
  const [pollRunning, setPollRunning] = useState(false);
  const [pollResult, setPollResult] = useState(null);
  const [nukeRunning, setNukeRunning] = useState(false);
  const [nukeResult, setNukeResult] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [spotifyAuthUrl, setSpotifyAuthUrl] = useState(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("pm_admin_secret");
      if (s) { setSecret(s); loadStats(s); }
    } catch {}
  }, []); // eslint-disable-line

  const loadStats = async (s = secret) => {
    if (!s) return;
    try {
      const r = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${s}` } });
      if (r.ok) setStats(await r.json());
    } catch {}
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const handlePoll = async () => {
    setPollRunning(true); setPollResult(null);
    try {
      const r = await fetch("/api/cron/poll", { headers: { Authorization: `Bearer ${secret}` } });
      setPollResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setPollResult({ ok: false, data: { error: e.message } }); }
    setPollRunning(false); loadStats();
  };

  const handleNuke = async () => {
    if (!confirm("Delete ALL tracks, snapshots, votes and track_adds from the DB? This cannot be undone.")) return;
    setNukeRunning(true); setNukeResult(null);
    try {
      const r = await fetch("/api/admin/clear-all-tracks", { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
      setNukeResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setNukeResult({ ok: false, data: { error: e.message } }); }
    setNukeRunning(false); loadStats();
  };

  const handleSearchTest = async () => {
    setSearchResult(null);
    try {
      const r = await fetch("/api/admin/test-search", { headers: { Authorization: `Bearer ${secret}` } });
      setSearchResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setSearchResult({ ok: false, data: { error: e.message } }); }
  };

  const handleSpotifyAuth = async () => {
    try {
      const r = await fetch("/api/admin/spotify-auth", { headers: { Authorization: `Bearer ${secret}` } });
      const d = await r.json();
      if (d.authUrl) setSpotifyAuthUrl(d.authUrl);
    } catch {}
  };

  const handleSyncPlaylist = async () => {
    setSyncRunning(true); setSyncResult(null);
    try {
      const r = await fetch("/api/admin/sync-playlist", { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
      setSyncResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setSyncResult({ ok: false, data: { error: e.message } }); }
    setSyncRunning(false); loadStats();
  };

  return (
    <>
      <Head><title>Admin — Playlist Machine</title></Head>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: "var(--accent)", color: "#000",
          padding: "10px 20px", borderRadius: 4, fontSize: 12, fontWeight: 700,
        }}>{toast}</div>
      )}

      <div style={{ minHeight: "100vh" }}>
        <nav style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "rgba(9,9,11,0.97)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 24, padding: "0 24px", height: 54,
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

        <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Auth + Stats */}
          <div style={card}>
            {label9("// Auth")}
            <input
              type="password" value={secret} placeholder="Cron secret"
              onChange={(e) => { setSecret(e.target.value); try { localStorage.setItem("pm_admin_secret", e.target.value); } catch {} }}
              onBlur={(e) => { loadStats(e.target.value); }}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "var(--surface2)", border: "1px solid var(--border2)",
                color: "var(--text)", fontSize: 12, padding: "8px 14px", borderRadius: 3, outline: "none",
              }}
            />
            {stats && (
              <>
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[
                    ["Total Tracks", stats.tracks?.total ?? "—"],
                    ["With Popularity", stats.withPop?.total ?? "—"],
                    ["Avg Popularity", stats.withPop?.avg_pop ?? "—"],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: "var(--surface2)", borderRadius: 3, padding: "10px 0", textAlign: "center" }}>
                      <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{v}</div>
                      <div style={{ fontSize: 8, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{l}</div>
                    </div>
                  ))}
                </div>
                {stats.chartPlaylistId && (
                  <div style={{ marginTop: 10, fontSize: 10, color: "var(--muted)" }}>
                    Chart playlist:{" "}
                    <a
                      href={`https://open.spotify.com/playlist/${stats.chartPlaylistId}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: "var(--accent)" }}
                    >
                      open.spotify.com/playlist/{stats.chartPlaylistId}
                    </a>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Spotify OAuth */}
          <div style={card}>
            {label9("// Spotify")}
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
              Required for playlist sync. Click to get an auth URL, then open it to grant playlist permissions.
            </p>
            <button
              onClick={handleSpotifyAuth} disabled={!secret}
              style={{ ...btn({ background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--text)" }), opacity: !secret ? 0.5 : 1 }}
            >
              Connect Spotify Account
            </button>
            {spotifyAuthUrl && (
              <div style={{ marginTop: 10, fontSize: 10, wordBreak: "break-all" }}>
                <a href={spotifyAuthUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                  Open this URL to authorize →
                </a>
              </div>
            )}
          </div>

          {/* Main actions */}
          <div style={card}>
            {label9("// Actions")}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

              <button
                onClick={handlePoll} disabled={!secret || pollRunning}
                style={{ ...btn({ background: "var(--accent)", color: "#000", padding: "14px 16px", fontSize: 13 }), opacity: (!secret || pollRunning) ? 0.6 : 1 }}
              >
                {pollRunning ? "Polling…" : "⚡ Trigger Poll"}
              </button>
              {pollResult && <ResultBox result={pollResult} />}

              <button
                onClick={handleSyncPlaylist} disabled={!secret || syncRunning}
                style={{ ...btn({ background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--text)" }), opacity: (!secret || syncRunning) ? 0.5 : 1 }}
              >
                {syncRunning ? "Syncing…" : "♫ Sync Spotify Playlist"}
              </button>
              {syncResult && <ResultBox result={syncResult} />}

              <button
                onClick={handleNuke} disabled={!secret || nukeRunning}
                style={{ ...btn({ background: "none", border: "1px solid #ff5555", color: "#ff8888" }), opacity: (!secret || nukeRunning) ? 0.5 : 1 }}
              >
                {nukeRunning ? "Clearing…" : "🗑 Clear All Tracks"}
              </button>
              {nukeResult && <ResultBox result={nukeResult} />}
            </div>
          </div>

          {/* Diagnostics */}
          <div style={card}>
            {label9("// Diagnostics")}
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
              Shows full raw Spotify track object including all fields returned by the search API.
            </p>
            <button
              onClick={handleSearchTest} disabled={!secret}
              style={{ ...btn({ background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--muted)" }), opacity: !secret ? 0.5 : 1 }}
            >
              Test Search (show raw Spotify response)
            </button>
            {searchResult && <ResultBox result={searchResult} />}
          </div>

        </div>
      </div>
    </>
  );
}
