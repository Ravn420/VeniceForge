import type { CommandRecord } from "@forge/contracts";

const SENTINELS = new Set(["!!", ":retry", "__retry__"]);

export function isRetrySentinel(argv: readonly string[]): boolean {
  return argv.length === 1 && SENTINELS.has(argv[0] ?? "");
}

export function lastFailed(history: readonly CommandRecord[]): CommandRecord | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const rec = history[i];
    if (!rec || isRetrySentinel(rec.argv)) continue;
    if (rec.status === "failed" || rec.status === "timed_out") {
      return rec;
    }
  }
  return null;
}
