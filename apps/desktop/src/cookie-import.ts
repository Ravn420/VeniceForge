/**
 * Venice.ai cookie import — Fallback SSO login.
 *
 * Since the app now supports native OAuth via the shared 'persist:venice' partition,
 * this tool serves as a secondary fallback for users who prefer to import existing
 * sessions from Chrome, Edge, etc., rather than performing a new OAuth flow.
 *
 * Supported stores:
 *   - Chromium-based (Chrome, Edge, Brave, etc.): SQLite `Cookies` db.
 *   - Firefox: SQLite `cookies.sqlite`.
 */
import { createDecipheriv } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import DatabaseConstructor from "better-sqlite3";

export interface VeniceCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number; // epoch seconds; 0 = session cookie
  secure: boolean;
}

export interface CookieImportResult {
  imported: number;
  sources: string[];
  errors: string[];
}

const CHROMIUM_BROWSERS: Array<{ name: string; base: string }> = [
  { name: "Chrome", base: join(homedir(), "AppData", "Local", "Google", "Chrome", "User Data") },
  { name: "Edge", base: join(homedir(), "AppData", "Local", "Microsoft", "Edge", "User Data") },
  { name: "Brave", base: join(homedir(), "AppData", "Local", "BraveSoftware", "Brave-Browser", "User Data") },
  { name: "Opera", base: join(homedir(), "AppData", "Roaming", "Opera Software", "Opera Stable") },
  { name: "Chromium", base: join(homedir(), "AppData", "Local", "Chromium", "User Data") }
];

const FIREFOX_PROFILES = join(homedir(), "AppData", "Roaming", "Mozilla", "Firefox", "Profiles");
const VENICE_DOMAIN = "venice.ai";

/* ── Chromium decryption ────────────────────────────────────────────── */

function dpapiUnprotect(buf: Buffer): Buffer {
  // Node has no native DPAPI; use PowerShell's [ProtectedData]::Unprotect.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  const b64 = buf.toString("base64");
  const script = [
    "Add-Type -AssemblyName System.Security",
    `$b=[Convert]::FromBase64String('${b64}')`,
    "$u=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser')",
    "[Convert]::ToBase64String($u)"
  ].join("; ");
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  return Buffer.from(out.trim(), "base64");
}

function chromiumMasterKey(userDataBase: string): Buffer | null {
  const localState = join(userDataBase, "Local State");
  if (!existsSync(localState)) return null;
  try {
    const encryptedKey = JSON.parse(readFileSync(localState, "utf8"))
      ?.os_crypt?.encrypted_key as string | undefined;
    if (!encryptedKey) return null;
    const keyBlob = Buffer.from(encryptedKey, "base64");
    // DPAPI blobs start with the "DPAPI" magic (0x01 0x00 0xD0 0x8C 0x9D 0xDF...).
    if (keyBlob.slice(0, 4).toString() !== "DPAPI") return null;
    return dpapiUnprotect(keyBlob.slice(5));
  } catch {
    return null;
  }
}

/** Chromium cookie value: v10/v20 = AES-GCM with app-bound prefix variants; DPAPI = legacy. */
function decryptChromiumValue(encrypted: Buffer, masterKey: Buffer | null): string {
  if (encrypted.length === 0) return "";
  const prefix = encrypted.slice(0, 3).toString("utf8");
  try {
    if (prefix === "v10" || prefix === "v11") {
      if (!masterKey) return "";
      const iv = encrypted.slice(3, 3 + 12);
      const payload = encrypted.slice(3 + 12);
      const tag = payload.subarray(payload.length - 16);
      const cipher = payload.subarray(0, payload.length - 16);
      const d = createDecipheriv("aes-256-gcm", masterKey, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(cipher), d.final()]).toString("utf8");
    }
    if (prefix === "v20") {
      // App-Bound encryption (Chrome 127+): impossible to decrypt outside the
      // browser process by design. Skip rather than corrupt.
      return "";
    }
    // Legacy DPAPI-encrypted value (pre-v10 Chrome, some Chromium builds).
    return dpapiUnprotect(encrypted).toString("utf8");
  } catch {
    return "";
  }
}

/* ── Store readers ──────────────────────────────────────────────────── */

interface RawCookieRow {
  host_key: string;
  name: string;
  value: string;
  encrypted_value: Buffer;
  path: string;
  is_secure: number;
  expires_utc: number;
}

/** Chromium epoch: microseconds since 1601-01-01. */
function chromiumExpiresToUnix(us: number): number {
  if (!us) return 0;
  return Math.floor(us / 1_000_000 - 11644473600);
}

function copyLocked(src: string, tmp: string): boolean {
  // Chromium browsers open the Cookies DB with an exclusive lock. Three
  // attempts in order of reliability:
  //   1. esentutl /y — Windows' built-in backup reader, reads exclusively-
  //      locked ESE/JET pages (this is how forensic tools do it).
  //   2. PowerShell FileStream with FileShare.ReadWrite|Delete — works when
  //      the browser only holds a shared write lock.
  //   3. Plain copyFileSync — works when the browser is closed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  try {
    rmSync(tmp, { force: true });
    execFileSync("esentutl", ["/y", src, "/d", tmp, "/o"], { stdio: "ignore", timeout: 15_000 });
    if (existsSync(tmp)) return true;
  } catch { /* fall through */ }
  const ps = [
    `$src='${src.replace(/'/g, "''")}'`,
    `$dst='${tmp.replace(/'/g, "''")}'`,
    "$fs=[System.IO.File]::Open($src,'Open','Read','ReadWrite,Delete')",
    "$out=[System.IO.File]::Create($dst)",
    "$fs.CopyTo($out)",
    "$out.Close(); $fs.Close()"
  ].join("; ");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "ignore" });
    if (existsSync(tmp)) return true;
  } catch { /* fall through */ }
  try {
    copyFileSync(src, tmp);
    return existsSync(tmp);
  } catch {
    return false;
  }
}

function readChromiumCookies(base: string, profileDirs: string[], masterKey: Buffer | null): VeniceCookie[] {
  const out: VeniceCookie[] = [];
  for (const profile of profileDirs) {
    const dbPath = join(base, profile, "Network", "Cookies");
    if (!existsSync(dbPath)) continue;
    const tmp = join(process.env.TEMP ?? "/tmp", `forge-cookies-${Math.random().toString(36).slice(2)}.db`);
    try {
      copyLocked(dbPath, tmp);
      if (!existsSync(tmp)) continue;
      const db = new DatabaseConstructor(tmp, { readonly: true });
      const rows = db
        .prepare("SELECT host_key, name, value, encrypted_value, path, is_secure, expires_utc FROM cookies WHERE host_key LIKE ?")
        .all("%venice.ai%") as RawCookieRow[];
      db.close();
      for (const r of rows) {
        const value = r.value || decryptChromiumValue(r.encrypted_value, masterKey);
        if (!value) continue;
        out.push({
          name: r.name,
          value,
          domain: r.host_key,
          path: r.path,
          expires: chromiumExpiresToUnix(r.expires_utc),
          secure: r.is_secure === 1
        });
      }
    } catch {
      /* unreadable profile — skip */
    } finally {
      try { rmSync(tmp, { force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* tmp file lingers harmlessly */ }
    }
  }
  return out;
}

function readFirefoxCookies(): VeniceCookie[] {
  if (!existsSync(FIREFOX_PROFILES)) return [];
  const out: VeniceCookie[] = [];
  for (const profile of ["default-release", "default"]) {
    const dbPath = join(FIREFOX_PROFILES, profile, "cookies.sqlite");
    if (!existsSync(dbPath)) continue;
    const tmp = join(process.env.TEMP ?? "/tmp", `forge-ff-cookies-${Math.random().toString(36).slice(2)}.sqlite`);
    try {
      copyLocked(dbPath, tmp);
      if (!existsSync(tmp)) continue;
      const db = new DatabaseConstructor(tmp, { readonly: true });
      const rows = db
        .prepare("SELECT host, name, value, path, isSecure, expiry FROM moz_cookies WHERE host LIKE ?")
        .all(`%${VENICE_DOMAIN}%`) as Array<{ host: string; name: string; value: string; path: string; isSecure: number; expiry: number }>;
      db.close();
      for (const r of rows) {
        if (!r.value) continue;
        out.push({
          name: r.name,
          value: r.value,
          domain: r.host,
          path: r.path,
          expires: r.expiry,
          secure: r.isSecure === 1
        });
      }
    } catch {
      /* skip */
    } finally {
      try { rmSync(tmp, { force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* tmp file lingers harmlessly */ }
    }
  }
  return out;
}

/* ── Public API ─────────────────────────────────────────────────────── */

/** Collect all venice.ai cookies from every installed browser profile. */
export function collectVeniceCookies(): { cookies: VeniceCookie[]; sources: string[]; errors: string[] } {
  const cookies: VeniceCookie[] = [];
  const sources: string[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const browser of CHROMIUM_BROWSERS) {
    if (!existsSync(browser.base)) continue;
    try {
      const key = chromiumMasterKey(browser.base);
      const profiles = existsSync(join(browser.base, "Default"))
        ? ["Default", ...readdirSafe(join(browser.base)).filter((d) => /^Profile \d+$/.test(d))]
        : readdirSafe(browser.base).filter((d) => existsSync(join(browser.base, d, "Network", "Cookies")));
      const found = readChromiumCookies(browser.base, profiles, key);
      for (const c of found) {
        const k = `${c.name}|${c.domain}`;
        if (!seen.has(k)) { seen.add(k); cookies.push(c); }
      }
      if (found.length) sources.push(browser.name);
    } catch (e) {
      errors.push(`${browser.name}: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  try {
    const ff = readFirefoxCookies();
    for (const c of ff) {
      const k = `${c.name}|${c.domain}`;
      if (!seen.has(k)) { seen.add(k); cookies.push(c); }
    }
    if (ff.length) sources.push("Firefox");
  } catch (e) {
    errors.push(`Firefox: ${(e as Error).message.slice(0, 80)}`);
  }

  return { cookies, sources, errors };
}

function readdirSafe(dir: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}
