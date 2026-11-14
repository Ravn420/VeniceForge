import { execFileSync } from "node:child_process";
import { stripAnsi } from "@forge/classifier";
import type { CommandRecord, ReadRequest } from "@forge/contracts";

export interface EnvState {
  cwd: string;
  shell: string;
  ports: number[];
  children: { pid: number; comm: string }[];
  diskFreeMb: number | null;
  memFreeMb: number | null;
}

export interface Diagnostic {
  file: string;
  line: number | null;
  column: number | null;
  code: string | null;
  severity: "error" | "warning";
  message: string;
  rule: string | null;
}

const TS_DIAG = /^(.+?):(\d+):(\d+)?\s*-\s*(error|warning)\s+(TS\d+):\s*(.+)$/;
const GCC_DIAG = /^(.+?):(\d+):(\d+)?:\s*(error|warning|fatal error):\s*(.+)$/;
const PY_DIAG = /File "([^"]+)", line (\d+)/;

export function read(records: readonly CommandRecord[], req: ReadRequest): string {
  const idx = req.sinceCommandId === null ? 0 : records.findIndex((r) => r.id === req.sinceCommandId) + 1;
  const slice = records.slice(Math.max(0, idx));
  const joined = slice
    .map((r) => {
      const body = req.stream === "stdout" ? r.stdout : req.stream === "stderr" ? r.stderr : `${r.stdout}${r.stderr}`;
      return `$ ${r.argv.join(" ")}\n${body}`;
    })
    .join("\n");
  return stripAnsi(joined).split("\n").slice(-req.lines).join("\n");
}

export function state(cwd: string, shell: string): EnvState {
  const num = (cmd: string, args: string[]): number | null => {
    try {
      const out = execFileSync(cmd, args, { encoding: "utf8" });
      const m = out.match(/(\d+)/);
      return m ? Number(m[1]) : null;
    } catch {
      return null;
    }
  };
  let children: { pid: number; comm: string }[] = [];
  try {
    const out = execFileSync("ps", ["-eo", "pid=,comm=", "--ppid", String(process.pid)], { encoding: "utf8" });
    children = out
      .split("\n")
      .map((l) => l.trim().split(/\s+/))
      .filter((p) => p.length >= 2 && p[0] !== undefined && p[1] !== undefined)
      .map((p) => ({ pid: Number(p[0]), comm: String(p[1]) }));
  } catch {
    /* ps unavailable */
  }
  return {
    cwd,
    shell,
    ports: [],
    children,
    diskFreeMb: num("df", ["-Pm", cwd]),
    memFreeMb: num("sh", ["-c", "free -m | awk 'NR==2{print $7}'"])
  };
}

export function diagnostics(records: readonly CommandRecord[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const r of records) {
    for (const line of `${r.stdout}\n${r.stderr}`.split("\n")) {
      let m = line.match(TS_DIAG);
      if (m) {
        out.push({ file: m[1] ?? "", line: m[2] ? Number(m[2]) : null, column: m[3] ? Number(m[3]) : null, code: m[5] ?? null, severity: m[4] === "warning" ? "warning" : "error", message: m[6] ?? "", rule: null });
        continue;
      }
      m = line.match(GCC_DIAG);
      if (m) {
        out.push({ file: m[1] ?? "", line: m[2] ? Number(m[2]) : null, column: m[3] ? Number(m[3]) : null, code: null, severity: m[4] === "warning" ? "warning" : "error", message: m[5] ?? "", rule: null });
        continue;
      }
      m = line.match(PY_DIAG);
      if (m) {
        out.push({ file: m[1] ?? "", line: m[2] ? Number(m[2]) : null, column: null, code: null, severity: "error", message: "Python Exception/Traceback", rule: null });
        continue;
      }
    }
  }
  return out;
}

export interface ProbeResult {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

/** Dry-run prerequisites so the failure never happens. */
export function probe(argv: string[], cwd: string, port?: number): ProbeResult {
  const checks: ProbeResult["checks"] = [];
  const bin = argv[0];
  if (bin !== undefined) {
    let onPath = false;
    try {
      execFileSync("sh", ["-c", `command -v ${JSON.stringify(bin)}`], { stdio: "ignore" });
      onPath = true;
    } catch {
      /* not on PATH */
    }
    checks.push({ name: `binary:${bin}`, ok: onPath, detail: onPath ? "on PATH" : "missing" });
  }
  if (port !== undefined) {
    let free = true;
    try {
      execFileSync("sh", ["-c", `ss -ltn | grep -q ':${port} '`], { stdio: "ignore" });
      free = false;
    } catch {
      /* port is free */
    }
    checks.push({ name: `port:${port}`, ok: free, detail: free ? "free" : "bound" });
  }
  checks.push({ name: "cwd", ok: true, detail: cwd });
  return { ok: checks.every((c) => c.ok), checks };
}

export function killPort(port: number): number[] {
  try {
    const out = execFileSync("sh", ["-c", `ss -ltnp | grep ':${port} '`], { encoding: "utf8" });
    const pids = [...out.matchAll(/pid=(\d+),/g)].map((m) => Number(m[1]));
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* gone */
      }
    }
    return pids;
  } catch {
    return [];
  }
}