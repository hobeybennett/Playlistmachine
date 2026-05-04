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
  return (
    <pre style={{
      marginTop: 12, padding: "10px 12px", borderRadius: 3, fontSize: 10,
      background: ok ? "rgba(184,240,80,0.06)" : "rgba(255,85,85,0.07)",
      border: `1px solid ${ok ? "var(--accent)" : "#ff5555"}`,
      color: ok ? "var(--text)" : "#ff8888",
      whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
    }}>
      {JSON.stringify(result.data, null, 2)}
    </pre>
  );
}

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [stats, setStats] = useState(null);
  const [toast, setToast] = useState(null);
  const [pollRunning, setPollRunning] = useState(false);
  const [pollResult, setPollResult] = useState(null);
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupLog, setSetupLog] = useState([]);
  const [nukeRunning, setNukeRunning] = useState(false);
  const [nukeResult, setNukeResult] = useState(null);
  const [spotifyAuthUrl, setSpotifyAuthUrl] = useState(null);
  const [searchResult, setSearchResult] = useState(null);

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

  const handleSetup = async () => {
    setSetupRunning(true); setSetupLog([]);
    const log = (msg, ok = null) => setSetupLog((p) => [...p, { msg, ok }]);
    try {
      log("Seeding curators...");
      const r1 = await fetch("/api/admin/seed-curators", { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
      const d1 = await r1.json();
      if (!r1.ok) { log(`Seed failed: ${d1.error}`, false); setSetupRunning(false); return; }
      log(`Curators seeded — ${d1.inserted} new, ${d1.skipped} existing`, true);

      log("Polling curator playlists...");
      const r2 = await fetch("/api/cron/poll", { headers: { Authorization: `Bearer ${secret}` } });
      const d2 = await r2.json();
      const errs = d2.errors || [];
      if (d2.tracksFound === 0) {
        const sample = errs.slice(0, 2).map(e => e.error || e.playlist || JSON.stringify(e)).join("; ");
        log(`Poll found 0 tracks${sample ? ` — ${sample}` : ""}`, false);
      } else {
        log(`Found ${d2.tracksFound} tracks, ${d2.newTracksIngested} new ingested`, true);
        log(`Snapshots: ${d2.snapshotsTaken}, track_adds: ${d2.trackAddsRecorded ?? 0}`, errs.length === 0);
      }
    } catch (e) { log(`Error: ${e.message}`, false); }
    setSetupRunning(false); loadStats();
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

  const handleSpotifyAuth = async () => {
    try {
      const r = await fetch("/api/admin/spotify-auth", { headers: { Authorization: `Bearer ${secret}` } });
      const d = await r.json();
      if (d.authUrl) setSpotifyAuthUrl(d.authUrl);
    } catch {}
  };

  const handleSearchTest = async () => {
    setSearchResult(null);
    try {
      const r = await fetch("/api/admin/test-search", { headers: { Authorization: `Bearer ${secret}` } });
      setSearchResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setSearchResult({ ok: false, data: { error: e.message } }); }
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
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[
                  ["Curators", `${stats.curators?.approved ?? "—"}/${stats.curators?.total ?? "—"}`],
                  ["Tracks", stats.tracks?.total ?? "—"],
                  ["Track Adds", stats.adds?.total ?? "—"],
                  ["Votes", stats.votes?.total ?? "—"],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: "var(--surface2)", borderRadius: 3, padding: "10px 0", textAlign: "center" }}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{v}</div>
                    <div style={{ fontSize: 8, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Main actions */}
          <div style={card}>
            {label9("// Actions")}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

              {/* Full setup */}
              <button
                onClick={handleSetup} disabled={!secret || setupRunning}
                style={{ ...btn({ background: "var(--accent)", color: "#000", padding: "14px 16px", fontSize: 13 }), opacity: (!secret || setupRunning) ? 0.6 : 1 }}
              >
                {setupRunning ? "Running… please wait" : "⚡ Full Setup (seed curators + poll)"}
              </button>
              {setupLog.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {setupLog.map((e, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 11 }}>
                      <span style={{ color: e.ok === true ? "var(--accent)" : e.ok === false ? "#ff5555" : "var(--muted)" }}>
                        {e.ok === true ? "✓" : e.ok === false ? "✗" : "·"}
                      </span>
                      <span style={{ color: e.ok === false ? "#ff8888" : "var(--text)" }}>{e.msg}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Trigger poll */}
              <button
                onClick={handlePoll} disabled={!secret || pollRunning}
                style={{ ...btn({ background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--accent)" }), opacity: (!secret || pollRunning) ? 0.5 : 1 }}
              >
                {pollRunning ? "Polling…" : "Trigger Poll"}
              </button>
              {pollResult && <ResultBox result={pollResult} />}

              {/* Nuke */}
              <button
                onClick={handleNuke} disabled={!secret || nukeRunning}
                style={{ ...btn({ background: "none", border: "1px solid #ff5555", color: "#ff8888" }), opacity: (!secret || nukeRunning) ? 0.5 : 1 }}
              >
                {nukeRunning ? "Clearing…" : "🗑 Clear All Tracks"}
              </button>
              {nukeResult && <ResultBox result={nukeResult} />}
            </div>
          </div>

          {/* Spotify OAuth */}
          <div style={card}>
            {label9("// Spotify OAuth")}
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
              Required for playlist polling. Add this redirect URI to your Spotify app first:
            </p>
            <code style={{ display: "block", padding: "6px 10px", background: "var(--surface2)", borderRadius: 2, fontSize: 10, marginBottom: 10, wordBreak: "break-all" }}>
              {typeof window !== "undefined" ? `${window.location.origin}/api/admin/spotify-callback` : "/api/admin/spotify-callback"}
            </code>
            <button
              onClick={handleSpotifyAuth} disabled={!secret}
              style={{ ...btn({ background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--accent)" }), opacity: !secret ? 0.5 : 1 }}
            >
              Get Auth URL →
            </button>
            {spotifyAuthUrl && (
              <div style={{ marginTop: 10, padding: 10, background: "rgba(184,240,80,0.07)", border: "1px solid var(--accent)", borderRadius: 3 }}>
                <div style={{ fontSize: 9, color: "var(--accent)", marginBottom: 4 }}>OPEN IN BROWSER:</div>
                <a href={spotifyAuthUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "var(--accent)", wordBreak: "break-all" }}>{spotifyAuthUrl}</a>
              </div>
            )}
          </div>

          {/* Diagnostics */}
          <div style={card}>
            {label9("// Diagnostics")}
            <button
              onClick={handleSearchTest} disabled={!secret}
              style={{ ...btn({ background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--muted)" }), opacity: !secret ? 0.5 : 1 }}
            >
              Test Spotify Search
            </button>
            {searchResult && <ResultBox result={searchResult} />}
          </div>

        </div>
      </div>
    </>
  );
}
