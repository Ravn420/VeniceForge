import { z } from "zod";
import { AttemptId, CheckpointId, CommandId, DiagnosisId, EpochMs, RecipeId, SignatureId } from "./primitives.js";

export const RemedyAttemptStatus = z.enum(["planned", "approved", "running", "succeeded", "failed", "skipped"]);
export type RemedyAttemptStatus = z.infer<typeof RemedyAttemptStatus>;

export const ExpectedEffect = z.enum([
  "binary_present", "module_resolved", "port_free", "exit_zero",
  "path_exists", "auth_present", "quota_ok", "custom"
]);
export type ExpectedEffect = z.infer<typeof ExpectedEffect>;

export const RemedyPlan = z.object({
  attemptId: AttemptId,
  signatureId: SignatureId,
  rung: z.number().int().nonnegative(),
  title: z.string().max(120),
  rationale: z.string().max(600),
  steps: z.array(z.array(z.string()).min(1)).min(1),
  expectedEffect: ExpectedEffect,
  reversible: z.boolean(),
  requiresScripts: z.boolean().default(false),
  offAllowlistRegistry: z.boolean().default(false),
  checkpointId: CheckpointId.nullable()
});
export type RemedyPlan = z.infer<typeof RemedyPlan>;

export const RemedyAttempt = z.object({
  id: AttemptId,
  signatureId: SignatureId,
  plan: RemedyPlan,
  status: RemedyAttemptStatus,
  startedAt: EpochMs.nullable(),
  endedAt: EpochMs.nullable(),
  resultCommandIds: z.array(CommandId),
  failureReason: z.string().nullable(),
  diff: z.string().nullable()
});
export type RemedyAttempt = z.infer<typeof RemedyAttempt>;

export const Hypothesis = z.object({
  claim: z.string().max(600),
  confidence: z.number().min(0).max(1),
  supporting: z.array(z.string()),
  contradicting: z.array(z.string())
});
export type Hypothesis = z.infer<typeof Hypothesis>;

export const Diagnosis = z.object({
  id: DiagnosisId,
  signatureId: SignatureId,
  summary: z.string().max(1200),
  evidence: z.array(z.object({ commandId: CommandId, quote: z.string().max(400) })),
  hypotheses: z.array(Hypothesis).min(1),
  ruledOut: z.array(z.string()),
  recommendation: z.string().max(800),
  needsHuman: z.literal(true),
  createdAt: EpochMs
});
export type Diagnosis = z.infer<typeof Diagnosis>;

export const FixRecipe = z.object({
  id: RecipeId,
  signatureHash: z.string().length(64),
  envFingerprint: z.string(),
  plan: RemedyPlan,
  verifiedAt: EpochMs,
  consecutiveFailures: z.number().int().nonnegative().default(0),
  demoted: z.boolean().default(false)
});
export type FixRecipe = z.infer<typeof FixRecipe>;

export const Bounds = z.object({
  maxAttemptsPerSignature: z.number().int().positive().default(3),
  diagnosisAfter: z.number().int().positive().default(2),
  allowRepeatConsecutive: z.boolean().default(false)
});
export type Bounds = z.infer<typeof Bounds>;

export const BoundsState = z.object({
  signatureId: SignatureId,
  attempts: z.number().int().nonnegative(),
  lastRung: z.number().int().nullable(),
  exhausted: z.boolean().default(false),
  diagnosisId: DiagnosisId.nullable().default(null)
});
export type BoundsState = z.infer<typeof BoundsState>;