import { z } from "zod";

export const Id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[0-9a-z]{20,32}$`), `expected ${prefix}_<id>`);

export const SessionId = Id("ses");
export const CommandId = Id("cmd");
export const RunId = Id("run");
export const StepId = Id("stp");
export const CheckpointId = Id("ckp");
export const ProjectId = Id("prj");
export const SignatureId = Id("sig");
export const RecipeId = Id("rcp");
export const AttemptId = Id("att");
export const DiagnosisId = Id("dia");
export const ApprovalId = Id("apr");
export const PreviewId = Id("pvw");

export const Iso = z.string().datetime({ offset: true });
export const EpochMs = z.number().int().nonnegative();

export const Actor = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human"), userId: z.string().min(1) }),
  z.object({ kind: z.literal("model"), modelId: z.string().min(1), runId: RunId }),
  z.object({ kind: z.literal("system") })
]);
export type Actor = z.infer<typeof Actor>;

export const Stream = z.enum(["stdout", "stderr", "pty"]);
export type Stream = z.infer<typeof Stream>;

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Deterministic-id helper; supply a seed for tests. */
export function makeId(prefix: string, rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 24; i += 1) out += ALPHABET[Math.floor(rand() * ALPHABET.length)] ?? "0";
  return `${prefix}_${out}`;
}