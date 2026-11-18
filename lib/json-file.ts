// Small JSON files in data/: atomic writes (temp file + rename), one at a time per file.
// Several miners are polled in parallel and may save the same file at once; without the queue
// two writes would share the temp file and the second rename would fail. If more saves come in
// while one is running, only the newest data is written next.

import fs from "node:fs/promises";
import path from "node:path";

// DATA_DIR moves the data folder (e.g. a dev server next to the running dashboard).
export const dataFile = (name: string) => path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), name);

export async function readJsonFile<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return undefined; // missing or broken file
  }
}

const g = globalThis as unknown as { __jsonWrites?: Map<string, { running: Promise<void>; next?: () => unknown }> };
const queues = (g.__jsonWrites ??= new Map());

async function write(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + ".tmp", JSON.stringify(data));
  await fs.rename(file + ".tmp", file);
}

/** Save `get()` to `file`; `get` is called right before writing, so the newest data wins. */
export function writeJsonFile(file: string, get: () => unknown): Promise<void> {
  const q = queues.get(file);
  if (q) {
    q.next = get; // replaces a save that has not started yet
    return q.running;
  }
  const entry: { running: Promise<void>; next?: () => unknown } = { running: Promise.resolve() };
  entry.running = (async () => {
    try {
      await write(file, get());
      while (entry.next) {
        const n = entry.next;
        entry.next = undefined;
        await write(file, n());
      }
    } finally {
      queues.delete(file);
    }
  })();
  queues.set(file, entry);
  return entry.running;
}
