import { expect, test, type ConsoleMessage } from "@playwright/test";
import type { MinersResponse } from "../lib/types";

// Expectations for this home setup: NerdOctaxe (8 chips) + NerdQAxe++ (4 chips) + Bitaxe Gamma.

test("API: miners are discovered and report sane data", async ({ request }) => {
  const res = await request.get("/api/miners");
  expect(res.ok()).toBe(true);
  const data: MinersResponse = await res.json();

  const nerd = data.miners.filter((m) => m.type === "nerdqaxe");
  expect(nerd.map((m) => m.snapshot?.chips?.length).sort()).toEqual([4, 8]);
  expect(data.miners.some((m) => m.type === "axeos")).toBe(true);

  // No duplicates: one entry per MAC.
  const ids = data.miners.map((m) => m.id);
  expect(new Set(ids).size).toBe(ids.length);

  for (const m of data.miners) {
    expect(m.online, `${m.hostname} online`).toBe(true);
    const s = m.snapshot!;
    expect(s.hashRate).toBeGreaterThan(100); // GH/s
    expect(s.power).toBeGreaterThan(5); // W
    expect(s.voltage!).toBeGreaterThan(3); // V, not mV
    expect(s.voltage!).toBeLessThan(15);
    expect(s.expectedHashRate!).toBeGreaterThan(0);
    // Hashrate within 70..130% of expected: catches unit mistakes (MH/s vs GH/s etc).
    const ratio = (s.hashRate1h ?? s.hashRate) / s.expectedHashRate!;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.3);
    expect(s.pool.host).toBeTruthy();
  }
});

test("UI: dashboard renders summary, cards and chip tables without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByText("Total hashrate")).toBeVisible();
  await expect(page.getByText(/^\d+ \/ \d+$/)).toHaveText(/^3 \/ 3$/); // online count tile
  await expect(page.getByText("TH/s").first()).toBeVisible();

  // One card per miner, each with a sparkline section and a pool section.
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
  // Chip tables only on the two NerdQAxe miners: 8 + 4 rows.
  await expect(page.locator("table")).toHaveCount(2);
  await expect(page.locator("table tbody tr")).toHaveCount(12);

  // Each card links to the miner's own web UI at its IP.
  const data: MinersResponse = await (await page.request.get("/api/miners")).json();
  for (const m of data.miners) {
    await expect(page.locator(`a[href="http://${m.ip}/"]`, { hasText: "UI ↗" })).toHaveAttribute("target", "_blank");
  }

  // Error % cells are colored green / amber / red.
  const colors = await page.locator("table tbody td:last-child").evaluateAll((tds) =>
    tds.map((td) => td.className.match(/text-(emerald|amber|red)-400/)?.[1]),
  );
  expect(colors.every(Boolean)).toBe(true);

  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("UI: Rescan finds the miners again", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: /Rescan|Scanning/ });
  await expect(button).toHaveText("Rescan");

  const rescan = page.waitForResponse((r) => r.url().endsWith("/api/rescan"), { timeout: 45_000 });
  await button.click();
  await expect(button).toHaveText("Scanning…");
  const body = await (await rescan).json();
  expect(body.found).toBeGreaterThanOrEqual(3);

  await expect(button).toHaveText("Rescan", { timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
});
