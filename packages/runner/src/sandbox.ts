import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as pty from "node-pty";
import { portsFromSs } from "./reaper.js";

export interface SandboxLimits {
  cpu: string;
  memMb: number;
  diskMb: number;
}

export interface Sandbox {
  id: string;
  root: string;
  spawn(argv: string[], env: Record<string, string>, cwd: string): ChildProcess;
  spawnPty(shell: string, cwd: string): PtyLike;
  exec(argv: string[], cwd?: string): { code: number; out: string };
  ports(): number[];
  snapshot(): string;
  restore(treeHash: string): void;
  destroy(): void;
}

export interface PtyLike {
  write(d: string): void;
  resize(c: number, r: number): void;
  kill(): void;
  onData(fn: (d: string) => void): void;
  onExit(fn: (code: number) => void): void;
}

const IMAGE = process.env.SANDBOX_IMAGE ?? "forge-sandbox:latest";

function sh(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf8", ...(cwd ? { cwd } : {}) });
}
function workspaceUsageMb(root: string): number {
  try {
    const out = execFileSync("du", ["-sb", root], { encoding: "utf8" });
    const bytes = Number(out.trim().split(/\s+/)[0] ?? "0");
    return Math.ceil(bytes / (1024 * 1024));
  } catch {
    return 0;
  }
}

function assertDiskQuota(root: string, limitMb: number): void {
  if (!Number.isFinite(limitMb) || limitMb <= 0) return;
  const used = workspaceUsageMb(root);
  if (used > limitMb) {
    throw new Error(`Disk quota exceeded on workspace path (used ${used} MB > limit ${limitMb} MB)`);
  }
}



function pipePty(argv: string[]): PtyLike {
  const listeners = new Map<string, ((arg: never) => void)[]>();
  const emit = (k: string, v: unknown) => {
    for (const fn of listeners.get(k) ?? []) (fn as (a: unknown) => void)(v);
  };
  const p = spawn(argv[0] ?? "docker", argv.slice(1), { stdio: ["pipe", "pipe", "pipe"] });
  p.stdout?.on("data", (b: Buffer) => emit("data", b.toString()));
  p.stderr?.on("data", (b: Buffer) => emit("data", b.toString()));
  p.on("close", (code) => emit("exit", code ?? 0));
  return {
    write: (d) => p.stdin?.write(d),
    resize: () => undefined,
    kill: () => p.kill("SIGKILL"),
    onData: (fn) => {
      const l = listeners.get("data") ?? [];
      l.push(fn as (a: never) => void);
      listeners.set("data", l);
    },
    onExit: (fn) => {
      const l = listeners.get("exit") ?? [];
      l.push(fn as (a: never) => void);
      listeners.set("exit", l);
    }
  };
}

function nativePty(shell: string, cwd: string): PtyLike {
  const listeners = new Map<string, ((arg: never) => void)[]>();
  const emit = (k: string, v: unknown) => {
    for (const fn of listeners.get(k) ?? []) (fn as (a: unknown) => void)(v);
  };
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !/^(?:VENICE_API_KEY|AUTH_SECRET)$/i.test(k)) env[k] = v;
  }
  const p = pty.spawn(shell, [], { cwd, cols: 120, rows: 32, env });
  p.onData((d) => emit("data", d));
  p.onExit(({ exitCode }) => emit("exit", exitCode));
  return {
    write: (d) => p.write(d),
    resize: (c, r) => p.resize(c, r),
    kill: () => p.kill(),
    onData: (fn) => {
      const l = listeners.get("data") ?? [];
      l.push(fn as (a: never) => void);
      listeners.set("data", l);
    },
    onExit: (fn) => {
      const l = listeners.get("exit") ?? [];
      l.push(fn as (a: never) => void);
      listeners.set("exit", l);
    }
  };
}

export class DockerSandbox implements Sandbox {
  readonly id: string;
  readonly root: string;
  private container: string;
  private readonly limits: SandboxLimits;

  constructor(id: string, limits: SandboxLimits) {
    this.id = id;
    this.limits = limits;
    this.root = mkdtempSync(join(tmpdir(), `forge-${id}-`));
    this.container = `forge-${id}-${randomUUID().slice(0, 8)}`;

    sh("docker", [
      "run", "-d", "--name", this.container,
      "--cpus", limits.cpu,
      "--memory", `${limits.memMb}m`,
      "--memory-swap", `${limits.memMb}m`,
      "--pids-limit", "100",
      "--network", "none",
      "--label", "agentforge.sandbox=true",
      "-v", `${this.root}:/app`,
      "-w", "/app",
      "--cap-drop", "ALL",
      "--cap-add", "CHOWN",
      "--security-opt", "no-new-privileges",
      IMAGE
    ]).trim();

    sh("docker", ["exec", "-u", "root", this.container, "chown", "-R", "forge:forge", "/app"]);
  }

  spawn(argv: string[], env: Record<string, string>, cwd: string): ChildProcess {
    assertDiskQuota(this.root, this.limits.diskMb);
    const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    return spawn("docker", ["exec", "-w", cwd, ...envArgs, this.container, ...argv], {
      stdio: ["ignore", "pipe", "pipe"]
    });
  }

  spawnPty(shell: string, cwd: string): PtyLike {
    assertDiskQuota(this.root, this.limits.diskMb);
    return pipePty(["docker", "exec", "-it", "-w", cwd, this.container, shell]);
  }

  exec(argv: string[], cwd = "/app"): { code: number; out: string } {
    assertDiskQuota(this.root, this.limits.diskMb);
    try {
      return { code: 0, out: sh("docker", ["exec", "-w", cwd, this.container, ...argv]) };
    } catch (e) {
      const err = e as { status?: number; stderr?: Buffer };
      return { code: err.status ?? 1, out: err.stderr?.toString() ?? "" };
    }
  }

  ports(): number[] {
    return portsFromSs(this.exec(["ss", "-ltn"]).out);
  }

  snapshot(): string {
    return sh("git", ["-C", this.root, "write-tree"]).trim();
  }

  restore(treeHash: string): void {
    sh("git", ["-C", this.root, "read-tree", treeHash]);
    sh("git", ["-C", this.root, "checkout-index", "-a", "-f"]);
  }

  destroy(): void {
    try {
      sh("docker", ["rm", "-f", this.container]);
    } catch {
      /* already gone */
    }
  }
}

/** Secrets and host-specific variables never reach sandbox children. */
const BLOCKED_ENV_KEYS = /^(?:VENICE_API_KEY|AUTH_SECRET|NODE_TOKEN|npm_[A-Z_]*|NPM_[A-Z_]*|AWS_[A-Z_]*|GITHUB_TOKEN|GIT_[A-Z_]*|SSH_[A-Z_]*)$/i;

function childEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (BLOCKED_ENV_KEYS.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...overrides };
}

export class LocalSandbox implements Sandbox {
  readonly id: string;
  readonly root: string;
  private readonly diskMb: number;
  constructor(id: string, root: string, diskMb = sandboxConfig().diskMb) {
    this.id = id;
    this.root = root;
    this.diskMb = diskMb;
  }
  private resolveCwd(cwd: string): string {
    return cwd === "/app" ? this.root : cwd;
  }
  spawn(argv: string[], env: Record<string, string>, cwd: string): ChildProcess {
    assertDiskQuota(this.root, this.diskMb);
    return spawn(argv[0] ?? "true", argv.slice(1), {
      cwd: this.resolveCwd(cwd),
      env: childEnv(env),
      stdio: ["ignore", "pipe", "pipe"]
    });
  }
  spawnPty(shell: string, cwd: string): PtyLike {
    assertDiskQuota(this.root, this.diskMb);
    return nativePty(shell, this.resolveCwd(cwd));
  }
  exec(argv: string[], cwd = this.root): { code: number; out: string } {
    assertDiskQuota(this.root, this.diskMb);
    try {
      return { code: 0, out: sh(argv[0] ?? "true", argv.slice(1), this.resolveCwd(cwd)) };
    } catch (e) {
      const err = e as { status?: number; stderr?: Buffer };
      return { code: err.status ?? 1, out: err.stderr?.toString() ?? "" };
    }
  }
  ports(): number[] {
    return portsFromSs(this.exec(["ss", "-ltn"]).out);
  }
  snapshot(): string {
    return sh("git", ["-C", this.root, "write-tree"]).trim();
  }
  restore(treeHash: string): void {
    sh("git", ["-C", this.root, "read-tree", treeHash]);
    sh("git", ["-C", this.root, "checkout-index", "-a", "-f"]);
  }
  destroy(): void {
    /* nothing to tear down */
  }
}

export interface SandboxConfig {
  cpu: string;
  memMb: number;
  diskMb: number;
}

export function sandboxConfig(): SandboxConfig {
  const cfg = {
    cpu: process.env.SANDBOX_CPU_LIMIT ?? "2",
    memMb: Number(process.env.SANDBOX_MEM_LIMIT_MB ?? 2048),
    diskMb: Number(process.env.SANDBOX_DISK_LIMIT_MB ?? 8192)
  };
  if (!Number.isFinite(cfg.memMb) || cfg.memMb <= 0) throw new Error("invalid SANDBOX_MEM_LIMIT_MB");
  if (!Number.isFinite(cfg.diskMb) || cfg.diskMb <= 0) throw new Error("invalid SANDBOX_DISK_LIMIT_MB");
  return cfg;
}

/** Runtime is chosen by env; both paths create their own root. */
export function createSandbox(id: string): Sandbox {
  if (process.env.SANDBOX_RUNTIME === "local") {
    return new LocalSandbox(id, mkdtempSync(join(tmpdir(), `forge-${id}-`)), sandboxConfig().diskMb);
  }
  return new DockerSandbox(id, sandboxConfig());
}