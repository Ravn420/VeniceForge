import { makeId, type Actor, type CommandRecord, type CommandStatus } from "@forge/contracts";
import type { ChildProcess } from "node:child_process";
import { Capture } from "./capture.js";
import { reapChildren } from "./reaper.js";
import type { Sandbox } from "./sandbox.js";

export interface ExecuteOptions {
  sessionId: string;
  projectId: string;
  actor: Actor;
  cwd: string;
  sandbox: Sandbox;
  timeoutMs?: number;
  env?: Record<string, string>;
  onChunk?: (stream: "stdout" | "stderr", chunk: string) => void;
  now?: () => number;
}

const DEFAULT_TIMEOUT = Number(process.env.REMEDY_COMMAND_TIMEOUT_MS ?? 120_000);

const BASE_ENV: Record<string, string> = {
  CI: "1",
  GIT_PAGER: "cat",
  PAGER: "cat",
  DEBIAN_FRONTEND: "noninteractive",
  NO_COLOR: "1",
  FORCE_COLOR: "0"
};

export interface ExecuteResult {
  record: CommandRecord;
  aborted: boolean;
}

export async function execute(argv: string[], opts: ExecuteOptions): Promise<ExecuteResult> {
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const stdout = new Capture();
  const stderr = new Capture();
  const raw = new Capture();

  const record: CommandRecord = {
    id: makeId("cmd"),
    sessionId: opts.sessionId,
    projectId: opts.projectId,
    actor: opts.actor,
    argv,
    cwd: opts.cwd,
    envOverrides: opts.env ?? {},
    status: "running",
    startedAt,
    endedAt: null,
    durationMs: null,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    raw: "",
    truncatedAt: null,
    processTree: [],
    portsOpened: [],
    filesTouched: [],
    untrusted: true,
    injectionSuspects: [],
    signatureId: null,
    remedyAttemptIds: []
  };

  const [bin] = argv;
  if (bin === undefined) {
    record.status = "failed";
    record.endedAt = now();
    return { record, aborted: false };
  }

  let child: ChildProcess;
  try {
    child = opts.sandbox.spawn(argv, { ...BASE_ENV, ...opts.env }, opts.cwd);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    record.status = "failed";
    record.endedAt = now();
    record.durationMs = record.endedAt - startedAt;
    record.stderr = msg;
    record.exitCode = 1;
    if (/disk quota exceeded/i.test(msg)) {
      record.signatureId = "disk_full";
    }
    return { record, aborted: false };
  }

  const timer = setTimeout(() => {
    record.status = "timed_out";
    child.kill("SIGTERM");
    const killTimer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }, 3000);
    killTimer.unref();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT);

  child.stdout?.on("data", (b: Buffer) => {
    const s = b.toString();
    stdout.push(s);
    raw.push(s);
    opts.onChunk?.("stdout", s);
  });
  child.stderr?.on("data", (b: Buffer) => {
    const s = b.toString();
    stderr.push(s);
    raw.push(s);
    opts.onChunk?.("stderr", s);
  });

  const exit = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.on("error", () => resolve({ code: 127, signal: null }));
    child.on("close", (code, signal) => resolve({ code, signal }));
  });

  clearTimeout(timer);
  const endedAt = now();

  record.exitCode = exit.code;
  record.signal = exit.signal;
  record.endedAt = endedAt;
  record.durationMs = endedAt - startedAt;
  record.stdout = stdout.plain();
  record.stderr = stderr.plain();
  record.raw = raw.rawText();
  record.truncatedAt = raw.truncatedAt;
  record.portsOpened = opts.sandbox.ports();

  const final: CommandStatus =
    record.status === "timed_out"
      ? "timed_out"
      : exit.signal !== null
        ? "signalled"
        : exit.code === 0
          ? "succeeded"
          : "failed";
  record.status = final;

  if (final === "timed_out") reapChildren(child.pid ?? 0);

  return { record, aborted: false };
}
