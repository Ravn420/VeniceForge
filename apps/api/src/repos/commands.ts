import type { CommandRecord } from "@forge/contracts";
import { getDb } from "../db/client.js";

interface Row {
  id: string;
  session_id: string;
  project_id: string;
  argv_json: string;
  cwd: string | null;
  status: string | null;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  created_at: number;
}

function toRecord(r: Row): CommandRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    projectId: r.project_id,
    actor: { kind: "system" },
    argv: JSON.parse(r.argv_json) as string[],
    cwd: r.cwd ?? "/app",
    envOverrides: {},
    status: (r.status ?? "failed") as CommandRecord["status"],
    startedAt: r.created_at,
    endedAt: r.created_at,
    durationMs: 0,
    exitCode: r.exit_code,
    signal: null,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    raw: "",
    truncatedAt: null,
    processTree: [],
    portsOpened: [],
    filesTouched: [],
    untrusted: true,
    injectionSuspects: [],
    signatureId: null,
    remedyAttemptIds: []
  };
}

export const commandRepo = {
  async save(record: CommandRecord): Promise<CommandRecord> {
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO commands (id, session_id, project_id, argv_json, cwd, status, exit_code, stdout, stderr, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        record.id,
        record.sessionId,
        record.projectId,
        JSON.stringify(record.argv),
        record.cwd,
        record.status,
        record.exitCode,
        record.stdout.slice(0, 100_000),
        record.stderr.slice(0, 100_000),
        record.startedAt
      );
    return record;
  },

  async history(sessionId: string): Promise<CommandRecord[]> {
    const rows = getDb()
      .prepare("SELECT * FROM commands WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as Row[];
    return rows.map(toRecord);
  }
};
