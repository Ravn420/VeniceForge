/* ============================================================
   Venice Forge — AI Dev Studio
   Top-nav router. Each workspace screen lives in its own classic
   script module (screens-*.js) that registers on window.__SCREENS__.
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const app = $("#app");

const NAV_TABS = ["Library", "Chat", "Brainstorm", "Image Gen", "Video Studio", "Movie Editor", "Audio Score", "AI Dev Studio", "Integrations"];
const VENICE_APP_URL = "https://venice.ai/chat";
const VENICE_SIGN_IN_URL = "https://venice.ai/sign-in";

const state = {
  tab: new URLSearchParams(location.search).get("tab") || (window.forge ? "AI Dev Studio" : "Brainstorm"),
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
  venice: null,
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
    window.forge?.subagents?.onResult?.((id, summary) => {
      const a = state.subagents.find((s) => s.id === id);
      if (a) { a.status = "done"; a.summary = summary; }
      const body = $("#inspector-body");
      if (body && state.tab === "AI Dev Studio" && state.activePanel === "Subagents") renderScreen();
    });
  } catch {}
  const was = state.venice?.loggedIn;
  await refreshVenice();
  if (state.venice?.loggedIn && !was) {
    const via = state.venice.source ? ` in ${state.venice.source}` : "";
    notify(`Already signed in${via}. Login skipped.`);
  }
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
      <button class="nav-control web-session-indicator" id="open-venice-webapp" title="Uses the browser where you already use Venice.ai">
        <span class="dot${state.venice?.loggedIn ? "" : " off"}"></span><span class="label">${esc(veniceButtonLabel())}</span>
      </button>
      <div class="topnav-spacer"></div>
      <div class="nav-control settings-menu" id="settings-menu">
        <button class="nav-control" id="open-settings" title="Settings">
          <span class="dot"></span><span class="label">Settings</span>
        </button>
        <div class="settings-panel" id="settings-panel">
          <div class="setting-item">
            <span class="setting-label">Account</span>
            <span class="setting-value" id="account-status">${esc(accountLabel())}</span>
          </div>
          <p class="account-note">Venice.ai has no desktop app. If that browser is already signed in, login is skipped and you go straight in.</p>
          <button class="nav-control" id="open-login">
            <span class="label">${esc(state.venice?.loggedIn ? "Open Venice.ai" : "Sign in with your browser")}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="screen" id="screen"></div>
    <div class="statusbar" id="statusbar"></div>
  `;
}

function wireNav() {
  $("#navtabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    state.tab = b.dataset.tab;
    render();
  });
  $("#open-venice-webapp").onclick = () => enterVenice(VENICE_APP_URL);
  $("#open-settings").onclick = (e) => {
    e.stopPropagation();
    const panel = $("#settings-panel");
    if (panel) panel.style.display = panel.style.display === "block" ? "none" : "block";
  };
  document.addEventListener("click", (e) => {
    const panel = $("#settings-panel");
    if (panel && !panel.contains(e.target) && e.target.id !== "open-settings") {
      panel.style.display = "none";
    }
  });
  $("#open-login").onclick = () => enterVenice(VENICE_APP_URL);
}

function veniceButtonLabel() {
  if (!state.venice) return "Checking your browser…";
  if (state.venice.loggedIn) return state.venice.source ? `Signed in · ${state.venice.source}` : "Signed in";
  return "Sign in with your browser";
}

function accountLabel() {
  if (!state.venice) return "Checking your browser…";
  if (state.venice.loggedIn) return state.venice.source ? `Signed in via ${state.venice.source}` : "Signed in";
  return "Not signed in";
}

async function readVeniceSession() {
  if (window.forge?.venice?.loginState) {
    const st = await window.forge.venice.loginState();
    return { loggedIn: !!st?.loggedIn, source: st?.source || "", skippedLogin: !!st?.skippedLogin };
  }
  const res = await fetch("/api/venice/session");
  if (!res.ok) return { loggedIn: false, source: "", skippedLogin: false };
  const st = await res.json();
  return { loggedIn: !!st.loggedIn, source: st.source || "", skippedLogin: !!st.skippedLogin };
}

async function refreshVenice() {
  try { state.venice = await readVeniceSession(); }
  catch { state.venice = { loggedIn: false, source: "", skippedLogin: false }; }
}

function openVeniceSurface(url) {
  if (window.forge?.browser) {
    window.forge.browser.open(url).catch((error) => notify("Could not open Venice.ai: " + error.message));
    return;
  }
  window.open(url, "_blank", "noopener");
}

let loginWatch = false;

function enterVenice(url) {
  const target = url || VENICE_APP_URL;
  if (state.venice?.loggedIn) {
    const via = state.venice.source ? ` in ${state.venice.source}` : "";
    notify(`Already signed in${via}. Login skipped.`);
    openVeniceSurface(target);
    return;
  }
  startBrowserLogin(target);
}

async function startBrowserLogin(nextUrl) {
  const next = nextUrl || VENICE_APP_URL;
  if (state.venice?.loggedIn) {
    openVeniceSurface(next);
    return;
  }
  if (loginWatch) return;
  loginWatch = true;
  try {
    if (window.forge?.venice?.openBrowserLogin) {
      const st = await window.forge.venice.openBrowserLogin();
      if (st?.loggedIn) {
        state.venice = { loggedIn: true, source: st.source || "", skippedLogin: true };
        notify(`Already signed in${st.source ? ` in ${st.source}` : ""}. Login skipped.`);
        openVeniceSurface(next);
        render();
        return;
      }
    } else {
      window.open(VENICE_SIGN_IN_URL, "_blank", "noopener");
    }
    notify("Continue in your browser. An existing Venice.ai session skips the login page.");
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await refreshVenice();
      if (state.venice?.loggedIn) {
        notify(`Signed in${state.venice.source ? ` via ${state.venice.source}` : ""}. Login skipped.`);
        openVeniceSurface(next);
        render();
        return;
      }
    }
  } finally {
    loginWatch = false;
  }
}

function render() {
  renderNav();
  wireNav();
  renderScreen();
  renderStatus();
}

async function renderScreen() {
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

Object.assign(window, { openProject, refreshTree, refreshGit, notify, esc, enterVenice, openVeniceSurface });

init();
