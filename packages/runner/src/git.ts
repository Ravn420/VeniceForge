import { execFileSync } from "node:child_process";

export interface GitStatus {
  branch: string;
  dirty: string[];
  ahead: number;
}

export interface Remote {
  name: string;
  url: string;
}

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

export function init(root: string): void {
  try {
    git(root, ["rev-parse", "--git-dir"]);
  } catch {
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "agent@forge.local"]);
    git(root, ["config", "user.name", "forge"]);
  }
}

export function status(root: string): GitStatus {
  let branch = "main";
  try {
    branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  } catch {
    /* unborn */
  }
  const porcelain = git(root, ["status", "--porcelain"]).split("\n").filter(Boolean);
  let ahead = 0;
  try {
    const counts = git(root, ["rev-list", "--count", "@{u}..HEAD"]).trim();
    ahead = Number(counts) || 0;
  } catch {
    /* no upstream configured */
  }
  return { branch, dirty: porcelain, ahead };
}

export function diff(root: string): string {
  try {
    git(root, ["add", "-N"]);
    return git(root, ["diff"]);
  } catch {
    return "";
  }
}

export function commit(root: string, message: string): string {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]).trim();
}

export function branch(root: string, name: string): void {
  git(root, ["checkout", "-q", "-b", name]);
}

export function generateMessage(root: string): string {
  const d = diff(root);
  const files = d.split("\n").filter((l) => l.startsWith("+++")).length;
  const first = d.split("\n").find((l) => l.startsWith("+") && !l.startsWith("+++")) ?? "";
  const kind = d.includes("test") ? "test" : d.includes(".md") ? "docs" : "feat";
  return `${kind}: update ${files} file${files === 1 ? "" : "s"}${first ? ` — ${first.slice(1, 60).trim()}` : ""}`;
}

export function push(root: string, remote: string, ref: string): string {
  return git(root, ["push", "-u", remote, ref]);
}

export function remotes(root: string): Remote[] {
  try {
    return git(root, ["remote", "-v"])
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [name, url] = l.split(/\s+/);
        return { name: name ?? "", url: url ?? "" };
      })
      .filter((r) => r.name && r.url);
  } catch {
    return [];
  }
}

export function addRemote(root: string, name: string, url: string): void {
  git(root, ["remote", "add", name, url]);
}

/** Remote URLs carry tokens; redact before showing them. */
export function redact(url: string): string {
  return url.replace(/\/\/[^@/]+@/, "//***@");
}