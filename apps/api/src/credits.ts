import { ErrorCode } from "@forge/contracts";
import { getDb } from "./db/client.js";

interface CreditBucket {
  project: number;
  run: number;
}

const DEFAULT_PROJECT_CREDITS = Number(process.env.DEFAULT_PROJECT_CREDITS ?? 2500);
const DEFAULT_RUN_CAP = Number(process.env.CREDITS_PER_RUN_CAP ?? 500);

/** Credit meter backed by SQLite — balances survive restarts. */
export class CreditMeter {
  private bucket(projectId: string): CreditBucket {
    const db = getDb();
    const row = db.prepare("SELECT project, run FROM credits WHERE project_id = ?").get(projectId) as
      | { project: number; run: number }
      | undefined;
    if (row) return { project: row.project, run: row.run };
    const fresh = { project: DEFAULT_PROJECT_CREDITS, run: DEFAULT_RUN_CAP };
    db.prepare("INSERT OR IGNORE INTO credits (project_id, project, run) VALUES (?, ?, ?)")
      .run(projectId, fresh.project, fresh.run);
    return fresh;
  }

  private write(projectId: string, b: CreditBucket): void {
    getDb()
      .prepare("INSERT INTO credits (project_id, project, run) VALUES (?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET project = excluded.project, run = excluded.run")
      .run(projectId, b.project, b.run);
  }

  newRun(projectId: string): void {
    const b = this.bucket(projectId);
    b.run = Math.min(b.project, DEFAULT_RUN_CAP);
    this.write(projectId, b);
  }

  remaining(projectId: string): CreditBucket {
    return this.bucket(projectId);
  }

  check(projectId: string, cost: number): { code: typeof ErrorCode.E_BUDGET_EXCEEDED; message: string } | null {
    const b = this.bucket(projectId);
    if (b.project < cost || b.run < cost) {
      return {
        code: ErrorCode.E_BUDGET_EXCEEDED,
        message: `Insufficient credits (need ${cost}, project=${b.project}, run=${b.run})`
      };
    }
    return null;
  }

  charge(projectId: string, cost: number): void {
    const b = this.bucket(projectId);
    b.project = Math.max(0, b.project - cost);
    b.run = Math.max(0, b.run - cost);
    this.write(projectId, b);
  }
}
