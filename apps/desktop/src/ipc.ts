import { BrowserWindow, IpcMain, session } from "electron";
import type { SubagentManager } from "./subagents.js";
import type { BrowserAutomation } from "./browser.js";
import type { FileTools } from "./file-tools.js";
import type { TerminalManager } from "./terminal.js";
import type { VeniceBridge } from "./venice-bridge.js";
import { collectVeniceCookies } from "./cookie-import.js";
import { execFileSync, execSync } from "node:child_process";

const VENICE_SESSION = "persist:venice";

export interface IpcDeps {
  subagents: SubagentManager;
  browser: BrowserAutomation;
  files: FileTools;
  terminals: TerminalManager;
  venice: VeniceBridge;
};

export function registerIpcHandlers(ipc: IpcMain, deps: IpcDeps): void {
  // ── Files ──
  ipc.handle("files:read", async (_e, path: string) => deps.files.read(path));
  ipc.handle("files:write", async (_e, path: string, content: string) => deps.files.write(path, content));
  ipc.handle("files:list", async (_e, dir: string) => deps.files.list(dir));
  ipc.handle("files:tree", async (_e, dir: string) => deps.files.tree(dir));
  ipc.handle("files:exists", async (_e, path: string) => deps.files.exists(path));
  ipc.handle("files:mkdir", async (_e, path: string) => deps.files.mkdir(path));
  ipc.handle("files:remove", async (_e, path: string) => deps.files.remove(path));
  ipc.handle("files:rename", async (_e, oldPath: string, newPath: string) => deps.files.rename(oldPath, newPath));
  ipc.handle("files:watch", async (_e, path: string) => deps.files.watch(path));
  ipc.handle("files:openDialog", async () => deps.files.openDialog());
  ipc.handle("files:saveDialog", async (_e, defaultName?: string) => deps.files.saveDialog(defaultName));

  // ── Terminal ──
  ipc.handle("terminal:create", async (_e, cwd: string) => {
    const id = deps.terminals.create(cwd);
    const win = BrowserWindow.getAllWindows()[0];
    deps.terminals.onData(id, (d: string) => win && !win.isDestroyed() && win.webContents.send(`terminal:data:${id}`, d));
    deps.terminals.onExit(id, (c: number | null) => win && !win.isDestroyed() && win.webContents.send(`terminal:exit:${id}`, c));
    return id;
  });
  ipc.handle("terminal:write", async (_e, id: string, data: string) => deps.terminals.write(id, data));
  ipc.handle("terminal:resize", async (_e, id: string, cols: number, rows: number) => deps.terminals.resize(id, cols, rows));
  ipc.handle("terminal:kill", async (_e, id: string) => deps.terminals.kill(id));
  ipc.handle("terminal:getData", async (_e, id: string) => deps.terminals.getData(id));

  // ── Browser ──
  ipc.handle("browser:open", async (_e, url: string) => deps.browser.open(url));
  ipc.handle("browser:screenshot", async () => deps.browser.screenshot());
  ipc.handle("browser:click", async (_e, selector: string) => deps.browser.click(selector));
  ipc.handle("browser:type", async (_e, selector: string, text: string) => deps.browser.type(selector, text));
  ipc.handle("browser:evaluate", async (_e, expr: string) => deps.browser.evaluate(expr));
  ipc.handle("browser:navigate", async (_e, url: string) => deps.browser.navigate(url));
  ipc.handle("browser:getTitle", async () => deps.browser.getTitle());
  ipc.handle("browser:close", async () => deps.browser.close());

  // ── Subagents ──
  ipc.handle("subagents:spawn", async (_e, goal: string, model: string, context?: string) =>
    deps.subagents.spawn(goal, model, context)
  );
  ipc.handle("subagents:list", async () => deps.subagents.list());
  ipc.handle("subagents:stop", async (_e, id: string) => deps.subagents.stop(id));
  ipc.handle("subagents:steer", async (_e, id: string, message: string) => deps.subagents.steer(id, message));

  // ── Venice.ai web app (no HTTP API — all model access via the official web surfaces) ──
  ipc.handle("venice:models", async () => deps.venice.models());
  ipc.handle("venice:chatModels", async () => deps.venice.chatModels());
  ipc.handle("venice:surfaceUrl", async (_e, modelOrSurface: string) => deps.venice.surfaceUrl(modelOrSurface));
  ipc.handle("venice:chatLink", async (_e, task: string, model?: string) => deps.venice.chatLink(task, model));
  ipc.handle("venice:processCompletion", async (_e, task: string, model?: string) => deps.venice.processCompletion(task, model));

  // ── Venice.ai login (Fallback: Cookie Import from installed browsers) ──
  // This is used if the user prefers not to use the standard OAuth flow.
  ipc.handle("venice:importCookies", async () => {
    const { cookies, sources, errors } = collectVeniceCookies();
    let imported = 0;
    try {
      const ses = session.fromPartition(VENICE_SESSION);
      for (const c of cookies) {
        try {
          await ses.cookies.set({
            url: `https://${c.domain.replace(/^\./, "")}${c.path || "/"}`,
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || "/",
            secure: c.secure,
            expirationDate: c.expires || undefined
          });
          imported++;
        } catch { /* skip individual cookie */ }
      }
    } catch (e) {
      errors.push(`session: ${(e as Error).message.slice(0, 80)}`);
    }
    return { imported, sources, errors, totalFound: cookies.length };
  });

  /** Check whether the venice.ai session (webview partition) is logged in. */
  ipc.handle("venice:loginState", async () => {
    const ses = session.fromPartition(VENICE_SESSION);
    const veniceCookies = await ses.cookies.get({ domain: "venice.ai" });
    // A logged-in session carries the auth cookie; session-only tokens suffice.
    const loggedIn = veniceCookies.some((c) => /token|auth|session|jwt/i.test(c.name));
    return { loggedIn, cookieCount: veniceCookies.length };
  });

  // ── Shell ──
  ipc.handle("shell:exec", async (_e, argv: string[], cwd: string) => {
    try {
      const out = execFileSync(argv[0], argv.slice(1), { encoding: "utf8", cwd, timeout: 30000 });
      return { code: 0, out };
    } catch (e) {
      const err = e as { status?: number; stderr?: Buffer };
      return { code: err.status ?? 1, out: err.stderr?.toString() ?? String(e) };
    }
  });
  ipc.handle("shell:which", async (_e, bin: string) => {
    try {
      const cmd = process.platform === "win32" ? "where" : "which";
      const out = execSync(`${cmd} ${bin}`, { encoding: "utf8" }).trim();
      return out.split("\n")[0];
    } catch { return null; }
  });

  // ── Git ──
  ipc.handle("git:status", async (_e, root: string) => gitStatus(root));
  ipc.handle("git:diff", async (_e, root: string) => gitDiff(root));
  ipc.handle("git:commit", async (_e, root: string, message: string) => gitCommit(root, message));
  ipc.handle("git:log", async (_e, root: string, count = 20) => gitLog(root, count));
  ipc.handle("git:branch", async (_e, root: string) => gitBranch(root));
  ipc.handle("git:checkout", async (_e, root: string, ref: string) => gitCheckout(root, ref));
  ipc.handle("git:init", async (_e, root: string) => gitInit(root));
}

// ── Git helpers ──
function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { encoding: "utf8", cwd }).trim();
}

function gitStatus(root: string) {
  try {
    const out = git(["status", "--porcelain=v2", "-b"], root);
    const lines = out.split("\n");
    let branch = "", dirty: string[] = [], ahead = 0;
    for (const line of lines) {
      if (line.startsWith("# branch.head")) branch = line.split(" ").slice(1).join(" ");
      if (line.startsWith("# branch.ab")) ahead = parseInt(line.split(" ")[2] ?? "0", 10);
      if (line.startsWith("1 ") || line.startsWith("2 ") || line.startsWith("u ")) {
        const parts = line.split("\t");
        if (parts[1]) dirty.push(parts[1]);
      }
    }
    return { branch, dirty, ahead };
  } catch { return { branch: "", dirty: [], ahead: 0 }; }
}

function gitDiff(root: string): string {
  try { return git(["diff", "HEAD"], root); } catch { return ""; }
}

function gitCommit(root: string, message: string): { ok: boolean; hash: string } {
  try {
    git(["add", "-A"], root);
    git(["commit", "-m", message || "wip"], root);
    const hash = git(["rev-parse", "HEAD"], root);
    return { ok: true, hash };
  } catch { return { ok: false, hash: "" }; }
}

function gitLog(root: string, count: number): { hash: string; message: string; date: string }[] {
  try {
    const out = git(["log", `-${count}`, "--format=%H|%ci"], root);
    return out.split("\n").filter(Boolean).map((l) => {
      const [hash, date] = l.split("|");
      return { hash, message: l.substring(l.indexOf("|") + 1), date };
    });
  } catch { return []; }
}

function gitBranch(root: string): string[] {
  try { return git(["branch", "--format=%(refname:short)"], root).split("\n").filter(Boolean); }
  catch { return []; }
}

function gitCheckout(root: string, ref: string): { ok: boolean } {
  try { git(["checkout", ref], root); return { ok: true }; }
  catch { return { ok: false }; }
}

function gitInit(root: string): { ok: boolean } {
  try { git(["init", "-q"], root); git(["config", "user.email", "forge@venice.ai"], root); git(["config", "user.name", "Venice Forge"], root); return { ok: true }; }
  catch { return { ok: false }; }
}
