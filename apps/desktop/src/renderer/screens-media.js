/* ============================================================
   Venice Forge — Image, Video, Movie, Audio
   Image, video, and the movie timeline run inside this studio.
   They use Venice web-app models through the studio, never the browser.
   ============================================================ */
(function () {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const uid = () => "m" + Math.random().toString(36).slice(2, 10);
  const clipText = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n) + "…" : String(s ?? ""));

  const store = {
    models: { image: null, video: null, edit: null },
    imageMode: "create",
    image: { modelId: "", aspect: "", prompt: "", busy: false, error: "", currentId: null },
    edit: {
      modelId: "", aspect: "", resolution: "", quality: "", thinking: "",
      prompt: "", busy: false, error: "", currentId: null, view: "source",
      enhance: true, reasoning: false, transparent: false,
      sources: [], activeId: null, tool: "doodle", brush: 28, color: "#e85d4c",
      marks: {},
    },
    video: { modelId: "", aspect: "", duration: "", resolution: "", prompt: "", busy: false, error: "", currentId: null },
    library: [],
    timeline: [],
    selected: null,
    playhead: 0,
    playing: false,
    exporting: false,
  };

  let ctxRef = null;
  let bound = false;
  let playToken = 0;
  let shownClip = null;
  let drawing = null;

  function cleanMessage(data) {
    const msg = String(data?.message || data?.error || "The model did not return anything.");
    if (msg === "authenticationRequired") {
      return "Venice did not return an image. This edit only runs for a signed-in Venice account, and this studio is not signed in.";
    }
    if (msg.includes("<") || /cloudflare|attention required/i.test(msg) || msg.length > 420) {
      return "Venice blocked this before it could finish inside Venice Forge. Nothing was opened in the browser, and nothing was substituted.";
    }
    return msg;
  }

  function modelOf(kind) {
    const list = store.models[kind] || [];
    return list.find((m) => m.id === store[kind].modelId) || null;
  }

  function modelName(kind) {
    return modelOf(kind)?.name || "the selected model";
  }

  function layout() {
    let t = 0;
    for (const c of store.timeline) {
      c.start = Math.round(t * 10) / 10;
      t += Number(c.len) || 0;
    }
    return Math.round(t * 10) / 10;
  }

  function formatClock(t) {
    const s = Math.max(0, Number(t) || 0);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return String(m).padStart(2, "0") + ":" + r.toFixed(1).padStart(4, "0");
  }

  function videoDuration(url) {
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      const done = (n) => resolve(Number.isFinite(n) && n > 0 ? n : 4);
      v.onloadedmetadata = () => done(v.duration);
      v.onerror = () => done(4);
      v.src = url;
    });
  }

  function optionHTML(list, selected) {
    return list.map((o) => `<option value="${esc(o.value)}"${o.value === selected ? " selected" : ""}>${esc(o.label)}</option>`).join("");
  }

  function titleCase(value) {
    const map = { auto: "Auto", none: "None", low: "Low", middle: "Middle", high: "High", complex: "Complex", medium: "Medium" };
    return map[value] || value;
  }

  function editModel() {
    return modelOf("edit");
  }

  function activeSource() {
    return store.edit.sources.find((s) => s.id === store.edit.activeId) || store.edit.sources[0] || null;
  }

  function marksFor(id) {
    if (!store.edit.marks[id]) store.edit.marks[id] = { doodle: [], mask: [] };
    return store.edit.marks[id];
  }

  function aspectLocked() {
    const model = editModel();
    return !!(model && model.singleImageAspectRatio === false && store.edit.sources.length < 2);
  }

  function normalizeEditTool() {
    const model = editModel();
    const ui = store.edit;
    if (!model) return;
    if (ui.tool === "doodle" && !model.supportsDoodle) ui.tool = model.supportsMaskedInpaint ? "mask" : "";
    if (ui.tool === "mask" && !model.supportsMaskedInpaint) ui.tool = model.supportsDoodle ? "doodle" : "";
    if (!ui.tool) ui.tool = model.supportsDoodle ? "doodle" : (model.supportsMaskedInpaint ? "mask" : "");
  }

  function modeTabs() {
    const mode = store.imageMode === "edit" ? "edit" : "create";
    return `<div class="media-modes" role="tablist" aria-label="Image studio mode">` +
      `<button type="button" role="tab" data-action="image-mode" data-mode="create" aria-selected="${mode === "create"}" class="${mode === "create" ? "is-on" : ""}">Create</button>` +
      `<button type="button" role="tab" data-action="image-mode" data-mode="edit" aria-selected="${mode === "edit"}" class="${mode === "edit" ? "is-on" : ""}">Edit</button>` +
    `</div>`;
  }

  function imageShell() {
    if (store.imageMode === "edit") return editShell();
    return `<div class="media-shell" data-media-root="image">` +
      modeTabs() +
      `<div class="media-stage" data-media="stage">${stageHTML("image", "Image studio")}</div>` +
      `<div class="media-strip" data-media="strip">${stripHTML("image")}</div>` +
      `<form class="media-bar" onsubmit="return false">` +
        `<label class="media-model"><select data-media="model" aria-label="Image studio model"><option>Loading models…</option></select></label>` +
        `<label class="media-opt" data-media-wrap="aspect" hidden><select data-media="aspect" aria-label="Aspect"></select></label>` +
        `<input data-media="prompt" placeholder="Describe the image…" autocomplete="off" value="${esc(store.image.prompt)}" />` +
        `<button type="button" class="media-go" data-action="generate" data-media="go"${store.image.busy ? " disabled" : ""}>${store.image.busy ? "Generating…" : "Generate"}</button>` +
      `</form></div>`;
  }

  function editOptionsHTML(model) {
    const ui = store.edit;
    if (!model) return `<p class="edit-note">Loading edit models…</p>`;
    const bits = [];
    if (model.hasBuiltInPromptEnhancer) bits.push(`<span class="edit-check is-static">Enhance prompt · Built-in</span>`);
    else bits.push(`<label class="edit-check"><input data-media="enhance" type="checkbox"${ui.enhance ? " checked" : ""} />Enhance prompt</label>`);
    if (model.supportsOptimizePromptThinking) bits.push(`<label class="edit-check"><input data-media="reasoning" type="checkbox"${ui.reasoning ? " checked" : ""} />Reasoning</label>`);
    if (model.supportsTransparentBackground) bits.push(`<label class="edit-check"><input data-media="transparent" type="checkbox"${ui.transparent ? " checked" : ""} />Transparent background</label>`);
    if (aspectLocked()) bits.push(`<span class="edit-note">This model keeps the source size until you add another image.</span>`);
    if (model.supportsDoodle || model.supportsMaskedInpaint) {
      const draw = model.supportsDoodle ? `<button type="button" data-action="edit-tool" data-tool="doodle" class="${ui.tool === "doodle" ? "is-on" : ""}">Draw</button>` : "";
      const mask = model.supportsMaskedInpaint ? `<button type="button" data-action="edit-tool" data-tool="mask" class="${ui.tool === "mask" ? "is-on" : ""}">Mask</button>` : "";
      const ink = ui.tool === "doodle" && model.supportsDoodle ? `<label class="edit-color">Ink<input data-media="ink" type="color" value="${esc(ui.color)}" aria-label="Ink color" /></label>` : "";
      bits.push(`<span class="edit-tools">${draw}${mask}<label class="edit-brush">Brush<input data-media="brush" type="range" min="8" max="96" step="2" value="${Number(ui.brush) || 28}" aria-label="Brush size" /></label>${ink}<button type="button" data-action="clear-marks">Clear</button></span>`);
    }
    if (model.maxInputImages > 1) bits.push(`<span class="edit-note">Up to ${model.maxInputImages} images.</span>`);
    return bits.join("");
  }

  function sourceStripHTML() {
    const ui = store.edit;
    const thumbs = ui.sources.map((src) => {
      const on = src.id === (activeSource()?.id) ? " is-on" : "";
      return `<button type="button" class="media-thumb${on}" data-action="pick-source" data-id="${esc(src.id)}" aria-label="${esc(src.name)}"><img src="${esc(src.url)}" alt="" /></button>`;
    }).join("");
    return thumbs + `<label class="edit-add">Add image<input data-media="edit-file" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden /></label>`;
  }

  function editStageHTML() {
    const ui = store.edit;
    if (ui.busy) return `<div class="media-wait"><div class="big">Image studio</div><div class="sub">Editing with ${esc(modelName("edit"))}…</div></div>`;
    if (ui.view === "result") {
      const item = store.library.find((x) => x.id === ui.currentId);
      if (item) {
        return `<div class="media-frame"><img src="${esc(item.url)}" alt="${esc(item.name)}" /><div class="media-caption"><span>${esc(item.modelName)}</span><span class="media-actions">` +
          `<button type="button" data-action="show-source">Source</button>` +
          `<button type="button" data-action="use-source" data-id="${esc(item.id)}">Use as source</button>` +
          `<button type="button" data-action="to-movie" data-id="${esc(item.id)}">Add to movie</button>` +
        `</span></div></div>`;
      }
    }
    const src = activeSource();
    if (!src) {
      return `<div class="media-wait"><div class="big">${ui.error ? "No result" : "Edit"}</div><div class="sub">${esc(ui.error || "Add an image, then say what to change. The edit stays in this studio.")}</div></div>`;
    }
    const err = ui.error
      ? `<div class="media-wait edit-fail"><div class="big">No result</div><div class="sub">${esc(ui.error)}</div></div>`
      : "";
    return err + `<div class="edit-frame"><img data-edit-photo alt="" src="${esc(src.url)}" /><canvas data-edit-canvas></canvas></div>`;
  }

  function editShell() {
    const ui = store.edit;
    return `<div class="media-shell" data-media-root="image">` +
      modeTabs() +
      `<div class="media-stage" data-media="stage">${editStageHTML()}</div>` +
      `<div class="edit-sources">${sourceStripHTML()}</div>` +
      `<form class="media-bar" onsubmit="return false">` +
        `<label class="media-model"><select data-media="model" aria-label="Edit model"><option>Loading models…</option></select></label>` +
        `<label class="media-opt" data-media-wrap="aspect" hidden><select data-media="aspect" aria-label="Aspect"></select></label>` +
        `<label class="media-opt" data-media-wrap="resolution" hidden><select data-media="resolution" aria-label="Resolution"></select></label>` +
        `<label class="media-opt" data-media-wrap="quality" hidden><select data-media="quality" aria-label="Quality"></select></label>` +
        `<label class="media-opt" data-media-wrap="thinking" hidden><select data-media="thinking" aria-label="Thinking"></select></label>` +
        `<input data-media="prompt" placeholder="Say what to change…" autocomplete="off" value="${esc(ui.prompt)}" />` +
        `<button type="button" class="media-go" data-action="generate" data-media="go"${ui.busy ? " disabled" : ""}>${ui.busy ? "Editing…" : "Edit"}</button>` +
      `</form>` +
      `<div class="edit-row">${editOptionsHTML(editModel())}</div>` +
    `</div>`;
  }

  function mountImage() {
    const root = document.querySelector(`[data-media-root="image"]`);
    if (!root) return;
    root.outerHTML = imageShell();
    if (store.imageMode === "edit") {
      syncControls("edit");
      const row = document.querySelector(`[data-media-root="image"] .edit-row`);
      const aspect = document.querySelector(`[data-media-root="image"] [data-media="aspect"]`);
      if (row) row.innerHTML = editOptionsHTML(editModel());
      if (aspect) aspect.disabled = aspectLocked();
      fitCanvas();
    } else syncControls("image");
  }

  function studioHTML(kind) {
    if (kind === "image") return imageShell();
    const title = kind === "image" ? "Image studio" : "Video studio";
    const placeholder = kind === "image" ? "Describe the image…" : "Describe the shot…";
    const extra = kind === "video"
      ? `<label class="media-opt" data-media-wrap="duration" hidden><select data-media="duration" aria-label="Duration"></select></label>` +
        `<label class="media-opt" data-media-wrap="resolution" hidden><select data-media="resolution" aria-label="Resolution"></select></label>`
      : "";
    return `<div class="media-shell" data-media-root="${kind}">` +
      `<div class="media-stage" data-media="stage">${stageHTML(kind, title)}</div>` +
      `<div class="media-strip" data-media="strip">${stripHTML(kind)}</div>` +
      `<form class="media-bar" onsubmit="return false">` +
        `<label class="media-model"><select data-media="model" aria-label="${title} model"><option>Loading models…</option></select></label>` +
        `<label class="media-opt" data-media-wrap="aspect" hidden><select data-media="aspect" aria-label="Aspect"></select></label>` +
        extra +
        `<input data-media="prompt" placeholder="${placeholder}" autocomplete="off" value="${esc(store[kind].prompt)}" />` +
        `<button type="button" class="media-go" data-action="generate" data-media="go"${store[kind].busy ? " disabled" : ""}>${store[kind].busy ? "Generating…" : "Generate"}</button>` +
      `</form></div>`;
  }

  function stageHTML(kind, title) {
    const ui = store[kind];
    const heading = title || (kind === "image" ? "Image studio" : "Video studio");
    if (ui.busy) {
      return `<div class="media-wait"><div class="big">${esc(heading)}</div><div class="sub">Generating with ${esc(modelName(kind))}…</div></div>`;
    }
    if (ui.error) {
      return `<div class="media-wait"><div class="big">No result</div><div class="sub">${esc(ui.error)}</div></div>`;
    }
    const item = store.library.find((x) => x.id === ui.currentId && x.kind === kind);
    if (!item) {
      const sub = kind === "image"
        ? "Pick a Venice image model and describe the picture. It is created in this studio."
        : "Pick a Venice video model and describe the shot. The clip plays here, not in the browser.";
      return `<div class="media-wait"><div class="big">${esc(heading)}</div><div class="sub">${sub}</div></div>`;
    }
    const media = item.kind === "video"
      ? `<video src="${esc(item.url)}" controls playsinline></video>`
      : `<img src="${esc(item.url)}" alt="${esc(item.name)}" />`;
    return `<div class="media-frame">${media}<div class="media-caption"><span>${esc(item.modelName)}</span>` +
      `<button type="button" data-action="to-movie" data-id="${esc(item.id)}">Add to movie</button></div></div>`;
  }

  function stripHTML(kind) {
    const items = store.library.filter((x) => x.kind === kind);
    if (!items.length) return "";
    return items.map((item) => {
      const on = item.id === store[kind].currentId ? " is-on" : "";
      const inner = item.kind === "video"
        ? `<span>${esc(clipText(item.name, 18))}</span>`
        : `<img src="${esc(item.url)}" alt="" />`;
      return `<button type="button" class="media-thumb${on}" data-action="show" data-id="${esc(item.id)}" aria-label="${esc(item.name)}">${inner}</button>`;
    }).join("");
  }

  function movieStageHTML() {
    const clip = store.timeline.find((c) => c.id === store.selected) || store.timeline[0] || null;
    if (!clip) {
      return `<div class="media-wait"><div class="big">Movie</div><div class="sub">Add a still or a clip from Image or Video, or import one from this device. Playback stays in this studio.</div></div>`;
    }
    const item = store.library.find((x) => x.id === clip.libId);
    if (!item) return `<div class="media-wait"><div class="big">Movie</div><div class="sub">That clip is missing from the studio.</div></div>`;
    if (item.kind === "video") return `<video data-media="preview" src="${esc(item.url)}" playsinline></video>`;
    return `<img data-media="preview" alt="" src="${esc(item.url)}" />`;
  }

  function trackHTML() {
    const total = layout() || 1;
    if (!store.timeline.length) {
      return `<div class="movie-empty">Timeline is empty.</div>`;
    }
    const blocks = store.timeline.map((c) => {
      const item = store.library.find((x) => x.id === c.libId);
      const left = (c.start / total) * 100;
      const width = Math.max(4, (c.len / total) * 100);
      const on = c.id === store.selected ? " is-on" : "";
      const kind = item?.kind === "video" ? " is-video" : "";
      return `<button type="button" class="movie-clip${on}${kind}" data-action="select-clip" data-id="${esc(c.id)}" style="left:${left}%;width:${width}%">${esc(clipText(item?.name || "Clip", 22))}</button>`;
    }).join("");
    const head = (store.playhead / total) * 100;
    return `<div class="movie-lane">${blocks}<div class="movie-playhead" style="left:${Math.min(100, head)}%"></div></div>`;
  }

  function libraryOptions() {
    if (!store.library.length) return `<option value="">No studio results yet</option>`;
    return store.library.map((item) => `<option value="${esc(item.id)}">${esc(item.kind === "video" ? "Video" : "Image")} · ${esc(item.name)}</option>`).join("");
  }

  function movieHTML() {
    const total = layout();
    const clip = store.timeline.find((c) => c.id === store.selected);
    return `<div class="movie-shell" data-media-root="movie">` +
      `<div class="movie-stage" data-media="stage">${movieStageHTML()}</div>` +
      `<div class="movie-transport">` +
        `<button type="button" data-action="play">${store.playing ? "Playing" : "Play"}</button>` +
        `<button type="button" data-action="stop">Stop</button>` +
        `<span data-media="clock">${formatClock(store.playhead)}</span>` +
        `<span class="movie-count" data-media="count">${store.timeline.length ? store.timeline.length + " clips · " + total.toFixed(1) + "s" : "Empty timeline"}</span>` +
      `</div>` +
      `<div class="movie-track" data-media="track">${trackHTML()}</div>` +
      `<div class="movie-tools">` +
        `<label class="movie-btn">Import<input data-media="file" type="file" accept="image/*,video/*" hidden /></label>` +
        `<select data-media="library" aria-label="Studio results">${libraryOptions()}</select>` +
        `<button type="button" data-action="add-lib">Add</button>` +
        `<label class="movie-len">Length<input data-media="len" type="number" min="0.5" max="60" step="0.5" value="${clip ? clip.len : 4}"${clip ? "" : " disabled"} aria-label="Clip length in seconds" /></label>` +
        `<button type="button" data-action="earlier">Earlier</button>` +
        `<button type="button" data-action="later">Later</button>` +
        `<button type="button" data-action="remove-clip">Remove</button>` +
        `<button type="button" class="movie-export" data-action="export"${store.exporting ? " disabled" : ""}>${store.exporting ? "Exporting…" : "Export"}</button>` +
      `</div></div>`;
  }

  function audioHtml() {
    return window.VeniceWebApp.render({ id: "audio", url: "https://venice.ai/studio/audio", title: "Venice Audio Studio", subtitle: "Choose an audio model and create music or sound in Venice.ai’s web app." });
  }

  function syncControls(kind) {
    if (kind === "edit" && store.imageMode !== "edit") return;
    if (kind === "image" && store.imageMode === "edit") return;
    const root = document.querySelector(kind === "edit" ? `[data-media-root="image"]` : `[data-media-root="${kind}"]`);
    if (!root) return;
    const list = store.models[kind];
    const modelSel = root.querySelector("[data-media=model]");
    if (modelSel) {
      if (!list) modelSel.innerHTML = `<option>Loading models…</option>`;
      else if (!list.length) modelSel.innerHTML = `<option>Models unavailable</option>`;
      else modelSel.innerHTML = optionHTML(list.map((m) => ({ value: m.id, label: m.name })), store[kind].modelId);
    }
    const model = modelOf(kind);
    setOpt(root, "aspect", (model?.aspects || []).map((a) => ({ value: a, label: a === "auto" ? "Auto" : a })), store[kind].aspect);
    if (kind === "video") {
      setOpt(root, "duration", (model?.durations || []).map((d) => ({ value: d.value, label: d.label })), store[kind].duration);
      setOpt(root, "resolution", (model?.resolutions || []).map((r) => ({ value: r, label: r })), store[kind].resolution);
    }
    if (kind === "edit") {
      const resolutions = model?.supportsResolution ? (model.resolutions || []) : [];
      setOpt(root, "resolution", resolutions.map((r) => ({ value: r, label: r === model.defaultResolution ? r + " · default" : r })), store.edit.resolution);
      setOpt(root, "quality", (model?.qualities || []).map((q) => ({ value: q, label: q === model.defaultQuality ? titleCase(q) + " · default" : titleCase(q) })), store.edit.quality);
      setOpt(root, "thinking", (model?.thinkingLevels || []).map((t) => ({ value: t, label: t === model.defaultThinking ? titleCase(t) + " · default" : titleCase(t) })), store.edit.thinking);
      const aspect = root.querySelector("[data-media=aspect]");
      if (aspect) aspect.disabled = aspectLocked();
    }
  }

  function setOpt(root, name, options, selected) {
    const wrap = root.querySelector(`[data-media-wrap="${name}"]`);
    const sel = root.querySelector(`[data-media="${name}"]`);
    if (!wrap || !sel) return;
    wrap.hidden = !options.length;
    if (!options.length) return;
    sel.innerHTML = optionHTML(options, selected);
  }

  function paintStudio(kind) {
    const root = document.querySelector(`[data-media-root="${kind}"]`);
    if (!root) return;
    const stage = root.querySelector("[data-media=stage]");
    const strip = root.querySelector("[data-media=strip]");
    const go = root.querySelector("[data-media=go]");
    if (stage) stage.innerHTML = stageHTML(kind);
    if (strip) {
      strip.innerHTML = stripHTML(kind);
      strip.hidden = !store.library.some((x) => x.kind === kind);
    }
    if (go) {
      go.disabled = !!store[kind].busy;
      go.textContent = store[kind].busy ? "Generating…" : "Generate";
    }
  }

  function paintMovieChrome() {
    const root = document.querySelector(`[data-media-root="movie"]`);
    if (!root) return;
    const total = layout();
    const clock = root.querySelector("[data-media=clock]");
    if (clock) clock.textContent = formatClock(store.playhead);
    const count = root.querySelector("[data-media=count]");
    if (count) count.textContent = store.timeline.length ? store.timeline.length + " clips · " + total.toFixed(1) + "s" : "Empty timeline";
    const track = root.querySelector("[data-media=track]");
    if (track) track.innerHTML = trackHTML();
    const len = root.querySelector("[data-media=len]");
    const clip = store.timeline.find((c) => c.id === store.selected);
    if (len && document.activeElement !== len) {
      len.disabled = !clip;
      len.value = clip ? String(clip.len) : "4";
    }
    const lib = root.querySelector("[data-media=library]");
    if (lib && document.activeElement !== lib) lib.innerHTML = libraryOptions();
    const play = root.querySelector("[data-action=play]");
    if (play) play.textContent = store.playing ? "Playing" : "Play";
    const exp = root.querySelector("[data-action=export]");
    if (exp) {
      exp.disabled = !!store.exporting;
      exp.textContent = store.exporting ? "Exporting…" : "Export";
    }
  }

  function showStoppedFrame() {
    const stage = document.querySelector(`[data-media-root="movie"] [data-media=stage]`);
    if (!stage || store.playing) return;
    const clip = store.timeline.find((c) => c.id === store.selected) || null;
    shownClip = clip ? clip.id : null;
    stage.innerHTML = movieStageHTML();
  }

  async function ensureModels(kind) {
    if (!store.models[kind]) {
      try {
        const res = await fetch("/api/studio/models?kind=" + encodeURIComponent(kind));
        const data = await res.json().catch(() => ({}));
        store.models[kind] = Array.isArray(data.models) ? data.models : [];
      } catch {
        store.models[kind] = [];
      }
      const ui = store[kind];
      if (!store.models[kind].some((m) => m.id === ui.modelId)) ui.modelId = store.models[kind][0]?.id || "";
      const model = modelOf(kind);
      if (model) {
        if (!model.aspects.includes(ui.aspect)) ui.aspect = model.defaultAspect || model.aspects[0] || "";
        if (kind === "video") {
          const durs = model.durations.map((d) => d.value);
          if (!durs.includes(ui.duration)) ui.duration = model.defaultDuration || durs[0] || "";
          if (!model.resolutions.includes(ui.resolution)) ui.resolution = model.defaultResolution || model.resolutions[0] || "";
        }
        if (kind === "edit") {
          if (!model.resolutions.includes(ui.resolution)) ui.resolution = model.defaultResolution || model.resolutions[0] || "";
          if (!(model.qualities || []).includes(ui.quality)) ui.quality = model.defaultQuality || (model.qualities || [])[0] || "";
          if (!(model.thinkingLevels || []).includes(ui.thinking)) ui.thinking = model.defaultThinking || (model.thinkingLevels || [])[0] || "";
          normalizeEditTool();
        }
      }
    }
    if (kind === "image" && store.imageMode === "edit") return;
    if (kind === "edit" && store.imageMode !== "edit") return;
    syncControls(kind);
    if (kind === "edit") {
      const row = document.querySelector(`[data-media-root="image"] .edit-row`);
      if (row) row.innerHTML = editOptionsHTML(editModel());
    }
  }

  async function generate(kind) {
    const ui = store[kind];
    if (!ui || ui.busy) return;
    const root = document.querySelector(`[data-media-root="${kind}"]`);
    const prompt = (root?.querySelector("[data-media=prompt]")?.value || ui.prompt || "").trim();
    ui.prompt = prompt;
    if (!prompt) { ctxRef?.notify?.("Describe it first."); return; }
    if (!ui.modelId || !modelOf(kind)) { ctxRef?.notify?.("Pick a model first."); return; }
    ui.busy = true;
    ui.error = "";
    paintStudio(kind);
    try {
      const body = { kind, modelId: ui.modelId, prompt, aspectRatio: ui.aspect };
      if (kind === "video") {
        body.duration = ui.duration;
        body.resolution = ui.resolution;
      }
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || type.includes("json") || type.includes("text/html")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(cleanMessage(data));
      }
      const blob = await res.blob();
      if (!blob.size) throw new Error(kind === "image" ? "Venice returned an empty image." : "Venice returned an empty video.");
      const url = URL.createObjectURL(blob);
      const duration = kind === "video" ? await videoDuration(url) : 4;
      const item = {
        id: uid(),
        kind,
        name: clipText(prompt, 48),
        url,
        duration: Math.round((duration || 4) * 10) / 10,
        prompt,
        modelName: modelName(kind),
      };
      store.library.unshift(item);
      ui.currentId = item.id;
      ui.status = "";
    } catch (err) {
      ui.error = cleanMessage({ message: err?.message });
    } finally {
      ui.busy = false;
      paintStudio(kind);
    }
  }

  function addClip(item) {
    const clip = {
      id: uid(),
      libId: item.id,
      len: Math.max(0.5, Math.round((item.duration || 4) * 10) / 10),
    };
    store.timeline.push(clip);
    store.selected = clip.id;
    layout();
  }

  function stopPlay(reset) {
    playToken += 1;
    store.playing = false;
    const video = document.querySelector(`[data-media-root="movie"] video`);
    if (video) video.pause();
    if (reset) store.playhead = 0;
    paintMovieChrome();
  }

  function showPlayFrame(clip, t) {
    const stage = document.querySelector(`[data-media-root="movie"] [data-media=stage]`);
    if (!stage) return;
    if (!clip) {
      shownClip = null;
      stage.innerHTML = movieStageHTML();
      return;
    }
    const item = store.library.find((x) => x.id === clip.libId);
    if (!item) return;
    if (shownClip !== clip.id) {
      shownClip = clip.id;
      store.selected = clip.id;
      stage.innerHTML = item.kind === "video"
        ? `<video data-media="preview" src="${esc(item.url)}" playsinline></video>`
        : `<img data-media="preview" alt="" src="${esc(item.url)}" />`;
      const video = stage.querySelector("video");
      if (video) {
        const want = Math.max(0, t - clip.start);
        const start = () => {
          try { video.currentTime = Math.min(want, (video.duration || want) - 0.05); } catch {}
          video.play().catch(() => {});
        };
        if (video.readyState >= 1) start();
        else video.onloadedmetadata = start;
      }
    } else if (item.kind === "video") {
      const video = stage.querySelector("video");
      if (video) {
        const want = Math.max(0, t - clip.start);
        if (Number.isFinite(video.currentTime) && Math.abs(video.currentTime - want) > 0.4) {
          try { video.currentTime = want; } catch {}
        }
        if (video.paused) video.play().catch(() => {});
      }
    }
  }

  function playMovie() {
    const total = layout();
    if (!store.timeline.length || total <= 0) {
      ctxRef?.notify?.("Add a clip to the timeline first.");
      return;
    }
    const token = ++playToken;
    store.playing = true;
    const origin = performance.now() - store.playhead * 1000;
    const tick = () => {
      if (token !== playToken) return;
      const t = (performance.now() - origin) / 1000;
      if (t >= total) {
        store.playing = false;
        store.playhead = 0;
        shownClip = null;
        const stage = document.querySelector(`[data-media-root="movie"] [data-media=stage]`);
        if (stage) stage.innerHTML = movieStageHTML();
        paintMovieChrome();
        return;
      }
      store.playhead = t;
      const clip = store.timeline.find((c) => t >= c.start && t < c.start + c.len) || null;
      showPlayFrame(clip, t);
      paintMovieChrome();
      requestAnimationFrame(tick);
    };
    paintMovieChrome();
    requestAnimationFrame(tick);
  }

  function paintCover(g, source, w, h) {
    const sw = source.videoWidth || source.naturalWidth || 0;
    const sh = source.videoHeight || source.naturalHeight || 0;
    g.fillStyle = "#0b0f19";
    g.fillRect(0, 0, w, h);
    if (!sw || !sh) return;
    const scale = Math.min(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    g.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  function drawClip(g, clip, w, h) {
    const item = store.library.find((x) => x.id === clip.libId);
    const ms = Math.max(300, clip.len * 1000);
    if (!item) return Promise.resolve();
    return new Promise((resolve) => {
      if (item.kind === "image") {
        const img = new Image();
        img.onload = () => {
          const start = performance.now();
          const frame = () => {
            try { paintCover(g, img, w, h); } catch {}
            if (performance.now() - start >= ms) resolve();
            else requestAnimationFrame(frame);
          };
          frame();
        };
        img.onerror = () => resolve();
        img.src = item.url;
        return;
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.onloadeddata = () => {
        video.play().then(() => {
          const start = performance.now();
          const frame = () => {
            try { paintCover(g, video, w, h); } catch {}
            if (performance.now() - start >= ms || video.ended) {
              video.pause();
              resolve();
            } else requestAnimationFrame(frame);
          };
          frame();
        }).catch(() => resolve());
      };
      video.onerror = () => resolve();
      video.src = item.url;
    });
  }

  async function exportMovie() {
    if (store.exporting) return;
    if (!store.timeline.length) { ctxRef?.notify?.("Add a clip before exporting."); return; }
    stopPlay(false);
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 540;
    const g = canvas.getContext("2d");
    let stream;
    try { stream = canvas.captureStream(24); }
    catch { ctxRef?.notify?.("This browser cannot record the timeline."); return; }
    const mime = window.MediaRecorder && MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime }); }
    catch { ctxRef?.notify?.("This browser cannot record the timeline."); return; }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { rec.onstop = resolve; });
    store.exporting = true;
    paintMovieChrome();
    try {
      rec.start();
      for (const clip of store.timeline) await drawClip(g, clip, canvas.width, canvas.height);
      rec.stop();
      await stopped;
      const blob = new Blob(chunks, { type: "video/webm" });
      if (!blob.size) throw new Error("empty");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "venice-forge-timeline.webm";
      document.body.appendChild(a);
      a.click();
      a.remove();
      ctxRef?.notify?.("Exported the timeline.");
    } catch {
      try { rec.stop(); } catch {}
      ctxRef?.notify?.("Export did not produce a movie.");
    } finally {
      store.exporting = false;
      paintMovieChrome();
    }
  }

  async function importFile(file) {
    if (!file) return;
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "";
    if (!kind) { ctxRef?.notify?.("Import an image or a video."); return; }
    const url = URL.createObjectURL(file);
    const duration = kind === "video" ? await videoDuration(url) : 4;
    const item = {
      id: uid(),
      kind,
      name: file.name || (kind === "video" ? "Imported clip" : "Imported still"),
      url,
      duration: Math.round((duration || 4) * 10) / 10,
      modelName: "Imported",
    };
    store.library.unshift(item);
    stopPlay(true);
    addClip(item);
    shownClip = store.selected;
    const stage = document.querySelector(`[data-media-root="movie"] [data-media=stage]`);
    if (stage) stage.innerHTML = movieStageHTML();
    paintMovieChrome();
    ctxRef?.notify?.("Added " + item.name + " to the timeline.");
  }

  function moveSelected(dir) {
    const i = store.timeline.findIndex((c) => c.id === store.selected);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= store.timeline.length) return;
    const [c] = store.timeline.splice(i, 1);
    store.timeline.splice(j, 0, c);
    layout();
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be read."));
      img.src = src;
    });
  }

  function fitSize(w, h) {
    let width = w;
    let height = h;
    const down = Math.min(1, 2048 / Math.max(width, height));
    width = Math.max(64, Math.round(width * down));
    height = Math.max(64, Math.round(height * down));
    if (width * height < 65536) {
      const bump = Math.sqrt(65536 / (width * height));
      width = Math.round(width * bump);
      height = Math.round(height * bump);
    }
    return [width, height];
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function resizedUrl(img) {
    const [w, h] = fitSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await canvasBlob(canvas, "image/jpeg", 0.9);
    if (!blob) throw new Error("That image could not be read.");
    return URL.createObjectURL(blob);
  }

  async function addEditFiles(fileList) {
    const max = editModel()?.maxInputImages || 4;
    for (const file of Array.from(fileList || [])) {
      if (store.edit.sources.length >= max) {
        ctxRef?.notify?.(`This model accepts ${max} image${max === 1 ? "" : "s"}.`);
        break;
      }
      if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
        ctxRef?.notify?.("Use a PNG, JPEG, or WebP.");
        continue;
      }
      const raw = URL.createObjectURL(file);
      try {
        const img = await loadImage(raw);
        if (img.naturalWidth < 64 || img.naturalHeight < 64) {
          ctxRef?.notify?.("Each side of the image needs to be at least 64 pixels.");
          continue;
        }
        const url = await resizedUrl(img);
        const item = { id: uid(), name: file.name || "Source", url };
        store.edit.sources.push(item);
        store.edit.activeId = item.id;
        store.edit.view = "source";
        store.edit.error = "";
      } catch (err) {
        ctxRef?.notify?.(err?.message || "That image could not be read.");
      } finally {
        URL.revokeObjectURL(raw);
      }
    }
    mountImage();
  }

  function drawStroke(g, stroke, w, h, asMask) {
    if (!stroke?.points?.length) return;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = asMask ? "#fff" : (stroke.color || "#e85d4c");
    g.fillStyle = g.strokeStyle;
    g.lineWidth = Math.max(2, (stroke.width || 0.02) * w);
    const [x0, y0] = stroke.points[0];
    if (stroke.points.length < 2) {
      g.beginPath();
      g.arc(x0 * w, y0 * h, g.lineWidth / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
    g.beginPath();
    stroke.points.forEach(([x, y], i) => (i ? g.lineTo(x * w, y * h) : g.moveTo(x * w, y * h)));
    g.stroke();
  }

  function redrawMarks() {
    const canvas = document.querySelector(`[data-media-root="image"] [data-edit-canvas]`);
    const src = activeSource();
    if (!canvas || !src) return;
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, canvas.width, canvas.height);
    const pack = marksFor(src.id);
    const list = store.edit.tool === "mask" ? pack.mask : pack.doodle;
    const preview = store.edit.tool === "mask";
    for (const stroke of list) drawStroke(g, stroke, canvas.width, canvas.height, preview);
    if (drawing) drawStroke(g, drawing, canvas.width, canvas.height, drawing.tool === "mask");
    if (preview) {
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "rgba(129,117,255,0.82)";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalCompositeOperation = "source-over";
    }
  }

  function fitCanvas() {
    const canvas = document.querySelector(`[data-edit-canvas]`);
    const img = document.querySelector(`[data-edit-photo]`);
    if (!canvas || !img) return;
    const paint = () => {
      canvas.width = Math.max(1, img.clientWidth);
      canvas.height = Math.max(1, img.clientHeight);
      redrawMarks();
    };
    if (img.complete && img.naturalWidth) paint();
    else img.addEventListener("load", paint, { once: true });
  }

  function pointOf(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width))),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height))),
    ];
  }

  async function rasterSource(src, bakeDoodle) {
    const img = await loadImage(src.url);
    const [w, h] = fitSize(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    const pack = marksFor(src.id);
    if (bakeDoodle) for (const stroke of pack.doodle) drawStroke(g, stroke, w, h, false);
    const imageBlob = await canvasBlob(canvas, "image/jpeg", 0.9);
    const image = await blobDataUrl(imageBlob);
    let mask = null;
    if (pack.mask.length) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = w;
      maskCanvas.height = h;
      const mg = maskCanvas.getContext("2d");
      mg.fillStyle = "#000";
      mg.fillRect(0, 0, w, h);
      for (const stroke of pack.mask) drawStroke(mg, stroke, w, h, true);
      mask = await blobDataUrl(await canvasBlob(maskCanvas, "image/png"));
    }
    return { image, mask };
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      if (!blob) { reject(new Error("That image could not be read.")); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("That image could not be read."));
      reader.readAsDataURL(blob);
    });
  }

  async function editImage() {
    const ui = store.edit;
    if (ui.busy) return;
    const root = document.querySelector(`[data-media-root="image"]`);
    const prompt = (root?.querySelector("[data-media=prompt]")?.value || ui.prompt || "").trim();
    ui.prompt = prompt;
    if (!prompt) { ctxRef?.notify?.("Say what to change."); return; }
    if (!ui.sources.length) { ctxRef?.notify?.("Add an image first."); return; }
    const model = editModel();
    if (!model) { ctxRef?.notify?.("Pick an edit model first."); return; }
    const doodle = ui.sources.some((s) => marksFor(s.id).doodle.length);
    const masked = ui.sources.some((s) => marksFor(s.id).mask.length);
    if (doodle && !model.supportsDoodle) { ctxRef?.notify?.("This model does not take a drawing. Clear it, or pick a model that does."); return; }
    if (masked && !model.supportsMaskedInpaint) { ctxRef?.notify?.("This model does not take a mask. Clear it, or pick a model that does."); return; }
    ui.busy = true;
    ui.error = "";
    ui.view = "source";
    mountImage();
    try {
      const rasters = [];
      for (const src of ui.sources) rasters.push(await rasterSource(src, model.supportsDoodle));
      const activeIndex = Math.max(0, ui.sources.findIndex((s) => s.id === activeSource()?.id));
      const body = {
        kind: "edit",
        modelId: ui.modelId,
        prompt,
        aspectRatio: aspectLocked() ? "auto" : ui.aspect,
        resolution: ui.resolution,
        quality: ui.quality,
        thinkingLevel: ui.thinking,
        enhance: model.hasBuiltInPromptEnhancer ? false : ui.enhance === true,
        reasoning: ui.reasoning === true,
        transparent: ui.transparent === true,
        images: rasters.map((r) => r.image),
      };
      if (model.supportsMaskedInpaint && rasters[activeIndex]?.mask) body.mask = rasters[activeIndex].mask;
      const res = await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || type.includes("json") || type.includes("text/html")) {
        const data = await res.json().catch(() => ({}));
        throw new Error(cleanMessage(data));
      }
      const blob = await res.blob();
      if (!blob.size) throw new Error("Venice returned an empty edit.");
      const url = URL.createObjectURL(blob);
      const item = {
        id: uid(),
        kind: "image",
        name: clipText(prompt, 48),
        url,
        duration: 4,
        prompt,
        modelName: model.name,
      };
      store.library.unshift(item);
      ui.currentId = item.id;
      ui.view = "result";
    } catch (err) {
      ui.error = cleanMessage({ message: err?.message });
      ui.view = "source";
    } finally {
      ui.busy = false;
      mountImage();
    }
  }

  async function useAsSource(id) {
    const item = store.library.find((x) => x.id === id && x.kind === "image");
    if (!item) return;
    const max = editModel()?.maxInputImages || 4;
    if (store.edit.sources.length >= max) {
      ctxRef?.notify?.(`This model accepts ${max} image${max === 1 ? "" : "s"}.`);
      return;
    }
    try {
      const img = await loadImage(item.url);
      const url = await resizedUrl(img);
      const src = { id: uid(), name: item.name || "Result", url };
      store.edit.sources.push(src);
      store.edit.activeId = src.id;
      store.edit.view = "source";
      store.edit.error = "";
      mountImage();
    } catch (err) {
      ctxRef?.notify?.(err?.message || "That image could not be used.");
    }
  }

  function onClick(e) {
    const el = e.target.closest("[data-action]");
    const root = el?.closest("[data-media-root]");
    if (!el || !root) return;
    const kind = root.dataset.mediaRoot;
    if (kind === "image" || kind === "video") {
      if (el.dataset.action === "image-mode" && kind === "image") {
        const mode = el.dataset.mode === "edit" ? "edit" : "create";
        if (store.imageMode !== mode) {
          store.imageMode = mode;
          mountImage();
          if (mode === "edit") ensureModels("edit");
        }
        return;
      }
      if (el.dataset.action === "generate") {
        if (kind === "image" && store.imageMode === "edit") editImage();
        else generate(kind);
      }
      if (el.dataset.action === "show" && !(kind === "image" && store.imageMode === "edit")) {
        store[kind].currentId = el.dataset.id;
        store[kind].error = "";
        paintStudio(kind);
      }
      if (el.dataset.action === "pick-source") {
        store.edit.activeId = el.dataset.id;
        store.edit.view = "source";
        mountImage();
      }
      if (el.dataset.action === "show-source") {
        store.edit.view = "source";
        mountImage();
      }
      if (el.dataset.action === "use-source") useAsSource(el.dataset.id);
      if (el.dataset.action === "edit-tool") {
        store.edit.tool = el.dataset.tool === "mask" ? "mask" : "doodle";
        mountImage();
      }
      if (el.dataset.action === "clear-marks") {
        const src = activeSource();
        if (!src) return;
        const pack = marksFor(src.id);
        if (store.edit.tool === "mask") pack.mask = [];
        else pack.doodle = [];
        redrawMarks();
      }
      if (el.dataset.action === "to-movie") {
        const item = store.library.find((x) => x.id === el.dataset.id);
        if (!item) return;
        addClip(item);
        ctxRef?.notify?.("Added to the movie timeline.");
        if (ctxRef?.go) ctxRef.go("Movie Editor");
      }
      return;
    }
    if (kind !== "movie") return;
    switch (el.dataset.action) {
      case "play": playMovie(); break;
      case "stop":
        stopPlay(true);
        showStoppedFrame();
        break;
      case "select-clip":
        stopPlay(false);
        store.selected = el.dataset.id;
        store.playhead = store.timeline.find((c) => c.id === store.selected)?.start || 0;
        showStoppedFrame();
        paintMovieChrome();
        break;
      case "add-lib": {
        const id = root.querySelector("[data-media=library]")?.value;
        const item = store.library.find((x) => x.id === id);
        if (!item) { ctxRef?.notify?.("Generate or import something first."); break; }
        stopPlay(true);
        addClip(item);
        showStoppedFrame();
        paintMovieChrome();
        break;
      }
      case "earlier":
        stopPlay(false);
        moveSelected(-1);
        paintMovieChrome();
        break;
      case "later":
        stopPlay(false);
        moveSelected(1);
        paintMovieChrome();
        break;
      case "remove-clip":
        stopPlay(true);
        store.timeline = store.timeline.filter((c) => c.id !== store.selected);
        store.selected = store.timeline[0]?.id || null;
        layout();
        showStoppedFrame();
        paintMovieChrome();
        break;
      case "export": exportMovie(); break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    const root = t.closest && t.closest("[data-media-root]");
    if (!root) return;
    const kind = root.dataset.mediaRoot;
    if ((kind === "image" || kind === "video") && t.matches("[data-media=model]")) {
      const bucket = kind === "image" && store.imageMode === "edit" ? "edit" : kind;
      store[bucket].modelId = t.value;
      const model = modelOf(bucket);
      if (model) {
        store[bucket].aspect = model.defaultAspect || model.aspects[0] || "";
        if (bucket === "video") {
          store[bucket].duration = model.defaultDuration || model.durations[0]?.value || "";
          store[bucket].resolution = model.defaultResolution || model.resolutions[0] || "";
        }
        if (bucket === "edit") {
          store.edit.resolution = model.defaultResolution || model.resolutions[0] || "";
          store.edit.quality = model.defaultQuality || (model.qualities || [])[0] || "";
          store.edit.thinking = model.defaultThinking || (model.thinkingLevels || [])[0] || "";
          normalizeEditTool();
          syncControls("edit");
          const row = document.querySelector(`[data-media-root="image"] .edit-row`);
          if (row) row.innerHTML = editOptionsHTML(model);
          fitCanvas();
        }
      }
      if (bucket !== "edit") syncControls(bucket);
      return;
    }
    const bucket = kind === "image" && store.imageMode === "edit" ? "edit" : kind;
    if (t.matches("[data-media=aspect]") && store[bucket]) store[bucket].aspect = t.value;
    if (t.matches("[data-media=duration]")) store.video.duration = t.value;
    if (t.matches("[data-media=resolution]") && store[bucket]) store[bucket].resolution = t.value;
    if (t.matches("[data-media=quality]")) store.edit.quality = t.value;
    if (t.matches("[data-media=thinking]")) store.edit.thinking = t.value;
    if (t.matches("[data-media=enhance]")) store.edit.enhance = t.checked;
    if (t.matches("[data-media=reasoning]")) store.edit.reasoning = t.checked;
    if (t.matches("[data-media=transparent]")) store.edit.transparent = t.checked;
    if (t.matches("[data-media=ink]")) store.edit.color = t.value;
    if (t.matches("[data-media=len]")) {
      const clip = store.timeline.find((c) => c.id === store.selected);
      if (!clip) return;
      const n = Math.min(60, Math.max(0.5, Number(t.value) || clip.len));
      clip.len = Math.round(n * 10) / 10;
      layout();
      paintMovieChrome();
    }
    if (t.matches("[data-media=file]")) {
      const file = t.files && t.files[0];
      t.value = "";
      importFile(file);
    }
    if (t.matches("[data-media=edit-file]")) {
      const files = Array.from(t.files || []);
      t.value = "";
      addEditFiles(files);
    }
  }

  function onInput(e) {
    const t = e.target;
    const root = t.closest && t.closest("[data-media-root]");
    if (!root || !t.matches("[data-media=prompt], [data-media=brush]")) return;
    const kind = root.dataset.mediaRoot;
    if (t.matches("[data-media=brush]")) {
      store.edit.brush = Number(t.value) || 28;
      return;
    }
    const bucket = kind === "image" && store.imageMode === "edit" ? "edit" : kind;
    if (store[bucket]) store[bucket].prompt = t.value;
  }

  function onKey(e) {
    if (e.key !== "Enter" || !e.target.matches || !e.target.matches("[data-media=prompt]")) return;
    const root = e.target.closest("[data-media-root]");
    if (!root) return;
    e.preventDefault();
    if (root.dataset.mediaRoot === "image" && store.imageMode === "edit") editImage();
    else generate(root.dataset.mediaRoot);
  }

  function onPointerDown(e) {
    const canvas = e.target.closest && e.target.closest("[data-edit-canvas]");
    if (!canvas || store.imageMode !== "edit" || !activeSource()) return;
    const model = editModel();
    const tool = store.edit.tool;
    if (tool === "doodle" && !model?.supportsDoodle) return;
    if (tool === "mask" && !model?.supportsMaskedInpaint) return;
    if (tool !== "doodle" && tool !== "mask") return;
    if (e.button > 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    drawing = {
      tool,
      color: store.edit.color,
      width: (Number(store.edit.brush) || 28) / Math.max(1, canvas.getBoundingClientRect().width),
      points: [pointOf(canvas, e)],
    };
    redrawMarks();
  }

  function onPointerMove(e) {
    if (!drawing) return;
    const canvas = document.querySelector("[data-edit-canvas]");
    if (!canvas) return;
    drawing.points.push(pointOf(canvas, e));
    redrawMarks();
  }

  function onPointerUp() {
    if (!drawing) return;
    const src = activeSource();
    if (src) {
      const pack = marksFor(src.id);
      (drawing.tool === "mask" ? pack.mask : pack.doodle).push(drawing);
    }
    drawing = null;
    redrawMarks();
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    window.addEventListener("resize", () => { if (store.imageMode === "edit") fitCanvas(); });
  }

  function renderSync(ctx) {
    switch (ctx.state.tab) {
      case "Image Gen": return studioHTML("image");
      case "Video Studio": return studioHTML("video");
      case "Movie Editor": return movieHTML();
      case "Audio Score": return audioHtml();
      default: return "";
    }
  }

  function render(ctx) { return renderSync(ctx); }

  function wire(ctx) {
    ctxRef = ctx;
    if (ctx.state.tab === "Image Gen") { bind(); ensureModels("image"); ensureModels("edit"); }
    else if (ctx.state.tab === "Video Studio") { bind(); ensureModels("video"); }
    else if (ctx.state.tab === "Movie Editor") {
      bind();
      shownClip = store.selected;
      paintMovieChrome();
    } else if (ctx.state.tab === "Audio Score") {
      window.VeniceWebApp.wire(ctx, { id: "audio", url: "https://venice.ai/studio/audio" });
    }
  }

  window.__SCREENS__ = window.__SCREENS__ || [];
  window.__SCREENS__.push({ id: "media", TABS: ["Image Gen", "Video Studio", "Movie Editor", "Audio Score"], render, wire });
})();
