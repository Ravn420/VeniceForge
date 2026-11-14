import { z } from "zod";
import { Actor, CommandId, EpochMs, Iso, ProjectId, SessionId, Stream } from "./primitives.js";

export const CommandStatus = z.enum([
  "queued", "running", "succeeded", "failed", "signalled", "timed_out", "aborted"
]);
export type CommandStatus = z.infer<typeof CommandStatus>;

export const CommandRecord = z.object({
  id: CommandId,
  sessionId: SessionId,
  projectId: ProjectId,
  actor: Actor,
  argv: z.array(z.string()).min(1),
  cwd: z.string(),
  envOverrides: z.record(z.string(), z.string()).default({}),
  status: CommandStatus,
  startedAt: EpochMs.nullable(),
  endedAt: EpochMs.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  exitCode: z.number().int().nullable(),
  signal: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  raw: z.string(),
  truncatedAt: z.number().int().nonnegative().nullable(),
  processTree: z.array(z.object({ pid: z.number().int(), ppid: z.number().int(), comm: z.string() })),
  portsOpened: z.array(z.number().int().min(1).max(65535)),
  filesTouched: z.array(z.string()),
  untrusted: z.boolean().default(true),
  injectionSuspects: z.array(z.string()).default([]),
  signatureId: z.string().nullable(),
  remedyAttemptIds: z.array(z.string())
});
export type CommandRecord = z.infer<typeof CommandRecord>;

export const TerminalSession = z.object({
  id: SessionId,
  projectId: ProjectId,
  shell: z.string(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  createdAt: Iso,
  closedAt: Iso.nullable(),
  modelTab: z.number().int().nonnegative(),
  humanFocusedTab: z.number().int().nonnegative(),
  isHumanTyping: z.boolean().default(false)
});
export type TerminalSession = z.infer<typeof TerminalSession>;

export const CommandInput = z.object({
  argv: z.array(z.string()).min(1),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  dryRun: z.boolean().default(false)
});
export type CommandInput = z.infer<typeof CommandInput>;

export const ReadRequest = z.object({
  lines: z.number().int().positive().max(2000).default(200),
  stream: Stream.default("pty"),
  sinceCommandId: CommandId.nullable().default(null)
});
export type ReadRequest = z.infer<typeof ReadRequest>;
