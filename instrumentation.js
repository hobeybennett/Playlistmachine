export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./lib/db.js");
    await runMigrations().catch((e) => console.error("[startup] migrations failed:", e.message));
  }
}
