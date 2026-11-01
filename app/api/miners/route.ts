import { ensureStarted, getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  ensureStarted();
  return Response.json(getState());
}
