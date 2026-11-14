import { z } from "zod";
import { CommandId, EpochMs, ProjectId } from "./primitives.js";

export const Ecosystem = z.enum(["npm", "pypi", "go", "crates"]);
export type Ecosystem = z.infer<typeof Ecosystem>;

export const InstallRequest = z.object({
  projectId: ProjectId,
  ecosystem: Ecosystem,
  name: z.string().min(1).max(214),
  version: z.string().min(1).max(64),
  registry: z.string().url(),
  allowScripts: z.boolean().default(false),
  typosquatDistance: z.number().int().nonnegative().nullable().default(null)
});
export type InstallRequest = z.infer<typeof InstallRequest>;

export const InstallBlockedReason = z.enum([
  "off_allowlist_registry", "scripts_not_approved", "typosquat_suspect",
  "version_range_not_exact", "no_lockfile_diff"
]);
export type InstallBlockedReason = z.infer<typeof InstallBlockedReason>;

export const InstallOutcome = z.object({
  request: InstallRequest,
  commandId: CommandId,
  ok: z.boolean(),
  tarballHash: z.string().nullable(),
  newTransitive: z.array(z.string()).default([]),
  lockfileDiff: z.string().nullable(),
  blockedReason: InstallBlockedReason.nullable(),
  at: EpochMs
});
export type InstallOutcome = z.infer<typeof InstallOutcome>;

export const TYPOSQUAT_THRESHOLD = 2;

/** Levenshtein, capped for speed on long names. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}

export function isTyposquatSuspect(name: string, known: readonly string[]): boolean {
  if (known.includes(name)) return false;
  return known.some((k) => editDistance(name, k) <= TYPOSQUAT_THRESHOLD);
}