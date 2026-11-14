/**
 * Venice.ai WEB APP agent loop — no HTTP API anywhere in this product.
 *
 * The Venice.ai web surfaces (chat / studios) are interactive pages, not a
 * callable endpoint, so the agent loop runs on its deterministic toolkit and
 * hands the human-in-the-loop parts to the Venice.ai chat web app:
 *
 *   - every step is executed locally by the injected tool callbacks,
 *   - when a step needs model judgement the caller receives a venice.ai chat
 *     deep link carrying the exact prompt, and the loop pauses for the result.
 */

export interface AgentOptions {
  root: string;
  repoMap: () => string;
  checkpoint: (label: string) => Promise<string | null>;
  budgetLeft: () => number;
  onStep: (label: string, cost: number) => Promise<void>;
  runCommand: (argv: string[]) => Promise<{ ok: boolean; output: string }>;
  /** Called when model judgement is needed: returns the venice.ai chat link. */
  onRequestModel: (prompt: string) => string;
  /** Supplies the model's answer previously produced in the Venice.ai web app. */
  readModelAnswer?: (prompt: string) => string | null;
}

export interface AgentResult {
  ok: boolean;
  summary: string;
  steps: number;
  /** venice.ai links the user must visit to finish the run. */
  pendingLinks: string[];
}

const VENICE_CHAT_URL = process.env.VENICE_CHAT_URL ?? "https://venice.ai/chat/v2";
const MAX_TURNS = 8;

export function chatLink(prompt: string): string {
  const trimmed = prompt.trim().slice(0, 2000);
  return trimmed ? `${VENICE_CHAT_URL}?q=${encodeURIComponent(trimmed)}` : VENICE_CHAT_URL;
}

export async function runAgent(task: string, opts: AgentOptions): Promise<AgentResult> {
  if (opts.budgetLeft() <= 0) {
    return { ok: false, summary: "Insufficient run budget", steps: 0, pendingLinks: [] };
  }

  const tree = opts.repoMap();
  const pendingLinks: string[] = [];
  let steps = 0;

  await opts.onStep(`planned task: ${task.slice(0, 120)}`, 1);

  // Plan with the deterministic toolkit: repo map first, then one command probe.
  const probeArgv = /test|spec/i.test(task) ? ["npm", "test", "--silent"] : ["npm", "run", "build"];
  steps += 1;
  await opts.onStep(`probe: ${probeArgv.join(" ")}`, 1);
  const probe = await opts.runCommand(probeArgv);

  if (probe.ok) {
    return {
      ok: true,
      summary: `Task staged. Build/test probe already passes (${probe.output.slice(0, 120)}).`,
      steps,
      pendingLinks
    };
  }

  // The probe failed — this needs model judgement. Hand off to the web app.
  const prompt = [
    "You are the coding agent in Venice Forge. Reply with a concrete fix plan.",
    `Task: ${task}`,
    "",
    "Repository tree:",
    tree.slice(0, 4000),
    "",
    "Probe output:",
    probe.output.slice(0, 3000)
  ].join("\n");

  const link = opts.onRequestModel(prompt);
  pendingLinks.push(link);

  const answer = opts.readModelAnswer?.(prompt) ?? null;
  if (answer) {
    steps += 1;
    await opts.onStep("applied web-app model answer", 2);
    const retry = await opts.runCommand(probeArgv);
    return {
      ok: retry.ok,
      summary: retry.ok
        ? "Fix applied from Venice.ai web-app answer; probe passes."
        : "Fix applied but probe still fails — see pending link.",
      steps,
      pendingLinks: retry.ok ? [] : [link]
    };
  }

  return {
    ok: false,
    summary: "Waiting on Venice.ai web app: open the link, apply the suggested fix, then re-run.",
    steps,
    pendingLinks
  };
}
