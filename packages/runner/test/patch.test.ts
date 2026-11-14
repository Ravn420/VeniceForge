import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyEdits, diffSince, isSafePath, readFileSafe } from "../src/patch.js";

const roots: string[] = [];
function gitRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-patch-"));
  roots.push(root);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.test"]);
  execFileSync("git", ["-C", root, "config", "user.name", "test"]);
  writeFileSync(join(root, "a.txt"), "before\n");
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "commit", "-qm", "initial"]);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) execFileSync("git", ["-C", root, "clean", "-fdx"]);
});

describe("patch helpers", () => {
  it("rejects absolute, traversal, NUL, and root-escaping paths", () => {
    expect(isSafePath("src/file.ts")).toBe(true);
    expect(isSafePath("../file.ts")).toBe(false);
    expect(isSafePath("C:\\file.ts")).toBe(false);
    expect(isSafePath("/tmp/file.ts")).toBe(false);
    expect(isSafePath("bad\0name")).toBe(false);
    expect(isSafePath("sub/file.ts", "C:\\sandbox\\root")).toBe(true);
  });

  it("writes nested edits and reports applied paths", () => {
    const root = gitRoot();
    const result = applyEdits(root, [{ path: "src/deep/file.ts", content: "ok\n" }]);
    expect(result).toEqual({ applied: ["src/deep/file.ts"], errors: [] });
    expect(readFileSync(join(root, "src/deep/file.ts"), "utf8")).toBe("ok\n");
  });

  it("validates every path before writing any edit", () => {
    const root = gitRoot();
    const result = applyEdits(root, [
      { path: "good.txt", content: "new" },
      { path: "../escape.txt", content: "bad" }
    ]);
    expect(result.applied).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(readFileSafe(root, "a.txt")).toBe("before\n");
  });

  it("reads regular files and refuses directories and symlinks", () => {
    const root = gitRoot();
    mkdirSync(join(root, "folder"));
    expect(() => readFileSafe(root, "folder")).toThrow();
    const outside = join(root, "..", "outside.txt");
    writeFileSync(outside, "outside");
    try {
      symlinkSync(outside, join(root, "link.txt"));
      expect(() => readFileSafe(root, "link.txt")).toThrow();
      expect(applyEdits(root, [{ path: "link.txt", content: "overwrite" }]).applied).toEqual([]);
    } finally {
      // The temporary tree is removed by the test environment's OS cleanup.
    }
  });

  it("returns a repeatable unified diff from a Git tree", () => {
    const root = gitRoot();
    const tree = execFileSync("git", ["-C", root, "write-tree"], { encoding: "utf8" }).trim();
    writeFileSync(join(root, "a.txt"), "after\n");
    const diff = diffSince(root, tree);
    expect(diff).toContain("--- a/a.txt");
    expect(diff).toContain("+++ b/a.txt");
    expect(diff).toContain("-before");
    expect(diff).toContain("+after");
    expect(diffSince(root, tree)).toBe(diff);
    expect(() => diffSince(root, "not-a-tree")).toThrow();
  });
});
