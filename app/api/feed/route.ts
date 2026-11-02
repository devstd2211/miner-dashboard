// Server-sent events: live nonce/share feed of every miner (see lib/share-feed.ts).
// Each message is {id, events}: the miner id and its latest nonces, newest first.
import { getFeeds, subscribe } from "@/lib/share-feed";
import { ensureStarted } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  ensureStarted();
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(ctrl) {
      const write = (s: string) => {
        try {
          ctrl.enqueue(enc.encode(s));
        } catch {
          cleanup(); // client went away
        }
      };
      const send = (id: string, events: unknown) => write(`data: ${JSON.stringify({ id, events })}\n\n`);
      getFeeds().forEach(([id, events]) => send(id, events));
      const unsubscribe = subscribe(send);
      const keepAlive = setInterval(() => write(": keep-alive\n\n"), 15_000);
      cleanup = () => {
        unsubscribe();
        clearInterval(keepAlive);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          ctrl.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
