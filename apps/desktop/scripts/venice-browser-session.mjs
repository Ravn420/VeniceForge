/**
 * Read a venice.ai sign-in from the browsers already installed on this machine.
 * Prints one JSON object. Cookie values are included only with --cookies,
 * and only for the desktop process that imports them into its own session.
 *
 * Venice.ai has no desktop app. A live Clerk session (__session / __client_uat)
 * or a legacy __venice-auth.session-token means the person is already signed in
 * and the login page must not be shown.
 */
import { createCipheriv, createDecipheriv, pbkdf2Sync } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir, platform } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const ORDER = ["Chrome", "Edge", "Brave", "Chromium", "Vivaldi", "Opera", "Arc", "Firefox"];

function sessionKind(name) {
  if (name === "__session" || name.startsWith("__session_")) return "session";
  if (name === "__client") return "session";
  if (name === "__venice-auth.session-token" || name.startsWith("__venice-auth.session-token.")) return "session";
  if (name === "__client_uat" || name.startsWith("__client_uat_")) return "uat";
  return "";
}

export function browserRoots(home = homedir(), os = platform()) {
  const chromium = [];
  const push = (name, base) => chromium.push({ name, base });
  if (os === "win32") {
    const local = join(home, "AppData", "Local");
    const roaming = join(home, "AppData", "Roaming");
    push("Chrome", join(local, "Google", "Chrome", "User Data"));
    push("Edge", join(local, "Microsoft", "Edge", "User Data"));
    push("Brave", join(local, "BraveSoftware", "Brave-Browser", "User Data"));
    push("Chromium", join(local, "Chromium", "User Data"));
    push("Vivaldi", join(local, "Vivaldi", "User Data"));
    push("Opera", join(roaming, "Opera Software", "Opera Stable"));
    return { chromium, firefox: join(roaming, "Mozilla", "Firefox") };
  }
  if (os === "darwin") {
    const app = join(home, "Library", "Application Support");
    push("Chrome", join(app, "Google", "Chrome"));
    push("Edge", join(app, "Microsoft Edge"));
    push("Brave", join(app, "BraveSoftware", "Brave-Browser"));
    push("Chromium", join(app, "Chromium"));
    push("Vivaldi", join(app, "Vivaldi"));
    push("Opera", join(app, "com.operasoftware.Opera"));
    push("Arc", join(app, "Arc", "User Data"));
    return { chromium, firefox: join(app, "Firefox") };
  }
  const cfg = join(home, ".config");
  push("Chrome", join(cfg, "google-chrome"));
  push("Edge", join(cfg, "microsoft-edge"));
  push("Brave", join(cfg, "BraveSoftware", "Brave-Browser"));
  push("Chromium", join(cfg, "chromium"));
  push("Vivaldi", join(cfg, "vivaldi"));
  push("Opera", join(cfg, "opera"));
  return { chromium, firefox: join(home, ".mozilla", "firefox") };
}

export function isLiveSession(cookie, now = Date.now() / 1000) {
  if (!cookie) return false;
  if (cookie.expires && cookie.expires > 0 && cookie.expires < now) return false;
  const kind = sessionKind(cookie.name || "");
  if (kind === "session") return !!(cookie.value || cookie.sealed);
  if (kind === "uat") return !!cookie.value && cookie.value !== "0";
  return false;
}

export function scanBrowsers(home = homedir(), os = platform()) {
  const roots = browserRoots(home, os);
  const bySource = new Map();
  for (const browser of roots.chromium) {
    if (!existsSync(browser.base)) continue;
    const found = readChromium(browser.base, os);
    if (found.length) bySource.set(browser.name, found);
  }
  const ff = readFirefox(roots.firefox);
  if (ff.length) bySource.set("Firefox", ff);
  const now = Date.now() / 1000;
  for (const name of ORDER) {
    const cookies = bySource.get(name);
    if (!cookies) continue;
    if (cookies.some((cookie) => isLiveSession(cookie, now))) {
      return { loggedIn: true, source: name, skippedLogin: true, cookies };
    }
  }
  return { loggedIn: false, source: "", skippedLogin: false, cookies: [] };
}

function readChromium(base, os) {
  const key = chromiumKey(base, os);
  const profiles = listProfiles(base);
  const out = [];
  for (const profile of profiles) {
    const dbPath = join(base, profile, "Network", "Cookies");
    const legacy = join(base, profile, "Cookies");
    const src = existsSync(dbPath) ? dbPath : existsSync(legacy) ? legacy : "";
    if (!src) continue;
    const rows = readDb(src, "SELECT host_key, name, value, encrypted_value, path, is_secure, expires_utc FROM cookies WHERE host_key LIKE '%venice.ai%'");
    for (const row of rows) {
      const encrypted = row.encrypted_value ? Buffer.from(row.encrypted_value) : Buffer.alloc(0);
      const value = row.value || decryptChromium(encrypted, key, os);
      const kind = sessionKind(row.name);
      const sealed = !value && kind === "session" && encrypted.length > 3;
      if (!value && !sealed) continue;
      out.push({
        name: row.name,
        value: value || "",
        sealed,
        domain: row.host_key,
        path: row.path || "/",
        expires: chromiumExpires(row.expires_utc),
        secure: row.is_secure === 1
      });
    }
  }
  return out;
}

function listProfiles(base) {
  let names = [];
  try {
    names = readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  const profiles = names.filter((name) => name === "Default" || /^Profile \d+$/.test(name));
  return profiles.length ? profiles : names;
}

function readFirefox(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const profile of firefoxProfiles(root)) {
    const dbPath = join(profile, "cookies.sqlite");
    if (!existsSync(dbPath)) continue;
    const rows = readDb(dbPath, "SELECT host, name, value, path, isSecure, expiry FROM moz_cookies WHERE host LIKE '%venice.ai%'");
    for (const row of rows) {
      if (!row.value) continue;
      out.push({
        name: row.name,
        value: row.value,
        domain: row.host,
        path: row.path || "/",
        expires: Number(row.expiry) || 0,
        secure: row.isSecure === 1
      });
    }
  }
  return out;
}

function firefoxProfiles(root) {
  const ini = join(root, "profiles.ini");
  const dirs = [];
  if (existsSync(ini)) {
    const text = readFileSync(ini, "utf8");
    const blocks = text.split(/\n(?=\[)/);
    for (const block of blocks) {
      const path = /^Path=(.*)$/m.exec(block)?.[1]?.trim();
      if (!path) continue;
      const relative = /^IsRelative=0/m.test(block) ? path : join(root, path);
      dirs.push(relative);
    }
  }
  if (dirs.length) return dirs;
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(root, d.name));
  } catch {
    return [];
  }
}

function readDb(src, sql) {
  const copied = readDbCopy(src, sql);
  if (copied) return copied;
  try {
    const db = new DatabaseSync(src, { readOnly: true });
    try { return db.prepare(sql).all(); }
    finally { db.close(); }
  } catch {
    return [];
  }
}

function readDbCopy(src, sql) {
  const dir = mkdtempSync(join(tmpdir(), "venice-cookies-"));
  const tmp = join(dir, "cookies.db");
  try {
    copyFileSync(src, tmp);
    for (const suffix of ["-wal", "-shm"]) {
      if (existsSync(src + suffix)) {
        try { copyFileSync(src + suffix, tmp + suffix); } catch { /* snapshot is enough */ }
      }
    }
    const db = new DatabaseSync(tmp, { readOnly: true });
    try { return db.prepare(sql).all(); }
    finally { db.close(); }
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function chromiumExpires(us) {
  const n = Number(us) || 0;
  if (!n) return 0;
  return Math.floor(n / 1_000_000 - 11644473600);
}

function chromiumKey(base, os) {
  if (os === "win32") return windowsMasterKey(base);
  const password = os === "darwin" ? macPassword() : linuxPassword();
  const iterations = os === "darwin" ? 1003 : 1;
  return pbkdf2Sync(password, "saltysalt", iterations, 16, "sha1");
}

function decryptChromium(encrypted, key, os) {
  if (!encrypted || encrypted.length < 4 || !key) return "";
  const prefix = encrypted.subarray(0, 3).toString("utf8");
  try {
    if (os === "win32" && (prefix === "v10" || prefix === "v11")) {
      const iv = encrypted.subarray(3, 15);
      const payload = encrypted.subarray(15);
      const tag = payload.subarray(payload.length - 16);
      const cipher = payload.subarray(0, payload.length - 16);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(cipher), decipher.final()]).toString("utf8");
    }
    if (prefix === "v10" || prefix === "v11") {
      const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
      const text = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]).toString("utf8");
      return text.replace(/^[\x00-\x1f]+/, "");
    }
  } catch {
    return "";
  }
  return "";
}

function windowsMasterKey(base) {
  try {
    const localState = JSON.parse(readFileSync(join(base, "Local State"), "utf8"));
    const encryptedKey = localState?.os_crypt?.encrypted_key;
    if (!encryptedKey) return null;
    const blob = Buffer.from(encryptedKey, "base64");
    if (blob.subarray(0, 5).toString("utf8") !== "DPAPI") return null;
    const script = [
      "Add-Type -AssemblyName System.Security",
      `$b=[Convert]::FromBase64String('${blob.subarray(5).toString("base64")}')`,
      "$u=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser')",
      "[Convert]::ToBase64String($u)"
    ].join("; ");
    const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 8000 });
    return Buffer.from(out.trim(), "base64");
  } catch {
    return null;
  }
}

function macPassword() {
  try {
    return execFileSync("security", ["find-generic-password", "-w", "-s", "Chrome Safe Storage"], { encoding: "utf8", timeout: 4000 }).trim() || "peanuts";
  } catch {
    return "peanuts";
  }
}

function linuxPassword() {
  const schemas = ["chrome_libsecret_os_crypt_password_v2", "chromium_libsecret_os_crypt_password_v2"];
  for (const schema of schemas) {
    try {
      const out = execFileSync("secret-tool", ["lookup", "xdg:schema", schema], { encoding: "utf8", timeout: 2000 }).trim();
      if (out) return out;
    } catch { /* keyring missing or locked */ }
  }
  return "peanuts";
}

function publicStatus(result) {
  return { loggedIn: !!result.loggedIn, source: result.source || "", skippedLogin: !!result.loggedIn };
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) {
    const failed = selfTest();
    if (failed) {
      console.error(failed);
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true }));
    return;
  }
  const home = process.env.VENICE_BROWSER_HOME || homedir();
  const result = scanBrowsers(home, platform());
  if (args.has("--cookies")) console.log(JSON.stringify(result));
  else console.log(JSON.stringify(publicStatus(result)));
}

function selfTest() {
  const home = mkdtempSync(join(tmpdir(), "venice-home-"));
  try {
    const profile = join(home, ".mozilla", "firefox", "abc.default-release");
    const dbDir = profile;
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(home, ".mozilla", "firefox", "profiles.ini"), "Path=abc.default-release\nIsRelative=1\n");
    const db = new DatabaseSync(join(profile, "cookies.sqlite"));
    db.exec("CREATE TABLE moz_cookies (host TEXT, name TEXT, value TEXT, path TEXT, isSecure INTEGER, expiry INTEGER)");
    db.prepare("INSERT INTO moz_cookies VALUES (?, ?, ?, '/', 1, 0)").run(".venice.ai", "__client_uat", "0");
    const signedOut = scanBrowsers(home, "linux");
    if (signedOut.loggedIn) return "a zero client timestamp was treated as signed in";
    db.prepare("INSERT INTO moz_cookies VALUES (?, ?, ?, '/', 1, 0)").run("venice.ai", "__session", "live-session");
    db.close();
    const signedIn = scanBrowsers(home, "linux");
    if (!signedIn.loggedIn || signedIn.source !== "Firefox") return "an existing browser session was not recognised";
    if (!signedIn.skippedLogin) return "login was not skipped";
    const clientOnly = mkdtempSync(join(tmpdir(), "venice-client-"));
    try {
      const profile = join(clientOnly, ".mozilla", "firefox", "only.default");
      mkdirSync(profile, { recursive: true });
      writeFileSync(join(clientOnly, ".mozilla", "firefox", "profiles.ini"), "Path=only.default\nIsRelative=1\n");
      const db = new DatabaseSync(join(profile, "cookies.sqlite"));
      db.exec("CREATE TABLE moz_cookies (host TEXT, name TEXT, value TEXT, path TEXT, isSecure INTEGER, expiry INTEGER)");
      db.prepare("INSERT INTO moz_cookies VALUES (?, ?, ?, '/', 1, 0)").run(".clerk.venice.ai", "__client", "durable-client");
      db.close();
      const viaClient = scanBrowsers(clientOnly, "linux");
      if (!viaClient.loggedIn || !viaClient.skippedLogin) return "a durable Clerk client cookie was not treated as signed in";
    } finally {
      rmSync(clientOnly, { recursive: true, force: true });
    }
    return encryptRoundTrip(home) || sealedRoundTrip();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function encryptRoundTrip(home) {
  const chrome = join(home, ".config", "google-chrome", "Default", "Network");
  mkdirSync(chrome, { recursive: true });
  const key = pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, " "));
  const encrypted = Buffer.concat([Buffer.from("v10"), cipher.update("__session-value"), cipher.final()]);
  const db = new DatabaseSync(join(chrome, "Cookies"));
  db.exec("CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, is_secure INTEGER, expires_utc INTEGER)");
  db.prepare("INSERT INTO cookies VALUES ('venice.ai', '__session', '', ?, '/', 1, 0)").run(encrypted);
  db.close();
  const found = scanBrowsers(home, "linux");
  if (!found.loggedIn || found.source !== "Chrome") return "encrypted Chrome session was not recognised";
  const session = found.cookies.find((cookie) => cookie.name === "__session");
  if (!session || session.value !== "__session-value") return "Chrome cookie did not decrypt";
  return "";
}

function sealedRoundTrip() {
  const home = mkdtempSync(join(tmpdir(), "venice-sealed-"));
  try {
    const chrome = join(home, ".config", "google-chrome", "Default", "Network");
    mkdirSync(chrome, { recursive: true });
    const db = new DatabaseSync(join(chrome, "Cookies"));
    db.exec("CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, is_secure INTEGER, expires_utc INTEGER)");
    db.prepare("INSERT INTO cookies VALUES ('venice.ai', '__session', '', ?, '/', 1, 0)").run(Buffer.from("v20-app-bound-secret"));
    db.prepare("INSERT INTO cookies VALUES ('.venice.ai', '__client_uat', '0', ?, '/', 1, 0)").run(Buffer.alloc(0));
    db.close();
    const found = scanBrowsers(home, "linux");
    if (!found.loggedIn || !found.skippedLogin || found.source !== "Chrome") return "a sealed browser session still asked for login";
    return "";
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const isDirect = process.argv[1] && process.argv[1].endsWith("venice-browser-session.mjs");
if (isDirect) main();
