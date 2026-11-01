import { defineConfig } from "@playwright/test";

// E2E smoke tests against the real miners on the LAN.
// Uses the already running dashboard (e.g. started by autostart) or starts `npm start`.
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", screenshot: "only-on-failure" },
  outputDir: "test-results",
  webServer: {
    command: "npm start",
    url: "http://localhost:3100/api/miners",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
