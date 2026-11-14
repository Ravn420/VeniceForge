import type { Detection, FailureSignature } from "@forge/contracts";
import { DETECTORS, type DetectorInput } from "./detectors/index.js";
import { firstDiagnostic, normalizeDiagnostic, signatureHash, stripAnsi } from "./normalize.js";

const MIN_CONFIDENCE = 0.5;

/** Highest-confidence detection wins; ties break by priority order. */
export function classify(input: DetectorInput): Detection | null {
  const clean: DetectorInput = {
    ...input,
    stdout: stripAnsi(input.stdout),
    stderr: stripAnsi(input.stderr)
  };

  let best: Detection | null = null;
  for (const d of DETECTORS) {
    const got = d.detect(clean);
    if (!got) continue;
    if (got.confidence < MIN_CONFIDENCE) continue;
    if (!best || got.confidence > best.confidence) best = got;
    if (best.confidence >= 0.95) break;
  }
  return best;
}

export interface SignatureInput {
  projectId: string;
  commandId: string;
  platform: string;
  now: number;
  makeSigId: () => string;
}

export function buildSignature(
  input: DetectorInput,
  detection: Detection,
  meta: SignatureInput
): FailureSignature {
  const diag = normalizeDiagnostic(firstDiagnostic(`${input.stderr}\n${input.stdout}`));
  return {
    id: meta.makeSigId(),
    projectId: meta.projectId,
    commandId: meta.commandId,
    failureClass: detection.failureClass,
    hash: signatureHash(detection.failureClass, input.exitCode, diag, meta.platform),
    exitCode: input.exitCode,
    firstDiagnostic: diag,
    platform: meta.platform,
    classifiedBy: "deterministic",
    confidence: detection.confidence,
    createdAt: meta.now
  };
}