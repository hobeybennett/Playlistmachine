import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "var(--surface2)", border: "1px solid var(--border2)",
  color: "var(--text)", fontSize: 12, padding: "8px 14px",
  borderRadius: 3, outline: "none",
};

const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 };
const label9 = (t) => <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>{t}</div>;

function ResultBox({ result, onCopy }) {
  if (!result) return null;
  return (
    <div style={{
      marginTop: 14, padding: "12px 14px", borderRadius: 3, fontSize: 10,
      background: result.ok ? "rgba(184,240,80,0.07)" : "rgba(255,85,85,0.07)",
      border: `1px solid ${result.ok ? "var(--accent)" : "#ff5555"}`,
    }}>
      {onCopy && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button onClick={() => onCopy(result.data)} style={{ fontSize: 9, padding: "3px 10px", background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--muted)", borderRadius: 2, cursor: "pointer", letterSpacing: "0.05em" }}>
            Copy JSON
          </button>
        </div>
      )}
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: result.ok ? "var(--text)" : "#ff8888" }}>
        {JSON.stringify(result.data, null, 2)}
      </pre>
    </div>
  );
}

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [stats, setStats] = useState(null);
  const [syncs, setSyncs] = useState(null);

  // Setup state
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupLog, setSetupLog] = useState([]);
  const [setupDone, setSetupDone] = useState(false);

  // Individual job states
  const [pollResult, setPollResult] = useState(null);
  const [pollRunning, setPollRunning] = useState(false);
  const [refreshRunning, setRefreshRunning] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [spotifyAuthUrl, setSpotifyAuthUrl] = useState(null);
  const [scoreTrackId, setScoreTrackId] = useState("");
  const [scoreResult, setScoreResult] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("pm_admin_secret");
      if (stored) { setSecret(stored); loadStats(stored); loadSyncs(stored); }
    } catch {}
  }, []); // eslint-disable-line

  const loadStats = async (s = secret) => {
    if (!s) return;
    try {
      const r = await fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${s}` } });
      if (r.ok) setStats(await r.json());
    } catch {}
  };

  const loadSyncs = async (s = secret) => {
    if (!s) return;
    try {
      const r = await fetch("/api/admin/playlist-syncs", { headers: { Authorization: `Bearer ${s}` } });
      if (r.ok) setSyncs(await r.json());
    } catch {}
  };

  // ── Big setup button: seed curators → run poll ────────────────────────────
  const handleSetup = async () => {
    setSetupRunning(true);
    setSetupLog([]);
    setSetupDone(false);

    const log = (msg, ok = null) => setSetupLog((prev) => [...prev, { msg, ok }]);

    try {
      log("Seeding curators...");
      const r1 = await fetch("/api/admin/seed-curators", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const d1 = await r1.json();
      if (!r1.ok) { log(`Seed failed: ${d1.error}`, false); setSetupRunning(false); return; }
      log(`Curators seeded — ${d1.inserted} new, ${d1.skipped} already existed`, true);

      log("Searching Spotify for indie tracks (8 queries)...");
      const r2 = await fetch("/api/cron/poll", { headers: { Authorization: `Bearer ${secret}` } });
      const d2 = await r2.json();
      const pollErrors = d2.errors?.filter(e => e.error) || [];
      if (d2.tracksFound === 0 && pollErrors.length) {
        log(`Poll errors: ${JSON.stringify(pollErrors.slice(0, 3))}`, false);
      } else if (d2.tracksFound === 0) {
        log(`Poll ran but found 0 tracks`, false);
      } else {
        log(`Found ${d2.tracksFound} tracks, ingested ${d2.newTracksIngested} new`, true);
      }
      log(`Popularity refreshed: ${d2.popularityRefreshed}, snapshots: ${d2.snapshotsTaken}`, pollErrors.length === 0);

      await loadStats(secret);
      setSetupDone(true);
    } catch (e) {
      log(`Unexpected error: ${e.message}`, false);
    }
    setSetupRunning(false);
  };

  const handlePoll = async () => {
    setPollRunning(true); setPollResult(null);
    try {
      const r = await fetch("/api/cron/poll", { headers: { Authorization: `Bearer ${secret}` } });
      setPollResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setPollResult({ ok: false, data: { error: e.message } }); }
    setPollRunning(false); loadStats();
  };

  const handleRefresh = async () => {
    setRefreshRunning(true); setRefreshResult(null);
    try {
      const r = await fetch("/api/admin/jobs/refresh-spotify", { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
      setRefreshResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setRefreshResult({ ok: false, data: { error: e.message } }); }
    setRefreshRunning(false); loadStats();
  };

  const handleSync = async () => {
    setSyncRunning(true); setSyncResult(null);
    try {
      const r = await fetch("/api/admin/jobs/sync-playlists", { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
      setSyncResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setSyncResult({ ok: false, data: { error: e.message } }); }
    setSyncRunning(false); loadSyncs();
  };

  const handleSpotifyAuth = async () => {
    try {
      const r = await fetch("/api/admin/spotify-auth", { headers: { Authorization: `Bearer ${secret}` } });
      const d = await r.json();
      if (d.authUrl) setSpotifyAuthUrl(d.authUrl);
    } catch {}
  };

  const [searchTestResult, setSearchTestResult] = useState(null);
  const [searchTestRunning, setSearchTestRunning] = useState(false);
  const [pipelineTestResult, setPipelineTestResult] = useState(null);
  const [pipelineTestRunning, setPipelineTestRunning] = useState(false);
  const [testDataResult, setTestDataResult] = useState(null);
  const [testDataRunning, setTestDataRunning] = useState(false);

  const handleSeedTestData = async () => {
    setTestDataRunning(true); setTestDataResult(null);
    try {
      const r = await fetch("/api/admin/seed-test-data", { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
      setTestDataResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setTestDataResult({ ok: false, data: { error: e.message } }); }
    setTestDataRunning(false); loadStats();
  };

  const handleClearTestData = async () => {
    if (!confirm("Delete all test_ tracks from the DB?")) return;
    setTestDataRunning(true); setTestDataResult(null);
    try {
      const r = await fetch("/api/admin/clear-test-data", { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
      setTestDataResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setTestDataResult({ ok: false, data: { error: e.message } }); }
    setTestDataRunning(false); loadStats();
  };

  const handleSearchTest = async () => {
    setSearchTestRunning(true); setSearchTestResult(null);
    try {
      const r = await fetch("/api/admin/test-search", { headers: { Authorization: `Bearer ${secret}` } });
      setSearchTestResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setSearchTestResult({ ok: false, data: { error: e.message } }); }
    setSearchTestRunning(false);
  };

  const handlePipelineTest = async () => {
    setPipelineTestRunning(true); setPipelineTestResult(null);
    try {
      const r = await fetch("/api/admin/test-pipeline", { headers: { Authorization: `Bearer ${secret}` } });
      setPipelineTestResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setPipelineTestResult({ ok: false, data: { error: e.message } }); }
    setPipelineTestRunning(false);
  };

  const handleTest = async () => {
    setTestResult("loading...");
    try {
      const r = await fetch("/api/admin/test-spotify", { headers: { Authorization: `Bearer ${secret}` } });
      setTestResult(JSON.stringify(await r.json(), null, 2));
    } catch (e) { setTestResult(e.message); }
  };

  const copyJSON = (data) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setToast("Copied!");
      setTimeout(() => setToast(null), 2000);
    } catch { setToast("Copy failed"); setTimeout(() => setToast(null), 2000); }
  };

  const handleScoreLookup = async () => {
    if (!scoreTrackId.trim()) return;
    try {
      const r = await fetch(`/api/admin/scoring/${scoreTrackId.trim()}`, { headers: { Authorization: `Bearer ${secret}` } });
      setScoreResult({ ok: r.ok, data: await r.json() });
    } catch (e) { setScoreResult({ ok: false, data: { error: e.message } }); }
  };

  return (
    <>
      <Head><title>Admin — Playlist Machine</title></Head>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          background: "var(--accent)", color: "#000",
          padding: "10px 20px", borderRadius: 4,
          fontSize: 12, fontWeight: 700, letterSpacing: "0.05em",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          animation: "fadeIn 0.15s ease",
        }}>
          {toast}
        </div>
      )}
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

        <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Auth */}
          <div style={card}>
            {label9("// Auth")}
            <input
              type="password"
              value={secret}
              onChange={(e) => { setSecret(e.target.value); try { localStorage.setItem("pm_admin_secret", e.target.value); } catch {} }}
              placeholder="Cron secret"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => { e.target.style.borderColor = "var(--border2)"; loadStats(e.target.value); loadSyncs(e.target.value); }}
            />
            {stats && (
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {[["Curators", `${stats.curators?.approved ?? "—"}/${stats.curators?.total ?? "—"}`],
                  ["Tracks", stats.tracks?.total ?? "—"],
                  ["Track Adds", stats.adds?.total ?? "—"],
                  ["Votes", stats.votes?.total ?? "—"]].map(([l, v]) => (
                  <div key={l} style={{ background: "var(--surface2)", borderRadius: 3, padding: "10px 0", textAlign: "center" }}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{v}</div>
                    <div style={{ fontSize: 8, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── BIG SETUP BUTTON ── */}
          <div style={{
            ...card,
            border: "1px solid var(--accent)",
            background: setupDone ? "rgba(184,240,80,0.06)" : "var(--surface)",
          }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>// One-click setup</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 8, marginTop: 0 }}>
              Seed Curators + Ingest Tracks
            </h2>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16, lineHeight: 1.7, marginTop: 0 }}>
              Seeds all 39 vetted curators, then runs 17 Spotify search queries to populate the chart. Takes about 60–90 seconds.
            </p>
            <button
              onClick={handleSetup}
              disabled={!secret || setupRunning}
              style={{
                width: "100%", padding: "18px 24px",
                background: setupRunning ? "var(--surface2)" : "var(--accent)",
                color: "#000", border: "none", borderRadius: 4,
                fontSize: 14, fontWeight: 700, cursor: (!secret || setupRunning) ? "default" : "pointer",
                letterSpacing: "0.06em", textTransform: "uppercase",
                opacity: (!secret || setupRunning) ? 0.6 : 1,
                transition: "opacity 0.2s",
              }}
            >
              {setupRunning ? "Running… please wait" : setupDone ? "✓ Done — Run Again?" : "⚡  Run Full Setup"}
            </button>

            {setupLog.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => copyJSON(setupLog)} style={{ fontSize: 9, padding: "3px 10px", background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--muted)", borderRadius: 2, cursor: "pointer", letterSpacing: "0.05em" }}>Copy JSON</button>
                </div>
                {setupLog.map((entry, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 11, alignItems: "flex-start" }}>
                    <span style={{
                      flexShrink: 0, color: entry.ok === true ? "var(--accent)" : entry.ok === false ? "#ff5555" : "var(--muted)",
                    }}>
                      {entry.ok === true ? "✓" : entry.ok === false ? "✗" : "·"}
                    </span>
                    <span style={{ color: entry.ok === false ? "#ff8888" : "var(--text)" }}>{entry.msg}</span>
                  </div>
                ))}
                {setupRunning && (
                  <div style={{ fontSize: 10, color: "var(--muted)", paddingLeft: 18, marginTop: 2 }}>
                    This may take a minute — Spotify search + DB writes for ~500 tracks…
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Test Data */}
          <div style={card}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>// Test Data</div>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 12px", lineHeight: 1.6 }}>
              Seed 50 fake tracks (prefixed <code style={{ background: "var(--surface2)", padding: "1px 5px", borderRadius: 2 }}>test_</code>) across all genres with varied scores. Clear them when done.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSeedTestData}
                disabled={!secret || testDataRunning}
                style={{ padding: "10px 16px", background: "var(--accent)", border: "none", color: "#000", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: (!secret || testDataRunning) ? "default" : "pointer", letterSpacing: "0.06em", textTransform: "uppercase", opacity: (!secret || testDataRunning) ? 0.5 : 1 }}
              >
                {testDataRunning ? "Working..." : "Seed Test Tracks"}
              </button>
              <button
                onClick={handleClearTestData}
                disabled={!secret || testDataRunning}
                style={{ padding: "10px 16px", background: "none", border: "1px solid #ff5555", color: "#ff8888", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: (!secret || testDataRunning) ? "default" : "pointer", letterSpacing: "0.06em", textTransform: "uppercase", opacity: (!secret || testDataRunning) ? 0.5 : 1 }}
              >
                Clear Test Tracks
              </button>
            </div>
            {testDataResult && <ResultBox result={testDataResult} onCopy={() => copyJSON(testDataResult.data)} />}
          </div>

          {/* Connect Spotify */}
          <div style={card}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>// Spotify OAuth</div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 8, marginTop: 0 }}>
              Connect Spotify Account
            </h2>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.7, marginTop: 0 }}>
              Required for playlist writes (sync-playlists job). Add the redirect URI to your{" "}
              <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Spotify Dashboard</a>{" "}
              first:
            </p>
            <code style={{ display: "block", padding: "7px 10px", background: "var(--surface2)", borderRadius: 2, fontSize: 10, color: "var(--text)", wordBreak: "break-all", marginBottom: 12 }}>
              {typeof window !== "undefined" ? `${window.location.origin}/api/admin/spotify-callback` : "/api/admin/spotify-callback"}
            </code>
            <button
              onClick={handleSpotifyAuth}
              disabled={!secret}
              style={{ padding: "10px 18px", background: "var(--accent)", color: "#000", border: "none", borderRadius: 3, fontSize: 11, fontWeight: 700, cursor: !secret ? "default" : "pointer", opacity: !secret ? 0.5 : 1 }}
            >
              Get Auth URL →
            </button>
            {spotifyAuthUrl && (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(184,240,80,0.07)", border: "1px solid var(--accent)", borderRadius: 3 }}>
                <div style={{ fontSize: 9, color: "var(--accent)", marginBottom: 6, letterSpacing: "0.1em" }}>OPEN IN BROWSER:</div>
                <a href={spotifyAuthUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "var(--accent)", wordBreak: "break-all" }}>{spotifyAuthUrl}</a>
              </div>
            )}
          </div>

          {/* Jobs */}
          <div style={card}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14 }}>// Jobs</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: pollRunning ? "Running poll…" : "Run Poll", onClick: handlePoll, disabled: pollRunning || !secret, result: pollResult },
                { label: refreshRunning ? "Refreshing…" : "Refresh Spotify Data", onClick: handleRefresh, disabled: refreshRunning || !secret, result: refreshResult },
                { label: syncRunning ? "Syncing…" : "Sync Spotify Playlists", onClick: handleSync, disabled: syncRunning || !secret, result: syncResult },
              ].map(({ label, onClick, disabled, result }) => (
                <div key={label.replace(/…$/, "")}>
                  <button
                    onClick={onClick}
                    disabled={disabled}
                    style={{
                      width: "100%", padding: "11px 16px",
                      background: disabled ? "var(--surface2)" : "var(--surface2)",
                      border: "1px solid var(--border2)",
                      color: disabled ? "var(--muted)" : "var(--accent)",
                      borderRadius: 3, fontSize: 11, fontWeight: 700,
                      cursor: disabled ? "default" : "pointer",
                      letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "left",
                    }}
                  >
                    {label}
                  </button>
                  {result && <ResultBox result={result} onCopy={copyJSON} />}
                </div>
              ))}
            </div>

            {syncs?.logs?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 9, color: "var(--faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Recent Sync Logs</div>
                <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
                  <thead><tr style={{ color: "var(--muted)" }}>
                    {["Genre", "Status", "Tracks", "Started"].map(h => <th key={h} style={{ padding: "3px 8px", borderBottom: "1px solid var(--border)", textAlign: "left", fontWeight: 600 }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {syncs.logs.slice(0, 10).map((log, i) => (
                      <tr key={i}>
                        <td style={{ padding: "3px 8px", borderBottom: "1px solid var(--border)", color: "var(--text)" }}>{log.genre}</td>
                        <td style={{ padding: "3px 8px", borderBottom: "1px solid var(--border)", color: log.status === "success" ? "var(--accent)" : "#ff5555" }}>{log.status}</td>
                        <td style={{ padding: "3px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{log.item_count ?? "—"}</td>
                        <td style={{ padding: "3px 8px", borderBottom: "1px solid var(--border)", color: "var(--faint)" }}>{log.started_at ? new Date(log.started_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Diagnostics */}
          <div style={card}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14 }}>// Diagnostics</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                onClick={handleSearchTest}
                disabled={!secret || searchTestRunning}
                style={{ padding: "10px 16px", background: "var(--accent)", border: "none", color: "#000", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: (!secret || searchTestRunning) ? "default" : "pointer", letterSpacing: "0.06em", textTransform: "uppercase", opacity: (!secret || searchTestRunning) ? 0.5 : 1 }}
              >
                {searchTestRunning ? "Testing..." : "Test Single Search"}
              </button>
              <button
                onClick={handleTest}
                disabled={!secret}
                style={{ padding: "10px 16px", background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--accent)", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: !secret ? "default" : "pointer", letterSpacing: "0.06em", textTransform: "uppercase", opacity: !secret ? 0.5 : 1 }}
              >
                Test Spotify API
              </button>
            </div>
            {searchTestResult && <ResultBox result={searchTestResult} onCopy={() => copyJSON(searchTestResult.data)} />}

            <div style={{ marginTop: 8 }}>
              <button
                onClick={handlePipelineTest}
                disabled={!secret || pipelineTestRunning}
                style={{ padding: "10px 16px", background: "var(--surface2)", border: "1px solid var(--border2)", color: "var(--muted)", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: (!secret || pipelineTestRunning) ? "default" : "pointer", letterSpacing: "0.06em", textTransform: "uppercase", opacity: (!secret || pipelineTestRunning) ? 0.5 : 1 }}
              >
                {pipelineTestRunning ? "Testing..." : "Test DB Pipeline (mock tracks)"}
              </button>
              {pipelineTestResult && <ResultBox result={pipelineTestResult} onCopy={() => copyJSON(pipelineTestResult.data)} />}
            </div>

            {testResult && (
              <pre style={{ marginTop: 12, fontSize: 9, color: "var(--muted)", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--surface2)", padding: 12, borderRadius: 3 }}>
                {testResult}
              </pre>
            )}

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <input
                type="text"
                value={scoreTrackId}
                onChange={(e) => setScoreTrackId(e.target.value)}
                placeholder="Spotify track ID — score breakdown"
                style={{ ...inputStyle, flex: 1 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
                onKeyDown={(e) => e.key === "Enter" && handleScoreLookup()}
              />
              <button
                onClick={handleScoreLookup}
                disabled={!secret || !scoreTrackId.trim()}
                style={{ padding: "8px 14px", background: "var(--accent)", color: "#000", border: "none", borderRadius: 3, fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
              >
                Look Up
              </button>
            </div>
            {scoreResult && <ResultBox result={scoreResult} />}
          </div>

        </div>
      </div>
    </>
  );
}
