import { useState } from "react";
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

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [minFollowers, setMinFollowers] = useState("1000");
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [pollRunning, setPollRunning] = useState(false);
  const [pollResult, setPollResult] = useState(null);

  const handleImport = async (e) => {
    e.preventDefault();
    setImportRunning(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/admin/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ minFollowers: Number(minFollowers) }),
      });
      const data = await res.json();
      setImportResult({ ok: res.ok, data });
    } catch {
      setImportResult({ ok: false, data: { error: "Network error" } });
    }
    setImportRunning(false);
  };

  const handlePoll = async () => {
    setPollRunning(true);
    setPollResult(null);
    try {
      const res = await fetch("/api/cron/poll", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      setPollResult({ ok: res.ok, data });
    } catch {
      setPollResult({ ok: false, data: { error: "Network error" } });
    }
    setPollRunning(false);
  };

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "var(--surface2)", border: "1px solid var(--border2)",
    color: "var(--text)", fontSize: 12, padding: "8px 14px",
    borderRadius: 3, outline: "none",
  };

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
      color: result.ok ? "var(--accent)" : "#ff8888",
    }}>
      {result.ok
        ? <pre style={{ margin: 0, fontSize: 10, whiteSpace: "pre-wrap", color: "var(--text)" }}>{JSON.stringify(result.data, null, 2)}</pre>
        : result.data.error}
    </div>
  );

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

        <div style={{ maxWidth: 540, margin: "0 auto", padding: "40px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 12 }}>
              // Auth
            </div>
            {fieldLabel("Cron Secret")}
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Required for all actions"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
            />
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
              // Step 1
            </div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              Poll Playlists
            </h2>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16, lineHeight: 1.7 }}>
              Fetches all approved curator playlists from Spotify, detects new track adds, and refreshes popularity scores. Run this after importing to populate the chart.
            </p>
            {btn(
              pollRunning ? "Polling — may take a few minutes..." : "Trigger Poll →",
              handlePoll,
              pollRunning || !secret,
              pollRunning
            )}
            {resultBox(pollResult)}
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 24 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
              // Step 2 (optional)
            </div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
              Discover Playlists
            </h2>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16, lineHeight: 1.7 }}>
              Discovers new playlists from Spotify editorial and genre categories and imports those meeting the follower minimum.
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
              {btn(
                importRunning ? "Importing..." : "Run Discovery →",
                handleImport,
                importRunning || !secret,
                importRunning
              )}
            </form>
            {resultBox(importResult)}
          </div>

        </div>
      </div>
    </>
  );
}
