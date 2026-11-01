// Runs once when the Next.js server starts: kick off discovery/polling in the background.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureStarted } = await import("./lib/store");
    ensureStarted();
  }
}
