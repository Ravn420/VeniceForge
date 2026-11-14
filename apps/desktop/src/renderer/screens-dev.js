/* ============================================================
   Venice Forge — AI Dev Studio (screen module)
   Full AI software-development workspace:
   explorer (project + templates) | code editor | inspector
   (Agent / Subagents / Git / API) | terminal | status bar.
   Contract: export const id, TABS; export function render(ctx), wire(ctx).
   ============================================================ */

const id = "dev";
const TABS = ["AI Dev Studio"];

// Completions run in-app first; the Venice.ai WEB APP (chat/studio surfaces)
// is the fallback for complex tasks. No HTTP API, no API keys anywhere in this product.
const VENICE_CHAT_URL = "https://venice.ai/chat/v2";
const IS_MAC = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
const MOD = IS_MAC ? "⌘" : "Ctrl";
const TERM_CAP = 160000;

/* mode → label + system-prompt instruction */
const MODES = {
  ask:   { chip: "Ask",   prompt: "MODE: ASK. Answer questions about this codebase. Explain, do not modify files." },
  plan:  { chip: "Plan",  prompt: "MODE: PLAN. Produce a concrete step-by-step implementation plan (files to change, in order). Do not modify files." },
  agent: { chip: "Agent", prompt: "MODE: AGENT. You are an autonomous coding agent. Propose exact file edits as fenced code blocks with file paths, then a short verification step." },
};

/* workflow templates: click fills the task box + mode */
const TEMPLATES = [
  { id: "scaffold",  name: "Greenfield scaffold", sub: "Entry, config, README, smoke test",
    mode: "agent", prompt: "Scaffold this project: create an entry point, a minimal config, a README with run instructions, and one smoke test. Keep it small and runnable." },
  { id: "bugtriage", name: "Bug triage", sub: "Reproduce, diagnose, propose fix",
    mode: "ask",   prompt: "Reproduce and diagnose the bug I describe. Identify the root cause, list the exact files involved, and propose the minimal fix.\n\nBug: " },
  { id: "refactor",  name: "Refactor pass", sub: "Plan that preserves behavior",
    mode: "plan",  prompt: "Review the active module for duplication, dead code and unclear naming. Produce a step-by-step refactor plan that preserves behavior." },
  { id: "tests",     name: "Test coverage", sub: "Focused tests for critical paths",
    mode: "plan",  prompt: "Identify the critical paths currently untested and write focused unit tests for them. List the files to create or extend." },
];

/* ---------------- module-level singles ---------------- */
let C = null;                    // latest ctx from wire()
let bound = false;               // document-level delegated listeners installed
let subResultsBound = false;     // subagents.onResult subscribed
let modelsLoading = false;
let gitLoading = false;
let chatInFlight = false;
let termSubscribedId = null;     // terminal id whose onData/onExit are bound
let lastLineCount = -1;
let filterQ = "";
let treeFocusPath = null;
let activeTpl = null;
let subModel = null;             // subagent model pick (defaults to state.model)
const collapsed = new Set();     // collapsed dir paths in the tree
const lastSaved = new Map();     // path -> saved content (dirty tracking)
const termHistory = [];
let termHistIdx = 0;

/* ---------------- tiny helpers ---------------- */
const q = (sel) => document.querySelector(sel);
const E = (s) => (C && typeof C.esc === "function" ? C.esc(s)
  : String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));
const clip = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n) + "…" : String(s ?? ""));
const joinPath = (dir, rel) => (dir ? dir.replace(/[\\/]+$/, "") + "/" : "") + String(rel || "").replace(/^[\\/]+/, "");
const activeScreen = () => { const S = C?.state; return !!S && (S.tab === "dev" || S.tab === "AI Dev Studio"); };
const dirtyCount = () => { const S = C?.state; if (!S?.openFiles) return 0; let n = 0;
  for (const [p, c] of S.openFiles) if (lastSaved.get(p) !== c) n++; return n; };

function prepState(S) {
  if (!S) return;
  if (!S.openFiles || typeof S.openFiles.set !== "function") S.openFiles = new Map();
  if (!Array.isArray(S.chat)) S.chat = [];
  if (!Array.isArray(S.subagents)) S.subagents = [];
  if (!Array.isArray(S.models)) S.models = [];
  if (typeof S.termBuffer !== "string") S.termBuffer = "";
  if (S.termOpen === undefined) S.termOpen = true;
  if (!S.agentMode || !MODES[S.agentMode]) S.agentMode = "agent";
  if (!S.activePanel) S.activePanel = "Agent";
  if (!S.maxTokens) S.maxTokens = 2000;
  if (!S.usage) S.usage = { in: 0, out: 0 };
  if (!S.git || typeof S.git !== "object") S.git = { branch: "", dirty: [], ahead: 0 };
  if (!S.model) S.model = "venice-uncensored";
  // files already in openFiles came from disk — seed saved-state so they aren't dirty
  for (const [p, c] of S.openFiles) if (!lastSaved.has(p)) lastSaved.set(p, c);
}

/* ============================================================
   TREE (state.tree is an array of indented lines from files.tree,
   e.g. "src/", "  main.ts" — parsed defensively; also accepts
   entry objects or one big string)
   ============================================================ */
function parseTree(tree) {
  const entries = [];
  const stack = [];
  const pushEntry = (name, dir, depth) => {
    if (!name) return;
    stack[depth] = name;
    const path = stack.slice(0, depth + 1).join("/");
    entries.push({ name, path, dir, depth });
  };
  let lines = [];
  if (Array.isArray(tree)) {
    if (tree.length && typeof tree[0] === "object" && tree[0] !== null) {
      for (const t of tree) {
        let p = String(t.path ?? t.name ?? "").replace(/\\/g, "/").replace(/^[./]+/, "");
        if (C?.state?.projectDir && p.startsWith(String(C.state.projectDir).replace(/\\/g, "/") + "/"))
          p = p.slice(String(C.state.projectDir).replace(/\\/g, "/").length + 1);
        if (!p) continue;
        const segs = p.split("/").filter(Boolean);
        pushEntry(segs[segs.length - 1], !!t.dir, segs.length - 1);
      }
      return entries;
    }
    lines = tree.map((l) => String(l));
  } else if (typeof tree === "string") lines = tree.split("\n");
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const depth = Math.floor((line.match(/^ */) || [""])[0].length / 2);
    let name = line.trim();
    const dir = name.endsWith("/");
    if (dir) name = name.slice(0, -1);
    pushEntry(name, dir, depth);
  }
  return entries;
}

const FOLDER_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>';
const FILE_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h8l4 4v14H6V3z"/><path d="M14 3v4h4"/></svg>';
const SEARCH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
const FOLDER_OPEN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M3 11h18"/></svg>';
const NEW_PROJECT_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>';

function treeItemHTML(en, isActive) {
  const action = en.dir ? "toggle-dir" : "open-file";
  const twisty = en.dir ? (collapsed.has(en.path) ? "▸" : "▾") : "";
  const pad = 4 + en.depth * 13;
  return `<div class="tree-item${isActive ? " active" : ""}" role="treeitem" aria-level="${en.depth + 1}" aria-selected="${isActive}"${en.dir ? ` aria-expanded="${!collapsed.has(en.path)}"` : ""} tabindex="-1" data-action="${action}" data-path="${E(en.path)}" title="${E(en.path)}" aria-label="${E(en.name)}" style="padding-left:${pad}px">` +
    `<span class="twisty">${twisty}</span>` +
    `<span class="file-ico" style="color:${en.dir ? "var(--accent-text)" : "var(--fg-dim)"}">${en.dir ? FOLDER_SVG : FILE_SVG}</span>` +
    `<span class="name">${E(en.name)}</span></div>`;
}

function treeListHTML(S) {
  const all = parseTree(S.tree);
  const query = filterQ.trim().toLowerCase();
  let list = all;
  if (query) {
    const matches = all.filter((en) => en.path.toLowerCase().includes(query));
    const visiblePaths = new Set();
    for (const en of matches) {
      visiblePaths.add(en.path);
      for (let d = 0; d < en.depth; d++) visiblePaths.add(en.path.split("/").slice(0, d + 1).join("/"));
    }
    list = all.filter((en) => visiblePaths.has(en.path)).slice(0, 200);
  }
  else {
    const out = [];
    for (const en of all) {
      if (en.dir && collapsed.has(en.path)) { out.push(en); continue; }
      let hidden = false;
      for (let d = 0; d < en.depth; d++) {
        const anc = en.path.split("/").slice(0, d + 1).join("/");
        if (collapsed.has(anc)) { hidden = true; break; }
      }
      if (!hidden) out.push(en);
    }
    list = out.slice(0, 400);
  }
  if (!S.projectDir)
    return `<div class="git-clean" style="margin:6px 4px 10px;line-height:1.5">Open a folder to browse its files.</div>` +
      `<button class="btn-ghost" style="width:auto;padding:0 14px" data-action="open-project">Open folder…</button>`;
  if (!list.length)
    return `<div class="git-clean" style="margin:6px 4px">${query ? "No files match." : "No files yet."}</div>`;
  return list.map((en) => treeItemHTML(en, !en.dir && en.path === S.activeFile)).join("");
}

function syncTree() {
  const S = C?.state; if (!S) return;
  const host = q('[data-dev="tree"]'); if (!host) return;
  host.innerHTML = treeListHTML(S);
  const cnt = q('[data-dev="tree-count"]');
  if (cnt) cnt.textContent = String(parseTree(S.tree).filter((en) => !en.dir).length);
  const items = Array.from(host.querySelectorAll('.tree-item[role="treeitem"]'));
  if (!items.length) { treeFocusPath = null; return; }
  if (!items.some((item) => item.dataset.path === treeFocusPath)) {
    const active = items.find((item) => item.dataset.path === S.activeFile);
    treeFocusPath = active?.dataset.path || items[0].dataset.path;
  }
  items.forEach((item) => { item.tabIndex = item.dataset.path === treeFocusPath ? 0 : -1; });
}

function focusTreePath(path) {
  const host = q('[data-dev="tree"]');
  const item = Array.from(host?.querySelectorAll('.tree-item[role="treeitem"]') || []).find((node) => node.dataset.path === path);
  if (!item) return false;
  treeFocusPath = path;
  host.querySelectorAll('.tree-item[role="treeitem"]').forEach((node) => { node.tabIndex = node === item ? 0 : -1; });
  item.focus();
  return true;
}

/* ============================================================
   CENTER — tabs + editor
   ============================================================ */
function tabsHTML(S) {
  const paths = Array.from(S.openFiles.keys());
  if (!paths.length) return "";
  return paths.map((p) => {
    const active = p === S.activeFile ? " active" : "";
    const dirty = lastSaved.get(p) !== S.openFiles.get(p) ? " •" : "";
    return `<button class="editor-tab${active}" data-action="activate-tab" data-path="${E(p)}" title="${E(p)}">` +
      `<span class="name">${E(shortName(p))}${dirty}</span>` +
      `<span class="close" data-action="close-tab" data-path="${E(p)}" title="Close">×</span></button>`;
  }).join("");
}

function gutterHTML(content) {
  const n = Math.max(1, String(content ?? "").split("\n").length);
  let out = "";
  for (let i = 1; i <= n; i++) out += "<div>" + i + "</div>";
  return out;
}

function editorBodyHTML(S) {
  const path = S.activeFile;
  if (!path || !S.openFiles.has(path)) {
    return `<div class="editor-empty">` +
      `<div class="big">AI Dev Studio</div>` +
      `<div class="sub">Open a file from the explorer, or pick a workflow template on the left and send it to the agent on the right.</div>` +
      `<div style="display:flex;gap:14px;font-size:10px;color:var(--fg-muted)">` +
      `<span><kbd>${MOD}</kbd>+<kbd>K</kbd> find file</span>` +
      `<span><kbd>${MOD}</kbd>+<kbd>S</kbd> save</span>` +
      `<span><kbd>${MOD}</kbd>+<kbd>↵</kbd> send task</span></div>` +
      `<button class="btn-ghost" style="width:auto;padding:0 16px" data-action="open-project">Open folder…</button></div>`;
  }
  const content = S.openFiles.get(path) ?? "";
  return `<div class="code-editor">` +
    `<div class="code-gutter" data-dev="gutter" style="overflow:hidden">${gutterHTML(content)}</div>` +
    `<div class="code-wrap"><textarea data-dev="editor" spellcheck="false" wrap="off" aria-label="Code editor">${E(content)}</textarea></div></div>`;
}

function syncTabs() {
  const S = C?.state; if (!S) return;
  const strip = q('[data-dev="tabs"]'); if (!strip) return;
  strip.innerHTML = tabsHTML(S);
  strip.style.display = S.openFiles.size ? "" : "none";
}

function syncEditor() {
  const S = C?.state; if (!S) return;
  const body = q('[data-dev="editor-body"]'); if (!body) return;
  body.innerHTML = editorBodyHTML(S);
  lastLineCount = -1;
}

function syncGutter() {
  const S = C?.state; const ta = q('[data-dev="editor"]');
  if (!S || !ta || !S.activeFile) return;
  const n = ta.value.split("\n").length;
  if (n === lastLineCount) return;
  lastLineCount = n;
  const g = q('[data-dev="gutter"]');
  if (g) { g.innerHTML = gutterHTML(ta.value); g.scrollTop = ta.scrollTop; }
}

async function openFile(path) {
  const S = C?.state, F = C?.forge; if (!S || !F || !path) return;
  try {
    const content = await F.files.read(joinPath(S.projectDir, path));
    S.openFiles.set(path, String(content ?? ""));
    lastSaved.set(path, String(content ?? ""));
    S.activeFile = path;
    syncTabs(); syncEditor(); syncTree(); syncStatusbar();
  } catch (err) { C?.notify?.("Cannot open " + path + " — " + (err?.message || err)); }
}

async function saveActive() {
  const S = C?.state, F = C?.forge; if (!S || !F) return;
  const path = S.activeFile;
  if (!path) { C?.notify?.("No file open"); return; }
  const ta = q('[data-dev="editor"]');
  const content = ta ? ta.value : (S.openFiles.get(path) ?? "");
  try {
    await F.files.write(joinPath(S.projectDir, path), content);
    S.openFiles.set(path, content);
    lastSaved.set(path, content);
    C?.notify?.("Saved " + path);
    syncTabs(); syncStatusbar();
  } catch (err) { C?.notify?.("Save failed — " + (err?.message || err)); }
}

function closeTab(path) {
  const S = C?.state; if (!S || !S.openFiles.has(path)) return;
  S.openFiles.delete(path); lastSaved.delete(path);
  if (S.activeFile === path) S.activeFile = Array.from(S.openFiles.keys()).pop() || null;
  syncTabs(); syncEditor(); syncTree(); syncStatusbar();
}

/* ============================================================
   INSPECTOR — Agent / Subagents / Git / API
   ============================================================ */
function modelOptionsHTML(S, selected) {
  const ids = [];
  for (const m of ["venice-uncensored", "venice-coder", "venice-reasoner"]) ids.push(m);
  // Chat-relevant web-app models only — image/video studios are separate surfaces.
  for (const m of S.models || []) {
    if (m.surface === "image" || m.surface === "video") continue;
    const id = m.id || m.name;
    if (id && !ids.includes(id)) ids.push(id);
  }
  const sel = selected && ids.includes(selected) ? selected : ids[0];
  return ids.map((id) => `<option value="${E(id)}"${id === sel ? " selected" : ""}>${E(id)}</option>`).join("");
}

function selectBoxHTML(devName, selected, label) {
  return `<div class="select-box"><span data-dev="${devName}-label" style="pointer-events:none">${E(selected || "model")}</span>` +
    `<select data-dev="${devName}" title="${E(label)}">${modelOptionsHTML(C?.state || {}, selected)}</select></div>`;
}

function chatLogHTML(S) {
  if (!S.chat.length)
    return `<div class="git-clean" style="margin-top:10px">No messages yet — describe a task and send.</div>`;
  return S.chat.map((m) => {
    const role = m.role === "user" ? "You" : "Assistant";
    return `<div class="chat-msg ${m.role === "user" ? "user" : "assistant"}">` +
      `<div class="role">${role}${m.meta && m.role === "user" ? " · " + E(m.meta) : ""}</div>` +
      `<div class="body">${E(m.text)}</div>` +
      (m.meta && m.role !== "user" ? `<div class="meta">${E(m.meta)}</div>` : "") +
      `</div>`;
  }).join("");
}

function subListHTML(S) {
  if (!S.subagents.length)
    return `<div class="git-clean" style="margin-top:10px">No subagents yet. Spawn one to run a goal in the background.</div>`;
  return S.subagents.map((a) => {
    const st = a.status || "running";
    return `<div class="subagent-card">` +
      `<div class="head"><span class="goal">${E(clip(a.goal, 90))}</span><span class="status ${E(st)}">${E(st)}</span></div>` +
      `<div class="meta">${E(a.model || "model")} · ${E(String(a.id || "").slice(0, 8))}</div>` +
      (a.summary ? `<div class="summary">${E(clip(a.summary, 400))}</div>` : "") +
      (st === "running" ? `<div class="actions"><button data-action="stop-sub" data-id="${E(a.id)}">Stop</button></div>` : "") +
      `</div>`;
  }).join("");
}

function gitPanelHTML(S) {
  const g = S.git || { branch: "", dirty: [], ahead: 0 };
  const noRepo = !g.branch;
  const changes = Array.isArray(g.dirty) ? g.dirty : [];
  return `<div class="field-label">Branch</div>` +
    `<div class="git-branch">${noRepo ? "no repository" : E(g.branch)}</div>` +
    (!noRepo && g.ahead ? `<div class="kv"><span class="k">Ahead of origin</span><span class="v">${E(String(g.ahead))}</span></div>` : "") +
    `<div class="field-label">Changes (${changes.length})</div>` +
    (noRepo ? `<div class="git-clean">Not a git repository yet.</div>` :
      changes.length ? changes.map((f) => `<div class="git-dirty">${E(clip(f, 60))}</div>`).join("") :
        `<div class="git-clean">Working tree clean.</div>`) +
    `<div class="field-label">Commit</div>` +
    `<div class="input-box"><input data-dev="commit-msg" placeholder="Commit message…" /></div>` +
    `<button class="btn-primary" data-action="commit" data-dev="commit-btn"${noRepo ? " disabled" : ""}>Commit changes</button>` +
    `<button class="btn-ghost" data-action="git-refresh">Refresh status</button>` +
    (noRepo ? `<button class="btn-ghost" data-action="git-init">Init repository</button>` : "") +
    `<div class="field-label">Recent commits</div>` +
    `<div class="git-log" data-dev="git-log">${gitLogHTML()}</div>`;
}

let gitLogCache = [];
function gitLogHTML() {
  if (!gitLogCache.length) return `<div class="git-clean">No commits yet.</div>`;
  return gitLogCache.map((c) => {
    const hash = String(c.hash || "").slice(0, 7);
    const msg = String(c.message || "").split("\n")[0];
    const date = String(c.date || "").slice(0, 10);
    // ipc git:log puts the %ci date inside `message` — show one date, not two
    const shown = date && msg.startsWith(date) ? date : clip(msg, 44);
    return `<div class="row"><span class="h">${E(hash)}</span><span class="m">${E(shown)}</span></div>`;
  }).join("");
}

function apiPanelHTML(S) {
  const running = S.subagents.filter((a) => a.status === "running").length;
  const kv = (k, v) => `<div class="kv"><span class="k">${E(k)}</span><span class="v">${E(v)}</span></div>`;
  return `<div class="field-label">Session</div>` +
    kv("Model access", "In-app + Venice.ai web app") +
    kv("Model", S.model || "—") +
    kv("Chat surface", VENICE_CHAT_URL) +
    kv("Chat turns", String(S.chat.length)) +
    kv("Subagents", `${running}/${S.subagents.length} running`) +
    kv("Tokens", `${S.usage.in} in · ${S.usage.out} out`) +
    `<div class="field-label">Routing</div>` +
    `<div class="code-block">Completions run in-app first; the Venice.ai chat web app${"\n"}(${E(VENICE_CHAT_URL)}) is the fallback for complex tasks.</div>` +
    `<button class="btn-ghost" data-action="open-venice-chat">Open Venice.ai chat</button>`;
}

function inspectorBodyHTML(S) {
  const panel = S.activePanel;
  const show = (name) => (panel === name ? "" : "hidden");
  const modeChips = Object.entries(MODES).map(([k, m]) =>
    `<button class="mode-chip${S.agentMode === k ? " active" : ""}" data-action="set-mode" data-mode="${k}" aria-label="${k} mode">${m.chip}</button>`).join("");
  return `<div data-dev="panel-Agent" class="${show("Agent")}">` +
      `<div class="agent-mode-row">${modeChips}</div>` +
      `<div class="field-label">Model</div>${selectBoxHTML("model-select", S.model, "Model")}` +
      `<div class="field-label">Task</div>` +
      `<textarea class="agent-input" data-dev="task" placeholder="Describe what to build, fix or plan…"></textarea>` +
      `<div class="field-label">Max tokens</div>` +
      `<div class="stepper"><span class="v" data-dev="tok-val">${S.maxTokens}</span>` +
      `<div class="ctrl"><button data-action="tokens" data-delta="-250" title="Fewer tokens">−</button>` +
      `<button data-action="tokens" data-delta="250" title="More tokens">+</button></div></div>` +
      `<button class="btn-primary" data-action="send" data-dev="send-btn">Send task</button>` +
      `<div class="chat-log" data-dev="chat-log">${chatLogHTML(S)}</div>` +
    `</div>` +
    `<div data-dev="panel-Subagents" class="${show("Subagents")}">` +
      `<div class="field-label">Goal</div>` +
      `<div class="input-box"><input data-dev="sub-goal" placeholder="Describe an autonomous task…" /></div>` +
      `<div class="field-label">Model</div>${selectBoxHTML("sub-model-select", subModel || S.model, "Subagent model")}` +
      `<button class="btn-primary" data-action="spawn" data-dev="spawn-btn">Spawn subagent</button>` +
      `<div class="field-label">Subagents (${S.subagents.length})</div>` +
      `<div data-dev="sub-list">${subListHTML(S)}</div>` +
    `</div>` +
    `<div data-dev="panel-Git" class="${show("Git")}">${gitPanelHTML(S)}</div>` +
    `<div data-dev="panel-API" class="${show("API")}">${apiPanelHTML(S)}</div>`;
}

function setPanel(name) {
  const S = C?.state; if (!S) return;
  if (!["Agent", "Subagents", "Git", "API"].includes(name)) return;
  S.activePanel = name;
  document.querySelectorAll('[data-dev="panel-tabs"] button').forEach((b) =>
    b.classList.toggle("active", b.dataset.panel === name));
  ["Agent", "Subagents", "Git", "API"].forEach((p) => {
    const el = q(`[data-dev="panel-${p}"]`);
    if (el) el.classList.toggle("hidden", p !== name);
  });
}

function syncChat() { const el = q('[data-dev="chat-log"]'); if (el && C?.state) el.innerHTML = chatLogHTML(C.state); }
function syncSubs() { const el = q('[data-dev="sub-list"]'); if (el && C?.state) el.innerHTML = subListHTML(C.state); }
function syncApi() { const el = q('[data-dev="panel-API"]'); if (el && C?.state) el.innerHTML = apiPanelHTML(C.state); }
function syncGit() {
  const S = C?.state; if (!S) return;
  const host = q('[data-dev="panel-Git"]'); if (host) host.innerHTML = gitPanelHTML(S);
}

/* ============================================================
   TERMINAL
   ============================================================ */
function terminalHTML(S) {
  const open = S.termOpen !== false;
  return `<div class="terminal${open ? "" : " collapsed"}" data-dev="terminal">` +
    `<div class="terminal-head"><span class="t-title">Terminal</span>` +
    `<div class="t-actions">` +
    `<button data-action="term-clear">Clear</button>` +
    `<button data-action="term-toggle" data-dev="term-toggle">${open ? "Hide" : "Show"}</button></div></div>` +
    `<div class="terminal-body${open ? "" : " hidden"}" data-dev="term-body">${E(S.termBuffer || "")}</div>` +
    `<div class="terminal-input${open ? "" : " hidden"}">` +
    `<span class="prompt">❯</span>` +
    `<input data-dev="term-input" placeholder="Type a command and press Enter…" spellcheck="false" /></div></div>`;
}

function syncTerminal() {
  const S = C?.state; if (!S) return;
  const term = q('[data-dev="terminal"]'); if (!term) return;
  const open = S.termOpen !== false;
  term.classList.toggle("collapsed", !open);
  const body = q('[data-dev="term-body"]');
  const inputRow = term.querySelector(".terminal-input");
  const toggle = q('[data-dev="term-toggle"]');
  if (body) { body.classList.toggle("hidden", !open); body.textContent = S.termBuffer || ""; body.scrollTop = body.scrollHeight; }
  if (inputRow) inputRow.classList.toggle("hidden", !open);
  if (toggle) toggle.textContent = open ? "Hide" : "Show";
}

function appendTerm(data) {
  const S = C?.state; if (!S) return;
  S.termBuffer = String(S.termBuffer || "") + String(data ?? "");
  if (S.termBuffer.length > TERM_CAP) S.termBuffer = "…[trimmed]…" + S.termBuffer.slice(-Math.floor(TERM_CAP * 0.9));
  const body = q('[data-dev="term-body"]');
  if (body) { body.textContent = S.termBuffer; body.scrollTop = body.scrollHeight; }
}

async function ensureTerminal() {
  const S = C?.state, F = C?.forge; if (!S || !F?.terminal) return false;
  if (S.terminalId) { if (termSubscribedId !== S.terminalId) subscribeTerm(F, S.terminalId); return true; }
  if (!S.projectDir) return false;
  if (termSubscribedId === "creating") return false;
  termSubscribedId = "creating";
  let id = null;
  try { id = await F.terminal.create(S.projectDir); } catch { id = null; }
  termSubscribedId = null;
  if (!id) { C?.notify?.("Could not start terminal"); return false; }
  S.terminalId = id;
  subscribeTerm(F, id);
  if (typeof F.terminal.getData === "function" && !S.termBuffer) {
    try { const prev = await F.terminal.getData(id); if (prev) { S.termBuffer = String(prev); syncTerminal(); } } catch {}
  }
  return true;
}

function subscribeTerm(F, id) {
  if (termSubscribedId === id) return;
  termSubscribedId = id;
  try {
    F.terminal.onData(id, (d) => appendTerm(d));
    F.terminal.onExit(id, (code) => {
      appendTerm(`\n[process exited${code != null ? " (code " + code + ")" : ""}]\n`);
      const S = C?.state;
      if (S && S.terminalId === id) { S.terminalId = null; termSubscribedId = null; }
    });
  } catch {}
}

async function runTermCmd() {
  const S = C?.state, F = C?.forge; const inp = q('[data-dev="term-input"]');
  if (!inp || !S || !F?.terminal) return;
  const cmd = inp.value;
  if (!S.terminalId) {
    const ok = await ensureTerminal();
    if (!ok || !S.terminalId) { C?.notify?.("Open a project to start a terminal"); return; }
  }
  if (cmd.trim()) { termHistory.push(cmd); if (termHistory.length > 100) termHistory.shift(); }
  termHistIdx = termHistory.length;
  inp.value = "";
  try { await F.terminal.write(S.terminalId, cmd + "\n"); }
  catch (err) { C?.notify?.("Terminal write failed — " + (err?.message || err)); }
}

/* ============================================================
   STATUS BAR
   ============================================================ */
function statusbarHTML(S) {
  return `<span class="item" data-dev="sb-sync" title="Completions run in-app; Venice.ai web app is the fallback">` +
      `<span class="dot" style="background:var(--success)"></span>In-app + Venice.ai</span>` +
    `<span class="item" data-dev="sb-branch">${E(S.git?.branch || "no repo")}</span>` +
    `<span class="item" data-dev="sb-files">${S.openFiles.size} open</span>` +
    `<span class="item" data-dev="sb-dirty">${dirtyCount()} unsaved</span>` +
    `<span class="item" data-dev="sb-model">${E(S.model || "")}</span>` +
    `<span class="spacer"></span>` +
    `<span class="cmd">${MOD}+K find file · ${MOD}+S save · ${MOD}+↵ send</span>`;
}

function syncStatusbar() {
  const S = C?.state; if (!S) return;
  const bar = q('[data-dev="statusbar"]'); if (bar) bar.innerHTML = statusbarHTML(S);
}

/* ============================================================
   ACTIONS — chat / subagents / git / api
   ============================================================ */
function buildMessages(S, task) {
  const mode = MODES[S.agentMode] || MODES.agent;
  const parts = [
    "You are the AI pair programmer inside Venice Forge, an Electron dev studio.",
    "Project root: " + (S.projectDir || "(no folder open)"),
  ];
  if (S.activeFile && S.openFiles.has(S.activeFile)) {
    parts.push(`Active file: ${S.activeFile}\n\`\`\`\n${clip(S.openFiles.get(S.activeFile), 4000)}\n\`\`\``);
  }
  parts.push(mode.prompt);
  const sys = parts.filter(Boolean).join("\n\n");
  const hist = S.chat.slice(-12).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.text || "") }));
  return [{ role: "system", content: sys }, ...hist];
}

async function sendChat() {
  const S = C?.state, F = C?.forge; if (!S || !F?.venice || chatInFlight) return;
  const ta = q('[data-dev="task"]');
  const task = (ta?.value || "").trim();
  if (!task) { C?.notify?.("Describe a task first"); return; }
  if (!S.model) { C?.notify?.("Pick a model first"); return; }
  S.chat.push({ role: "user", text: task, meta: (MODES[S.agentMode] || MODES.agent).chip });
  syncChat();
  if (ta) ta.value = "";
  const btn = q('[data-dev="send-btn"]');
  chatInFlight = true;
  if (btn) { btn.disabled = true; btn.textContent = "Thinking…"; }
  // Process in-app first; fall back to the Venice.ai web app on failure.
  const canProcessInApp = typeof F.venice.processCompletion === "function";
  try {
    if (canProcessInApp) {
      const response = await F.venice.processCompletion(task, S.model);
      S.chat.push({ role: "assistant", text: response, meta: "internal" });
    } else {
      await handOffToWebApp(S, F, task);
    }
  } catch (err) {
    // In-app processing failed — try the web-app fallback before surfacing an error.
    if (canProcessInApp && typeof F.venice.chatLink === "function") {
      console.warn("In-app completion failed, falling back to web app:", err);
      try { await handOffToWebApp(S, F, task); }
      catch (fallbackErr) { pushError(S, fallbackErr); }
    } else {
      pushError(S, err);
    }
  } finally {
    chatInFlight = false;
    if (btn) { btn.disabled = false; btn.textContent = "Send task"; }
    syncChat(); syncApi(); syncStatusbar();
  }
}

/** Push a user-visible error message into the chat log. */
function pushError(S, err) {
  S.chat.push({ role: "assistant", text: "Could not process completion — " + (err?.message || err), meta: "error" });
}

/** Hand a task off to the Venice.ai web app (SSO + deep link). */
async function handOffToWebApp(S, F, task) {
  // Ensure SSO first — if cookies are already in the session this is a no-op.
  if (typeof F.venice.loginState === "function") {
    try {
      const st = await F.venice.loginState();
      if (!st?.loggedIn && typeof F.venice.importCookies === "function") await loginViaBrowserCookies();
    } catch {}
  }
  // Hand the task to the Venice.ai web app — the app's model surface.
  const link = typeof F.venice.chatLink === "function"
    ? await F.venice.chatLink(task, S.model)
    : VENICE_CHAT_URL;
  await F.browser.open(link);
  S.chat.push({
    role: "assistant",
    text: `Opened your task in the Venice.ai web app (${link}). Pick “${S.model}” there and continue — results paste straight back here.`,
    meta: "web app"
  });
}

async function spawnSub() {
  const S = C?.state, F = C?.forge; if (!S || !F?.subagents) return;
  const inp = q('[data-dev="sub-goal"]');
  const goal = (inp?.value || "").trim();
  if (!goal) { C?.notify?.("Describe a goal for the subagent"); return; }
  const sel = q('[data-dev="sub-model-select"]');
  const model = sel?.value || subModel || S.model;
  const btn = q('[data-dev="spawn-btn"]');
  if (btn) { btn.disabled = true; btn.textContent = "Spawning…"; }
  try {
    const id = await F.subagents.spawn(goal, model, S.projectDir || undefined);
    S.subagents.unshift({ id: String(id), goal, model, status: "running", summary: "", context: S.projectDir });
    if (inp) inp.value = "";
    C?.notify?.("Subagent spawned");
  } catch (err) { C?.notify?.("Spawn failed — " + (err?.message || err)); }
  finally {
    if (btn) { btn.disabled = false; btn.textContent = "Spawn subagent"; }
    syncSubs(); syncApi();
  }
}

async function stopSub(id) {
  const S = C?.state, F = C?.forge; if (!S || !F?.subagents || !id) return;
  try { await F.subagents.stop(id); } catch {}
  const a = S.subagents.find((s) => s.id === id);
  if (a) a.status = "stopped";
  syncSubs(); syncApi();
}

async function loadGit(force) {
  const S = C?.state, F = C?.forge; if (!S || !F?.git) return;
  if (!S.projectDir) { S.git = { branch: "", dirty: [], ahead: 0 }; gitLogCache = []; syncGit(); syncStatusbar(); return; }
  if (gitLoading && !force) return;
  gitLoading = true;
  try {
    const st = await F.git.status(S.projectDir);
    S.git = st && typeof st === "object" ? { branch: st.branch || "", dirty: st.dirty || [], ahead: st.ahead || 0 } : { branch: "", dirty: [], ahead: 0 };
  } catch { S.git = { branch: "", dirty: [], ahead: 0 }; }
  try { gitLogCache = (await F.git.log(S.projectDir, 8)) || []; } catch { gitLogCache = []; }
  gitLoading = false;
  syncGit(); syncStatusbar();
}

async function doCommit() {
  const S = C?.state, F = C?.forge; if (!S || !F?.git || !S.projectDir) return;
  const inp = q('[data-dev="commit-msg"]');
  const msg = (inp?.value || "").trim() || "wip";
  const btn = q('[data-dev="commit-btn"]');
  if (btn) { btn.disabled = true; btn.textContent = "Committing…"; }
  let ok = false, hash = "";
  try { const r = await F.git.commit(S.projectDir, msg); ok = !!r?.ok; hash = r?.hash || ""; }
  catch (err) { C?.notify?.("Commit failed — " + (err?.message || err)); }
  if (btn) { btn.disabled = false; btn.textContent = "Commit changes"; }
  if (ok) { if (inp) inp.value = ""; C?.notify?.("Committed " + (hash ? hash.slice(0, 7) : "")); }
  else if (hash === "") { /* keep input; notify already shown on throw */ }
  await loadGit(true);
}

async function loadModels() {
  const S = C?.state, F = C?.forge; if (!S || !F?.venice) return;
  if (!Array.isArray(S.models) || !S.models.length) {
    if (modelsLoading) return;
    modelsLoading = true;
    try {
      const fn = typeof F.venice.chatModels === "function" ? F.venice.chatModels : F.venice.models;
      const ms = await fn.call(F.venice);
      if (Array.isArray(ms) && ms.length) S.models = ms;
    } catch {}
    modelsLoading = false;
  }
  syncModelSelects(); syncStatusbar(); syncApi();
}

/** One-time SSO: pull venice.ai cookies from installed browsers into the
 *  app's persisted session, then open the chat surface already logged in. */
async function loginViaBrowserCookies() {
  const F = C?.forge; if (!F?.venice?.importCookies) return;
  const res = await F.venice.importCookies();
  if (res?.imported > 0) {
    C?.notify?.(`Signed in with venice.ai cookies from ${(res.sources || ["browser"]).join(", ")}`);
  } else {
    C?.notify?.("No venice.ai cookies found — log in at venice.ai once and retry.");
  }
  return res;
}

function syncModelSelects() {
  const S = C?.state; if (!S) return;
  for (const dev of ["model-select", "sub-model-select"]) {
    const sel = q(`[data-dev="${dev}"]`);
    if (!sel) continue;
    const current = dev === "model-select" ? S.model : (subModel || S.model);
    sel.innerHTML = modelOptionsHTML(S, current);
    const value = sel.value;
    if (dev === "model-select") S.model = value;
    else subModel = value;
    const label = q(`[data-dev="${dev}-label"]`);
    if (label) label.textContent = value;
  }
}

function buildCurl() {
  const S = C?.state || {};
  const task = (q('[data-dev="task"]')?.value || "").trim();
  return F?.venice?.chatLink ? F.venice.chatLink(task, S.model) : VENICE_CHAT_URL;
}

async function copyCurl() {
  const text = buildCurl();
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {}
  if (!ok) {
    try {
      const t = document.createElement("textarea");
      t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      ok = document.execCommand("copy");
      t.remove();
    } catch {}
  }
  C?.notify?.(ok ? "Venice.ai link copied" : "Copy failed");
}

async function openVeniceChat() {
  const S = C?.state, F = C?.forge; if (!F?.browser) return;
  const task = (q('[data-dev="task"]')?.value || "").trim();
  const link = buildCurl();
  try { await F.browser.open(link); }
  catch (err) { C?.notify?.("Could not open Venice.ai — " + (err?.message || err)); return; }
  if (task && S) S.chat.push({ role: "assistant", text: `Opened in Venice.ai web app: ${link}`, meta: "web app" });
}

function useTemplate(id) {
  const S = C?.state; const tpl = TEMPLATES.find((t) => t.id === id);
  if (!S || !tpl) return;
  const ta = q('[data-dev="task"]');
  if (ta) { ta.value = tpl.prompt; ta.focus(); }
  S.agentMode = tpl.mode;
  document.querySelectorAll('[data-dev="panel-Agent"] .mode-chip').forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === tpl.mode));
  activeTpl = id;
  document.querySelectorAll('[data-dev="tpl"]').forEach((el) =>
    el.classList.toggle("active", el.dataset.tpl === id));
  if (S.activePanel !== "Agent") setPanel("Agent");
  C?.notify?.("Template loaded — edit the task, then Send");
}

/* ============================================================
   RENDER + WIRE
   ============================================================ */
async function createNewProject() {
  const dir = await C.forge.files.openDialog();
  if (!dir) return;
  try {
    if (!C.forge.files.exists(dir)) await C.forge.files.mkdir(dir);
    await C.forge.files.write(dir + "/README.md", "# New project" + String.fromCharCode(10) + "Select a workspace directory." + String.fromCharCode(10));
    await C.forge.git.init(dir);
  } catch (e) { C?.notify?.(e.message); }
  C.state.projectDir = dir;
  localStorage.setItem("forge.projectDir", dir);
  await refreshTree();
  await refreshGit();
  render();
  C.notify?.("Created project at " + shortName(dir));
}

function renderWorkspace(ctx) {
  C = ctx; prepState(ctx.state);
  const S = ctx.state;
  const proj = S.projectDir ? shortName(S.projectDir) : "No project";
  const templates = TEMPLATES.map((t) =>
    `<div class="template-card${activeTpl === t.id ? " active" : ""}" data-dev="tpl" data-action="use-template" data-tpl="${t.id}">` +
    `<div class="t-name">${E(t.name)}</div><div class="t-sub">${E(t.sub)}</div></div>`).join("");
  return `<div data-dev="root" style="flex:1 1 auto;min-height:0;height:100%;display:flex;flex-direction:column">` +
    `<div class="workspace" style="flex:1 1 auto;min-height:0">` +
      `<aside class="explorer" aria-label="Projects and files">` +
        `<div class="panel-head"><span class="panel-title" title="${E(S.projectDir || "")}">${E(proj)}</span>` +
        `<div class="panel-actions">` +
        `<button class="icon-btn" data-action="open-project" title="Open folder…" aria-label="Open folder">${FOLDER_OPEN_SVG}</button>` +
        `<button class="icon-btn" data-action="new-project" title="New project" aria-label="New project">${NEW_PROJECT_SVG}</button></div></div>` +
        `<label class="search">${SEARCH_SVG}<input data-dev="tree-search" placeholder="Find file…" /></label>` +
        `<div class="explorer-scroll">` +
          `<div class="section-label"><span>Files</span><span data-dev="tree-count">0</span></div>` +
          `<div class="file-tree" data-dev="tree" role="tree" aria-label="Project files">${treeListHTML(S)}</div>` +
          `<div class="divider"></div>` +
          `<div class="section-label"><span>Workflow templates</span></div>` +
          templates +
        `</div>` +
      `</aside>` +
      `<section class="center">` +
        `<div class="editor-tabs" data-dev="tabs" style="${S.openFiles.size ? "" : "display:none"}">${tabsHTML(S)}</div>` +
        `<div class="editor-body" data-dev="editor-body">${editorBodyHTML(S)}</div>` +
      `</section>` +
      `<aside class="inspector">` +
        `<div class="tab-strip" data-dev="panel-tabs">` +
          ["Agent", "Subagents", "Git", "API"].map((p) =>
            `<button class="${S.activePanel === p ? "active" : ""}" data-action="panel" data-panel="${p}">${p}</button>`).join("") +
        `</div>` +
        `<div class="inspector-scroll" data-dev="inspector-body">${inspectorBodyHTML(S)}</div>` +
      `</aside>` +
    `</div>` +
    terminalHTML(S) +
  `</div>`;
}

function wire(ctx) {
  C = ctx; prepState(ctx.state);
  if (typeof document === "undefined") return; // no DOM (non-browser eval) — nothing to bind
  bindDelegates();
  syncTree(); syncTabs(); syncStatusbar(); syncTerminal();
  ensureTerminal().catch(() => {});
  loadModels().catch(() => {});
  loadGit(false).catch(() => {});
  subscribeSubResults();
}

function subscribeSubResults() {
  const F = C?.forge; if (!F?.subagents || subResultsBound) return;
  subResultsBound = true;
  try {
    F.subagents.onResult?.((id, summary) => {
      const S = C?.state; if (!S) return;
      const a = S.subagents.find((s) => s.id === id);
      if (a) { a.status = "done"; a.summary = summary || a.summary; }
      syncSubs(); syncApi();
    });
  } catch { subResultsBound = false; }
}

function bindDelegates() {
  if (bound) return;
  bound = true;

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el || !el.closest('[data-dev="root"]')) return;
    const S = C?.state, F = C?.forge; if (!S || !F) return;
    if (el.matches('.tree-item[role="treeitem"]')) focusTreePath(el.dataset.path);
    switch (el.dataset.action) {
      case "open-project":
        Promise.resolve(C.openProject?.()).then(() => {
          syncTree(); loadGit(true).catch(() => {}); ensureTerminal().catch(() => {}); syncStatusbar();
        }).catch(() => {});
        break;
      case "new-project":
        Promise.resolve(createNewProject?.()).then(() => {
          syncTree(); loadGit(true).catch(() => {}); ensureTerminal().catch(() => {}); syncStatusbar();
        }).catch(() => {});
        break;
      case "use-template": useTemplate(el.dataset.tpl); break;
      case "open-file": openFile(el.dataset.path); break;
      case "toggle-dir": {
        const p = el.dataset.path;
        if (collapsed.has(p)) collapsed.delete(p); else collapsed.add(p);
        syncTree(); break;
      }
      case "activate-tab": if (S.activeFile !== el.dataset.path) { S.activeFile = el.dataset.path; syncTabs(); syncEditor(); syncTree(); } break;
      case "close-tab": closeTab(el.dataset.path); break;
      case "panel": setPanel(el.dataset.panel); break;
      case "set-mode":
        S.agentMode = el.dataset.mode;
        document.querySelectorAll('[data-dev="panel-Agent"] .mode-chip').forEach((b) =>
          b.classList.toggle("active", b.dataset.mode === S.agentMode));
        break;
      case "send": sendChat(); break;
      case "tokens": {
        const d = parseInt(el.dataset.delta || "0", 10);
        S.maxTokens = Math.min(8192, Math.max(256, (S.maxTokens || 2000) + d));
        const tv = q('[data-dev="tok-val"]'); if (tv) tv.textContent = String(S.maxTokens);
        syncApi(); break;
      }
      case "spawn": spawnSub(); break;
      case "stop-sub": stopSub(el.dataset.id); break;
      case "commit": doCommit(); break;
      case "git-refresh": loadGit(true); break;
      case "git-init":
        if (S.projectDir) F.git.init(S.projectDir)
          .then(() => { C.notify?.("Repository initialised"); return loadGit(true); })
          .catch((err) => C.notify?.("Init failed — " + (err?.message || err)));
        break;
      case "copy-curl": copyCurl(); break;
      case "open-venice-chat": openVeniceChat(); break;
      case "term-clear": {
        S.termBuffer = "";
        const body = q('[data-dev="term-body"]'); if (body) body.textContent = "";
        break;
      }
      case "term-toggle":
        S.termOpen = S.termOpen === false;
        syncTerminal();
        break;
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.closest || !t.closest('[data-dev="root"]')) return;
    const S = C?.state; if (!S) return;
    if (t.matches('[data-dev="tree-search"]')) { filterQ = t.value; syncTree(); return; }
    if (t.matches('[data-dev="editor"]') && S.activeFile) {
      S.openFiles.set(S.activeFile, t.value);
      syncGutter(); syncStatusbar(); syncTabs();
    }
  });

  document.addEventListener("keydown", (e) => {
    const S = C?.state; if (!S) return;
    const inRoot = e.target.closest && e.target.closest('[data-dev="root"]');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "s" || e.key === "S") && activeScreen()) {
      e.preventDefault(); saveActive(); return;
    }
    if (mod && (e.key === "k" || e.key === "K") && activeScreen()) {
      const s = q('[data-dev="tree-search"]');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
      return;
    }
    if (!inRoot) return;
    if (e.target.matches('[data-dev="tree-search"]') && e.key === "Escape") {
      if (e.target.value) { e.preventDefault(); e.target.value = ""; filterQ = ""; syncTree(); }
      return;
    }
    const treeItem = e.target.closest('.tree-item[role="treeitem"]');
    if (treeItem && treeItem.closest('[data-dev="tree"]')) {
      const items = Array.from(treeItem.closest('[data-dev="tree"]').querySelectorAll('.tree-item[role="treeitem"]'));
      const index = items.indexOf(treeItem);
      const moveTo = (item) => { if (item) { e.preventDefault(); focusTreePath(item.dataset.path); } };
      switch (e.key) {
        case "ArrowDown": moveTo(items[index + 1]); return;
        case "ArrowUp": moveTo(items[index - 1]); return;
        case "Home": moveTo(items[0]); return;
        case "End": moveTo(items[items.length - 1]); return;
        case "ArrowRight":
          if (treeItem.dataset.action === "toggle-dir") {
            e.preventDefault();
            if (collapsed.has(treeItem.dataset.path)) { collapsed.delete(treeItem.dataset.path); syncTree(); focusTreePath(treeItem.dataset.path); }
            else moveTo(items.find((item) => item.dataset.path.startsWith(treeItem.dataset.path + "/") && Number(item.getAttribute("aria-level")) === Number(treeItem.getAttribute("aria-level")) + 1));
          }
          return;
        case "ArrowLeft":
          if (treeItem.dataset.action === "toggle-dir" && !collapsed.has(treeItem.dataset.path)) {
            e.preventDefault(); collapsed.add(treeItem.dataset.path); syncTree(); focusTreePath(treeItem.dataset.path);
          } else {
            const parent = treeItem.dataset.path.split("/").slice(0, -1).join("/");
            if (parent) moveTo(items.find((item) => item.dataset.path === parent));
          }
          return;
        case "Enter":
        case " ": e.preventDefault(); treeItem.click(); return;
      }
    }
    if (e.key === "Tab" && e.target.matches('[data-dev="editor"]')) {
      e.preventDefault();
      const ta = e.target;
      ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (e.target.matches('[data-dev="term-input"]')) {
      if (e.key === "Enter") { e.preventDefault(); runTermCmd(); return; }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (termHistory.length) { termHistIdx = Math.max(0, termHistIdx - 1); e.target.value = termHistory[termHistIdx] || ""; }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        termHistIdx = Math.min(termHistory.length, termHistIdx + 1);
        e.target.value = termHistory[termHistIdx] || "";
        return;
      }
    }
    if (mod && e.key === "Enter" && e.target.matches('[data-dev="task"]')) {
      e.preventDefault(); sendChat();
    }
  });

  document.addEventListener("scroll", (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('[data-dev="editor"]')) {
      const g = q('[data-dev="gutter"]');
      if (g) g.scrollTop = t.scrollTop;
    }
  }, true);
}

/* Dual-registration guard: when bundled/loaded alongside the classic
   router, make this screen discoverable via window.__SCREENS__ too. */
if (typeof window !== "undefined") {
  try {
    window.__SCREENS__ = window.__SCREENS__ || [];
    if (!window.__SCREENS__.some((m) => m && m.id === "dev")) {
      window.__SCREENS__.push({ id: "dev", TABS, render: renderWorkspace, wire });
    }
  } catch {}
}
