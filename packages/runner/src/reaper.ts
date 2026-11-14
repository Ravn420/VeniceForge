import { execFileSync } from "node:child_process";

export function reapChildren(rootPid: number): number[] {
  const killed: number[] = [];
  let out: string;
  try {
    out = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8" });
  } catch {
    return killed;
  }
  const children = new Map<number, number[]>();
  for (const line of out.split("\n")) {
    const [pidStr, ppidStr] = line.trim().split(/\s+/);
    const pid = Number(pidStr);
    const ppid = Number(ppidStr);
    if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
    const list = children.get(ppid) ?? [];
    list.push(pid);
    children.set(ppid, list);
  }
  const stack = [...(children.get(rootPid) ?? [])];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (pid === undefined) break;
    stack.push(...(children.get(pid) ?? []));
    try {
      process.kill(pid, "SIGTERM");
      killed.push(pid);
    } catch {
      /* already gone */
    }
  }
  return killed;
}

/** Host-side listener lookup. Used only by the local sandbox. */
export function listeningPorts(pids: readonly number[]): number[] {
  if (pids.length === 0) return [];
  try {
    const out = execFileSync("ss", ["-ltnp"], { encoding: "utf8" });
    const ports: number[] = [];
    for (const line of out.split("\n")) {
      const m = line.match(/:(\d+)\s/);
      if (!m) continue;
      if (pids.some((p) => line.includes(`pid=${p},`))) ports.push(Number(m[1]));
    }
    return ports;
  } catch {
    return [];
  }
}

/**
 * Container-side listener lookup. Parses `ss` inside the sandbox so the docker
 * client pid is never confused with the workload pid.
 */
export function portsFromSs(out: string): number[] {
  const ports = new Set<number>();
  for (const line of out.split("\n")) {
    const m = line.match(/:(?:\d{1,3}\.){0,3}(\d{2,5})\s/);
    if (m?.[1]) ports.add(Number(m[1]));
  }
  return [...ports].filter((p) => p > 0 && p < 65536).sort((a, b) => a - b);
}