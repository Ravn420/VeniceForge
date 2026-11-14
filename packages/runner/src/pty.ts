import type { PtyLike, Sandbox } from "./sandbox.js";

/**
 * Handle alias kept for API clarity. Intentionally structural: PtyHandle IS-A PtyLike.
 */
export type PtyHandle = PtyLike;

export function spawnPty(sandbox: Sandbox, cwd: string, shell = "bash"): PtyHandle {
  return sandbox.spawnPty(shell, cwd);
}