import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LocalSandbox } from "../src/sandbox.js";
import { applyEdits, isSafePath } from "../src/patch.js";

function gitRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-local-"));
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "t@t"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "t"]);
  writeFileSync(join(dir, "a.txt"), "one");
  execFileSync("git", ["-C", dir, "add", "-A"]);
  execFileSync("git", ["-C", dir, "commit", "-qm", "init"]);
  return dir;
}

describe("LocalSandbox", () => {
  it("execs inside the root", () => {
    const root = gitRoot();
    const s = new LocalSandbox("p", root);
    expect(s.exec(["cat", "a.txt"]).out.trim()).toBe("one");
  });

  it("snapshots and restores exactly", () => {
    const root = gitRoot();
    const s = new LocalSandbox("p", root);
    const tree = s.snapshot();
    writeFileSync(join(root, "a.txt"), "two");
    expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("two");
    s.restore(tree);
    expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("one");
  });

  it("reports zero ports when nothing listens", () => {
    const root = gitRoot();
    expect(new LocalSandbox("p", root).ports()).toEqual([]);
  });
});

describe("applyEdits", () => {
  it("writes nested files", () => {
    const root = gitRoot();
    const res = applyEdits(root, [{ path: "src/deep/x.ts", content: "ok" }]);
    expect(res.applied).toEqual(["src/deep/x.ts"]);
    expect(existsSync(join(root, "src/deep/x.ts"))).toBe(true);
  });

  it("rejects escaping paths", () => {
    expect(isSafePath("src/a.ts")).toBe(true);
    expect(isSafePath("../out.ts")).toBe(false);
    expect(isSafePath("/etc/passwd")).toBe(false);
  });
});
describe("disk quota", () => {
  it("rejects spawn when workspace exceeds diskMb", () => {
    const root = gitRoot();
    // Create a file larger than 1 MB
    const big = Buffer.alloc(2 * 1024 * 1024, 0x61);
    writeFileSync(join(root, "big.bin"), big);
    const s = new LocalSandbox("p", root, 1); // 1 MB limit
    expect(() => s.spawn(["true"], {}, "/app")).toThrow(/Disk quota exceeded/);
  });

  it("allows spawn when under quota", () => {
    const root = gitRoot();
    const s = new LocalSandbox("p", root, 100);
    expect(() => s.spawn(["true"], {}, "/app")).not.toThrow();
  });
});
