import { createHash } from "node:crypto";

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

const NOISE = /^(npm WARN|warning:|note:|\s*at\s|\s*$)/i;

/** First line that looks like the actual fault, not a warning or a stack frame. */
export function firstDiagnostic(text: string): string {
  for (const raw of stripAnsi(text).split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (NOISE.test(line)) continue;
    return line.slice(0, 500);
  }
  return "";
}

export function signatureHash(
  failureClass: string,
  exitCode: number | null,
  diagnostic: string,
  platform: string
): string {
  return createHash("sha256")
    .update(`${failureClass}|${exitCode ?? "null"}|${diagnostic}|${platform}`)
    .digest("hex");
}

/** Collapse volatile tokens so the same fault hashes identically. */
export function normalizeDiagnostic(text: string): string {
  return text
    .replace(/0x[0-9a-f]+/gi, "0xADDR")
    .replace(/\b\d+(\.\d+)?(ms|s)\b/g, "TIME")
    .replace(/\bpid\s*\d+/gi, "pid PID")
    .replace(/:\d+:\d+/g, ":L:C")
    // Collapse volatile port numbers (EADDRINUSE :::3000, ECONNREFUSED host:5432).
    .replace(/:((?:\d{1,3}\.){0,3}\d{1,5})(?![\w.])(?:\s|$)/g, ":PORT ");
}