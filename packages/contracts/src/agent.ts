import { z } from "zod";
import { Actor, ApprovalId, CheckpointId, CommandId, EpochMs, ProjectId, RunId, SessionId, StepId } from "./primitives.js";
import { PermissionGrant, PermissionScope } from "./trust.js";

export const AgentMode = z.enum(["ask", "plan", "agent"]);
export type AgentMode = z.infer<typeof AgentMode>;

export const RunStatus = z.enum([
  "queued", "planning", "awaiting_approval", "running", "diagnosing",
  "blocked", "succeeded", "failed", "aborted"
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const StepKind = z.enum([
  "model_call", "tool_call", "file_write", "command", "remedy", "checkpoint", "diagnosis", "note"
]);
export type StepKind = z.infer<typeof StepKind>;

export const AgentStep = z.object({
  id: StepId,
  runId: RunId,
  index: z.number().int().nonnegative(),
  kind: StepKind,
  at: EpochMs,
  label: z.string().max(200),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  credits: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative().nullable(),
  commandId: CommandId.nullable(),
  checkpointId: CheckpointId.nullable(),
  error: z.string().nullable()
});
export type AgentStep = z.infer<typeof AgentStep>;

export const AgentRun = z.object({
  id: RunId,
  projectId: ProjectId,
  sessionId: SessionId.nullable(),
  actor: Actor,
  mode: AgentMode,
  status: RunStatus,
  autonomy: z.number().int().min(0).max(3),
  planMarkdown: z.string().nullable(),
  touchedManifest: z.array(z.string()).default([]),
  startedAt: EpochMs,
  endedAt: EpochMs.nullable(),
  creditsUsed: z.number().nonnegative().default(0),
  creditsCap: z.number().positive(),
  steps: z.array(AgentStep).default([])
});
export type AgentRun = z.infer<typeof AgentRun>;

export const Approval = z.object({
  id: ApprovalId,
  runId: RunId,
  scope: PermissionScope,
  grant: PermissionGrant,
  requestedAt: EpochMs,
  decidedAt: EpochMs.nullable(),
  decidedBy: z.string().nullable(),
  subject: z.string().max(1000)
});
export type Approval = z.infer<typeof Approval>;

export const AutonomyLevel = z.object({
  level: z.number().int().min(0).max(3),
  grants: z.record(PermissionScope, PermissionGrant)
});
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

/** Default grant table per autonomy level. Level 3 is fully automatic. */
export function defaultGrants(level: number): Record<PermissionScope, PermissionGrant> {
  const all: PermissionScope[] = [
    "read_files", "write_files", "run_commands", "run_remedies", "network_egress",
    "install_packages", "touch_git", "deploy", "spend_credits", "run_migrations"
  ];
  const g = (s: PermissionScope): PermissionGrant => {
    if (level >= 3) return "always";
    if (s === "read_files") return "project";
    if (level >= 2) return s === "deploy" || s === "run_migrations" ? "once" : "session";
    if (level === 1) return s === "write_files" || s === "run_commands" ? "once" : "deny";
    return "deny";
  };
  return Object.fromEntries(all.map((s) => [s, g(s)])) as Record<PermissionScope, PermissionGrant>;
}