// Long hashrate/temperature history of one miner: GET /api/history?id=<miner id>&days=7
import { getLongHistory } from "@/lib/long-history";
import { ensureStarted } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  ensureStarted();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days")) || 7));
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  return Response.json({ points: getLongHistory(id, days * 86_400_000) });
}
