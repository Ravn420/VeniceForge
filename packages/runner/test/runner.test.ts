import { describe, expect, it, beforeEach } from "vitest";
import { BoundsTracker } from "../src/bounds.js";
import { Capture } from "../src/capture.js";
import { buildPlan, ladderLength, LADDERS } from "../src/ladders.js";
import { RecipeStore } from "../src/recipes.js";
import { guardInstall, newDependencies, withScripts } from "../src/supply-chain.js";
import type { FailureSignature } from "@forge/contracts";

const sig = (cls: FailureSignature["failureClass"] = "missing_dependency"): FailureSignature => ({
  id: "sig_0123456789abcdefghijklmn",
  projectId: "prj_0123456789abcdefghijklmn",
  commandId: "cmd_0123456789abcdefghijklmn",
  failureClass: cls,
  hash: "a".repeat(64),
  exitCode: 1,
  firstDiagnostic: "Cannot find module 'zod'",
  platform: "linux",
  classifiedBy: "deterministic",
  confidence: 0.9,
  createdAt: 1
});

const ctx = { argv: ["node", "index.js"], stderr: "Cannot find module 'zod'", knownPackages: ["zod"], makeAttemptId: () => "att_0123456789abcdefghijklmn" };

describe("capture", () => {
  it("keeps the tail and records truncation", () => {
    const c = new Capture(20);
    c.push("a".repeat(50));
    expect(c.truncatedAt).toBe(30);
    expect(c.plain().length).toBe(20);
  });

  it("reports no truncation under the limit", () => {
    const c = new Capture(100);
    c.push("short");
    expect(c.truncatedAt).toBeNull();
  });
});

describe("bounds", () => {
  let b: BoundsTracker;
  
  beforeEach(() => {
    b = new BoundsTracker({ maxAttemptsPerSignature: 3, diagnosisAfter: 2, allowRepeatConsecutive: false });
  });

  it("proceeds on the first attempt", () => expect(b.next(sig().id, 0).kind).toBe("proceed"));

  it("diagnoses after the ceiling", () => {
    const id = sig().id;
    b.record(id, 0);
    b.record(id, 1);
    expect(b.next(id, 2).kind).toBe("diagnose");
  });

  it("blocks a consecutive repeat", () => {
    const id = sig("oom").id;
    b.record(id, 0);
    expect(b.next(id, 0)).toEqual({ kind: "diagnose", reason: "repeat" });
  });
});

describe("ladders", () => {
  it("has a rung for every class except unknown", () => {
    expect(ladderLength("missing_binary")).toBeGreaterThan(0);
    expect(ladderLength("unknown")).toBe(0);
  });

  it("builds a plan with a checkpoint slot", () => {
    const p = buildPlan({ ...ctx, signature: sig() }, 0);
    expect(p?.steps.length).toBeGreaterThan(0);
    expect(p?.checkpointId).toBeNull();
  });

  it("pins installs with scripts disabled", () => {
    const p = buildPlan({ ...ctx, signature: sig() }, 0);
    expect(p?.steps[0]).toContain("--ignore-scripts");
  });

  it("every rung declares an expected effect", () => {
    for (const rungs of Object.values(LADDERS)) {
      for (const r of rungs) expect(r.expectedEffect).toBeTruthy();
    }
  });
});

describe("supply chain", () => {
  const cfg = { allowlistRegistries: ["registry.npmjs.org"], knownPackages: ["express"], allowScriptsDefault: false };

  it("blocks an off-allowlist registry", () => {
    expect(guardInstall(cfg, "npm", "left-pad", "1.3.0", "https://evil.dev").blocked).toBe("off_allowlist_registry");
  });

  it("blocks a range version", () => {
    expect(guardInstall(cfg, "npm", "left-pad", "^1.3.0", "https://registry.npmjs.org").blocked).toBe("version_range_not_exact");
  });

  it("flags a typosquat", () => {
    expect(guardInstall(cfg, "npm", "expres", "4.21.1", "https://registry.npmjs.org").blocked).toBe("typosquat_suspect");
  });

  it("passes a clean install", () => {
    expect(guardInstall(cfg, "npm", "left-pad", "1.3.0", "https://registry.npmjs.org").blocked).toBeNull();
  });

  it("adds --ignore-scripts and can remove it", () => {
    const args = guardInstall(cfg, "npm", "left-pad", "1.3.0", "https://registry.npmjs.org").installArgs;
    expect(args).toContain("--ignore-scripts");
    expect(withScripts(args)).not.toContain("--ignore-scripts");
  });

  it("finds new lockfile entries", () => {
    expect(newDependencies("a\nb", "a\nb\nc")).toEqual(["c"]);
  });
});

describe("recipes", () => {
  it("demotes after two failures", () => {
    const store = new RecipeStore();
    const p = buildPlan({ ...ctx, signature: sig() }, 0);
    if (!p) throw new Error("no plan");
    store.remember("h", "env", p);
    store.noteFailure("h", "env");
    expect(store.find("h", "env")).not.toBeNull();
    store.noteFailure("h", "env");
    expect(store.find("h", "env")).toBeNull();
  });
});