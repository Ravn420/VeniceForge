import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

let child: ChildProcess | null = null;

export function brainstormRoot(): string {
  const beside = join(__dirname, "../../brainstorm");
  if (existsSync(join(beside, "brainstorm", "cli.py"))) return beside;
  return join(process.cwd(), "apps", "brainstorm");
}

export function stopBrainstorm(): void {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
}

/** Spawn the CrewAI CLI. Events are JSON lines on stdout. */
export function runBrainstorm(payload: unknown, onEvent: (event: unknown) => void): Promise<{ type: string; message?: string }> {
  stopBrainstorm();
  const root = brainstormRoot();
  const python = process.env.BRAINSTORM_PYTHON || "python3.11";
  const pydeps = [
    process.env.BRAINSTORM_PYDEPS,
    "/workspace/.brainstorm-pydeps",
    join(root, "pydeps"),
  ].filter((p): p is string => !!p && existsSync(p));
  const proc = spawn(python, ["-m", "brainstorm.cli"], {
    cwd: root,
    env: {
      ...process.env,
      PYTHONPATH: [root, ...pydeps].join(delimiter),
      PYTHONNOUSERSITE: "1",
      CREWAI_TELEMETRY_OPT_OUT: "true",
      OTEL_SDK_DISABLED: "true",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child = proc;
  let last: { type: string; message?: string } = { type: "error", message: "The crew exited before it spoke." };
  let stdout = "";
  let stderr = "";

  proc.stdout?.setEncoding("utf8");
  proc.stderr?.setEncoding("utf8");
  proc.stdout?.on("data", (chunk: string) => {
    stdout += chunk;
    let nl: number;
    while ((nl = stdout.indexOf("\n")) !== -1) {
      const line = stdout.slice(0, nl).trim();
      stdout = stdout.slice(nl + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line) as { type?: string; message?: string };
        if (event && typeof event.type === "string") {
          last = { type: event.type, message: event.message };
          onEvent(event);
        }
      } catch { /* crew logs are not events */ }
    }
  });
  proc.stderr?.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-2000);
  });

  const body = JSON.stringify(payload ?? {});
  proc.stdin?.write(body);
  proc.stdin?.end();

  return new Promise((resolve) => {
    proc.on("error", () => {
      const event = { type: "error", message: "The CrewAI runner is not available on this machine." };
      onEvent(event);
      resolve(event);
    });
    proc.on("close", (code) => {
      if (child === proc) child = null;
      if (code === 0 || last.type === "done" || last.type === "board" || last.type === "stopped") {
        resolve(last);
        return;
      }
      if (last.type === "error" && last.message) {
        resolve(last);
        return;
      }
      const tail = stderr.trim().split("\n").pop() || "";
      const event = { type: "error", message: tail.slice(0, 240) || "The crew stopped before the board was ready." };
      onEvent(event);
      resolve(event);
    });
  });
}
