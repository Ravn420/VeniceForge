import { describe, expect, it } from "vitest";
import type { Sandbox } from "../src/sandbox.js";
import { CheckpointStore } from "../src/checkpoint.js";

class MemorySandbox {
  id = "prj_0123456789abcdefghijklmn";
  root = "/memory";
  tree = "snapshot-one";
  restored: string | null = null;
  failRestore = false;
  snapshot(): string { return this.tree; }
  restore(tree: string): void {
    if (this.failRestore) throw new Error("restore failed");
    this.restored = tree;
  }
}

function fixedRandom(): () => number {
  let i = 0;
  return () => ((i++ % 36) + 0.25) / 36;
}

describe("CheckpointStore", () => {
  it("records validated metadata and restores the exact snapshot", () => {
    const sandbox = new MemorySandbox();
    const store = new CheckpointStore(sandbox as unknown as Sandbox, { now: () => 123, random: fixedRandom() });
    const checkpoint = store.create("manual", "before edits");
    sandbox.tree = "later tree";

    expect(checkpoint).toMatchObject({
      id: expect.stringMatching(/^ckp_[0-9a-z]{24}$/),
      projectId: sandbox.id,
      runId: null,
      trigger: "manual",
      causedBy: null,
      label: "before edits",
      createdAt: 123,
      treeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      sizeBytes: Buffer.byteLength("snapshot-one"),
      restorable: true
    });
    expect(store.restore(checkpoint.id)).toEqual({
      checkpointId: checkpoint.id,
      restoredAt: 123,
      filesChanged: 0,
      ok: true,
      error: null
    });
    expect(sandbox.restored).toBe("snapshot-one");
  });

  it("returns a structured failure for unknown or malformed identifiers", () => {
    const store = new CheckpointStore(new MemorySandbox() as unknown as Sandbox, { now: () => 456, random: fixedRandom() });
    expect(store.restore("ckp_0123456789abcdefghijklmn")).toMatchObject({
      checkpointId: "ckp_0123456789abcdefghijklmn",
      restoredAt: 456,
      filesChanged: 0,
      ok: false,
      error: "Checkpoint not found"
    });
    expect(store.restore("not-an-id")).toMatchObject({
      checkpointId: expect.stringMatching(/^ckp_[0-9a-z]{24}$/),
      ok: false,
      error: "Checkpoint not found"
    });
  });

  it("reports sandbox restore failures without throwing", () => {
    const sandbox = new MemorySandbox();
    const store = new CheckpointStore(sandbox as unknown as Sandbox, { now: () => 789, random: fixedRandom() });
    const checkpoint = store.create("before_destructive", "safe point", "cmd_0123456789abcdefghijklmn");
    sandbox.failRestore = true;
    expect(store.restore(checkpoint.id)).toMatchObject({ ok: false, error: "restore failed", checkpointId: checkpoint.id });
  });
});
