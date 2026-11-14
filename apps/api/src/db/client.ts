import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

/**
 * Single SQLite connection for all persistent state: users, sessions
 * (auth revocation), projects, credits, commands and agent runs.
 * File location: FORGE_DB_PATH, or <repo>/data/forge.db by default.
 */

type SqliteDatabase = InstanceType<typeof Database>;

let db: SqliteDatabase | null = null;

export function dbPath(): string {
  return process.env.FORGE_DB_PATH ?? join(process.cwd(), "data", "forge.db");
}

export function getDb(): SqliteDatabase {
  if (db) return db;
  const file = dbPath();
  mkdirSync(dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(d: SqliteDatabase): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id   TEXT PRIMARY KEY,
      provider   TEXT NOT NULL DEFAULT 'local',
      provider_id TEXT,
      kind      TEXT NOT NULL CHECK (kind IN ('dev','pro','max','free')),
      plan      TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','max')),
      secret    TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(provider, provider_id)
    );

    CREATE TABLE IF NOT EXISTS revoked_sessions (
      sid        TEXT PRIMARY KEY,
      revoked_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(user_id),
      name       TEXT NOT NULL,
      repo_url   TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credits (
      project_id TEXT PRIMARY KEY REFERENCES projects(id),
      project    INTEGER NOT NULL DEFAULT 2500,
      run        INTEGER NOT NULL DEFAULT 500
    );

    CREATE TABLE IF NOT EXISTS commands (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      argv_json  TEXT NOT NULL,
      cwd        TEXT,
      status     TEXT,
      exit_code  INTEGER,
      stdout     TEXT,
      stderr     TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commands_session ON commands(session_id);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor_json TEXT NOT NULL,
      mode       TEXT NOT NULL,
      autonomy   INTEGER NOT NULL,
      status     TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at   INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_steps (
      id       TEXT PRIMARY KEY,
      run_id   TEXT NOT NULL REFERENCES agent_runs(id),
      idx      INTEGER NOT NULL,
      kind     TEXT,
      label    TEXT,
      credits  INTEGER NOT NULL DEFAULT 0,
      at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id);
  `);
}

export async function closeDb(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}
