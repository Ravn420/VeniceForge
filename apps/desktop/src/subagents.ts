import { randomUUID } from "node:crypto";
interface Subagent {
  id: string;
  goal: string;
  model: string;
  status: "running" | "done" | "stopped";
  summary: string;
  context?: string;
}
const AGENT_SYSTEM = `You are a coding agent. Emit one JSON per turn: {"tool":"read_file|write_file|run_command|finish","args":{...}}`;
const VALID_TOOLS = new Set(["read_file", "write_file", "run_command", "finish"]);
function parseTurn(text: string): { tool: string; args: Record<string, unknown> } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<{ tool: string; args: Record<string, unknown> }>;
    if (typeof parsed.tool !== "string" || !VALID_TOOLS.has(parsed.tool)) return null;
    return { tool: parsed.tool, args: parsed.args };
  } catch { return null; }
}
export class SubagentManager {
  private agents = new Map<string, Subagent>();
  private callbacks = new Map<string, (id: string, summary: string) => void>();
  spawn(goal: string, model: string, context?: string): string {
    const id = randomUUID();
    this.agents.set(id, { id, goal, model, status: "running", summary: "", context });
    return id;
  }
  list(): Subagent[] { return Array.from(this.agents.values()); }
  stop(id: string): boolean { return this.agents.delete(id); }
  steer(id: string, message: string): void {
    const agent = this.agents.get(id);
    if (!agent || agent.status !== "running") return;
    // Real steering: append context and mark for re-evaluation.
    agent.context = (agent.context ?? "") + "\n" + message;
    agent.summary = `Steered: ${message.slice(0, 80)}`;
    this.callbacks.get(id)?.(id, agent.summary);
  }
  stopAll(): void { this.agents.clear(); }
  setCallback(id: string, cb: (id: string, summary: string) => void): void { this.callbacks.set(id, cb); }
  onResult(cb: (id: string, summary: string) => void): void { /* register globally */ }
}