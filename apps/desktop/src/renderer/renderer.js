/* ============================================================
   Venice Forge — AI Dev Studio
   Top-nav router. Each workspace screen lives in its own classic
   script module (screens-*.js) that registers on window.__SCREENS__.
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const app = $("#app");

const NAV_TABS = ["Library", "Chat", "Image Gen", "Video Studio", "Movie Editor", "Music", "Audio Score", "AI Dev Studio", "Integrations"];

const state = {
  tab: new URLSearchParams(location.search).get("tab") || (window.forge ? "AI Dev Studio" : "Music"),
  projectDir: null,
  tree: [],
  openFiles: new Map(),
  activeFile: null,
  activePanel: "Agent",
  agentMode: "agent",
  subagents: [],
  terminalId: null,
  termBuffer: "",
  termOpen: true,
  git: null,
  template: null,
};

/* ---------------- helpers ---------------- */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const shortName = (p) => p.split(/[/\\]/).filter(Boolean).pop() || p;

function notify(msg) {
  let t = $("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = "position:fixed;bottom:52px;left:50%;transform:translateX(-50%);background:#161b26;border:1px solid #2a3241;color:#f3f4f6;font-size:11px;padding:9px 14px;border-radius:7px;z-index:200;box-shadow:0 6px 24px rgba(0,0,0,.45);transition:opacity .2s";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t.__h);
  t.__h = setTimeout(() => { t.style.opacity = "0"; }, 1800);
}

/* ---------------- boot ---------------- */
async function init() {
  await bootstrap();
  render();
}

async function bootstrap() {
  const last = localStorage.getItem("forge.projectDir");
  if (last) {
    state.projectDir = last;
    await refreshTree();
    await refreshGit();
  }
  try {
    window.forge.subagents.onResult?.((id, summary) => {
      const a = state.subagents.find((s) => s.id === id);
      if (a) { a.status = "done"; a.summary = summary; }
      const body = $("#inspector-body");
      if (body && state.tab === "AI Dev Studio" && state.activePanel === "Subagents") renderScreen();
    });
  } catch {}
}

/* ---------------- router ---------------- */
const modules = () => window.__SCREENS__ || [];

function moduleFor(tab) {
  return modules().find((m) => Array.isArray(m.TABS) && m.TABS.includes(tab));
}

function renderNav() {
  app.innerHTML = `
    <div class="topnav">
      <div class="brand">
        <div class="monogram">V</div>
        <div class="brand-text">
          <span class="brand-name">Venice</span>
          <span class="brand-sub">STUDIO</span>
        </div>
      </div>
      <nav class="nav-tabs" id="navtabs">
        ${NAV_TABS.map((t) => `<button class="nav-tab ${t === state.tab ? "active" : ""}" data-tab="${esc(t)}">${esc(t)}</button>`).join("")}
      </nav>
      <div class="topnav-spacer"></div>
      <div class="nav-control settings-menu" id="settings-menu">
        <button class="nav-control" id="open-settings" title="Settings">
          <span class="dot"></span><span class="label">Settings</span>
        </button>
        <div class="settings-panel" id="settings-panel">
          <div class="setting-item">
            <span class="setting-label">Generations</span>
            <span class="setting-value">In this studio</span>
          </div>
          <div class="setting-item">
            <span class="setting-label">Music models</span>
            <span class="setting-value">Music page</span>
          </div>
        </div>
      </div>
    </div>
    <div class="screen" id="screen"></div>
    <div class="statusbar" id="statusbar"></div>
  `;
}

let settingsCloserBound = false;

function wireNav() {
  $("#navtabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    render();
  });
  $("#open-settings").onclick = (e) => {
    e.stopPropagation();
    const panel = $("#settings-panel");
    if (!panel) return;
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  };
  if (!settingsCloserBound) {
    settingsCloserBound = true;
    document.addEventListener("click", (e) => {
      const panel = $("#settings-panel");
      if (!panel || panel.style.display !== "block") return;
      if (panel.contains(e.target) || e.target.closest?.("#open-settings")) return;
      panel.style.display = "none";
    });
  }
}

function render() {
  renderNav();
  wireNav();
  renderScreen();
  renderStatus();
}async function renderScreen() {
  const mount = $("#screen");
  if (!mount) return;
  const mod = moduleFor(state.tab);
  if (!mod) {
    mount.innerHTML = `<div class="editor-empty" style="height:100%">
      <div class="big">${esc(state.tab)}</div>
      <div class="sub">This screen module did not load yet.</div></div>`;
    return;
  }
  const ctx = {
    state,
    forge: window.forge,
    esc,
    go: (t) => { state.tab = t; render(); },
    openProject,
    refreshTree,
    notify,
  };
  try {
    let html = mod.render(ctx);
    if (html && typeof html.then === "function") html = await html;
    mount.innerHTML = html;
    mod.wire(ctx);
  } catch (e) {
    mount.innerHTML = `<div class="editor-empty" style="height:100%"><div class="big">Screen error</div><div class="sub">${esc(e.message)}</div></div>`;
  }
}

function renderStatus() {
  const el = $("#statusbar");
  if (!el) return;
  const dirty = state.git?.dirty?.length ?? 0;
  el.innerHTML = `
    <div class="item"><span class="dot"></span> Workspace synced</div>
    <div class="item">${esc(state.tab)}</div>
    <div class="spacer"></div>
    <div class="item">${state.openFiles.size} files open · ${dirty} changes</div>
    <div class="item">⌘ K &nbsp;Command menu</div>`;
}

/* ---------------- shared actions ---------------- */
async function openProject() {
  const dir = await window.forge.files.openDialog();
  if (!dir) return;
  state.projectDir = dir;
  localStorage.setItem("forge.projectDir", dir);
  await refreshTree();
  await refreshGit();
  renderStatus();
  render();
  notify("Opened " + shortName(dir));
}

async function refreshTree() {
  if (!state.projectDir) return;
  try {
    const t = await window.forge.files.tree(state.projectDir);
    state.tree = t.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  } catch { state.tree = []; }
}

async function refreshGit() {
  if (!state.projectDir) return;
  try { state.git = await window.forge.git.status(state.projectDir); } catch { state.git = null; }
}

Object.assign(window, { openProject, refreshTree, refreshGit, notify, esc });

init();
