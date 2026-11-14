/**
 * Real auth: user registration with scrypt-hashed credentials + HMAC session
 * tokens. Sessions are revocable and revocations persist in SQLite.
 */
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "./db/client.js";

export type Plan = "free" | "pro" | "max";

export interface AuthPayload {
  sid: string;
  userId: string;
  plan: Plan;
  exp: number;
}

const SECRET = process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "venice-forge-dev-secret");
if (process.env.NODE_ENV === "production" && !SECRET) {
  throw new Error("AUTH_SECRET must be set in production");
}

interface UserRow {
  user_id: string;
  provider: string;
  provider_id: string | null;
  secret: string | null;
  plan: Plan;
}

function hashPassword(password: string, salt?: string): string {
  const s = salt ?? randomBytes(16).toString("hex");
  const h = scryptSync(password, s, 32).toString("hex");
  return `${s}:${h}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function signBody(encoded: string): string {
  return createHmac("sha256", SECRET).update(encoded).digest("base64url");
}

/** Register a user; returns false if the userId is taken. */
export function register(userId: string, password: string, plan: Plan = "free"): boolean {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM users WHERE user_id = ?").get(userId);
  if (exists) return false;
  db.prepare("INSERT INTO users (user_id, kind, plan, secret, created_at) VALUES (?, 'dev', ?, ?, ?)")
    .run(userId, plan, hashPassword(password), Date.now());
  return true;
}

/** Verify credentials; returns the payload basis or null. */
export function authenticate(userId: string, password: string): { userId: string; plan: Plan } | null {
  const row = getDb().prepare("SELECT user_id, secret, plan FROM users WHERE user_id = ?").get(userId) as UserRow | undefined;
  if (!row || !row.secret || !verifyPassword(password, row.secret)) return null;
  return { userId: row.user_id, plan: row.plan };
}

/** Authenticate via OAuth; find or create user. */
export function authenticateOAuth(provider: string, providerId: string, plan: Plan = "free"): { userId: string; plan: Plan } {
  const db = getDb();
  const row = db.prepare("SELECT user_id, plan FROM users WHERE provider = ? AND provider_id = ?").get(provider, providerId) as { user_id: string; plan: Plan } | undefined;

  if (row) {
    return { userId: row.user_id, plan: row.plan };
  }

  const userId = `${provider}:${providerId}`;
  const exists = db.prepare("SELECT 1 FROM users WHERE user_id = ?").get(userId);
  if (exists) {
    throw new Error("OAuth identity collision");
  }

  db.prepare("INSERT INTO users (user_id, provider, provider_id, kind, plan, created_at) VALUES (?, ?, ?, 'dev', ?, ?)")
    .run(userId, provider, providerId, plan, Date.now());

  return { userId, plan };
}

export function sign(input: { userId: string; plan: Plan }, ttlMs = 24 * 60 * 60 * 1000): string {
  const payload: AuthPayload = {
    sid: randomUUID(),
    userId: input.userId,
    plan: input.plan,
    exp: Date.now() + ttlMs
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${signBody(encoded)}`;
}

export function verify(token: string): AuthPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expected = signBody(encoded);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AuthPayload;
    if (!parsed.sid || !parsed.userId || !parsed.plan || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    if (getDb().prepare("SELECT 1 FROM revoked_sessions WHERE sid = ?").get(parsed.sid)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function fromHeader(header: string | undefined): AuthPayload | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m?.[1]) return null;
  return verify(m[1].trim());
}

/** Revocations persist — survives server restarts. */
export function revoke(sid: string): void {
  getDb().prepare("INSERT OR REPLACE INTO revoked_sessions (sid, revoked_at) VALUES (?, ?)").run(sid, Date.now());
}

export function maxSandboxes(plan: Plan): number {
  switch (plan) {
    case "max":
      return 20;
    case "pro":
      return 5;
    case "free":
    default:
      return 1;
  }
}
