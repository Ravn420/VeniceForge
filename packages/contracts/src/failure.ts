import { z } from "zod";
import { CommandId, ProjectId, SignatureId } from "./primitives.js";

export const FailureClass = z.enum([
  "missing_binary", "missing_dependency", "version_mismatch", "permission_denied",
  "port_in_use", "path_not_found", "syntax_error", "type_error", "test_assertion",
  "build_failure", "egress_blocked", "auth_failure", "disk_full", "oom",
  "interactive_stall", "flaky_test", "unknown"
]);
export type FailureClass = z.infer<typeof FailureClass>;

export const FAILURE_CLASSES = FailureClass.options;

export const ClassifiedBy = z.enum(["deterministic", "model", "human"]);
export type ClassifiedBy = z.infer<typeof ClassifiedBy>;

export const FailureSignature = z.object({
  id: SignatureId,
  projectId: ProjectId,
  commandId: CommandId,
  failureClass: FailureClass,
  hash: z.string().length(64),
  exitCode: z.number().int().nullable(),
  firstDiagnostic: z.string().max(500),
  platform: z.string(),
  classifiedBy: ClassifiedBy,
  confidence: z.number().min(0).max(1),
  createdAt: z.number().int().nonnegative()
});
export type FailureSignature = z.infer<typeof FailureSignature>;

export const Detection = z.object({
  failureClass: FailureClass,
  confidence: z.number().min(0).max(1),
  evidence: z.string().max(500),
  location: z.object({ file: z.string(), line: z.number().int().positive().nullable() }).nullable()
});
export type Detection = z.infer<typeof Detection>;