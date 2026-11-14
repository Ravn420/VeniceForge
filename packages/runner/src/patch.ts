import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface FileEdit {
  path: string;
  content: string;
}

export interface PatchResult {
  applied: string[];
  errors: string[];
}

/** Reject path syntax that can escape the sandbox on POSIX or Windows. */
export function isSafePath(path: string, root?: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return false;
  if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.startsWith("\\") || path.startsWith("/")) return false;
  const segments = path.split(/[\\/]+/);
  if (segments.some((segment) => segment === ".." || segment === ".")) return false;
  if (root !== undefined) {
    const base = resolve(root);
    const target = resolve(base, path);
    const rel = relative(base, target);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  }
  return true;
}

function resolveSafeTarget(root: string, path: string): string {
  if (!isSafePath(path, root)) throw new Error(`Unsafe path: ${path}`);
  const base = realpathSync(root);
  const target = resolve(base, path);
  const rel = relative(base, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Unsafe path: ${path}`);

  // Existing symlinks in any parent component must not redirect an operation outside root.
  let current = base;
  for (const part of rel.split(sep).slice(0, -1)) {
    current = resolve(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) {
        const actual = realpathSync(current);
        const linkRel = relative(base, actual);
        if (linkRel === ".." || linkRel.startsWith(`..${sep}`) || isAbsolute(linkRel)) {
          throw new Error(`Path traverses outside root: ${path}`);
        }
      } else if (!stat.isDirectory()) {
        throw new Error(`Parent is not a directory: ${path}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      break;
    }
  }
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${path}`);
    if (!stat.isFile()) throw new Error(`Not a regular file: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

export function readFileSafe(root: string, path: string): string {
  const target = resolveSafeTarget(root, path);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Not a regular file: ${path}`);
  return readFileSync(target, "utf8");
}

/** Validate all edits before touching files; each replacement is staged then renamed atomically. */
export function applyEdits(root: string, edits: readonly FileEdit[]): PatchResult {
  const errors: string[] = [];
  const prepared: Array<{ path: string; target: string; content: string }> = [];
  const seen = new Set<string>();
  try {
    realpathSync(root);
  } catch {
    return { applied: [], errors: [`Root does not exist or is inaccessible: ${root}`] };
  }
  for (const edit of edits) {
    try {
      if (!edit || typeof edit.path !== "string" || typeof edit.content !== "string") {
        throw new Error("Each edit must have a path and string content");
      }
      const target = resolveSafeTarget(root, edit.path);
      if (seen.has(target)) throw new Error(`Duplicate edit path: ${edit.path}`);
      seen.add(target);
      prepared.push({ path: edit.path, target, content: edit.content });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length > 0) return { applied: [], errors };

  const staged: Array<{ path: string; temp: string; target: string }> = [];
  try {
    for (const edit of prepared) {
      mkdirSync(dirname(edit.target), { recursive: true });
      const temp = resolve(dirname(edit.target), `.${randomUUID()}.patch-tmp`);
      writeFileSync(temp, edit.content, { encoding: "utf8", flag: "wx" });
      staged.push({ path: edit.path, temp, target: edit.target });
    }
    for (const entry of staged) {
      let attempts = 0;
      while (true) {
        try {
          renameSync(entry.temp, entry.target);
          break;
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException)?.code;
          if ((code === "EPERM" || code === "EBUSY") && attempts < 3) {
            attempts++;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
            continue;
          }
          throw err;
        }
      }
    }
    return { applied: staged.map((entry) => entry.path), errors: [] };
  } catch (error) {
    for (const entry of staged) {
      try { rmSync(entry.temp, { force: true }); } catch { /* best effort cleanup */ }
    }
    return { applied: [], errors: [error instanceof Error ? error.message : String(error)] };
  }
}

/** Diff the working tree against a Git tree object (for example Sandbox.snapshot()). */
export function diffSince(root: string, before: string): string {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(before)) throw new Error("Invalid Git tree hash");
  return execFileSync("git", [
    "-C", root, "diff", "--no-ext-diff", "--no-renames", "--no-color",
    "--src-prefix=a/", "--dst-prefix=b/", before, "--"
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}
