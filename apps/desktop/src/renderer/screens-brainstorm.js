/* ============================================================
   Venice Forge — Brainstorm
   A CrewAI room: Spark, Skeptic, Maker, Chair.
   Classic-script module. Registers on window.__SCREENS__.
   ============================================================ */
(function () {
  "use strict";

  const STORAGE = "forge.brainstorm.v1";
  const ROLES = {
    storm: ["Spark", "Skeptic", "Maker", "Chair"],
    deepen: ["Expander", "Skeptic", "Maker", "Chair"],
    combine: ["Weaver", "Skeptic", "Maker", "Chair"],
  };
  const ROLE_LINE = {
    Spark: "Opens the field. No critique.",
    Expander: "Branches one concept into different builds.",
    Weaver: "Fuses the ideas you starred.",
    Skeptic: "Cuts slogans and names the fatal assumption.",
    Maker: "Turns survivors into something you can start.",
    Chair: "Ranks the board and picks the next action.",
  };

  const esc = (s) => String(s ?? "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;");

  const store = {
    ctx: null,
    mode: "storm",
    heat: "bold",
    count: 6,
    topic: "",
    audience: "",
    constraints: "",
    seeds: "",
    focus: "",
    running: false,
    status: "The room is empty.",
    error: "",
    roles: ROLES.storm,
    agents: {},
    openAgent: "",
    board: null,
    stars: {},
    dropped: {},
    sessions: loadSessions(),
    activeId: null,
    abort: null,
  };

  function loadSessions() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE) || "[]");
      return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
    } catch {
      return [];
    }
  }

  function saveSessions() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(store.sessions.slice(0, 12)));
    } catch { /* quota — the board is still on screen */ }
  }

  function html() {
    return `
      <div class="storm">
        <form class="storm-brief" id="storm-form">
          <div class="storm-kicker">CrewAI</div>
          <h1 class="storm-title">Brainstorm</h1>
          <p class="storm-lead">Four seats, one brief. Each seat is a real crew, and nothing is filled in until that seat answers.</p>
          <div class="field-label">Mode</div>
          <div class="agent-mode-row" role="group" aria-label="Mode">
            ${chip("mode", "storm", "Storm")}
            ${chip("mode", "deepen", "Deepen")}
            ${chip("mode", "combine", "Combine")}
          </div>
          <label class="field-label" for="storm-topic">Brief</label>
          <textarea class="agent-input" id="storm-topic" maxlength="4000" placeholder="What are we trying to invent, and what does done look like?">${esc(store.topic)}</textarea>
          <label class="field-label" for="storm-audience">Who it's for</label>
          <input class="storm-input" id="storm-audience" maxlength="240" value="${esc(store.audience)}" placeholder="A person, not a market segment" />
          <label class="field-label" for="storm-constraints">Constraints</label>
          <textarea class="agent-input storm-short" id="storm-constraints" maxlength="1500" placeholder="Time, money, things that are off the table">${esc(store.constraints)}</textarea>
          <label class="field-label" for="storm-seeds">Seeds</label>
          <textarea class="agent-input storm-short" id="storm-seeds" maxlength="2500" placeholder="Ideas already on the table">${esc(store.seeds)}</textarea>
          <div class="field-label">Heat</div>
          <div class="agent-mode-row" role="group" aria-label="Heat">
            ${chip("heat", "grounded", "Grounded")}
            ${chip("heat", "bold", "Bold")}
            ${chip("heat", "unhinged", "Wild")}
          </div>
          <div class="field-label">How many</div>
          <div class="agent-mode-row" role="group" aria-label="How many ideas">
            ${chip("count", "4", "4")}
            ${chip("count", "6", "6")}
            ${chip("count", "8", "8")}
          </div>
          <button class="btn-primary storm-go" id="storm-run" type="submit">${store.running ? "Crew is working…" : "Run the crew"}</button>
          <button class="btn-ghost" id="storm-stop" type="button" ${store.running ? "" : "disabled"}>Stop after this seat</button>
        </form>
        <section class="storm-stage" id="storm-stage" aria-live="polite"></section>
        <aside class="storm-rail" id="storm-rail"></aside>
      </div>`;
  }

  function chip(group, value, label) {
    const current = group === "count" ? String(store.count) : store[group];
    const active = current === value ? " active" : "";
    return `<button type="button" class="mode-chip${active}" data-${group}="${esc(value)}">${esc(label)}</button>`;
  }

  function stageHtml() {
    const roles = store.roles.length ? store.roles : ROLES[store.mode];
    const seats = roles.map((role) => {
      const agent = store.agents[role] || { status: "idle", text: "" };
      const state = agent.status || "idle";
      return `
        <article class="storm-seat is-${state}${store.openAgent === role ? " is-open" : ""}">
          <button type="button" class="storm-seat-hit" data-seat="${esc(role)}">
            <span class="storm-seat-name">${esc(role)}</span>
            <span class="storm-seat-state">${esc(seatState(state))}</span>
          </button>
          <p class="storm-seat-line">${esc(ROLE_LINE[role] || "")}</p>
          ${agent.text && store.openAgent === role ? `<pre class="storm-seat-text">${esc(agent.text)}</pre>` : ""}
        </article>`;
    }).join("");

    let board = "";
    if (store.board) {
      const ideas = store.board.ideas.filter((idea) => !store.dropped[idea.id]);
      board = `
        <div class="storm-board-head">
          <div>
            <div class="storm-kicker">Board</div>
            <h2 class="storm-board-title">${esc(store.board.title)}</h2>
            ${store.board.thesis ? `<p class="storm-thesis">${esc(store.board.thesis)}</p>` : ""}
          </div>
          <button type="button" class="btn-ghost storm-inline" id="storm-export">Export</button>
        </div>
        <div class="storm-cards">
          ${ideas.map((idea) => cardHtml(idea)).join("") || `<p class="storm-empty">Every card on this board was dropped.</p>`}
        </div>
        ${extrasHtml()}`;
    } else if (!store.running && !store.error) {
      board = `
        <div class="storm-empty-block">
          <h2>A brief goes in. A ranked board comes out.</h2>
          <ol>
            <li>Spark writes raw ideas and is not allowed to judge them.</li>
            <li>Skeptic cuts anything that is only a slogan.</li>
            <li>Maker turns what's left into a first step you could take today.</li>
            <li>Chair scores the board and names one next action.</li>
          </ol>
        </div>`;
    }

    return `
      <div class="storm-status-row">
        <span class="storm-live${store.running ? " on" : ""}" aria-hidden="true"></span>
        <p id="storm-status">${esc(store.error || store.status)}</p>
      </div>
      <div class="storm-seats">${seats}</div>
      ${board}`;
  }

  function seatState(state) {
    if (state === "run") return "Speaking";
    if (state === "done") return "Done";
    if (state === "error") return "Stopped";
    return "Waiting";
  }

  function cardHtml(idea) {
    const starred = !!store.stars[idea.id];
    return `
      <article class="storm-card">
        <header>
          <h3>${esc(idea.title)}</h3>
          ${idea.score ? `<span class="storm-score">${esc(idea.score)}</span>` : ""}
        </header>
        ${idea.pitch ? `<p>${esc(idea.pitch)}</p>` : ""}
        ${idea.how ? `<p class="storm-how">${esc(idea.how)}</p>` : ""}
        ${idea.firstStep ? `<p class="storm-step"><span>First step</span> ${esc(idea.firstStep)}</p>` : ""}
        ${idea.risk ? `<p class="storm-risk"><span>Risk</span> ${esc(idea.risk)}</p>` : ""}
        ${idea.tags && idea.tags.length ? `<p class="storm-tags">${idea.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</p>` : ""}
        <div class="storm-card-actions">
          <button type="button" data-star="${esc(idea.id)}">${starred ? "Starred" : "Star"}</button>
          <button type="button" data-deepen="${esc(idea.id)}">Deepen</button>
          <button type="button" data-drop="${esc(idea.id)}">Drop</button>
          <button type="button" data-copy="${esc(idea.id)}">Copy</button>
        </div>
      </article>`;
  }

  function extrasHtml() {
    const board = store.board;
    if (!board) return "";
    const killed = (board.killed || []).slice(0, 5);
    const questions = (board.questions || []).slice(0, 5);
    if (!killed.length && !questions.length && !board.next) return "";
    return `
      <div class="storm-extras">
        ${board.next ? `<p class="storm-next"><span>Next</span> ${esc(board.next)}</p>` : ""}
        ${questions.length ? `<div><h3>Still open</h3><ul>${questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>` : ""}
        ${killed.length ? `<div><h3>Cut</h3><ul>${killed.map((k) => `<li><strong>${esc(k.title)}</strong> ${esc(k.why || "")}</li>`).join("")}</ul></div>` : ""}
      </div>`;
  }

  function railHtml() {
    const starred = starredIdeas();
    return `
      <div class="panel-head"><span class="panel-title">Sessions</span></div>
      <div class="storm-rail-body">
        <button type="button" class="btn-ghost" id="storm-new">New brief</button>
        <button type="button" class="btn-ghost" id="storm-combine" ${starred.length >= 2 ? "" : "disabled"}>Combine ${starred.length >= 2 ? starred.length + " starred" : "starred"}</button>
        <div class="field-label">Recent</div>
        ${store.sessions.length ? store.sessions.map((s) => `
          <button type="button" class="storm-session${s.id === store.activeId ? " active" : ""}" data-session="${esc(s.id)}">
            <span>${esc(s.title || "Untitled session")}</span>
            <small>${esc(when(s.createdAt))}</small>
          </button>`).join("") : `<p class="storm-rail-empty">Finished boards stay on this machine.</p>`}
      </div>`;
  }

  function when(ts) {
    try {
      return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function paint() {
    const stage = document.querySelector("#storm-stage");
    const rail = document.querySelector("#storm-rail");
    const run = document.querySelector("#storm-run");
    const stop = document.querySelector("#storm-stop");
    if (stage) stage.innerHTML = stageHtml();
    if (rail) rail.innerHTML = railHtml();
    if (run) {
      run.disabled = store.running;
      run.textContent = store.running ? "Crew is working…" : "Run the crew";
    }
    if (stop) stop.disabled = !store.running;
    bindStage();
    bindRail();
  }

  function wire(ctx) {
    store.ctx = ctx;
    const form = document.querySelector("#storm-form");
    if (!form) return;
    form.onsubmit = (e) => { e.preventDefault(); start(); };
    bindField("#storm-topic", "topic");
    bindField("#storm-audience", "audience");
    bindField("#storm-constraints", "constraints");
    bindField("#storm-seeds", "seeds");
    form.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => {
      store.mode = b.dataset.mode;
      store.roles = ROLES[store.mode];
      syncChips();
    });
    form.querySelectorAll("[data-heat]").forEach((b) => b.onclick = () => { store.heat = b.dataset.heat; syncChips(); });
    form.querySelectorAll("[data-count]").forEach((b) => b.onclick = () => { store.count = Number(b.dataset.count); syncChips(); });
    const stop = document.querySelector("#storm-stop");
    if (stop) stop.onclick = () => halt();
    paint();
  }

  function bindField(sel, key) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.oninput = () => { store[key] = el.value; };
  }

  function syncChips() {
    document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === store.mode));
    document.querySelectorAll("[data-heat]").forEach((b) => b.classList.toggle("active", b.dataset.heat === store.heat));
    document.querySelectorAll("[data-count]").forEach((b) => b.classList.toggle("active", Number(b.dataset.count) === store.count));
  }

  function bindStage() {
    document.querySelectorAll("[data-seat]").forEach((b) => b.onclick = () => {
      store.openAgent = store.openAgent === b.dataset.seat ? "" : b.dataset.seat;
      paint();
    });
    document.querySelectorAll("[data-star]").forEach((b) => b.onclick = () => {
      const id = b.dataset.star;
      if (store.stars[id]) delete store.stars[id];
      else store.stars[id] = true;
      paint();
    });
    document.querySelectorAll("[data-drop]").forEach((b) => b.onclick = () => {
      store.dropped[b.dataset.drop] = true;
      paint();
    });
    document.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => copyIdea(b.dataset.copy));
    document.querySelectorAll("[data-deepen]").forEach((b) => b.onclick = () => prepareDeepen(b.dataset.deepen));
    const exp = document.querySelector("#storm-export");
    if (exp) exp.onclick = exportBoard;
  }

  function bindRail() {
    const neu = document.querySelector("#storm-new");
    if (neu) neu.onclick = () => resetBrief();
    const combine = document.querySelector("#storm-combine");
    if (combine) combine.onclick = prepareCombine;
    document.querySelectorAll("[data-session]").forEach((b) => b.onclick = () => openSession(b.dataset.session));
  }

  function starredIdeas() {
    const ideas = store.board ? store.board.ideas : [];
    return ideas.filter((idea) => store.stars[idea.id] && !store.dropped[idea.id]);
  }

  function prepareDeepen(id) {
    const idea = (store.board?.ideas || []).find((item) => item.id === id);
    if (!idea) return;
    store.mode = "deepen";
    store.focus = [idea.title, idea.pitch, idea.how].filter(Boolean).join("\n");
    store.topic = store.topic || idea.title;
    store.status = "Deepen is loaded. Run the crew when you want the branches.";
    store.error = "";
    remount();
  }

  function prepareCombine() {
    const ideas = starredIdeas();
    if (ideas.length < 2) return;
    store.mode = "combine";
    store.seeds = ideas.map((idea) => `${idea.title}: ${idea.pitch}`).join("\n");
    store.status = "Those starred ideas are the seeds. Run the crew to fuse them.";
    store.error = "";
    remount();
  }

  function resetBrief() {
    if (store.running) return;
    store.topic = "";
    store.audience = "";
    store.constraints = "";
    store.seeds = "";
    store.focus = "";
    store.mode = "storm";
    store.board = null;
    store.agents = {};
    store.stars = {};
    store.dropped = {};
    store.error = "";
    store.activeId = null;
    store.roles = ROLES.storm;
    store.status = "The room is empty.";
    remount();
  }

  function openSession(id) {
    if (store.running) return;
    const session = store.sessions.find((s) => s.id === id);
    if (!session) return;
    store.activeId = id;
    store.topic = session.topic || "";
    store.audience = session.audience || "";
    store.constraints = session.constraints || "";
    store.seeds = session.seeds || "";
    store.focus = session.focus || "";
    store.mode = session.mode || "storm";
    store.heat = session.heat || "bold";
    store.count = session.count || 6;
    store.board = session.board || null;
    store.agents = session.agents || {};
    store.stars = session.stars || {};
    store.dropped = session.dropped || {};
    store.roles = Object.keys(store.agents).length ? Object.keys(store.agents) : ROLES[store.mode];
    store.error = "";
    store.status = "Saved session.";
    remount();
  }

  function remount() {
    const mount = document.querySelector("#screen");
    if (!mount || !store.ctx || store.ctx.state.tab !== "Brainstorm") return;
    mount.innerHTML = html();
    wire(store.ctx);
  }

  async function start() {
    if (store.running) return;
    readForm();
    if (store.topic.trim().length < 8) {
      store.error = "Give the crew a brief of at least a sentence.";
      store.status = "";
      paint();
      return;
    }
    store.running = true;
    store.error = "";
    store.board = null;
    store.stars = {};
    store.dropped = {};
    store.roles = ROLES[store.mode] || ROLES.storm;
    store.agents = {};
    store.openAgent = "";
    store.status = "Calling the crew…";
    store.activeId = null;
    paint();

    const payload = {
      topic: store.topic.trim(),
      audience: store.audience.trim(),
      constraints: store.constraints.trim(),
      seeds: store.seeds.trim(),
      focus: store.focus.trim(),
      mode: store.mode,
      heat: store.heat,
      count: store.count,
    };
    const controller = new AbortController();
    store.abort = controller;
    try {
      await stream(payload, onEvent, controller.signal);
    } catch (err) {
      if (err && err.name === "AbortError") {
        store.status = "Stopped. Seats that already spoke stay on the board.";
      } else {
        store.error = (err && err.message) || "The crew did not finish.";
        store.status = "";
      }
    } finally {
      store.running = false;
      store.abort = null;
      paint();
    }
  }

  function readForm() {
    const topic = document.querySelector("#storm-topic");
    const audience = document.querySelector("#storm-audience");
    const constraints = document.querySelector("#storm-constraints");
    const seeds = document.querySelector("#storm-seeds");
    if (topic) store.topic = topic.value;
    if (audience) store.audience = audience.value;
    if (constraints) store.constraints = constraints.value;
    if (seeds) store.seeds = seeds.value;
  }

  function onEvent(event) {
    if (!event || typeof event !== "object") return;
    if (event.type === "start" && Array.isArray(event.roles)) {
      store.roles = event.roles;
      store.status = event.roles[0] + " is up.";
    } else if (event.type === "agent_start") {
      store.agents[event.role] = { status: "run", text: "" };
      store.openAgent = event.role;
      store.status = event.role + " is speaking.";
    } else if (event.type === "agent_done") {
      store.agents[event.role] = { status: "done", text: event.text || "" };
      store.status = event.role + " is done.";
    } else if (event.type === "board" || event.type === "done") {
      if (event.board) {
        store.board = event.board;
        store.status = "Board is in.";
        remember();
      }
    } else if (event.type === "stopped") {
      store.status = "Stopped between seats.";
    } else if (event.type === "error") {
      store.error = event.message || "The crew failed.";
      if (event.role && store.agents[event.role]) store.agents[event.role].status = "error";
      store.status = "";
    }
    paint();
  }

  function remember() {
    const id = store.activeId || ("b_" + Date.now().toString(36));
    store.activeId = id;
    const session = {
      id,
      createdAt: Date.now(),
      title: (store.board && store.board.title) || store.topic.slice(0, 80),
      topic: store.topic,
      audience: store.audience,
      constraints: store.constraints,
      seeds: store.seeds,
      focus: store.focus,
      mode: store.mode,
      heat: store.heat,
      count: store.count,
      board: store.board,
      agents: store.agents,
      stars: store.stars,
      dropped: store.dropped,
    };
    store.sessions = [session, ...store.sessions.filter((s) => s.id !== id)].slice(0, 12);
    saveSessions();
  }

  async function stream(payload, onEvent, signal) {
    const forge = window.forge && window.forge.brainstorm;
    if (forge && typeof forge.run === "function") {
      const off = forge.onEvent ? forge.onEvent(onEvent) : () => {};
      try {
        const finalEvent = await forge.run(payload);
        if (finalEvent && finalEvent.type) onEvent(finalEvent);
      } finally {
        if (typeof off === "function") off();
      }
      return;
    }
    const res = await fetch("/api/brainstorm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok || !res.body) {
      let message = "The crew did not start.";
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch { /* keep the fallback */ }
      throw new Error(message);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      buf = buf.replace(/\r\n/g, "\n");
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const packet = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const data = packet.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
        if (!data) continue;
        try { onEvent(JSON.parse(data)); } catch { /* ignore a partial frame */ }
      }
    }
  }

  function halt() {
    if (store.abort) store.abort.abort();
    const forge = window.forge && window.forge.brainstorm;
    if (forge && typeof forge.stop === "function") forge.stop();
    fetch("/api/brainstorm/stop", { method: "POST" }).catch(() => {});
    store.status = "Stopping after the seat that is speaking.";
    paint();
  }

  function ideaById(id) {
    return (store.board?.ideas || []).find((idea) => idea.id === id);
  }

  function copyIdea(id) {
    const idea = ideaById(id);
    if (!idea) return;
    const text = [idea.title, idea.pitch, idea.how, idea.firstStep ? "First step: " + idea.firstStep : ""].filter(Boolean).join("\n\n");
    copyText(text);
  }

  function exportBoard() {
    if (!store.board) return;
    const lines = ["# " + store.board.title, "", store.board.thesis, ""];
    store.board.ideas.forEach((idea, i) => {
      if (store.dropped[idea.id]) return;
      lines.push(`## ${i + 1}. ${idea.title}${idea.score ? " (" + idea.score + ")" : ""}`, "", idea.pitch, "", idea.how, "", idea.firstStep ? "First step: " + idea.firstStep : "", idea.risk ? "Risk: " + idea.risk : "", "");
    });
    if (store.board.next) lines.push("Next: " + store.board.next, "");
    const blob = new Blob([lines.filter((l) => l !== undefined).join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (store.board.title || "brainstorm").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => notify("Copied"), () => notify("Could not copy"));
    }
  }

  function notify(msg) {
    if (store.ctx && store.ctx.notify) store.ctx.notify(msg);
  }

  function render(ctx) {
    store.ctx = ctx;
    return html();
  }

  window.__SCREENS__ = window.__SCREENS__ || [];
  window.__SCREENS__.push({ id: "brainstorm", TABS: ["Brainstorm"], render, wire });
})();
