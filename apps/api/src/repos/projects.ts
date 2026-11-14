import { makeId } from "@forge/contracts";
import { getDb } from "../db/client.js";

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  repoUrl: string | null;
  createdAt: number;
}

interface Row {
  id: string;
  user_id: string;
  name: string;
  repo_url: string | null;
  created_at: number;
}

function toRecord(r: Row): ProjectRecord {
  return { id: r.id, userId: r.user_id, name: r.name, repoUrl: r.repo_url, createdAt: r.created_at };
}

export const projectRepo = {
  async create(userId: string, name: string, repoUrl: string | null): Promise<ProjectRecord> {
    const project: ProjectRecord = {
      id: makeId("prj"),
      userId,
      name,
      repoUrl,
      createdAt: Date.now()
    };
    getDb()
      .prepare("INSERT INTO projects (id, user_id, name, repo_url, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(project.id, project.userId, project.name, project.repoUrl, project.createdAt);
    return project;
  },

  async list(userId: string): Promise<ProjectRecord[]> {
    const rows = getDb()
      .prepare("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as Row[];
    return rows.map(toRecord);
  },

  async get(id: string): Promise<ProjectRecord | null> {
    const row = getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Row | undefined;
    return row ? toRecord(row) : null;
  }
};
