/* ============================================================
   Venice Forge — Mobile screen module
   Minimalist phone-first GUI over the REAL window.forge IPC:
   git status, project tree, subagent runs, Venice.ai completions,
   model catalog, and login state. No mock data anywhere.
   Contract: { id, TABS, render(ctx), wire(ctx) } on window.__SCREENS__.
   ============================================================ */
(function () {
  "use strict";

  const id = "mobile";
  const TABS = ["Mobile"];

  /* ---------- module state ---------- */
  const S = {
    view: "home",            // home | runs | studio | chat | settings
    git: null,
    treeCount: 0,
    agents: [],
    models: [],
    modelQuery: "",
    chat: [],                // { role: 'user'|'forge', text }
    chatBusy: false,
    login: null,
    spawnGoal: "",
    spawnModel: "",
  };

  /* ---------- styles (injected once, scoped by .forge-mobile) ---------- */
  const CSS = `
  .forge-mobile { --m-bg:#0b0f19; --m-panel:#10151f; --m-panel2:#161b26; --m-border:#2a3241;
    --m-fg:#f3f4f6; --m-muted:#949eaf; --m-dim:#6b7488; --m-accent:#8175ff; --m-ok:#72ddb8; }
  .forge-mobile { display:flex; flex-direction:column; height:100%; background:var(--m-bg);
    color:var(--m-fg); font-family:Inter,-apple-system,sans-serif; }
  .fm-head { padding:14px 18px 6px; }
  .fm-head h1 { font-size:20px; font-weight:700; letter-spacing:-.02em; margin:0; }
  .fm-head p { font-size:11px; color:var(--m-dim); margin:2px 0 0; }
  .fm-body { flex:1; overflow-y:auto; padding:8px 14px 90px; -webkit-overflow-scrolling:touch; }
  .fm-card { background:var(--m-panel); border:1px solid var(--m-border); border-radius:16px;
    padding:14px; margin-bottom:10px; }
  .fm-row { display:flex; align-items:center; gap:10px; }
  .fm-grow { flex:1; min-width:0; }
  .fm-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--m-dim);
    margin:14px 4px 6px; }
  .fm-chip { display:inline-flex; align-items:center; gap:5px; font-size:11px; padding:4px 10px;
    border-radius:999px; background:var(--m-panel2); border:1px solid var(--m-border); color:var(--m-muted); }
  .fm-dot { width:7px; height:7px; border-radius:50%; background:var(--m-dim); }
  .fm-dot.ok { background:var(--m-ok); } .fm-dot.run { background:var(--m-accent); animation:fm-pulse 1.2s infinite; }
  @keyframes fm-pulse { 50% { opacity:.35; } }
  .fm-btn { border:0; border-radius:12px; padding:10px 16px; font-size:13px; font-weight:600;
    background:var(--m-accent); color:#1b1830; cursor:pointer; }
  .fm-btn.ghost { background:var(--m-panel2); color:var(--m-fg); border:1px solid var(--m-border); }
  .fm-btn:disabled { opacity:.5; cursor:default; }
  .fm-input, .fm-text { width:100%; background:var(--m-panel2); border:1px solid var(--m-border);
    border-radius:12px; color:var(--m-fg); font-size:13px; padding:11px 13px; outline:none; box-sizing:border-box; }
  .fm-input:focus, .fm-text:focus { border-color:var(--m-accent); }
  .fm-text { min-height:70px; resize:vertical; font-family:inherit; }
  .fm-bubble { max-width:85%; padding:10px 13px; border-radius:16px; font-size:13px; line-height:1.5;
    margin-bottom:8px; word-break:break-word; }
  .fm-bubble.user { background:var(--m-accent); color:#1b1830; margin-left:auto; border-bottom-right-radius:5px; }
  .fm-bubble.forge { background:var(--m-panel2); border:1px solid var(--m-border); border-bottom-left-radius:5px; }
  .fm-bubble .fm-link { color:var(--m-accent); text-decoration:underline; cursor:pointer; }
  .fm-item { display:flex; align-items:center; gap:10px; padding:11px 4px; border-bottom:1px solid var(--m-border); }
  .fm-item:last-child { border-bottom:0; }
  .fm-mono { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--m-muted); }
  .fm-tabbar { position:absolute; bottom:0; left:0; right:0; display:flex; justify-content:space-around;
    background:rgba(16,21,31,.94); border-top:1px solid var(--m-border); padding:8px 4px calc(8px + env(safe-area-inset-bottom)); z-index:5; }
  .fm-tab { display:flex; flex-direction:column; align-items:center; gap:2px; background:none; border:0;
    color:var(--m-dim); font-size:9px; padding:4px 10px; cursor:pointer; border-radius:10px; }
  .fm-tab.active { color:var(--m-fg); }
  .fm-tab svg { width:18px; height:18px; }
  .fm-empty { text-align:center; color:var(--m-dim); font-size:12px; padding:26px 10px; }
  `;

  /* ---------- icons (inline SVG, stroke style) ---------- */
  const I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/></svg>',
    runs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/></svg>',
    studio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>',
  };

  /* ---------- small render helpers ---------- */
  function head(title, sub) {
    return `<div class="fm-head"><h1>${title}</h1><p>${sub}</p></div>`;
  }
  function dot(kind) { return `<span class="fm-dot ${kind}"></span>`; }

  /* ---------- views ---------- */

  function homeHtml(ctx) {
    const g = S.git;
    const branch = g?.branch || "no repo";
    const dirty = g?.dirty?.length ?? 0;
    const running = S.agents.filter((a) => a.status === "running").length;
    return `
      ${head("VeniceForge", ctx.state.projectDir ? esc(short(ctx.state.projectDir)) : "No project open")}
      <div class="fm-card">
        <div class="fm-row">
          <div class="fm-grow">
            <div class="fm-row" style="gap:6px">${dot(ctx.state.projectDir ? "ok" : "")}
              <span style="font-size:13px;font-weight:600">${ctx.state.projectDir ? "Project connected" : "Connect a project"}</span></div>
            <div class="fm-mono" style="margin-top:4px">${esc(branch)} · ${S.treeCount} files · ${dirty} changed</div>
          </div>
          <button class="fm-btn ghost" data-fm="open-project">${ctx.state.projectDir ? "Switch" : "Open"}</button>
        </div>
      </div>
      <div class="fm-card">
        <div class="fm-row">
          <div class="fm-grow">
            <div class="fm-row" style="gap:6px">${dot(running ? "run" : "")}
              <span style="font-size:13px;font-weight:600">${running ? running + " run" + (running > 1 ? "s" : "") + " active" : "No active runs"}</span></div>
            <div class="fm-mono" style="margin-top:4px">${S.agents.length} subagent${S.agents.length === 1 ? "" : "s"} total</div>
          </div>
          <button class="fm-btn" data-fm="go-runs">Runs</button>
        </div>
      </div>
      <div class="fm-label">Quick actions</div>
      <div class="fm-card" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px">
        <button class="fm-btn ghost" data-fm="go-chat">Ask Venice</button>
        <button class="fm-btn ghost" data-fm="go-studio">Models</button>
        <button class="fm-btn ghost" data-fm="git-log">Git log</button>
        <button class="fm-btn ghost" data-fm="git-diff">Diff</button>
      </div>
      <div id="fm-homeout"></div>`;
  }

  function runsHtml() {
    let list;
    if (!S.agents.length) {
      list = `<div class="fm-empty">No subagents yet. Spawn one below — it runs through the app's real SubagentManager.</div>`;
    } else {
      list = S.agents.map((a) => `
        <div class="fm-item">
          <div class="fm-grow">
            <div style="font-size:13px">${esc(a.goal || a.id)}</div>
            <div class="fm-mono">${esc(a.model || "")} · ${esc(a.status || "?")}${a.summary ? " · " + esc(a.summary) : ""}</div>
          </div>
          ${a.status === "running" ? `<button class="fm-btn ghost" style="padding:6px 12px;font-size:11px" data-fm-stop="${esc(a.id)}">Stop</button>` : ""}
        </div>`).join("");
    }
    return `
      ${head("Runs", "Subagents via forge.subagents IPC")}
      <div class="fm-card">${list}</div>
      <div class="fm-label">Spawn run</div>
      <div class="fm-card">
        <input class="fm-input" id="fm-goal" placeholder="Goal for the subagent…" value="${esc(S.spawnGoal)}" />
        <input class="fm-input" id="fm-model" placeholder="Model (optional)" value="${esc(S.spawnModel)}" style="margin-top:8px" />
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="fm-btn" data-fm="spawn" style="flex:1">Spawn</button>
          <button class="fm-btn ghost" data-fm="refresh-agents">Refresh</button>
        </div>
      </div>`;
  }

  function studioHtml() {
    const q = S.modelQuery.toLowerCase();
    const models = S.models.filter((m) => !q || String(m.name || m.id || "").toLowerCase().includes(q));
    const list = models.length
      ? models.map((m) => `
          <div class="fm-item">
            <div class="fm-grow">
              <div style="font-size:13px">${esc(m.name || m.id)}</div>
              <div class="fm-mono">${esc(m.id || "")}${m.type ? " · " + esc(m.type) : ""}</div>
            </div>
            <button class="fm-btn ghost" style="padding:6px 12px;font-size:11px" data-fm-open="${esc(m.id || m.name || "")}">Open</button>
          </div>`).join("")
      : `<div class="fm-empty">Loading the Venice.ai model catalog from the app's VeniceBridge…</div>`;
    return `
      ${head("Studio", "Real catalog · opens the official Venice.ai surface")}
      <div class="fm-card">
        <input class="fm-input" id="fm-modelq" placeholder="Filter models…" value="${esc(S.modelQuery)}" />
      </div>
      <div class="fm-card" style="padding:4px 14px">${list}</div>`;
  }

  function chatHtml() {
    const msgs = S.chat.length
      ? S.chat.map((m) => `<div class="fm-bubble ${m.role}">${m.link ? `<span class="fm-link" data-fm-open="${esc(m.link)}">${esc(m.text)}</span>` : esc(m.text)}</div>`).join("")
      : `<div class="fm-empty">Completions run in-app via forge.venice.processCompletion — no HTTP API, no API keys.</div>`;
    return `
      ${head("Chat", "In-app Venice completions")}
      <div id="fm-chatlog" style="display:flex;flex-direction:column">${msgs}</div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input class="fm-input" id="fm-chatin" placeholder="Ask the agent…" style="flex:1" />
        <button class="fm-btn" data-fm="send" ${S.chatBusy ? "disabled" : ""}>Send</button>
      </div>`;
  }

  function settingsHtml() {
    const l = S.login;
    return `
      ${head("Settings", "Live app state")}
      <div class="fm-card">
        <div class="fm-item">
          <div class="fm-grow">
            <div style="font-size:13px">Venice.ai login</div>
            <div class="fm-mono">${l ? (l.loggedIn ? `logged in · ${l.cookieCount} cookies` : `not logged in · ${l.cookieCount} cookies`) : "checking…"}</div>
          </div>
          ${l && l.loggedIn ? dot("ok") : `<button class="fm-btn ghost" style="padding:6px 12px;font-size:11px" data-fm="import-cookies">Import cookies</button>`}
        </div>
        <div class="fm-item">
          <div class="fm-grow">
            <div style="font-size:13px">Project</div>
            <div class="fm-mono">${esc(ctx_short())}</div>
          </div>
          <button class="fm-btn ghost" style="padding:6px 12px;font-size:11px" data-fm="open-project">Open</button>
        </div>
        <div class="fm-item">
          <div class="fm-grow">
            <div style="font-size:13px">Generations</div>
            <div class="fm-mono">In this studio · music models on Music page</div>
          </div>
        </div>
      </div>`;
  }

  function ctx_short() {
    return window.__fmProjectShort || "none";
  }
  const short = (p) => String(p || "").split(/[/\\]/).filter(Boolean).pop() || "project";

  /* ---------- module contract ---------- */

  function render(ctx) {
    if (!document.getElementById("fm-style")) {
      const st = document.createElement("style");
      st.id = "fm-style";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    window.__fmProjectShort = ctx.state.projectDir ? short(ctx.state.projectDir) : "none";
    const views = { home: homeHtml, runs: runsHtml, studio: studioHtml, chat: chatHtml, settings: settingsHtml };
    return `<div class="forge-mobile">${views[S.view](ctx)}
      <div class="fm-tabbar">${[
        ["home", "Home", I.home], ["runs", "Runs", I.runs], ["studio", "Studio", I.studio],
        ["chat", "Chat", I.chat], ["settings", "Settings", I.gear],
      ].map(([v, label, icon]) => `<button class="fm-tab ${S.view === v ? "active" : ""}" data-fm-view="${v}">${icon}<span>${label}</span></button>`).join("")}</div>
    </div>`;
  }

  /* ---------- data loading (real IPC) ---------- */

  async function loadData(ctx) {
    const forge = ctx.forge || window.forge;
    if (!forge) return;
    const dir = ctx.state.projectDir;
    const jobs = [
      forge.git?.status?.(dir).then((g) => { S.git = g; }).catch(() => { S.git = null; }),
      forge.files?.tree?.(dir).then((t) => { S.treeCount = String(t || "").split("\n").filter(Boolean).length; }).catch(() => { S.treeCount = 0; }),
      forge.subagents?.list?.().then((a) => { S.agents = Array.isArray(a) ? a : []; }).catch(() => { S.agents = []; }),
      forge.venice?.models?.().then((m) => { S.models = Array.isArray(m) ? m : []; }).catch(() => { S.models = []; }),
      forge.venice?.loginState?.().then((l) => { S.login = l; }).catch(() => { S.login = null; }),
    ];
    await Promise.allSettled(jobs);
  }

  async function refresh(ctx) {
    await loadData(ctx);
    const mount = document.getElementById("screen");
    if (mount && ctx.state.tab === "Mobile") {
      mount.innerHTML = render(ctx);
      wire(ctx);
    }
  }

  /* ---------- actions ---------- */

  async function spawnAgent(ctx) {
    const forge = ctx.forge || window.forge;
    const goal = (document.getElementById("fm-goal")?.value || "").trim();
    const model = (document.getElementById("fm-model")?.value || "").trim();
    if (!goal) return ctx.notify("Enter a goal first");
    S.spawnGoal = goal; S.spawnModel = model;
    ctx.notify("Spawning subagent…");
    try {
      await forge.subagents.spawn(goal, model || undefined, undefined);
      ctx.notify("Subagent spawned");
    } catch (e) { ctx.notify("Spawn failed: " + (e?.message || e)); }
    await refresh(ctx);
  }

  async function sendChat(ctx) {
    const forge = ctx.forge || window.forge;
    const input = document.getElementById("fm-chatin");
    const text = (input?.value || "").trim();
    if (!text || S.chatBusy) return;
    S.chat.push({ role: "user", text });
    input.value = "";
    S.chatBusy = true;
    rerenderPreserveChat(ctx);
    try {
      const res = await forge.venice.processCompletion(text, undefined);
      const out = typeof res === "string" ? res : (res?.text || res?.summary || res?.output || JSON.stringify(res));
      S.chat.push({ role: "forge", text: String(out).slice(0, 2000) });
    } catch (e) {
      // Offline of the web-app session: hand the task to the Venice.ai chat deep link.
      try {
        const link = await forge.venice.chatLink(text, undefined);
        S.chat.push({ role: "forge", text: "Open this task in the Venice.ai web app, then come back:", link });
      } catch (e2) {
        S.chat.push({ role: "forge", text: "Completion failed: " + (e?.message || e2?.message || e) });
      }
    }
    S.chatBusy = false;
    rerenderPreserveChat(ctx);
  }

  function rerenderPreserveChat(ctx) {
    const mount = document.getElementById("screen");
    if (!mount) return;
    mount.innerHTML = render(ctx);
    wire(ctx);
    const log = document.getElementById("fm-chatlog");
    if (log) log.scrollTop = log.scrollHeight;
  }

  async function openSurface(ctx, modelOrSurface) {
    const forge = ctx.forge || window.forge;
    try {
      const url = await forge.venice.surfaceUrl(modelOrSurface);
      if (url) { await forge.browser.open(url); ctx.notify("Opened " + modelOrSurface); }
    } catch (e) { ctx.notify("Could not open surface: " + (e?.message || e)); }
  }

  /* ---------- wiring ---------- */

  function wire(ctx) {
    const root = document.querySelector(".forge-mobile");
    if (!root) return;

    root.addEventListener("click", async (e) => {
      const viewBtn = e.target.closest("[data-fm-view]");
      if (viewBtn) { S.view = viewBtn.dataset.fmView; mount(ctx); return; }

      const openBtn = e.target.closest("[data-fm-open]");
      if (openBtn) { openSurface(ctx, openBtn.dataset.fmOpen); return; }

      const stopBtn = e.target.closest("[data-fm-stop]");
      if (stopBtn) {
        try { await (ctx.forge || window.forge).subagents.stop(stopBtn.dataset.fmStop); ctx.notify("Stopped"); } catch (err) { ctx.notify("Stop failed"); }
        await refresh(ctx);
        return;
      }

      switch (e.target.closest("[data-fm]")?.dataset.fm) {
        case "go-runs": S.view = "runs"; mount(ctx); break;
        case "go-chat": S.view = "chat"; mount(ctx); break;
        case "go-studio": S.view = "studio"; mount(ctx); break;
        case "open-project": await ctx.openProject(); await refresh(ctx); break;
        case "spawn": await spawnAgent(ctx); break;
        case "refresh-agents": await refresh(ctx); break;
        case "send": await sendChat(ctx); break;
        case "import-cookies": {
          try {
            const r = await (ctx.forge || window.forge).venice.importCookies();
            ctx.notify(`Imported ${r.imported}/${r.totalFound} cookies`);
          } catch { ctx.notify("Cookie import failed"); }
          await refresh(ctx);
          break;
        }
        case "git-log": {
          const out = document.getElementById("fm-homeout");
          if (out && ctx.state.projectDir) {
            const log = await (ctx.forge || window.forge).git.log(ctx.state.projectDir, 8);
            out.innerHTML = `<div class="fm-card">${log.length ? log.map((c) => `<div class="fm-item"><div class="fm-grow"><div style="font-size:12px">${esc(c.message)}</div><div class="fm-mono">${esc(c.hash?.slice(0, 8))} · ${esc(c.date?.slice(0, 10))}</div></div></div>`).join("") : '<div class="fm-empty">No commits yet</div>'}</div>`;
          } else if (out) out.innerHTML = `<div class="fm-card"><div class="fm-empty">Open a project first</div></div>`;
          break;
        }
        case "git-diff": {
          const out = document.getElementById("fm-homeout");
          if (out && ctx.state.projectDir) {
            const d = await (ctx.forge || window.forge).git.diff(ctx.state.projectDir);
            out.innerHTML = `<div class="fm-card"><pre class="fm-mono" style="white-space:pre-wrap;max-height:260px;overflow:auto">${esc(d || "No uncommitted changes")}</pre></div>`;
          } else if (out) out.innerHTML = `<div class="fm-card"><div class="fm-empty">Open a project first</div></div>`;
          break;
        }
      }
    });

    const chatIn = document.getElementById("fm-chatin");
    if (chatIn) chatIn.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendChat(ctx); } });
    const modelQ = document.getElementById("fm-modelq");
    if (modelQ) modelQ.addEventListener("input", () => { S.modelQuery = modelQ.value; rerenderPreserveChat(ctx); const q2 = document.getElementById("fm-modelq"); if (q2) { q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); } });
  }

  function mount(ctx) {
    const m = document.getElementById("screen");
    if (!m) return;
    m.innerHTML = render(ctx);
    wire(ctx);
    refresh(ctx); // background refresh of real data
  }

  /* ---------- registration ---------- */
  if (typeof window !== "undefined") {
    window.__SCREENS__ = window.__SCREENS__ || [];
    if (!window.__SCREENS__.some((m) => m && m.id === "mobile")) {
      window.__SCREENS__.push({ id, TABS, render, wire });
    }
  }
})();
