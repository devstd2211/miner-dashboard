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
    expect(s.pool.connected, `${m.hostname} pool connected`).toBe(true);
    // Bitcoin network difficulty is in the 1e13..1e16 range; pool share target is far below.
    expect(s.networkDifficulty!).toBeGreaterThan(1e13);
    expect(s.networkDifficulty!).toBeLessThan(1e16);
    expect(s.poolDifficulty!).toBeGreaterThan(0);
    expect(s.blockHeight!).toBeGreaterThan(900_000);
  }
});

test("UI: dashboard renders summary, cards and chip tables without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await expect(page.getByText("Total hashrate")).toBeVisible();
  await expect(page.getByText("Online", { exact: true }).locator("..")).toContainText("3 / 3"); // online count tile
  await expect(page.getByText("TH/s").first()).toBeVisible();
  await expect(page.getByText("Network difficulty")).toBeVisible();
  await expect(page.getByTestId("diff-progress")).toContainText("of network");

  // One card per miner, each with a sparkline section and a pool section.
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
  // Parameters and stats/chips sit in collapsed blocks: open them all
  // (3 "parameters", 2 "stats · chips" on the NerdQAxe miners, 1 "stats" on the Bitaxe).
  await expect(page.getByRole("button", { name: "parameters ▸" })).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^stats( · chips)? ▸$/ })).toHaveCount(3);
  for (const name of ["parameters ▸", /^stats( · chips)? ▸$/]) {
    const closed = page.getByRole("button", { name });
    while ((await closed.count()) > 0) await closed.first().click();
  }
  // Chip tables only on the two NerdQAxe miners: 8 + 4 rows.
  await expect(page.locator("table")).toHaveCount(2);
  await expect(page.locator("table tbody tr")).toHaveCount(12);

  // Each card links to the miner's own web UI at its IP.
  const data: MinersResponse = await (await page.request.get("/api/miners")).json();
  for (const m of data.miners) {
    await expect(page.locator(`a[href="http://${m.ip}/"]`, { hasText: "UI ↗" })).toHaveAttribute("target", "_blank");
  }
  // Pool host links to the pool's stats page for the wallet (all three mine on Braiins Solo).
  await expect(page.locator('a[href^="https://solo.braiins.com/stats/bc1"]')).toHaveCount(data.miners.length);

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

test("Feed: live nonces arrive from every miner and show up on the cards", async ({ page }) => {
  const data: MinersResponse = await (await page.request.get("/api/miners")).json();
  await page.goto("/");

  // Read the SSE stream in the page until every miner has sent at least one parsed nonce.
  const seen = await page.evaluate(
    (ids) =>
      new Promise<Record<string, { nonce: string; status: string }>>((resolve) => {
        const got: Record<string, { nonce: string; status: string }> = {};
        const es = new EventSource("/api/feed");
        const done = () => (es.close(), resolve(got));
        es.onmessage = (e) => {
          const { id, events } = JSON.parse(e.data);
          if (events.length) got[id] = events[0];
          if (ids.every((i) => got[i])) done();
        };
        setTimeout(done, 30_000);
      }),
    data.miners.map((m) => m.id),
  );
  for (const m of data.miners) {
    expect(seen[m.id]?.nonce, `${m.hostname} nonce`).toMatch(/^[0-9A-F]{8}$/);
  }
  // Live nonces sit collapsed at the bottom of each card: open one, it shows a nonce
  // (8 lowercase hex digits).
  await page.getByRole("button", { name: "live nonces ▸" }).first().click();
  await expect(page.locator("span.font-mono, div.font-mono span").filter({ hasText: /^[0-9a-f]{8}$/ }).first()).toBeVisible();
});

test("UI: 15 miners switch to compact cards, ranked by best share, table view works", async ({ page }) => {
  // Clone the real miners into 15 with mocked APIs; two of them offline.
  const real: MinersResponse = await (await page.request.get("/api/miners")).json();
  const miners = Array.from({ length: 15 }, (_, i) => {
    const m = structuredClone(real.miners[i % real.miners.length]);
    m.id = `AA:00:00:00:00:${i.toString(16).padStart(2, "0")}`;
    m.hostname = `Sim-${String(i + 1).padStart(2, "0")}`;
    if (i === 4 || i === 9) m.online = false;
    return m;
  });
  await page.route("**/api/miners", (r) => r.fulfill({ json: { ...real, now: Date.now(), miners } }));
  await page.route("**/api/feed", (r) => r.fulfill({ contentType: "text/event-stream", body: "retry: 600000\n\n" }));
  // Start without a saved view choice (only on the first load, so reload keeps the choice).
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("sim")) localStorage.removeItem("miners.view");
    sessionStorage.setItem("sim", "1");
  });

  await page.goto("/");
  await expect(page.getByText("Online", { exact: true }).locator("..")).toContainText("13 / 15");
  await expect(page.getByTestId("miner-compact")).toHaveCount(15);
  await expect(page.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
  // Leaderboard: the best share since boot first (with the trophy), offline miners last.
  const leader = miners
    .filter((m) => m.online)
    .sort((a, b) => (b.snapshot?.bestSessionDiff ?? 0) - (a.snapshot?.bestSessionDiff ?? 0) || a.hostname.localeCompare(b.hostname))[0];
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.nth(0)).toHaveText(leader.hostname);
  await expect(page.getByTestId("miner-compact").nth(0)).toContainText("🏆 #1");
  expect((await headings.allTextContents()).slice(-2).sort()).toEqual(["Sim-05", "Sim-10"]);

  // "more" opens the full card in place, "less" closes it.
  await page.getByRole("button", { name: "more ▾" }).nth(2).click();
  await expect(page.getByTestId("miner-compact")).toHaveCount(14);
  await page.getByRole("button", { name: "less ▴" }).click();
  await expect(page.getByTestId("miner-compact")).toHaveCount(15);

  // Table: one row per miner; the choice is remembered.
  await page.getByRole("button", { name: "Table" }).click();
  await expect(page.locator('[data-testid="miner-table"] > tbody > tr')).toHaveCount(15);
  await page.reload();
  await expect(page.getByTestId("miner-table")).toBeVisible();
});

test("UI: a miner that takes the lead moves to the first card and glows", async ({ page }) => {
  const real: MinersResponse = await (await page.request.get("/api/miners")).json();
  const best = Math.max(...real.miners.map((m) => m.snapshot?.bestSessionDiff ?? 0));
  const last = real.miners.reduce((a, b) => ((a.snapshot?.bestSessionDiff ?? 0) <= (b.snapshot?.bestSessionDiff ?? 0) ? a : b));
  let lead = false;
  await page.route("**/api/miners", (r) => {
    const data: MinersResponse = structuredClone(real);
    // Once `lead` is set, the last miner has found a share better than everyone's.
    if (lead) data.miners.find((m) => m.id === last.id)!.snapshot!.bestSessionDiff = best * 2;
    return r.fulfill({ json: { ...data, now: Date.now() } });
  });
  await page.goto("/");
  const first = page.getByRole("heading", { level: 2 }).first();
  await expect(first).toHaveText(real.miners.find((m) => m.snapshot?.bestSessionDiff === best)!.hostname);
  await expect(page.locator(".rank-up")).toHaveCount(0);
  lead = true;
  await expect(first).toHaveText(last.hostname, { timeout: 10_000 }); // next poll is 5 s later
  await expect(page.locator(".rank-up")).toHaveCount(1);
  await expect(page.locator(".rank-up")).toContainText("🏆 #1");
});

test("Demo: ?demo=12 shows 12 made-up miners without calling the miners API", async ({ page }) => {
  let apiCalls = 0;
  page.on("request", (r) => r.url().includes("/api/") && apiCalls++);
  await page.goto("/?demo=12");
  await expect(page.getByText("demo data")).toBeVisible();
  await expect(page.getByTestId("miner-compact")).toHaveCount(12); // > 6 miners: compact by default
  await expect(page.getByText("Online", { exact: true }).locator("..")).toContainText("11 / 12");
  await expect(page.getByText("🏆 #1")).toHaveCount(1);
  expect(apiCalls).toBe(0);
});

test("API: best nonce of the last minutes, best-share log and long history", async ({ request }) => {
  // The 10-minute best comes from the live log feed: give it a few seconds after a restart.
  let data: MinersResponse | undefined;
  for (let i = 0; i < 15; i++) {
    data = await (await request.get("/api/miners")).json();
    if (data!.miners.every((m) => !m.online || m.recentBest)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  expect(Array.isArray(data!.records)).toBe(true);
  for (const m of data!.miners.filter((m) => m.online)) {
    expect(m.recentBest, `${m.hostname} recentBest`).toBeGreaterThan(0);
  }
  const res = await request.get(`/api/history?id=${encodeURIComponent(data!.miners[0].id)}&days=7`);
  expect(res.ok()).toBe(true);
  const { points } = await res.json();
  expect(Array.isArray(points)).toBe(true);
  expect((await request.get("/api/history")).status()).toBe(400); // id is required
});

test("Demo: card blocks open per grid row, not for the whole page", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); // 4 cards per row
  await page.addInitScript(() => {
    localStorage.setItem("miners.view", "full");
    localStorage.removeItem("miners.folds");
  });
  await page.goto("/?demo=10");
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(10);
  const params = page.getByRole("button", { name: /^parameters/ });
  const open = async () => (await params.allTextContents()).map((t) => (t.includes("▾") ? 1 : 0)).join("");
  await params.nth(5).click(); // second row: cards 5..8
  await expect.poll(open).toBe("0000111100");
  await page.setViewportSize({ width: 1000, height: 1080 }); // 2 per row
  await params.nth(0).click(); // first row: cards 1..2
  await expect.poll(open).toBe("1111000000");
});

test("Demo: 10-minute best, share line, best-share log and 7d chart without API calls", async ({ page }) => {
  let apiCalls = 0;
  page.on("request", (r) => r.url().includes("/api/") && apiCalls++);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => localStorage.setItem("miners.view", "full"));
  await page.goto("/?demo=6");
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(6);
  await expect(page.getByTestId("share-line")).toHaveCount(1);
  await page.getByRole("button", { name: /^stats/ }).first().click();
  await expect(page.getByText("Best nonce (10 min)").first()).toBeVisible();
  await expect(page.getByText("Best nonce (10 min)").first().locator("..")).toContainText(/\d/);
  // Long chart range: the temperature line appears.
  await page.getByRole("button", { name: "7d" }).first().click();
  await expect(page.getByTestId("temp-line").first()).toBeAttached();
  // Best-share log opens and lists records.
  await page.getByTestId("best-records").locator("summary").click();
  await expect(page.getByTestId("best-records").locator("tbody tr").first()).toBeVisible();
  expect(apiCalls).toBe(0);
});
