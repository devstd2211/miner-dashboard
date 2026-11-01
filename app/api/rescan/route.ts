import { ensureStarted, getState, rescan } from "@/lib/store";

export const dynamic = "force-dynamic";

// Waits for the scan to finish (~10 s for one /24) and returns the fresh state.
export async function POST() {
  ensureStarted();
  try {
    const found = await rescan();
    return Response.json({ found, ...getState() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
