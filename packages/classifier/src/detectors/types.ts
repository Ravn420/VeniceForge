import type { Detection, FailureClass } from "@forge/contracts";

export interface DetectorInput {
  argv: string[];
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  cwd: string;
}

export interface Detector {
  id: string;
  priority: number;
  detect(input: DetectorInput): Detection | null;
}

export function hit(
  failureClass: FailureClass,
  confidence: number,
  evidence: string,
  location: { file: string; line: number | null } | null = null
): Detection {
  return { failureClass, confidence, evidence: evidence.slice(0, 500), location };
}

export function anyMatch(patterns: RegExp[], text: string): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m;
  }
  return null;
}