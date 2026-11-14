import type { Bounds, BoundsState } from "@forge/contracts";

export type BoundsVerdict =
  | { kind: "proceed" }
  | { kind: "diagnose"; reason: "ceiling" | "repeat" }
  | { kind: "exhausted" };

/**
 * Per-signature attempt accounting. Never the same rung twice in a row, and a
 * hard ceiling regardless of how many distinct rungs exist.
 */
export class BoundsTracker {
  private readonly states = new Map<string, BoundsState>();

  constructor(private readonly bounds: Bounds) {}

  state(signatureId: BoundsState["signatureId"]): BoundsState {
    const existing = this.states.get(signatureId);
    if (existing) return existing;
    const fresh: BoundsState = {
      signatureId,
      attempts: 0,
      lastRung: null,
      exhausted: false,
      diagnosisId: null
    };
    this.states.set(signatureId, fresh);
    return fresh;
  }

  next(signatureId: BoundsState["signatureId"], rung: number): BoundsVerdict {
    const s = this.state(signatureId);
    if (s.exhausted) return { kind: "exhausted" };
    if (s.attempts >= this.bounds.maxAttemptsPerSignature) {
      s.exhausted = true;
      return { kind: "diagnose", reason: "ceiling" };
    }
    if (!this.bounds.allowRepeatConsecutive && s.lastRung === rung && s.attempts > 0) {
      return { kind: "diagnose", reason: "repeat" };
    }
    if (s.attempts >= this.bounds.diagnosisAfter) {
      return { kind: "diagnose", reason: "ceiling" };
    }
    return { kind: "proceed" };
  }

  record(signatureId: BoundsState["signatureId"], rung: number): void {
    const s = this.state(signatureId);
    s.attempts += 1;
    s.lastRung = rung;
  }

  markDiagnosed(signatureId: BoundsState["signatureId"], diagnosisId: string): void {
    const s = this.state(signatureId);
    s.exhausted = true;
    s.diagnosisId = diagnosisId;
  }

  reset(signatureId: BoundsState["signatureId"]): void {
    this.states.delete(signatureId);
  }
}
