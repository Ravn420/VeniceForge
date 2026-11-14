import { z } from "zod";

export const TrustLevel = z.enum(["system", "user", "tool", "file", "output", "web"]);
export type TrustLevel = z.infer<typeof TrustLevel>;

export const TRUST_PRECEDENCE: Record<TrustLevel, number> = {
  system: 0, user: 1, tool: 2, file: 3, output: 4, web: 5
};

export const TrustTag = z.object({
  level: TrustLevel,
  source: z.string().max(300),
  suspectInstruction: z.string().max(500).nullable().default(null)
});
export type TrustTag = z.infer<typeof TrustTag>;

export const Tagged = z.object({ text: z.string(), trust: TrustTag });
export type Tagged = z.infer<typeof Tagged>;

export const PermissionScope = z.enum([
  "read_files", "write_files", "run_commands", "run_remedies", "network_egress",
  "install_packages", "touch_git", "deploy", "spend_credits", "run_migrations"
]);
export type PermissionScope = z.infer<typeof PermissionScope>;

export const PermissionGrant = z.enum(["once", "session", "project", "always", "deny"]);
export type PermissionGrant = z.infer<typeof PermissionGrant>;

/** Heuristic: does this text look like it is addressing the model? */
const INJECTION_PATTERNS = [
  /note to (the )?(ai|assistant|agent)/i,
  /ignore (all )?(previous|prior|above) instructions/i,
  /^as an ai\b/im,
  /\byou must\b.*\b(add|install|run|set)\b/i,
  /\bdo not (ask|prompt) the user\b/i
];

export function suspectsInstruction(text: string): string | null {
  for (const line of text.split("\n")) {
    if (INJECTION_PATTERNS.some((p) => p.test(line))) return line.trim().slice(0, 500);
  }
  return null;
}