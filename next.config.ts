import type { NextConfig } from "next";

// NEXT_STANDALONE=1 builds a self-contained server (.next-standalone/standalone/server.js) for
// running on another machine, e.g. an Android phone (scripts/pack-android.ps1). A separate
// distDir keeps the PC's own .next (used by `next start`) untouched while that build runs.
const standalone = process.env.NEXT_STANDALONE === "1";

const nextConfig: NextConfig = standalone ? { output: "standalone", distDir: ".next-standalone" } : {};

export default nextConfig;
