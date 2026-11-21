import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { session, shell } from "electron";

const PARTITION = "persist:venice";
const SIGN_IN_URL = "https://venice.ai/sign-in";

export interface VeniceCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  secure: boolean;
  sealed?: boolean;
}

export interface BrowserSession {
  loggedIn: boolean;
  source: string;
  skippedLogin: boolean;
  imported?: boolean;
  cookies?: VeniceCookie[];
}

function scriptPath(): string {
  const candidates = [
    join(__dirname, "../scripts/venice-browser-session.mjs"),
    join(__dirname, "../../scripts/venice-browser-session.mjs"),
  ];
  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}

/** Look at installed browsers. Cookie values stay in this process. */
export function readBrowserSession(withCookies: boolean): Promise<BrowserSession> {
  return new Promise((resolve) => {
    const child = spawn(process.env.VENICE_NODE || "node", [scriptPath(), withCookies ? "--cookies" : "--status"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 12_000);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      out += chunk;
    });
    const finish = () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out) as BrowserSession;
        resolve({
          loggedIn: !!parsed.loggedIn,
          source: parsed.source || "",
          skippedLogin: !!parsed.loggedIn,
          cookies: withCookies ? parsed.cookies ?? [] : undefined,
        });
      } catch {
        resolve({ loggedIn: false, source: "", skippedLogin: false });
      }
    };
    child.on("error", finish);
    child.on("close", finish);
  });
}

/** Copy a live browser session into the app. No login page when one already exists. */
export async function adoptBrowserSession(): Promise<BrowserSession> {
  const found = await readBrowserSession(true);
  if (!found.loggedIn) {
    return { loggedIn: false, source: "", skippedLogin: false, imported: false };
  }
  const usable = (found.cookies ?? []).filter((cookie) => cookie.value && !cookie.sealed);
  const ses = session.fromPartition(PARTITION);
  let imported = 0;
  for (const cookie of usable) {
    const host = cookie.domain.replace(/^\./, "");
    try {
      await ses.cookies.set({
        url: `https://${host}${cookie.path || "/"}`,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || "/",
        secure: true,
        ...(cookie.domain.startsWith(".") ? { domain: cookie.domain } : {}),
        ...(cookie.expires ? { expirationDate: cookie.expires } : {}),
      });
      imported += 1;
    } catch {
      /* one cookie should not drop the rest of the session */
    }
  }
  return { loggedIn: true, source: found.source, skippedLogin: true, imported: imported > 0 };
}

/** Open the real browser only when no Venice.ai session is already there. */
export async function openSystemBrowserLogin(): Promise<BrowserSession> {
  const existing = await adoptBrowserSession();
  if (existing.loggedIn) return existing;
  await shell.openExternal(SIGN_IN_URL);
  return { loggedIn: false, source: "", skippedLogin: false, imported: false };
}
