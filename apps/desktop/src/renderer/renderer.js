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
            <span class="setting-label">Venice</span>
            <span class="setting-value" id="venice-status">Checking…</span>
          </div>
          <p class="setting-note" id="venice-note">Checking for a Venice session.</p>
          <button type="button" class="btn-primary" id="venice-login">Continue with Google</button>
          <details class="signin-more">
            <summary>Other ways to sign in</summary>
            <section class="api-login" aria-label="Web session">
              <div class="api-login-title">Web session</div>
              <p class="setting-note">Only if Google is not signed in. Used for web-app models.</p>
              <label class="setting-label venice-key-label" for="venice-web-session">Session</label>
              <input id="venice-web-session" class="venice-keys" type="password" autocomplete="off" placeholder="Paste session" />
              <button type="button" class="btn-primary" id="venice-web-save">Use session</button>
            </section>
          </details>
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
    <div id="venice-browser" class="venice-browser"${veniceAccount.browserOpen ? "" : " hidden"}>
      <div class="venice-browser-card" id="venice-browser-card">
        <div class="panel-head">
          <span class="panel-title">Sign in with Google</span>
          <button type="button" id="venice-browser-close">Close</button>
        </div>
        <p class="setting-note" id="venice-browser-note">Opening Google…</p>
        <div class="venice-frame-wrap">
          <p class="venice-frame-wait" id="venice-frame-wait">Opening Google…</p>
          <img id="venice-frame" alt="Google sign-in" />
        </div>
        <div class="venice-signin-bar">
          <input id="venice-keys" type="text" placeholder="Email, password, or code, then Enter" autocomplete="off" />
          <button type="button" id="venice-google">Google</button>
          <button type="button" id="venice-google-passkey">Passkey</button>
          <button type="button" id="venice-browser-back">Back</button>
        </div>
      </div>
    </div>
  `;
}

let settingsCloserBound = false;
const veniceAccount = {
  checking: true,
  signedIn: false,
  opening: false,
  browserOpen: false,
  web: false,
  status: "Checking…",
  note: "Checking for a Venice session.",
  poll: 0,
};

function paintVenice() {
  const status = $("#venice-status");
  const note = $("#venice-note");
  const button = $("#venice-login");
  if (status) status.textContent = veniceAccount.status;
  if (note) note.textContent = veniceAccount.note;
  if (button) {
    button.disabled = veniceAccount.opening;
    button.textContent = veniceAccount.opening
      ? "Opening Google…"
      : "Continue with Google";
  }
}

async function refreshVenice() {
  veniceAccount.checking = true;
  paintVenice();
  try {
    const res = await fetch("/api/venice/session");
    const data = await res.json();
    veniceAccount.signedIn = !!data.signedIn;
    veniceAccount.web = !!data.web;
    veniceAccount.status = data.signedIn ? "Signed in" : "Not signed in";
    const who = data.email || data.name || "";
    if (data.web) {
      veniceAccount.note = `Signed in${who ? " as " + who : ""}.`;
    } else if (data.signedIn) {
      veniceAccount.note = `Signed in${who ? " as " + who : ""}.`;
    } else {
      veniceAccount.note = "Continue with Google. Sign-in stays in this studio.";
    }
    return data;
  } catch {
    veniceAccount.signedIn = false;
    veniceAccount.status = "Not signed in";
    veniceAccount.note = "Could not check the browser session.";
    return { signedIn: false };
  } finally {
    veniceAccount.checking = false;
    paintVenice();
  }
}

function showVeniceBrowser(open) {
  const modal = $("#venice-browser");
  if (!modal) return;
  modal.hidden = !open;
  veniceAccount.browserOpen = open;
}

async function browserCommand(body) {
  try {
    const res = await fetch("/api/venice/browser/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    const note = $("#venice-browser-note");
    if (note && data.message) {
      note.dataset.lock = "1";
      note.textContent = data.message;
    }
  } catch { /* the next frame will show where the page is */ }
}

function watchVeniceBrowser() {
  const token = ++veniceAccount.poll;
  const tick = async () => {
    if (!veniceAccount.browserOpen || token !== veniceAccount.poll) return;
    try {
      const sessionRes = await fetch("/api/venice/session");
      const session = await sessionRes.json().catch(() => ({}));
      if (token !== veniceAccount.poll || !veniceAccount.browserOpen) return;
      if (session.web) {
        showVeniceBrowser(false);
        veniceAccount.opening = false;
        await refreshVenice();
        return;
      }
      const res = await fetch("/api/venice/browser/frame.jpg?t=" + Date.now());
      if (token !== veniceAccount.poll) return;
      const host = res.headers.get("x-venice-page") || "";
      if (host && host !== "venice.ai" && !host.endsWith(".venice.ai")) veniceAccount.sawLogin = true;
      const note = $("#venice-browser-note");
      const google = $("#venice-google");
      if (google) google.hidden = host === "accounts.google.com";
      if (note && !note.dataset.lock) {
        note.textContent = host === "accounts.google.com"
          ? "Click the page, or type below and press Enter. Passkey shows a code to scan with your phone."
          : "Opening Google. The page stays in this window.";
      }
      const blob = await res.blob();
      const img = $("#venice-frame");
      const wait = $("#venice-frame-wait");
      if (img && blob.size) {
        const next = URL.createObjectURL(blob);
        const prev = img.src;
        img.src = next;
        if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        if (wait) wait.hidden = true;
      }
    } catch { /* keep watching */ }
    if (veniceAccount.browserOpen && token === veniceAccount.poll) {
      setTimeout(tick, 800);
    }
  };
  tick();
}

function wireVeniceBrowser() {
  const img = $("#venice-frame");
  const keys = $("#venice-keys");
  const close = $("#venice-browser-close");
  const card = $("#venice-browser-card");
  if (card) card.onclick = (e) => e.stopPropagation();
  if (close) close.onclick = (e) => {
    e.stopPropagation();
    veniceAccount.poll += 1;
    veniceAccount.opening = false;
    showVeniceBrowser(false);
  };
  const google = $("#venice-google");
  if (google) google.onclick = (e) => {
    e.stopPropagation();
    const note = $("#venice-browser-note");
    if (note) delete note.dataset.lock;
    browserCommand({ type: "google" });
  };
  const passkey = $("#venice-google-passkey");
  if (passkey) passkey.onclick = (e) => {
    e.stopPropagation();
    browserCommand({ type: "google-passkey", email: $("#venice-keys")?.value || "" });
  };
  const back = $("#venice-browser-back");
  if (back) back.onclick = (e) => {
    e.stopPropagation();
    browserCommand({ type: "home" });
  };
  if (img) {
    img.onclick = (e) => {
      const rect = img.getBoundingClientRect();
      const naturalW = img.naturalWidth || rect.width;
      const naturalH = img.naturalHeight || rect.height;
      if (!rect.width || !rect.height || !naturalW || !naturalH) return;
      const scale = Math.min(rect.width / naturalW, rect.height / naturalH);
      const drawnW = naturalW * scale;
      const drawnH = naturalH * scale;
      const offsetX = (rect.width - drawnW) / 2;
      const offsetY = (rect.height - drawnH) / 2;
      const x = (e.clientX - rect.left - offsetX) / drawnW;
      const y = (e.clientY - rect.top - offsetY) / drawnH;
      if (x < 0 || y < 0 || x > 1 || y > 1) return;
      browserCommand({ type: "click", x, y });
    };
    img.onwheel = (e) => {
      e.preventDefault();
      browserCommand({ type: "scroll", dy: e.deltaY });
    };
  }
  if (keys) {
    keys.onkeydown = async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      const text = keys.value;
      keys.value = "";
      if (text) await browserCommand({ type: "type", text });
      await browserCommand({ type: "key", key: "Enter" });
    };
  }
}

async function signInWithBrowser() {
  veniceAccount.opening = true;
  veniceAccount.sawLogin = false;
  veniceAccount.webAtOpen = veniceAccount.web;
  veniceAccount.note = "Opening Google.";
  paintVenice();
  showVeniceBrowser(true);
  wireVeniceBrowser();
  watchVeniceBrowser();
  const frameNote = $("#venice-browser-note");
  if (frameNote) {
    delete frameNote.dataset.lock;
    frameNote.textContent = "Opening Google…";
  }
  const wait = $("#venice-frame-wait");
  if (wait) wait.hidden = false;
  try {
    await fetch("/api/venice/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login" }),
    });
  } catch {
    veniceAccount.opening = false;
    veniceAccount.note = "Could not open Google.";
    paintVenice();
    if (frameNote) frameNote.textContent = "Could not open Google. Press Google to try again.";
    return;
  }
  browserCommand({ type: "google" });
  veniceAccount.opening = false;
  paintVenice();
}

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
    if (panel.style.display === "block") refreshVenice();
  };
  const login = $("#venice-login");
  if (login) login.onclick = (e) => {
    e.stopPropagation();
    if (veniceAccount.opening) return;
    signInWithBrowser();
  };
  const webButton = $("#venice-web-save");
  const webToken = $("#venice-web-session");
  const saveWebSession = async () => {
    const token = webToken?.value?.trim() || "";
    if (webButton) webButton.disabled = true;
    try {
      const res = await fetch("/api/venice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "web-session", token }),
      });
      const data = await res.json().catch(() => ({}));
      if (webToken) webToken.value = "";
      if (!res.ok || !data.web) {
        veniceAccount.note = data.message || "Venice rejected that web session.";
        paintVenice();
        return;
      }
      await refreshVenice();
    } catch {
      veniceAccount.note = "Could not reach Venice to check that web session.";
      paintVenice();
    } finally {
      if (webButton) webButton.disabled = false;
    }
  };
  if (webToken) webToken.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      saveWebSession();
    }
  };
  if (webButton) webButton.onclick = (e) => {
    e.stopPropagation();
    saveWebSession();
  };
  paintVenice();
  if (veniceAccount.browserOpen) {
    wireVeniceBrowser();
    watchVeniceBrowser();
  }
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
