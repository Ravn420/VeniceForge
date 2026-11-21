import { makeId, type Actor, type AgentMode, type AgentRun, type AgentStep, type RunStatus } from "@forge/contracts";
import { getDb } from "../db/client.js";

type AgentRunRow = {
  id: string;
  project_id: string;
  actor_json: string;
  mode: string;
  autonomy: number;
  status: string;
  started_at: number;
  ended_at: number | null;
};

type StepRow = {
  id: string;
  run_id: string;
  idx: number;
  kind: string | null;
  label: string | null;
  credits: number;
  at: number;
};

function toRun(r: AgentRunRow, steps: AgentStep[] = []): AgentRun {
  return {
    id: r.id,
    projectId: r.project_id,
    sessionId: null,
    actor: JSON.parse(r.actor_json) as AgentRun["actor"],
    mode: r.mode as AgentMode,
    status: r.status as RunStatus,
    autonomy: r.autonomy,
    planMarkdown: null,
    touchedManifest: [],
    startedAt: r.started_at,
    endedAt: r.ended_at,
    creditsUsed: steps.reduce((n, s) => n + s.credits, 0),
    creditsCap: 0,
    steps
  };
}

export const runRepo = {
  async start(
    projectId: string,
    actor: Actor,
    mode: AgentMode,
    autonomy: number,
    creditsCap: number
  ): Promise<AgentRun> {
    const run: AgentRun = {
      id: makeId("run"),
      projectId,
      sessionId: null,
      actor,
      mode,
      status: "running",
      autonomy,
      planMarkdown: null,
      touchedManifest: [],
      startedAt: Date.now(),
      endedAt: null,
      creditsUsed: 0,
      creditsCap,
      steps: []
    };
    getDb()
      .prepare(
        "INSERT INTO agent_runs (id, project_id, actor_json, mode, autonomy, status, started_at) VALUES (?, ?, ?, ?, ?, 'running', ?)"
      )
      .run(run.id, projectId, JSON.stringify(actor), mode, autonomy, run.startedAt);
    return run;
  },

  async addStep(
    runId: string,
    step: Omit<AgentStep, "id" | "runId" | "index" | "at">
  ): Promise<AgentStep | null> {
    const db = getDb();
    const row = db.prepare("SELECT id FROM agent_runs WHERE id = ?").get(runId) as { id: string } | undefined;
    if (!row) return null;
    const count = (db.prepare("SELECT COUNT(*) AS n FROM agent_steps WHERE run_id = ?").get(runId) as { n: number }).n;
    const entry: AgentStep = {
      ...step,
      id: makeId("stp"),
      runId,
      index: count,
      at: Date.now()
    };
    db.prepare(
      "INSERT INTO agent_steps (id, run_id, idx, kind, label, credits, at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(entry.id, runId, entry.index, entry.kind, entry.label, entry.credits, entry.at);
    return entry;
  },

  async finish(runId: string, status: RunStatus): Promise<AgentRun | null> {
    const db = getDb();
    const endedAt = Date.now();
    const res = db.prepare("UPDATE agent_runs SET status = ?, ended_at = ? WHERE id = ?").run(status, endedAt, runId);
    if (res.changes === 0) return null;
    const r = db.prepare("SELECT * FROM agent_runs WHERE id = ?").get(runId) as AgentRunRow;
    return toRun(r);
  },

  async get(id: string): Promise<AgentRun | null> {
    const r = getDb().prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as AgentRunRow | undefined;
    return r ? toRun(r) : null;
  },

  async getOwned(id: string, userId: string): Promise<AgentRun | null> {
    const r = getDb()
      .prepare(`
        SELECT r.* FROM agent_runs r
        JOIN projects p ON p.id = r.project_id
        WHERE r.id = ? AND p.user_id = ?
      `)
      .get(id, userId) as AgentRunRow | undefined;
    return r ? toRun(r) : null;
  },

  async replay(id: string): Promise<AgentStep[]> {
    const rows = getDb()
      .prepare("SELECT * FROM agent_steps WHERE run_id = ? ORDER BY idx ASC")
      .all(id) as StepRow[];
    return rows.map((s) => ({
      id: s.id,
      runId: s.run_id,
      index: s.idx,
      at: s.at,
      kind: (s.kind ?? "note") as AgentStep["kind"],
      label: s.label ?? "",
      credits: s.credits,
      inputTokens: null,
      outputTokens: null,
      latencyMs: null,
      commandId: null,
      checkpointId: null,
      error: null
    }));
  }
};
