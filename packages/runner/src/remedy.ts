import { makeId, type Diagnosis, type FailureSignature, type RemedyAttempt, type RemedyPlan } from "@forge/contracts";
import type { BoundsTracker } from "./bounds.js";
import { buildPlan, ladderLength, type LadderContext } from "./ladders.js";
import type { RecipeStore } from "./recipes.js";

export interface RemedyDeps {
  bounds: BoundsTracker;
  recipes: RecipeStore;
  /** Autonomy level 2 or higher runs without a plan stop. */
  autonomy: number;
  envFingerprint: string;
  runStep: (argv: string[]) => Promise<{ ok: boolean; commandId: string; diff: string | null }>;
  checkpoint: (label: string) => Promise<string | null>;
}

export type RemedyDecision =
  | { kind: "run"; plan: RemedyPlan; fromRecipe: boolean }
  | { kind: "await"; plan: RemedyPlan }
  | { kind: "diagnose"; diagnosis: Diagnosis };

const AUTO_LEVEL = 2;

function diagnosisFor(sig: FailureSignature, attempts: RemedyAttempt[], reason: string): Diagnosis {
  return {
    id: makeId("dia"),
    signatureId: sig.id,
    summary: `Ladder exhausted after ${attempts.length} attempts (${reason}) on ${sig.failureClass}. No further mutation.`,
    evidence: [{ commandId: sig.commandId, quote: sig.firstDiagnostic }],
    hypotheses: [
      { claim: `The ${sig.failureClass} detection may be wrong for this command.`, confidence: 0.35, supporting: [sig.firstDiagnostic], contradicting: [] },
      { claim: "The environment differs from the ladder's assumptions.", confidence: 0.4, supporting: [], contradicting: [] }
    ],
    ruledOut: attempts.map((a) => `${a.plan.title}: ${a.failureReason ?? "no effect"}`),
    recommendation: "Inspect the last command output and either redirect the approach or take over.",
    needsHuman: true,
    createdAt: Date.now()
  };
}

export async function decide(
  sig: FailureSignature,
  ctx: Omit<LadderContext, "signature">,
  deps: RemedyDeps
): Promise<RemedyDecision> {
  const recipe = deps.recipes.find(sig.hash, deps.envFingerprint);
  if (recipe) {
    return { kind: deps.autonomy >= AUTO_LEVEL ? "run" : "await", plan: recipe.plan, fromRecipe: true };
  }

  const ladder = ladderLength(sig.failureClass);
  if (ladder === 0) return { kind: "diagnose", diagnosis: diagnosisFor(sig, [], "no ladder") };

  for (let rung = 0; rung < ladder; rung += 1) {
    const verdict = deps.bounds.next(sig.id, rung);
    if (verdict.kind === "exhausted") return { kind: "diagnose", diagnosis: diagnosisFor(sig, [], "exhausted") };
    if (verdict.kind === "diagnose") return { kind: "diagnose", diagnosis: diagnosisFor(sig, [], verdict.reason) };

    const plan = buildPlan({ ...ctx, signature: sig }, rung);
    if (!plan) continue;
    return { kind: deps.autonomy >= AUTO_LEVEL ? "run" : "await", plan, fromRecipe: false };
  }
  return { kind: "diagnose", diagnosis: diagnosisFor(sig, [], "no viable rung") };
}

export async function apply(
  sig: FailureSignature,
  plan: RemedyPlan,
  deps: RemedyDeps
): Promise<RemedyAttempt> {
  const attempt: RemedyAttempt = {
    id: plan.attemptId,
    signatureId: sig.id,
    plan,
    status: "running",
    startedAt: Date.now(),
    endedAt: null,
    resultCommandIds: [],
    failureReason: null,
    diff: null
  };

  const cp = await deps.checkpoint(`before remedy: ${plan.title}`);
  attempt.plan.checkpointId = cp;
  deps.bounds.record(sig.id, plan.rung);

  for (const argv of plan.steps) {
    const res = await deps.runStep(argv);
    attempt.resultCommandIds.push(res.commandId);
    if (!res.ok) {
      attempt.status = "failed";
      attempt.failureReason = `step failed: ${argv.join(" ")}`;
      attempt.endedAt = Date.now();
      deps.recipes.noteFailure(sig.hash, deps.envFingerprint);
      return attempt;
    }
    if (res.diff) attempt.diff = res.diff;
  }

  attempt.status = "succeeded";
  attempt.endedAt = Date.now();
  deps.recipes.remember(sig.hash, deps.envFingerprint, plan);
  return attempt;
}
