import { lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface FsListEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
}

function assertSafeSubpath(relPath: string): void {
  if (typeof relPath !== "string" || relPath.includes("\0")) {
    throw new Error(`Unsafe listing path: ${relPath}`);
  }
  if (relPath === "") return;
  if (isAbsolute(relPath) || /^[A-Za-z]:/.test(relPath) || relPath.startsWith("/") || relPath.startsWith("\\")) {
    throw new Error(`Unsafe listing path: ${relPath}`);
  }
  const segments = relPath.split(/[\\/]+/);
  if (segments.some((s) => s === ".." || s === ".")) {
    throw new Error(`Unsafe listing path: ${relPath}`);
  }
}

function resolveContainedDir(root: string, relPath: string): string {
  assertSafeSubpath(relPath);
  const baseReal = realpathSync(root);
  const lexicalTarget = relPath ? resolve(baseReal, relPath) : baseReal;
  const lexicalRel = relative(baseReal, lexicalTarget);
  if (lexicalRel === ".." || lexicalRel.startsWith(`..${sep}`) || isAbsolute(lexicalRel)) {
    throw new Error(`Unsafe listing path: ${relPath}`);
  }
  const actualReal = realpathSync(lexicalTarget);
  const actualRel = relative(baseReal, actualReal);
  if (actualRel === ".." || actualRel.startsWith(`..${sep}`) || isAbsolute(actualRel)) {
    throw new Error(`Path escapes repository: ${relPath}`);
  }
  return actualReal;
}

export function list(root: string, relPath = "", limit = 500): FsListEntry[] {
  const baseReal = realpathSync(root);
  const targetDir = resolveContainedDir(root, relPath);
  const names = readdirSync(targetDir);
  const entries: FsListEntry[] = [];

  for (const name of names) {
    const full = join(targetDir, name);
    const lstat = lstatSync(full);
    if (lstat.isSymbolicLink()) {
      const targetReal = realpathSync(full);
      const rel = relative(baseReal, targetReal);
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new Error(`Path escapes repository: ${relPath ? `${relPath}/${name}` : name}`);
      }
    }
    const st = statSync(full);
    const isDir = st.isDirectory();
    const entryRel = relPath ? `${relPath.replace(/\\/g, "/").replace(/\/+$/, "")}/${name}` : name;
    entries.push({
      name,
      path: entryRel,
      dir: isDir,
      size: isDir ? 0 : st.size
    });
  }

  entries.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries.slice(0, Math.max(0, limit));
}

export function tree(root: string, relPath = "", maxDepth = 4): string {
  const baseReal = realpathSync(root);
  const startDir = resolveContainedDir(root, relPath);
  const lines: string[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth >= maxDepth) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    const items = names
      .filter((n) => n !== ".git" && n !== "node_modules")
      .map((name) => {
        const full = join(dir, name);
        const lstat = lstatSync(full);
        if (lstat.isSymbolicLink()) {
          const targetReal = realpathSync(full);
          const rel = relative(baseReal, targetReal);
          if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
            throw new Error(`Path escapes repository: ${name}`);
          }
        }
        const st = statSync(full);
        return { name, full, isDir: st.isDirectory() };
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    for (const item of items) {
      lines.push(`${"  ".repeat(depth)}${item.name}${item.isDir ? "/" : ""}`);
      if (item.isDir) walk(item.full, depth + 1);
    }
  };

  walk(startDir, 0);
  return lines.join("\n");
}
