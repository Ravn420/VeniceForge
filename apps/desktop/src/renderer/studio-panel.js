/* In-app generation. Never opens venice.ai. Music models are not offered here. */
(function () {
  "use strict";

  const studios = {};
  const esc = (s) => String(s ?? "").replace(/&/g, "\u0026amp;").replace(/</g, "\u0026lt;").replace(/>/g, "\u0026gt;").replace(/"/g, "\u0026quot;");

  function slot(id) {
    if (!studios[id]) {
      studios[id] = {
        models: [], modelId: "", query: "", prompt: "", aspect: "", duration: "", resolution: "",
        busy: false, status: "Loading Venice models…", tone: "", messages: [], resultUrl: "",
      };
    }
    return studios[id];
  }

  function current(st) {
    return st.models.find((m) => m.id === st.modelId) || null;
  }

  function render(opts) {
    const st = slot(opts.id);
    const model = current(st);
    const result = opts.result;
    return `
      <div class="music-studio" id="${esc(opts.id)}-root">
        <section class="music-stage">
          <div class="panel-head">
            <span class="panel-title">${esc(opts.title)}</span>
            <span class="music-live" id="${esc(opts.id)}-live">${st.models.length ? esc(st.models.length + " models") : "In Venice Forge"}</span>
          </div>
          <div class="gen-stage">
            <div class="gen-canvas${st.busy ? " is-busy" : ""}" id="${esc(opts.id)}-frame">
            <img id="${esc(opts.id)}-img" alt="" hidden />
            <video id="${esc(opts.id)}-video" controls playsinline hidden></video>
            <audio id="${esc(opts.id)}-audio" controls hidden></audio>
            <div class="gen-log" id="${esc(opts.id)}-log" hidden></div>
            <div class="music-empty" id="${esc(opts.id)}-empty">
              <div class="big">${esc(opts.emptyTitle || "Nothing generated yet")}</div>
              <p class="sub" id="${esc(opts.id)}-status">${esc(st.status)}</p>
            </div>
            </div>
          </div>
        </section>
        <aside class="inspector music-controls">
          <div class="panel-head"><span class="panel-title">Model</span></div>
          <div class="inspector-scroll">
            <div class="field-label">Venice model</div>
            <div class="select-box">
              <span id="${esc(opts.id)}-model-label">${model ? esc(model.name) : "Loading models…"}</span>
              <span aria-hidden="true">⌄</span>
              <select id="${esc(opts.id)}-model" aria-label="${esc(opts.title)} model"></select>
            </div>
            <input class="model-filter" id="${esc(opts.id)}-filter" type="search" placeholder="Filter models" value="${esc(st.query)}" hidden />
            <p class="music-desc" id="${esc(opts.id)}-desc">${model ? esc(model.description || "") : ""}</p>
            <div id="${esc(opts.id)}-aspect-wrap" hidden>
              <div class="field-label">Aspect</div>
              <div class="select-box">
                <span id="${esc(opts.id)}-aspect-label">${esc(st.aspect || "1:1")}</span>
                <span aria-hidden="true">⌄</span>
                <select id="${esc(opts.id)}-aspect" aria-label="Aspect ratio"></select>
              </div>
            </div>
            <div id="${esc(opts.id)}-duration-wrap" hidden>
              <div class="field-label">Duration</div>
              <div class="select-box">
                <span id="${esc(opts.id)}-duration-label">${esc(st.duration || "")}</span>
                <span aria-hidden="true">⌄</span>
                <select id="${esc(opts.id)}-duration" aria-label="Duration"></select>
              </div>
            </div>
            <div id="${esc(opts.id)}-resolution-wrap" hidden>
              <div class="field-label">Resolution</div>
              <div class="select-box">
                <span id="${esc(opts.id)}-resolution-label">${esc(st.resolution || "")}</span>
                <span aria-hidden="true">⌄</span>
                <select id="${esc(opts.id)}-resolution" aria-label="Resolution"></select>
              </div>
            </div>
            <div class="field-label">${esc(opts.promptLabel || "Prompt")}</div>
            <textarea id="${esc(opts.id)}-prompt" class="agent-input" placeholder="${esc(opts.placeholder || "")}">${esc(st.prompt)}</textarea>
            <div class="music-hint" id="${esc(opts.id)}-hint"></div>
          </div>
          <div class="music-go-bar">
            <button class="btn-primary" id="${esc(opts.id)}-go" type="button" disabled>Generate</button>
            <p class="music-foot">${esc(opts.foot || "Runs in Venice Forge.")}</p>
          </div>
        </aside>
      </div>`;
  }

  function paintLog(opts) {
    const st = slot(opts.id);
    const log = document.getElementById(opts.id + "-log");
    if (!log) return;
    log.hidden = false;
    log.innerHTML = st.messages.map((m) => `
      <div class="gen-msg ${esc(m.role)}">
        <div class="who">${m.role === "user" ? "You" : esc(m.who || "Venice Forge")}</div>
        <div>${esc(m.text)}</div>
      </div>`).join("");
    log.scrollTop = log.scrollHeight;
  }

  function visibleModels(st) {
    const q = st.query.trim().toLowerCase();
    if (!q) return st.models;
    return st.models.filter((m) => m.id === st.modelId || (m.name || "").toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }

  function fillModels(opts) {
    const st = slot(opts.id);
    const select = document.getElementById(opts.id + "-model");
    const filter = document.getElementById(opts.id + "-filter");
    if (filter) filter.hidden = st.models.length < 12;
    if (!select) return;
    const models = visibleModels(st);
    const sig = models.map((m) => m.id).join("\n");
    if (select.dataset.sig !== sig) {
      select.dataset.sig = sig;
      select.innerHTML = models.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
    }
    if (st.modelId && models.some((m) => m.id === st.modelId)) select.value = st.modelId;
  }

  function sync(opts) {
    const st = slot(opts.id);
    const model = current(st);
    const label = document.getElementById(opts.id + "-model-label");
    const desc = document.getElementById(opts.id + "-desc");
    const live = document.getElementById(opts.id + "-live");
    const hint = document.getElementById(opts.id + "-hint");
    const go = document.getElementById(opts.id + "-go");
    const status = document.getElementById(opts.id + "-status");
    if (label) label.textContent = model ? model.name : (st.models.length ? "Choose a model" : "Loading models…");
    if (desc) {
      desc.textContent = model?.description || "";
      desc.hidden = !model?.description;
    }
    if (live) {
      const shown = visibleModels(st).length;
      live.textContent = !st.models.length
        ? "In Venice Forge"
        : (shown === st.models.length ? `${st.models.length} models` : `${shown} of ${st.models.length}`);
    }
    const prompt = st.prompt.trim();
    const min = model?.minPromptLength || 1;
    const max = model?.promptCharacterLimit || 0;
    const promptOk = model && prompt.length >= min && (!max || prompt.length <= max);
    if (hint) hint.textContent = model ? `${prompt.length}${max ? "/" + max : ""}` : "";
    if (go) {
      go.disabled = st.busy || !promptOk;
      go.textContent = st.busy ? "Generating…" : (opts.button || "Generate");
    }
    if (status && !st.busy) {
      status.textContent = st.status;
      status.className = "sub" + (st.tone ? " " + st.tone : "");
    }
    if (opts.result === "text") {
      const empty = document.getElementById(opts.id + "-empty");
      const log = document.getElementById(opts.id + "-log");
      const has = st.messages.length > 0;
      if (empty) empty.hidden = has;
      if (log) log.hidden = !has;
    }
    const frame = document.getElementById(opts.id + "-frame");
    if (frame) frame.classList.toggle("is-busy", !!st.busy);
    fillModels(opts);
    fillChoice(opts.id, "aspect", model?.aspects || [], st, "aspect");
    fillChoice(opts.id, "duration", (model?.durations || []).map((d) => d.value), st, "duration", model?.durations || []);
    fillChoice(opts.id, "resolution", model?.resolutions || [], st, "resolution");
  }

  function fillChoice(id, key, values, st, field, labeled) {
    const wrap = document.getElementById(id + "-" + key + "-wrap");
    const select = document.getElementById(id + "-" + key);
    const label = document.getElementById(id + "-" + key + "-label");
    if (!wrap || !select) return;
    if (!values.length) {
      wrap.hidden = true;
      st[field] = "";
      return;
    }
    wrap.hidden = false;
    if (!values.includes(st[field])) st[field] = values[0];
    const sig = values.join("\n");
    if (select.dataset.sig !== sig) {
      select.dataset.sig = sig;
      select.innerHTML = values.map((value) => {
        const item = labeled && labeled.find((d) => d.value === value);
        const text = item?.label || value;
        return `<option value="${esc(value)}">${esc(text)}</option>`;
      }).join("");
    }
    select.value = st[field];
    if (label) label.textContent = (labeled && labeled.find((d) => d.value === st[field])?.label) || st[field];
  }

  async function ensure(opts) {
    const st = slot(opts.id);
    if (st.models.length) return st.models;
    if (st.inflight) return st.inflight;
    st.inflight = fetch("/api/studio/models?kind=" + encodeURIComponent(opts.kind))
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data.models) || !data.models.length) {
          throw new Error(data.message || data.error || "Venice did not return models for this page.");
        }
        st.models = data.models;
        if (!st.models.some((m) => m.id === st.modelId)) st.modelId = st.models[0].id;
        const model = current(st);
        st.aspect = model?.defaultAspect || model?.aspects?.[0] || "";
        st.duration = model?.defaultDuration || model?.durations?.[0]?.value || "";
        st.resolution = model?.defaultResolution || model?.resolutions?.[0] || "";
        st.status = opts.ready || "Write a prompt. Generate stays in Venice Forge.";
        st.tone = "";
        return st.models;
      })
      .catch((err) => {
        st.status = err.message || "Could not load models.";
        st.tone = "error";
        return [];
      })
      .finally(() => { st.inflight = null; });
    return st.inflight;
  }

  function showMedia(opts, url, type) {
    const st = slot(opts.id);
    const empty = document.getElementById(opts.id + "-empty");
    const img = document.getElementById(opts.id + "-img");
    const video = document.getElementById(opts.id + "-video");
    const audio = document.getElementById(opts.id + "-audio");
    if (empty) empty.hidden = true;
    if (img) img.hidden = type !== "image";
    if (video) video.hidden = type !== "video";
    if (audio) audio.hidden = type !== "audio";
    const el = type === "image" ? img : type === "video" ? video : audio;
    if (!el) return;
    if (st.resultUrl && st.resultUrl !== url) URL.revokeObjectURL(st.resultUrl);
    st.resultUrl = url;
    el.src = url;
    el.hidden = false;
    if (type !== "image") el.play?.().catch(() => {});
  }

  async function generate(opts) {
    const st = slot(opts.id);
    const model = current(st);
    if (!model || st.busy) return;
    const token = (st.token = (st.token || 0) + 1);
    st.busy = true;
    st.tone = "";
    st.status = `Generating with ${model.name}…`;
    const status = document.getElementById(opts.id + "-status");
    const empty = document.getElementById(opts.id + "-empty");
    if (opts.result !== "text" && empty) empty.hidden = false;
    if (status) status.textContent = st.status;
    sync(opts);
    const payload = {
      kind: opts.kind,
      modelId: model.id,
      prompt: st.prompt.trim(),
      aspectRatio: st.aspect,
      duration: st.duration,
      resolution: st.resolution,
    };
    if (opts.result === "text") {
      st.messages.push({ role: "user", text: st.prompt.trim() });
      payload.messages = st.messages.slice(0, -1).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
      st.prompt = "";
      const box = document.getElementById(opts.id + "-prompt");
      if (box) box.value = "";
      paintLog(opts);
    }
    try {
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (token !== st.token) return;
      const type = res.headers.get("content-type") || "";
      if (type.includes("json")) {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.text) {
          const message = json.message || json.error || "Venice did not return a result.";
          st.status = message;
          st.tone = "error";
          if (opts.result === "text") st.messages.push({ role: "assistant", text: message, who: "Venice" });
        } else if (opts.result === "text") {
          st.messages.push({ role: "assistant", text: json.text, who: json.modelName || model.name });
          st.status = "Reply is in the studio.";
          st.tone = "";
        } else {
          st.status = json.message || "Venice did not return media.";
          st.tone = "error";
        }
      } else if (!res.ok) {
        st.status = "Venice refused this generation.";
        st.tone = "error";
      } else {
        const blob = await res.blob();
        if (token !== st.token) return;
        const url = URL.createObjectURL(blob);
        const media = opts.result === "video" ? "video" : opts.result === "audio" ? "audio" : "image";
        showMedia(opts, url, media);
        st.status = `${model.name} finished inside Venice Forge.`;
        st.tone = "";
      }
    } catch (err) {
      if (token !== st.token) return;
      st.status = err?.message || "Could not reach Venice.";
      st.tone = "error";
      if (opts.result === "text") st.messages.push({ role: "assistant", text: st.status, who: "Venice" });
    }
    st.busy = false;
    if (!document.getElementById(opts.id + "-root")) return;
    if (opts.result === "text") paintLog(opts);
    const emptyNow = document.getElementById(opts.id + "-empty");
    if (emptyNow && opts.result !== "text" && st.tone === "error") emptyNow.hidden = false;
    sync(opts);
  }

  function wire(opts) {
    const st = slot(opts.id);
    const prompt = document.getElementById(opts.id + "-prompt");
    const select = document.getElementById(opts.id + "-model");
    const go = document.getElementById(opts.id + "-go");
    if (prompt) prompt.oninput = () => { st.prompt = prompt.value; sync(opts); };
    const filter = document.getElementById(opts.id + "-filter");
    if (filter) filter.oninput = () => { st.query = filter.value; sync(opts); };
    if (select) select.onchange = () => {
      st.modelId = select.value;
      const model = current(st);
      st.aspect = model?.defaultAspect || model?.aspects?.[0] || "";
      st.duration = model?.defaultDuration || model?.durations?.[0]?.value || "";
      st.resolution = model?.defaultResolution || model?.resolutions?.[0] || "";
      sync(opts);
    };
    for (const key of ["aspect", "duration", "resolution"]) {
      const el = document.getElementById(opts.id + "-" + key);
      if (el) el.onchange = () => {
        st[key] = el.value;
        const label = document.getElementById(opts.id + "-" + key + "-label");
        if (label) label.textContent = el.selectedOptions?.[0]?.textContent || el.value;
      };
    }
    if (go) go.onclick = () => generate(opts);
    if (prompt) prompt.onkeydown = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(opts); }
    };
    ensure(opts).then(() => {
      if (!document.getElementById(opts.id + "-root")) return;
      if (select) fillModels(opts);
      if (st.resultUrl && opts.result !== "text") showMedia(opts, st.resultUrl, opts.result === "video" ? "video" : opts.result === "audio" ? "audio" : "image");
      if (opts.result === "text" && st.messages.length) paintLog(opts);
      sync(opts);
    });
  }

  window.StudioPanel = { render, wire };
})();
