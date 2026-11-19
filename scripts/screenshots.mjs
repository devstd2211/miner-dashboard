// README screenshots of the three views with made-up miners (demo mode, ?demo=N),
// so no real addresses or wallets end up on GitHub.
//   node scripts/screenshots.mjs [baseURL] [miners]
// The dashboard must be running (default http://localhost:3100); writes docs/{cards,compact,table}.png.
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:3100";
const count = Number(process.argv[3] ?? 10);
const docs = fileURLToPath(new URL("../docs/", import.meta.url));

const browser = await chromium.launch();
for (const view of ["full", "compact", "table"]) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: "dark" });
  await page.addInitScript((v) => localStorage.setItem("miners.view", v), view);
  await page.goto(`${base}/?demo=${count}`);
  await page.getByText("demo data").waitFor();
  const rows = view === "table" ? page.locator('[data-testid="miner-table"] > tbody > tr') : page.getByRole("heading", { level: 2 });
  await rows.nth(count - 1).waitFor();
  // Dev-mode badge; the newest-nonce fade-in (demo feeds are regenerated on every update, so the
  // first cell would always be caught half-transparent).
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; } .nonce-in { animation: none !important; }" });
  // Parameters, stats · chips and live nonces start collapsed: open them for the picture.
  for (const name of ["parameters ▸", /^stats( · chips)? ▸$/, "live nonces ▸"]) {
    const closed = page.getByRole("button", { name });
    if (view === "full") while ((await closed.count()) > 0) await closed.first().click();
  }
  await page.waitForTimeout(500);
  const file = `${docs}${view === "full" ? "cards" : view}.png`;
  // Finished animations: the newest nonce fades in, and demo nonces arrive all the time.
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  console.log("saved", file);
  await page.close();
}
await browser.close();
