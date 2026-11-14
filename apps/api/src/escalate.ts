/**
 * Deterministic escalation — no LLM/API calls.
 *
 * Confidence now comes purely from the deterministic classifier. Low
 * confidence detections are labelled "needs_human" so the UI can hand the
 * user to the Venice.ai web app if it wants model judgement; the server
 * itself never talks to a model endpoint.
 */
import { FailureClass, type Detection as DetectionType } from "@forge/contracts";

export interface EscalationResult {
  detection: DetectionType | null;
  /** True when confidence was too low and a human/model should look at it. */
  needsHuman: boolean;
}

export async function escalate(
  rawDetection: DetectionType | null,
  stderr: string,
  stdout: string,
  exitCode: number | null
): Promise<EscalationResult> {
  if (rawDetection && rawDetection.confidence >= 0.7) {
    return { detection: rawDetection, needsHuman: false };
  }

  if (rawDetection) {
    return { detection: rawDetection, needsHuman: true };
  }

  if (exitCode !== null && exitCode !== 0) {
    const evidence = (stderr.trim() || stdout.trim() || `Process exited with code ${exitCode}`).slice(0, 500);
    void FailureClass; // keep the zod enum import contract-checked
    return {
      detection: {
        failureClass: "unknown",
        confidence: 0.5,
        evidence,
        location: null
      },
      needsHuman: true
    };
  }

  return { detection: null, needsHuman: false };
}
