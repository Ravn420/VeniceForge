import { createHash, randomBytes } from "node:crypto";
import {
  Checkpoint as CheckpointSchema,
  CheckpointId,
  RestoreResult as RestoreResultSchema,
  makeId,
  type Checkpoint,
  type CheckpointTrigger,
  type RestoreResult
} from "@forge/contracts";
import type { Sandbox } from "./sandbox.js";

export interface CheckpointStoreOptions {
  now?: () => number;
  random?: () => number;
}

interface SavedSnapshot {
  checkpoint: Checkpoint;
  tree: string;
}

/** In-memory checkpoint metadata and the sandbox snapshot it describes. */
export class CheckpointStore {
  private readonly saved = new Map<string, SavedSnapshot>();
  private readonly now: () => number;
  private readonly random: () => number;

  constructor(private readonly sandbox: Sandbox, options: CheckpointStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? (() => randomBytes(4).readUInt32BE(0) / 0x1_0000_0000);
  }

  create(trigger: CheckpointTrigger, label: string, causedBy?: string): Checkpoint {
    const tree = this.sandbox.snapshot();
    const treeHash = createHash("sha256").update(tree).digest("hex");
    const checkpoint = CheckpointSchema.parse({
      id: makeId("ckp", this.random),
      projectId: this.sandbox.id,
      runId: null,
      trigger,
      causedBy: causedBy ?? null,
      label,
      createdAt: this.now(),
      treeHash,
      sizeBytes: Buffer.byteLength(tree, "utf8"),
      restorable: true
    });
    this.saved.set(checkpoint.id, { checkpoint, tree });
    return checkpoint;
  }

  restore(id: string): RestoreResult {
    const saved = this.saved.get(id);
    const checkpointId = CheckpointId.safeParse(id).success
      ? id
      : makeId("ckp", this.random);
    let result: RestoreResult;
    if (!saved) {
      result = {
        checkpointId,
        restoredAt: this.now(),
        filesChanged: 0,
        ok: false,
        error: "Checkpoint not found"
      };
      return RestoreResultSchema.parse(result);
    }

    try {
      // Verify the metadata still describes exactly the tree retained for restore.
      const actualHash = createHash("sha256").update(saved.tree).digest("hex");
      if (actualHash !== saved.checkpoint.treeHash) throw new Error("Checkpoint snapshot hash mismatch");
      this.sandbox.restore(saved.tree);
      result = {
        checkpointId: saved.checkpoint.id,
        restoredAt: this.now(),
        filesChanged: 0,
        ok: true,
        error: null
      };
    } catch (error) {
      result = {
        checkpointId: saved.checkpoint.id,
        restoredAt: this.now(),
        filesChanged: 0,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
    return RestoreResultSchema.parse(result);
  }
}
