import { useState } from "react";
import Head from "next/head";
import Link from "next/link";

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [minFollowers, setMinFollowers] = useState("1000");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async (e) => {
    e.preventDefault();
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ minFollowers: Number(minFollowers) }),
      });
      const data = await res.json();
      setResult({ ok: res.ok, data });
    } catch {
      setResult({ ok: false, data: { error: "Network error" } });
    }
    setRunning(false);
  };

  const field = (label, value, onChange, type = "text") => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 6 }}>
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "var(--surface2)", border: "1px solid var(--border2)",
          color: "var(--text)", fontSize: 12, padding: "8px 14px",
          borderRadius: 3, outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.target.style.borderColor = "var(--border2)")}
      />
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

        <div style={{ maxWidth: 540, margin: "0 auto", padding: "40px 24px" }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: 28 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 }}>
              // Bulk Import
            </div>
            <h2 style={{ fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              Import from Spotify
            </h2>
            <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 24, lineHeight: 1.7 }}>
              Searches Spotify across 15 music discovery queries and imports all public playlists meeting the follower minimum.
            </p>

            <form onSubmit={handleImport}>
              {field("Cron Secret", secret, setSecret, "password")}
              {field("Min Followers", minFollowers, setMinFollowers, "number")}

              <button
                type="submit"
                disabled={running || !secret}
                style={{
                  width: "100%",
                  background: running || !secret ? "var(--surface2)" : "var(--accent)",
                  color: "#000", border: "none", fontSize: 11, fontWeight: 700,
                  padding: "12px 24px", cursor: running || !secret ? "default" : "pointer",
                  letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: 3,
                  opacity: running ? 0.6 : 1,
                }}
              >
                {running ? "Importing — this takes ~2 minutes..." : "Run Bulk Import →"}
              </button>
            </form>

            {result && (
              <div style={{
                marginTop: 20, padding: "16px 20px", borderRadius: 3,
                background: result.ok ? "rgba(184,240,80,0.08)" : "rgba(255,85,85,0.08)",
                border: `1px solid ${result.ok ? "var(--accent)" : "var(--hot)"}`,
              }}>
                {result.ok ? (
                  <div style={{ fontSize: 12 }}>
                    {[
                      ["Playlists found", result.data.candidates],
                      ["Imported", result.data.imported],
                      ["Below follower min", result.data.skippedFollowers],
                      ["Already tracked", result.data.skippedExisting],
                      ["Errors", result.data.errors],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ color: "var(--muted)" }}>{label}</span>
                        <span style={{ color: "var(--text)", fontWeight: 700 }}>{val}</span>
                      </div>
                    ))}
                    {result.data.searchErrors?.length > 0 && (
                      <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(255,85,85,0.08)", borderRadius: 3, fontSize: 10, color: "#ff8888" }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Search errors:</div>
                        {result.data.searchErrors.map((e, i) => <div key={i}>{e}</div>)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "#ff8888" }}>{result.data.error}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
