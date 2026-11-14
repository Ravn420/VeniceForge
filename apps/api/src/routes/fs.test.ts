import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { list, tree } from "./fs.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-fs-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("filesystem listing", () => {
  it("sorts directories first, bounds results, and reports file sizes", () => {
    const root = makeRoot();
    mkdirSync(join(root, "z-dir"));
    mkdirSync(join(root, "a-dir"));
    writeFileSync(join(root, "b.txt"), "1234");
    writeFileSync(join(root, "a.txt"), "12");

    expect(list(root, "")).toEqual([
      { name: "a-dir", path: "a-dir", dir: true, size: 0 },
      { name: "z-dir", path: "z-dir", dir: true, size: 0 },
      { name: "a.txt", path: "a.txt", dir: false, size: 2 },
      { name: "b.txt", path: "b.txt", dir: false, size: 4 }
    ]);
    expect(list(root, "", 2)).toHaveLength(2);
    expect(list(root, "", 10_000)).toHaveLength(4);
  });

  it("rejects lexical traversal and symlink escapes", () => {
    const root = makeRoot();
    const outside = makeRoot();
    mkdirSync(join(outside, "private"));
    expect(() => list(root, "../private")).toThrow(/Unsafe listing path/);
    expect(() => tree(root, "../private")).toThrow(/Unsafe listing path/);
    try {
      symlinkSync(outside, join(root, "external"), "junction");
      expect(() => list(root, "external")).toThrow(/escapes repository/);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    }
  });
});
