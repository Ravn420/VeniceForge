import { z } from "zod";
import { CheckpointId, CommandId, EpochMs, ProjectId, RunId } from "./primitives.js";

export const CheckpointTrigger = z.enum([
  "before_write_batch", "before_destructive", "before_remedy", "manual", "agent_step"
]);
export type CheckpointTrigger = z.infer<typeof CheckpointTrigger>;

export const Checkpoint = z.object({
  id: CheckpointId,
  projectId: ProjectId,
  runId: RunId.nullable(),
  trigger: CheckpointTrigger,
  causedBy: CommandId.nullable(),
  label: z.string().max(200),
  createdAt: EpochMs,
  treeHash: z.string().length(64),
  sizeBytes: z.number().int().nonnegative(),
  restorable: z.boolean().default(true)
});
export type Checkpoint = z.infer<typeof Checkpoint>;

export const RestoreResult = z.object({
  checkpointId: CheckpointId,
  restoredAt: EpochMs,
  filesChanged: z.number().int().nonnegative(),
  ok: z.boolean(),
  error: z.string().nullable()
});
export type RestoreResult = z.infer<typeof RestoreResult>;

export const DestructiveRule = z.object({
  id: z.string(),
  pattern: z.string(),
  description: z.string(),
  severity: z.number().int().min(1).max(3),
  requiresConfirmBelow: z.number().int().min(0).max(3)
});
export type DestructiveRule = z.infer<typeof DestructiveRule>;

export const DESTRUCTIVE_RULES: readonly DestructiveRule[] = [
  { id: "rm-rf", pattern: "rm\\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\\b", description: "recursive force delete", severity: 3, requiresConfirmBelow: 2 },
  { id: "git-reset-hard", pattern: "git\\s+reset\\s+--hard", description: "discards uncommitted work", severity: 3, requiresConfirmBelow: 2 },
  { id: "git-push-force", pattern: "git\\s+push\\s+.*(--force|-f)\\b", description: "rewrites remote history", severity: 3, requiresConfirmBelow: 2 },
  { id: "drop-table", pattern: "DROP\\s+(TABLE|DATABASE|SCHEMA)", description: "drops persistent data", severity: 3, requiresConfirmBelow: 2 },
  { id: "chmod-r", pattern: "chmod\\s+-R", description: "recursive permission change", severity: 2, requiresConfirmBelow: 1 },
  { id: "truncate", pattern: "truncate\\s+-s\\s*0", description: "empties files", severity: 2, requiresConfirmBelow: 1 },
  { id: "mv-mass", pattern: "mv\\s+.*\\*", description: "mass move", severity: 1, requiresConfirmBelow: 0 }
];

export function matchDestructive(argv: string[]): DestructiveRule[] {
  const joined = argv.join(" ");
  return DESTRUCTIVE_RULES.filter((r) => new RegExp(r.pattern).test(joined));
}