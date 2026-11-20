/* ============================================================
   Venice Forge — screens: Image Gen, Video Studio, Movie Editor, Music, Audio Score
   Classic-script module. Registers on window.__SCREENS__.
   Contract: { id, TABS, render(ctx), wire(ctx) }
   ============================================================ */
(function () {
  "use strict";

  const store = {
    movie: {
      id: "",
      name: "",
      frameCount: 0,
      cleanCount: 0,
      scale: "4x",
      phase: "",
      status: "Choose a downloaded video.",
      tone: "",
      busy: false,
      result: false,
      duration: 0,
      fps: 0,
      width: 0,
      height: 0,
      look: 0,
      nsfw: false,
    },
  };

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ============================================================
     IMAGE GEN — Create stays on the studio panel. Edit is img2img.
     ============================================================ */
  const imageUi = {
    mode: "create",
    models: [],
    modelId: "",
    prompt: "",
    aspect: "",
    resolution: "",
    quality: "",
    thinking: "",
    enhance: false,
    reasoning: false,
    transparent: false,
    sources: [],
    activeId: null,
    tool: "doodle",
    brush: 28,
    color: "#e85d4c",
    marks: {},
    busy: false,
    status: "Add an image, then say what to change. The edit stays in this studio.",
    tone: "",
    resultUrl: "",
    resultName: "venice-edit.png",
    results: [],
    count: 1,
    view: "source",
  };

  function editModel() {
    return imageUi.models.find((m) => m.id === imageUi.modelId) || null;
  }

  function activeSource() {
    return imageUi.sources.find((s) => s.id === imageUi.activeId) || imageUi.sources[0] || null;
  }

  function marksFor(id) {
    if (!imageUi.marks[id]) imageUi.marks[id] = { doodle: [], mask: [] };
    return imageUi.marks[id];
  }

  function aspectLocked() {
    const model = editModel();
    return !!(model && model.singleImageAspectRatio === false && imageUi.sources.length < 2);
  }

  function modeTabs() {
    const mode = imageUi.mode === "edit" ? "edit" : "create";
    return `<div class="image-modes" role="tablist">
      <button type="button" data-image-mode="create" role="tab" aria-selected="${mode === "create"}" class="${mode === "create" ? "is-on" : ""}">Create</button>
      <button type="button" data-image-mode="edit" role="tab" aria-selected="${mode === "edit"}" class="${mode === "edit" ? "is-on" : ""}">Edit</button>
    </div>`;
  }

  function choiceBox(id, label, values, current) {
    if (!values.length) return "";
    const options = values.map((value) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(value)}</option>`).join("");
    return `<div class="field-label">${esc(label)}</div>
      <div class="select-box">
        <span>${esc(current || values[0])}</span>
        <span aria-hidden="true">⌄</span>
        <select id="${id}" aria-label="${esc(label)}">${options}</select>
      </div>`;
  }

  function editChecks(model) {
    if (!model) return "";
    const bits = [];
    if (!model.hasBuiltInPromptEnhancer) bits.push(`<label class="edit-check"><input id="edit-enhance" type="checkbox"${imageUi.enhance ? " checked" : ""} />Enhance</label>`);
    if (model.supportsOptimizePromptThinking) bits.push(`<label class="edit-check"><input id="edit-reasoning" type="checkbox"${imageUi.reasoning ? " checked" : ""} />Reasoning</label>`);
    if (model.supportsTransparentBackground) bits.push(`<label class="edit-check"><input id="edit-transparent" type="checkbox"${imageUi.transparent ? " checked" : ""} />Transparent</label>`);
    return bits.length ? `<div class="edit-row">${bits.join("")}</div>` : "";
  }

  function editTools(model) {
    if (!model || !(model.supportsDoodle || model.supportsMaskedInpaint)) return "";
    const draw = model.supportsDoodle ? `<button type="button" data-edit-tool="doodle" class="${imageUi.tool === "doodle" ? "is-on" : ""}">Draw</button>` : "";
    const mask = model.supportsMaskedInpaint ? `<button type="button" data-edit-tool="mask" class="${imageUi.tool === "mask" ? "is-on" : ""}">Mask</button>` : "";
    const ink = imageUi.tool === "doodle" && model.supportsDoodle ? `<label class="edit-color">Ink<input id="edit-ink" type="color" value="${esc(imageUi.color)}" aria-label="Ink color" /></label>` : "";
    return `<div class="edit-float">${draw}${mask}<label class="edit-brush">Brush<input id="edit-brush" type="range" min="8" max="96" step="2" value="${Number(imageUi.brush) || 28}" aria-label="Brush size" /></label>${ink}<button type="button" id="edit-clear">Clear</button></div>`;
  }

  function editGallery() {
    const items = imageUi.results;
    const n = items.length;
    return `<div class="gen-gallery n-${Math.min(4, n)}">
      <div class="gen-toolbar">
        <span>${imageUi.busy ? esc(imageUi.status) : ""}</span>
        <span class="gen-actions">
          <button type="button" id="edit-show-source">Source</button>
          <button type="button" id="edit-clear-result">Clear</button>
        </span>
      </div>
      ${items.map((item, i) => `
        <figure class="gen-card">
          <img src="${esc(item.url)}" alt="Edited image ${i + 1}" />
          <div class="gen-actions">
            <a class="gen-download" href="${esc(item.url)}" download="${esc(item.name)}">Download</a>
            <button type="button" data-edit-use="${i}" aria-label="Use as source">Use</button>
            <button type="button" data-edit-clear="${i}">Clear</button>
          </div>
        </figure>`).join("")}
    </div>`;
  }

  function editStage() {
    if (imageUi.view === "result" && imageUi.results.length) return editGallery();
    if (imageUi.busy) {
      return `<div class="music-empty"><p class="sub">${esc(imageUi.status || "Editing…")}</p></div>`;
    }
    const src = activeSource();
    if (!src) {
      return `<div class="music-empty">
        <p class="sub${imageUi.tone === "error" ? " error" : ""}">${esc(imageUi.status)}</p>
        <button type="button" class="btn-primary edit-pick" data-edit-pick>Choose image</button>
      </div>`;
    }
    const err = imageUi.tone === "error" ? `<p class="sub error edit-status">${esc(imageUi.status)}</p>` : "";
    return `<div class="edit-result">${err}${editTools(editModel())}<div class="edit-frame"><img id="edit-photo" alt="" src="${esc(src.url)}" /><canvas id="edit-canvas"></canvas><button type="button" class="edit-x" id="edit-remove" aria-label="Clear image">×</button></div></div>`;
  }

  function sourceStrip() {
    const thumbs = imageUi.sources.map((src) => {
      const on = src.id === (activeSource()?.id) ? " is-on" : "";
      return `<button type="button" class="edit-thumb${on}" data-edit-source="${esc(src.id)}" aria-label="${esc(src.name)}"><img src="${esc(src.url)}" alt="" /></button>`;
    }).join("");
    if (!thumbs) return "";
    return `${thumbs}<button type="button" class="edit-add" data-edit-pick aria-label="Add image">+</button>`;
  }

  function editHtml() {
    const model = editModel();
    const thinking = model?.supportsMaskedInpaint ? (model.thinkingLevels || []) : [];
    const options = [
      choiceBox("edit-aspect", "Aspect", aspectLocked() ? [] : (model?.aspects || []), imageUi.aspect),
      choiceBox("edit-resolution", "Resolution", model?.resolutions || [], imageUi.resolution),
      choiceBox("edit-quality", "Quality", model?.qualities || [], imageUi.quality),
      choiceBox("edit-thinking", "Thinking", thinking, imageUi.thinking),
      editChecks(model),
    ].join("");
    const count = Math.min(4, Math.max(1, Number(imageUi.count) || 1));
    return `
      <div class="music-studio" id="edit-root">
        <section class="music-stage">
          <div class="gen-stage"><div class="gen-canvas" id="edit-stage">${editStage()}</div></div>
          <div class="edit-sources">${sourceStrip()}</div>
        </section>
        <aside class="inspector music-controls">
          <div class="inspector-scroll">
            <div class="select-box">
              <span>${model ? esc(model.name) : "Model"}</span>
              <span aria-hidden="true">⌄</span>
              <select id="edit-model" aria-label="Edit model">${imageUi.models.map((m) => `<option value="${esc(m.id)}"${m.id === imageUi.modelId ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
            </div>
            <div class="edit-count" role="group" aria-label="How many images">
              ${[1, 2, 3, 4].map((n) => `<button type="button" data-edit-count="${n}" class="${n === count ? "is-on" : ""}" aria-pressed="${n === count}">${n}</button>`).join("")}
            </div>
            ${options.trim() ? `<details class="edit-more"><summary>Options</summary>${options}</details>` : ""}
            <textarea id="edit-prompt" class="agent-input" placeholder="What to change">${esc(imageUi.prompt)}</textarea>
            <input id="edit-file" class="edit-file-ghost" type="file" accept="image/png,image/jpeg,image/webp" multiple />
          </div>
          <div class="music-go-bar">
            <button class="btn-primary" id="edit-go" type="button"${imageUi.busy ? " disabled" : ""}>${imageUi.busy ? "Editing…" : (count > 1 ? `Edit ${count}` : "Edit")}</button>
          </div>
        </aside>
      </div>`;
  }

  function imageHtml() {
    const body = imageUi.mode === "edit"
      ? editHtml()
      : window.StudioPanel.render({
          id: "image",
          kind: "image",
          result: "image",
          title: "Image",
          emptyTitle: "No image yet",
          placeholder: "A quiet canal at blue hour, warm windows, film still",
          promptLabel: "Prompt",
          button: "Generate image",
          ready: "Pick an image model. Generation stays in Venice Forge.",
          foot: "Image models only."
        });
    return `<div class="image-screen">${modeTabs()}<div class="image-pane">${body}</div></div>`;
  }

  function videoHtml() {
    return window.StudioPanel.render({
      id: "video",
      kind: "video",
      result: "video",
      title: "Video",
      emptyTitle: "No clip yet",
      placeholder: "A gondola turns a corner, slow camera drift, dusk",
      promptLabel: "Prompt",
      button: "Generate video",
      ready: "Text-to-video models only. Generation stays in Venice Forge.",
      foot: "Text-to-video models only."
    });
  }

  /* ============================================================
     MOVIE EDITOR
     ============================================================ */
  function fitSize(w, h) {
    const pixels = Math.max(1, w * h);
    if (!w || !h || pixels >= 16777216) return "";
    const scale = Math.min(4, Math.floor(Math.sqrt(16777216 / pixels) * 100) / 100);
    if (scale < 2) return `${w}×${h}`;
    return `${Math.round(w * scale)}×${Math.round(h * scale)}`;
  }

  function movieHtml() {
    const m = store.movie;
    const total = Math.min(m.frameCount || 0, 24);
    const look = Math.max(0, Math.min(m.look || 0, Math.max(total - 1, 0)));
    const comparing = total && (m.phase === "upscaling" || m.resultKind === "upscale");
    const thumbs = total
      ? `<div class="frame-strip">${Array.from({ length: Math.min(total, 12) }, (_, i) =>
          `<button type="button" class="frame-thumb${i === look ? " is-on" : ""}" data-frame="${i}"><img src="/api/movie/frame?id=${esc(m.id)}&i=${i}&kind=source" alt="Frame ${i + 1}" /></button>`
        ).join("")}</div>`
      : "";
    const before = `<img src="/api/movie/frame?id=${esc(m.id)}&i=${look}&kind=source" alt="Before" />`;
    const after = look < (m.cleanCount || 0)
      ? `<img src="/api/movie/frame?id=${esc(m.id)}&i=${look}&kind=clean" alt="After" />`
      : `<div class="frame-wait">${m.phase === "upscaling" ? "Upscaling…" : "After"}</div>`;
    const afterLabel = m.outWidth ? `${m.outWidth}×${m.outHeight}` : "After";
    const beforeLabel = m.width ? `${m.width}×${m.height}` : "Before";
    const pairs = comparing
      ? `<div class="frame-compare">
          <div class="frame-pair">
            <figure><figcaption>${esc(beforeLabel)}</figcaption>${before}</figure>
            <figure><figcaption>${esc(afterLabel)}</figcaption>${after}</figure>
          </div>
          ${thumbs}
          ${m.result && m.resultKind === "upscale" ? `<video class="movie-result" src="/api/movie/result?id=${esc(m.id)}" controls playsinline></video>` : ""}
        </div>`
      : "";
    const frames = total
      ? `<div class="frame-compare"><figure class="frame-solo"><img src="/api/movie/frame?id=${esc(m.id)}&i=${look}&kind=source" alt="Frame ${look + 1}" /></figure>${thumbs}</div>`
      : `<div class="music-empty"><p class="sub${m.tone === "error" ? " error" : ""}">${esc(m.status)}</p></div>`;
    const stage = pairs || (m.result
      ? `<video class="movie-result" src="/api/movie/result?id=${esc(m.id)}" controls playsinline></video>`
      : frames);
    const cap = fitSize(m.width, m.height);
    const size = cap ? `<p class="music-desc">Up to ${esc(cap)}</p>` : "";
    return `
      <div class="music-studio" id="movie-root">
        <section class="music-stage">
          <div class="gen-stage"><div class="gen-canvas" id="movie-stage">${stage}</div></div>
        </section>
        <aside class="inspector music-controls">
          <div class="inspector-scroll">
            <button type="button" class="edit-file" id="movie-pick"><span>${m.name ? esc(m.name) : "Choose video"}</span></button>
            <input id="movie-file" class="edit-file-ghost" type="file" accept="video/mp4,video/webm,video/quicktime" />
            <label class="edit-check"><input id="movie-nsfw" type="checkbox"${m.nsfw ? " checked" : ""}${m.busy ? " disabled" : ""} />NSFW</label>
            ${size}
            <p class="sub${m.tone === "error" ? " error" : ""}" id="movie-status">${esc(m.status)}</p>
          </div>
          <div class="music-go-bar movie-actions">
            <button class="btn-primary" id="movie-upscale" type="button"${m.busy || !m.id ? " disabled" : ""}>${m.phase === "upscaling" ? "Upscaling…" : "Upscale"}</button>
            <button class="btn-ghost" id="movie-pixel" type="button"${m.busy || !m.id ? " disabled" : ""}>${m.phase === "depixel" ? "Cleaning…" : "Remove pixelation"}</button>
            ${m.result ? `<a class="gen-download" href="/api/movie/result?id=${esc(m.id)}" download="${esc((m.name || "video").replace(/\.\w+$/, ""))}-${m.resultKind === "pixel" ? "clean" : "upscale"}.mp4">Download</a>` : ""}
          </div>
        </aside>
      </div>`;
  }

  /* ============================================================
     MUSIC — in-app studio. Venice web-app Music models only
     (outerface catalog + music queue). Not the developer API.
     Voice, TTS, and sound-effect models are excluded.
     Does not open or embed venice.ai.
     ============================================================ */
  const music = {
    models: [],
    modelId: "",
    prompt: "",
    lyrics: "",
    duration: null,
    instrumental: false,
    optimizer: false,
    tracks: [],
    status: "Loading Venice’s Music models…",
    tone: "",
    busy: false,
    inflight: null,
    gen: 0,
  };

  const MUSIC_ERRORS = {
    authenticationRequired: "Venice refused this generation because this studio has no Venice web session. The models listed are the live Music models from the web app. No track was invented in its place.",
    edgeBlocked: "Venice blocked the music queue before a track could be created. These are still the live web-app Music models. No audio was substituted.",
    insufficientBalance: "Venice refused the run: the web-app account does not have enough balance.",
    contentPolicyViolation: "Venice refused the prompt under its content policy.",
    MODEL_AT_CAPACITY: "That model is at capacity on Venice right now. Try another Music model.",
    inferenceFailed: "Venice started the job, then inference failed.",
    invalidParameters: "Venice rejected these settings for this model.",
    audioDurationTooLong: "That duration is longer than this model allows.",
    audioDurationTooShort: "That duration is shorter than this model allows.",
    processingTimeout: "Venice did not finish the track in time.",
    payloadTooLarge: "The prompt or lyrics are too long for this model.",
    unknownModel: "That model is not in Venice’s Music list.",
    lyricsRequired: "This model needs lyrics.",
    promptTooShort: "The prompt is shorter than this model allows.",
  };

  function currentMusicModel() {
    return music.models.find((m) => m.id === music.modelId) || null;
  }

  function musicHtml() {
    const model = currentMusicModel();
    const duration = music.duration ?? model?.defaultDuration ?? model?.minDuration ?? 30;
    return `
      <div class="music-studio" id="music-root">
        <section class="music-stage">
          <div class="panel-head">
            <span class="panel-title">Music</span>
            <span class="music-live" id="music-live">${music.models.length ? esc(music.models.length + " web-app models") : "Web app · Music"}</span>
          </div>
          <div class="music-player ${music.busy ? "is-generating" : ""}" id="music-player">
            <div class="music-visual" aria-hidden="true">${Array.from({ length: 28 }, () => "<i></i>").join("")}</div>
            <div class="music-empty" id="music-empty">
              <div class="big">No track yet</div>
              <p class="sub" id="music-status">${esc(music.status)}</p>
            </div>
            <audio id="music-audio" controls hidden></audio>
            <div class="music-now" id="music-now" hidden></div>
          </div>
          <div class="music-tracks" id="music-tracks"></div>
        </section>
        <aside class="inspector music-controls">
          <div class="panel-head"><span class="panel-title">Venice Music</span></div>
          <div class="inspector-scroll">
            <div class="field-label">Web-app model</div>
            <div class="select-box">
              <span id="music-model-label">${model ? esc(model.name) : "Loading models…"}</span>
              <span aria-hidden="true">⌄</span>
              <select id="music-model" aria-label="Venice web-app music model"></select>
            </div>
            <p class="music-desc" id="music-desc">${model ? esc(model.description) : ""}</p>
            <div class="field-label">Prompt</div>
            <textarea id="music-prompt" class="agent-input" placeholder="Slow night drive, analog synths, soft drums, minor key">${esc(music.prompt)}</textarea>
            <div class="music-hint" id="music-prompt-hint"></div>
            <div id="music-lyrics-wrap" hidden>
              <div class="field-label">Lyrics</div>
              <textarea id="music-lyrics" class="agent-input" placeholder="[Verse]&#10;…">${esc(music.lyrics)}</textarea>
              <div class="music-hint" id="music-lyrics-hint"></div>
            </div>
            <div id="music-duration-wrap" hidden>
              <div class="slider-top"><span>Duration</span><span class="val" id="music-duration-val">${duration}s</span></div>
              <input id="music-duration" type="range" min="1" max="120" step="1" value="${duration}" aria-label="Duration in seconds" />
            </div>
            <div class="toggle-row" id="music-inst-row" hidden>
              <div><div class="t-name">Instrumental</div><div class="t-sub">Ask Venice for no vocals</div></div>
              <button type="button" class="switch ${music.instrumental ? "on" : ""}" id="music-inst" aria-pressed="${music.instrumental ? "true" : "false"}" aria-label="Instrumental"></button>
            </div>
            <div class="toggle-row" id="music-opt-row" hidden>
              <div><div class="t-name">Lyrics optimizer</div><div class="t-sub">Let this model refine the lyric draft</div></div>
              <button type="button" class="switch ${music.optimizer ? "on" : ""}" id="music-opt" aria-pressed="${music.optimizer ? "true" : "false"}" aria-label="Lyrics optimizer"></button>
            </div>
          </div>
          <div class="music-go-bar">
            <button class="btn-primary" id="music-go" type="button" disabled>Generate</button>
            <p class="music-foot">Song models only, on this page.</p>
          </div>
        </aside>
      </div>`;
  }

  function musicErrorText(json, status) {
    const code = json?.error || json?.code || "";
    if (MUSIC_ERRORS[code]) return MUSIC_ERRORS[code];
    if (typeof code === "string" && code.includes("<")) return MUSIC_ERRORS.edgeBlocked;
    if (status === 401 || status === 403) return MUSIC_ERRORS.authenticationRequired;
    if (typeof json?.message === "string" && json.message && json.message !== code) return json.message;
    if (typeof code === "string" && code && !code.startsWith("<")) return code;
    return "Venice did not return a track.";
  }

  function ensureMusicModels() {
    if (music.models.length) return Promise.resolve(music.models);
    if (music.inflight) return music.inflight;
    music.inflight = fetch("/api/music/models")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data.models) || !data.models.length) {
          throw new Error(data.message || data.error || "Venice’s Music catalog did not load.");
        }
        music.models = data.models;
        if (!music.models.some((m) => m.id === music.modelId)) music.modelId = music.models[0].id;
        const model = currentMusicModel();
        if (music.duration == null && model) music.duration = model.defaultDuration ?? model.minDuration;
        music.status = "Describe a song. Generate sends it to the selected Venice web-app model.";
        music.tone = "";
        return music.models;
      })
      .catch((err) => {
        music.status = err.message || "Could not load Venice’s Music models.";
        music.tone = "error";
        throw err;
      })
      .finally(() => { music.inflight = null; });
    return music.inflight;
  }

  function syncMusicControls() {
    const model = currentMusicModel();
    const label = document.getElementById("music-model-label");
    const desc = document.getElementById("music-desc");
    const live = document.getElementById("music-live");
    const lyricsWrap = document.getElementById("music-lyrics-wrap");
    const durationWrap = document.getElementById("music-duration-wrap");
    const instRow = document.getElementById("music-inst-row");
    const optRow = document.getElementById("music-opt-row");
    const promptHint = document.getElementById("music-prompt-hint");
    const lyricsHint = document.getElementById("music-lyrics-hint");
    const go = document.getElementById("music-go");
    const status = document.getElementById("music-status");
    const duration = document.getElementById("music-duration");
    const durationVal = document.getElementById("music-duration-val");
    if (label) label.textContent = model ? model.name : (music.models.length ? "Choose a model" : "Loading models…");
    if (desc) {
      desc.textContent = model?.description || "";
      desc.hidden = !model?.description;
    }
    if (live) live.textContent = music.models.length ? `${music.models.length} web-app models` : "Web app · Music";
    if (lyricsWrap) lyricsWrap.hidden = !model?.supportsLyrics;
    if (instRow) instRow.hidden = !model?.supportsForceInstrumental;
    if (optRow) optRow.hidden = !model?.supportsLyricsOptimizer;
    const hasDuration = !!(model && (model.durationOptions?.length || model.minDuration != null || model.maxDuration != null));
    if (durationWrap) durationWrap.hidden = !hasDuration;
    if (duration && model && hasDuration) {
      const min = model.minDuration ?? model.durationOptions?.[0] ?? 1;
      const max = model.maxDuration ?? model.durationOptions?.[model.durationOptions.length - 1] ?? min;
      duration.min = String(min);
      duration.max = String(max);
      duration.step = model.durationOptions?.length ? "1" : (max - min > 120 ? "5" : "1");
      let value = music.duration ?? model.defaultDuration ?? min;
      if (model.durationOptions?.length) {
        value = model.durationOptions.reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best, model.durationOptions[0]);
      }
      value = Math.min(max, Math.max(min, value));
      music.duration = value;
      duration.value = String(value);
      if (durationVal) durationVal.textContent = `${value}s`;
    }
    const prompt = music.prompt.trim();
    const minPrompt = model?.minPromptLength || 1;
    const maxPrompt = model?.promptCharacterLimit || 2000;
    if (promptHint) {
      promptHint.textContent = model ? `${prompt.length}/${maxPrompt}` + (prompt.length < minPrompt ? ` · at least ${minPrompt}` : "") : "";
    }
    if (lyricsHint && model?.supportsLyrics) {
      const maxLyrics = model.lyricsCharacterLimit || 0;
      const need = model.lyricsRequired && !(model.supportsForceInstrumental && music.instrumental);
      lyricsHint.textContent = `${music.lyrics.trim().length}${maxLyrics ? "/" + maxLyrics : ""}${need ? " · required" : ""}`;
    }
    const promptOk = !!model && prompt.length >= minPrompt && prompt.length <= maxPrompt;
    const lyricsOk = !model?.supportsLyrics || !model.lyricsRequired || (model.supportsForceInstrumental && music.instrumental) || music.lyrics.trim().length > 0;
    if (go) {
      go.disabled = music.busy || !promptOk || !lyricsOk;
      go.textContent = music.busy ? "Generating on Venice…" : "Generate";
    }
    if (status && !music.busy) {
      status.textContent = music.status;
      status.className = "sub" + (music.tone ? " " + music.tone : "");
    }
    renderMusicTracks();
  }

  function renderMusicTracks() {
    const list = document.getElementById("music-tracks");
    if (!list) return;
    list.innerHTML = music.tracks.map((t) => `
      <button type="button" class="music-track ${t.id === music.activeId ? "active" : ""}" data-track="${esc(t.id)}">
        <span class="music-track-name">${esc(t.title)}</span>
        <span class="music-track-meta">${esc(t.modelName)}</span>
      </button>`).join("");
    list.querySelectorAll("[data-track]").forEach((btn) => {
      btn.onclick = () => playMusicTrack(btn.dataset.track);
    });
  }

  function playMusicTrack(id) {
    const track = music.tracks.find((t) => t.id === id);
    const audio = document.getElementById("music-audio");
    const empty = document.getElementById("music-empty");
    const now = document.getElementById("music-now");
    if (!track || !audio) return;
    music.activeId = id;
    audio.hidden = false;
    audio.src = track.url;
    if (empty) empty.hidden = true;
    if (now) {
      now.hidden = false;
      now.textContent = `${track.title} · ${track.modelName}`;
    }
    audio.play().catch(() => {});
    renderMusicTracks();
  }

  function fillMusicModels() {
    const select = document.getElementById("music-model");
    if (!select) return;
    select.innerHTML = music.models.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
    if (music.modelId) select.value = music.modelId;
    syncMusicControls();
  }

  function wireMusic(ctx) {
    const prompt = document.getElementById("music-prompt");
    const lyrics = document.getElementById("music-lyrics");
    const select = document.getElementById("music-model");
    const duration = document.getElementById("music-duration");
    const inst = document.getElementById("music-inst");
    const opt = document.getElementById("music-opt");
    const go = document.getElementById("music-go");
    const audio = document.getElementById("music-audio");
    if (prompt) prompt.oninput = () => { music.prompt = prompt.value; syncMusicControls(); };
    if (lyrics) lyrics.oninput = () => { music.lyrics = lyrics.value; syncMusicControls(); };
    if (select) select.onchange = () => {
      music.modelId = select.value;
      const model = currentMusicModel();
      music.duration = model?.defaultDuration ?? model?.minDuration ?? null;
      if (!model?.supportsForceInstrumental) music.instrumental = false;
      if (!model?.supportsLyricsOptimizer) music.optimizer = false;
      if (inst) { inst.classList.toggle("on", music.instrumental); inst.setAttribute("aria-pressed", music.instrumental ? "true" : "false"); }
      if (opt) { opt.classList.toggle("on", music.optimizer); opt.setAttribute("aria-pressed", music.optimizer ? "true" : "false"); }
      syncMusicControls();
    };
    if (duration) duration.oninput = () => {
      let value = Number(duration.value);
      const model = currentMusicModel();
      if (model?.durationOptions?.length) {
        value = model.durationOptions.reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best, model.durationOptions[0]);
        duration.value = String(value);
      }
      music.duration = value;
      const label = document.getElementById("music-duration-val");
      if (label) label.textContent = `${value}s`;
    };
    const toggle = (el, key) => {
      if (!el) return;
      el.onclick = () => {
        music[key] = !music[key];
        el.classList.toggle("on", music[key]);
        el.setAttribute("aria-pressed", music[key] ? "true" : "false");
        syncMusicControls();
      };
    };
    toggle(inst, "instrumental");
    toggle(opt, "optimizer");
    if (audio) {
      audio.onplay = () => document.getElementById("music-player")?.classList.add("is-playing");
      audio.onpause = () => document.getElementById("music-player")?.classList.remove("is-playing");
      audio.onended = () => document.getElementById("music-player")?.classList.remove("is-playing");
    }
    const run = () => generateMusic(ctx);
    if (go) go.onclick = run;
    if (prompt) prompt.onkeydown = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
    };
    ensureMusicModels().then(() => {
      if (!document.getElementById("music-root")) return;
      fillMusicModels();
    }).catch(() => {
      if (!document.getElementById("music-root")) return;
      syncMusicControls();
    });
    if (music.models.length) fillMusicModels();
    else syncMusicControls();
    if (music.activeId) playMusicTrack(music.activeId);
  }

  async function generateMusic(ctx) {
    const model = currentMusicModel();
    if (!model || music.busy) return;
    const token = ++music.gen;
    music.busy = true;
    music.tone = "";
    music.status = `Queued on Venice with ${model.name}…`;
    const status = document.getElementById("music-status");
    const empty = document.getElementById("music-empty");
    const player = document.getElementById("music-player");
    if (empty) empty.hidden = false;
    if (status) status.textContent = music.status;
    player?.classList.add("is-generating");
    syncMusicControls();
    const payload = {
      modelId: model.id,
      prompt: music.prompt.trim(),
      lyricsPrompt: music.lyrics.trim(),
      forceInstrumental: music.instrumental,
      lyricsOptimizer: music.optimizer,
    };
    if (music.duration != null && (model.durationOptions?.length || model.minDuration != null || model.maxDuration != null)) {
      payload.durationSeconds = music.duration;
    }
    try {
      const res = await fetch("/api/music/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (token !== music.gen) return;
      const type = res.headers.get("content-type") || "";
      if (res.ok && !type.includes("application/json") && !type.includes("text/")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const track = {
          id: `${Date.now()}`,
          url,
          title: music.prompt.trim().slice(0, 72) || "Untitled",
          modelName: model.name,
          modelId: model.id,
        };
        music.tracks.unshift(track);
        if (music.tracks.length > 8) {
          const dropped = music.tracks.splice(8);
          dropped.forEach((t) => URL.revokeObjectURL(t.url));
        }
        music.activeId = track.id;
        music.status = `Playing the track Venice returned from ${model.name}.`;
        music.tone = "";
        music.busy = false;
        if (document.getElementById("music-root")) {
          player?.classList.remove("is-generating");
          playMusicTrack(track.id);
          syncMusicControls();
        }
        ctx.notify?.(`Track ready · ${model.name}`);
        return;
      }
      const json = await res.json().catch(() => ({}));
      music.status = musicErrorText(json, res.status);
      music.tone = "error";
    } catch (err) {
      if (token !== music.gen) return;
      music.status = err?.message || "Could not reach Venice.";
      music.tone = "error";
    }
    music.busy = false;
    if (!document.getElementById("music-root")) return;
    player?.classList.remove("is-generating");
    if (empty) empty.hidden = false;
    syncMusicControls();
  }

  /* ============================================================
     AUDIO SCORE
     ============================================================ */
  function audioHtml() {
    return window.StudioPanel.render({
      id: "audio",
      kind: "audio",
      result: "audio",
      title: "Audio",
      emptyTitle: "No audio yet",
      placeholder: "A calm voice reading a short line, or a soft door closing",
      promptLabel: "Prompt",
      button: "Generate audio",
      ready: "Voice and sound models only. Song models stay on the Music page.",
      foot: "Voice and sound only. Songs stay on Music."
    });
  }

  /* ============================================================
     wiring
     ============================================================ */
  function wireImage(ctx) {
    document.querySelectorAll("[data-image-mode]").forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.imageMode === "edit" ? "edit" : "create";
        if (imageUi.mode === mode) return;
        captureEdit();
        imageUi.mode = mode;
        rerender(ctx);
      };
    });
    if (imageUi.mode === "edit") wireEdit(ctx);
    else window.StudioPanel.wire({ id: "image", kind: "image", result: "image", ready: "Pick an image model. Generation stays in Venice Forge." });
  }

  function captureEdit() {
    const prompt = document.getElementById("edit-prompt");
    if (prompt) imageUi.prompt = prompt.value;
    const enhance = document.getElementById("edit-enhance");
    if (enhance) imageUi.enhance = enhance.checked;
    const reasoning = document.getElementById("edit-reasoning");
    if (reasoning) imageUi.reasoning = reasoning.checked;
    const transparent = document.getElementById("edit-transparent");
    if (transparent) imageUi.transparent = transparent.checked;
  }

  function applyEditDefaults(model) {
    if (!model) return;
    if (!model.aspects?.includes(imageUi.aspect)) imageUi.aspect = model.defaultAspect || model.aspects?.[0] || "";
    if (!model.resolutions?.includes(imageUi.resolution)) imageUi.resolution = model.defaultResolution || model.resolutions?.[0] || "";
    if (!(model.qualities || []).includes(imageUi.quality)) imageUi.quality = model.defaultQuality || (model.qualities || [])[0] || "";
    if (!(model.thinkingLevels || []).includes(imageUi.thinking)) imageUi.thinking = model.defaultThinking || (model.thinkingLevels || [])[0] || "";
    if (imageUi.tool === "mask" && !model.supportsMaskedInpaint) imageUi.tool = "doodle";
    if (imageUi.tool === "doodle" && !model.supportsDoodle && model.supportsMaskedInpaint) imageUi.tool = "mask";
  }

  async function ensureEditModels(ctx) {
    if (imageUi.models.length || imageUi.editTried) return;
    imageUi.editTried = true;
    try {
      const res = await fetch("/api/studio/models?kind=edit");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.models) || !data.models.length) {
        throw new Error(data.message || data.error || "Venice did not return edit models.");
      }
      imageUi.models = data.models;
      if (!imageUi.models.some((m) => m.id === imageUi.modelId)) imageUi.modelId = imageUi.models[0].id;
      applyEditDefaults(editModel());
      imageUi.tone = "";
    } catch (err) {
      imageUi.status = err.message || "Could not load edit models.";
      imageUi.tone = "error";
    }
    if (imageUi.mode === "edit" && ctx.state.tab === "Image Gen") rerender(ctx);
  }

  function drawStroke(ctx2d, stroke, w, h, mask) {
    if (!stroke.points?.length) return;
    ctx2d.save();
    ctx2d.lineCap = "round";
    ctx2d.lineJoin = "round";
    ctx2d.strokeStyle = mask ? "#fff" : (stroke.color || "#e85d4c");
    ctx2d.fillStyle = ctx2d.strokeStyle;
    ctx2d.lineWidth = Math.max(2, (Number(stroke.width) || 0.02) * w);
    ctx2d.beginPath();
    stroke.points.forEach((p, i) => {
      const x = p.x * w;
      const y = p.y * h;
      if (i === 0) ctx2d.moveTo(x, y);
      else ctx2d.lineTo(x, y);
    });
    if (stroke.points.length === 1) {
      const p = stroke.points[0];
      ctx2d.arc(p.x * w, p.y * h, ctx2d.lineWidth / 2, 0, Math.PI * 2);
      ctx2d.fill();
    } else ctx2d.stroke();
    ctx2d.restore();
  }

  function redrawMarks() {
    const canvas = document.getElementById("edit-canvas");
    const img = document.getElementById("edit-photo");
    const src = activeSource();
    if (!canvas || !img || !src) return;
    const w = Math.max(1, Math.round(img.clientWidth));
    const h = Math.max(1, Math.round(img.clientHeight));
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, w, h);
    const pack = marksFor(src.id);
    const list = imageUi.tool === "mask" ? pack.mask : pack.doodle;
    g.globalAlpha = imageUi.tool === "mask" ? 0.45 : 1;
    for (const stroke of list) drawStroke(g, stroke, w, h, imageUi.tool === "mask");
    g.globalAlpha = 1;
  }

  function fitCanvas() {
    const img = document.getElementById("edit-photo");
    if (!img) return;
    if (!img.complete) {
      img.onload = () => redrawMarks();
      return;
    }
    redrawMarks();
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      if (!blob) { reject(new Error("That image could not be read.")); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("That image could not be read."));
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That image could not be read."));
      img.src = url;
    });
  }

  async function fileToSource(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type || "")) throw new Error("Use a PNG, JPEG, or WebP.");
    const raw = await blobToDataUrl(file);
    const img = await loadImage(raw);
    if (img.width < 64 || img.height < 64) throw new Error("Each side of the image needs to be at least 64 pixels.");
    const scale = Math.min(1, 2048 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const url = await blobToDataUrl(await canvasBlob(canvas, "image/jpeg", 0.92));
    return { id: "s" + Math.random().toString(36).slice(2, 10), name: file.name || "Image", url };
  }

  async function rasterSource(src) {
    const img = await loadImage(src.url);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    const pack = marksFor(src.id);
    if (editModel()?.supportsDoodle) {
      for (const stroke of pack.doodle) drawStroke(g, stroke, w, h, false);
    }
    const image = await blobToDataUrl(await canvasBlob(canvas, "image/jpeg", 0.92));
    let mask = "";
    if (editModel()?.supportsMaskedInpaint && pack.mask.length) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = w;
      maskCanvas.height = h;
      const mg = maskCanvas.getContext("2d");
      mg.fillStyle = "#000";
      mg.fillRect(0, 0, w, h);
      for (const stroke of pack.mask) drawStroke(mg, stroke, w, h, true);
      mask = await blobToDataUrl(await canvasBlob(maskCanvas, "image/png"));
    }
    return { image, mask };
  }

  async function editImage(ctx) {
    if (imageUi.busy) return;
    captureEdit();
    const prompt = imageUi.prompt.trim();
    if (!prompt) { ctx.notify?.("Say what to change."); return; }
    if (!imageUi.sources.length) { ctx.notify?.("Add an image first."); return; }
    const model = editModel();
    if (!model) { ctx.notify?.("Pick an edit model first."); return; }
    const doodle = imageUi.sources.some((s) => marksFor(s.id).doodle.length);
    const masked = imageUi.sources.some((s) => marksFor(s.id).mask.length);
    if (doodle && !model.supportsDoodle) { ctx.notify?.("This model does not take a drawing. Clear it, or pick a model that does."); return; }
    if (masked && !model.supportsMaskedInpaint) { ctx.notify?.("This model does not take a mask. Clear it, or pick a model that does."); return; }
    imageUi.busy = true;
    imageUi.tone = "";
    imageUi.view = "source";
    const count = Math.min(4, Math.max(1, Number(imageUi.count) || 1));
    for (const old of imageUi.results) if (old?.url) URL.revokeObjectURL(old.url);
    imageUi.results = [];
    imageUi.resultUrl = "";
    imageUi.status = count === 1 ? `Editing with ${model.name}…` : `Editing 1 of ${count}…`;
    rerender(ctx);
    const made = [];
    try {
      const rasters = [];
      for (const src of imageUi.sources) rasters.push(await rasterSource(src));
      const activeIndex = Math.max(0, imageUi.sources.findIndex((s) => s.id === activeSource()?.id));
      const body = {
        kind: "edit",
        modelId: imageUi.modelId,
        prompt,
        aspectRatio: aspectLocked() ? "auto" : imageUi.aspect,
        resolution: imageUi.resolution,
        quality: imageUi.quality,
        enhance: model.hasBuiltInPromptEnhancer ? false : imageUi.enhance === true,
        reasoning: imageUi.reasoning === true,
        transparent: imageUi.transparent === true,
        images: rasters.map((r) => r.image),
      };
      if (model.supportsMaskedInpaint && rasters[activeIndex]?.mask) {
        body.mask = rasters[activeIndex].mask;
        body.thinkingLevel = imageUi.thinking;
      }
      for (let i = 0; i < count; i += 1) {
        imageUi.status = count === 1 ? `Editing with ${model.name}…` : `Editing ${i + 1} of ${count}…`;
        if (ctx.state.tab === "Image Gen" && imageUi.mode === "edit") rerender(ctx);
        const res = await fetch("/api/studio/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const type = res.headers.get("content-type") || "";
        if (!res.ok || type.includes("json") || type.includes("text/html")) {
          const data = await res.json().catch(() => ({}));
          const message = data.message || data.error || "The model did not return anything.";
          if (!made.length) throw new Error(message);
          imageUi.status = `${made.length} finished. ${message}`;
          imageUi.tone = "";
          break;
        }
        const blob = await res.blob();
        if (!blob.size) {
          if (!made.length) throw new Error("Venice returned an empty edit.");
          imageUi.status = `${made.length} finished. Venice returned an empty edit.`;
          break;
        }
        const kind = blob.type || type;
        const ext = kind.includes("jpeg") ? "jpg" : kind.includes("webp") ? "webp" : "png";
        made.push({
          url: URL.createObjectURL(blob),
          name: `${model.id || "venice-edit"}-${i + 1}.${ext}`,
        });
        imageUi.results = made.slice();
        imageUi.resultUrl = made[0].url;
        imageUi.resultName = made[0].name;
        imageUi.view = "result";
        imageUi.tone = "";
        imageUi.status = made.length === count
          ? (count === 1 ? `${model.name} finished inside Venice Forge.` : `${count} edits finished inside Venice Forge.`)
          : `${made.length} of ${count} ready.`;
      }
    } catch (err) {
      imageUi.status = err?.message || "The model did not return anything.";
      imageUi.tone = "error";
      imageUi.view = made.length ? "result" : "source";
    } finally {
      imageUi.busy = false;
      if (ctx.state.tab === "Image Gen" && imageUi.mode === "edit") rerender(ctx);
    }
  }

  function bindEditPointer() {
    const canvas = document.getElementById("edit-canvas");
    if (!canvas) return;
    let drawing = null;
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / Math.max(1, r.height))),
      };
    };
    const down = (e) => {
      if (!activeSource()) return;
      const model = editModel();
      const tool = imageUi.tool === "mask" && model?.supportsMaskedInpaint ? "mask" : "doodle";
      if (tool === "doodle" && !model?.supportsDoodle) return;
      if (tool === "mask" && !model?.supportsMaskedInpaint) return;
      canvas.setPointerCapture?.(e.pointerId);
      const pack = marksFor(activeSource().id);
      const stroke = {
        color: imageUi.color,
        width: (Number(imageUi.brush) || 28) / Math.max(1, canvas.getBoundingClientRect().width),
        points: [point(e)],
      };
      (tool === "mask" ? pack.mask : pack.doodle).push(stroke);
      drawing = stroke;
      redrawMarks();
    };
    const move = (e) => {
      if (!drawing) return;
      drawing.points.push(point(e));
      redrawMarks();
    };
    const up = () => { drawing = null; };
    canvas.onpointerdown = down;
    canvas.onpointermove = move;
    canvas.onpointerup = up;
    canvas.onpointercancel = up;
  }

  function wireEdit(ctx) {
    ensureEditModels(ctx);
    const modelSelect = document.getElementById("edit-model");
    if (modelSelect) modelSelect.onchange = () => {
      captureEdit();
      imageUi.modelId = modelSelect.value;
      applyEditDefaults(editModel());
      rerender(ctx);
    };
    for (const [id, key] of [["edit-aspect", "aspect"], ["edit-resolution", "resolution"], ["edit-quality", "quality"], ["edit-thinking", "thinking"]]) {
      const el = document.getElementById(id);
      if (el) el.onchange = () => {
        imageUi[key] = el.value;
        const label = el.parentElement?.querySelector("span");
        if (label) label.textContent = el.selectedOptions?.[0]?.textContent || el.value;
      };
    }
    const prompt = document.getElementById("edit-prompt");
    if (prompt) prompt.oninput = () => { imageUi.prompt = prompt.value; };
    const enhance = document.getElementById("edit-enhance");
    if (enhance) enhance.onchange = () => { imageUi.enhance = enhance.checked; };
    const reasoning = document.getElementById("edit-reasoning");
    if (reasoning) reasoning.onchange = () => { imageUi.reasoning = reasoning.checked; };
    const transparent = document.getElementById("edit-transparent");
    if (transparent) transparent.onchange = () => { imageUi.transparent = transparent.checked; };
    const ink = document.getElementById("edit-ink");
    if (ink) ink.oninput = () => { imageUi.color = ink.value; };
    const brush = document.getElementById("edit-brush");
    if (brush) brush.oninput = () => { imageUi.brush = Number(brush.value) || 28; };
    document.querySelectorAll("[data-edit-tool]").forEach((btn) => {
      btn.onclick = () => {
        imageUi.tool = btn.dataset.editTool === "mask" ? "mask" : "doodle";
        captureEdit();
        rerender(ctx);
      };
    });
    const clear = document.getElementById("edit-clear");
    if (clear) clear.onclick = () => {
      const src = activeSource();
      if (!src) return;
      const pack = marksFor(src.id);
      if (imageUi.tool === "mask") pack.mask = [];
      else pack.doodle = [];
      redrawMarks();
    };
    document.querySelectorAll("[data-edit-source]").forEach((btn) => {
      btn.onclick = () => {
        imageUi.activeId = btn.dataset.editSource;
        imageUi.view = "source";
        captureEdit();
        rerender(ctx);
      };
    });
    document.querySelectorAll("[data-edit-pick]").forEach((btn) => {
      btn.onclick = () => document.getElementById("edit-file")?.click();
    });
    const file = document.getElementById("edit-file");
    if (file) file.onchange = async () => {
      const files = Array.from(file.files || []);
      file.value = "";
      const max = editModel()?.maxInputImages || 4;
      for (const item of files) {
        if (imageUi.sources.length >= max) {
          ctx.notify?.(`This model accepts ${max} image${max === 1 ? "" : "s"}.`);
          break;
        }
        try {
          const src = await fileToSource(item);
          imageUi.sources.push(src);
          imageUi.activeId = src.id;
          imageUi.view = "source";
          imageUi.tone = "";
          imageUi.status = "Add an image, then say what to change. The edit stays in this studio.";
        } catch (err) {
          ctx.notify?.(err?.message || "That image could not be read.");
        }
      }
      captureEdit();
      rerender(ctx);
    };
    document.querySelectorAll("[data-edit-count]").forEach((btn) => {
      btn.onclick = () => {
        imageUi.count = Math.min(4, Math.max(1, Number(btn.dataset.editCount) || 1));
        document.querySelectorAll("[data-edit-count]").forEach((b) => {
          const on = Number(b.dataset.editCount) === imageUi.count;
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        const goBtn = document.getElementById("edit-go");
        if (goBtn && !imageUi.busy) goBtn.textContent = imageUi.count > 1 ? `Edit ${imageUi.count}` : "Edit";
      };
    });
    const go = document.getElementById("edit-go");
    if (go) go.onclick = () => editImage(ctx);
    if (prompt) prompt.onkeydown = (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); editImage(ctx); }
    };
    const show = document.getElementById("edit-show-source");
    if (show) show.onclick = () => { imageUi.view = "source"; rerender(ctx); };
    const clearResult = document.getElementById("edit-clear-result");
    if (clearResult) clearResult.onclick = () => {
      for (const item of imageUi.results) if (item?.url) URL.revokeObjectURL(item.url);
      imageUi.results = [];
      imageUi.resultUrl = "";
      imageUi.resultName = "venice-edit.png";
      imageUi.view = "source";
      imageUi.tone = "";
      imageUi.status = imageUi.sources.length
        ? "Cleared the edit. The source image is still here."
        : "Add an image, then say what to change. The edit stays in this studio.";
      rerender(ctx);
    };
    document.querySelectorAll("[data-edit-clear]").forEach((btn) => {
      btn.onclick = () => {
        const index = Number(btn.dataset.editClear);
        const gone = imageUi.results[index];
        if (gone?.url) URL.revokeObjectURL(gone.url);
        imageUi.results.splice(index, 1);
        imageUi.resultUrl = imageUi.results[0]?.url || "";
        imageUi.resultName = imageUi.results[0]?.name || "venice-edit.png";
        if (!imageUi.results.length) {
          imageUi.view = "source";
          imageUi.status = "Cleared the edit. The source image is still here.";
        }
        rerender(ctx);
      };
    });
    const remove = document.getElementById("edit-remove");
    if (remove) remove.onclick = () => {
      const src = activeSource();
      if (!src) return;
      imageUi.sources = imageUi.sources.filter((s) => s.id !== src.id);
      delete imageUi.marks[src.id];
      imageUi.activeId = imageUi.sources[0]?.id || null;
      imageUi.view = "source";
      imageUi.tone = "";
      imageUi.status = imageUi.sources.length
        ? "Image removed."
        : "Add an image, then say what to change. The edit stays in this studio.";
      rerender(ctx);
    };
    document.querySelectorAll("[data-edit-use]").forEach((btn) => {
      btn.onclick = async () => {
        const item = imageUi.results[Number(btn.dataset.editUse)];
        if (!item?.url) return;
        const max = editModel()?.maxInputImages || 4;
        if (imageUi.sources.length >= max) {
          ctx.notify?.(`This model accepts ${max} image${max === 1 ? "" : "s"}.`);
          return;
        }
        try {
          const res = await fetch(item.url);
          const src = await fileToSource(new File([await res.blob()], item.name || "edit.png", { type: res.headers.get("content-type") || "image/png" }));
          imageUi.sources.push(src);
          imageUi.activeId = src.id;
          imageUi.view = "source";
          rerender(ctx);
        } catch (err) {
          ctx.notify?.(err?.message || "That image could not be used.");
        }
      };
    });
    fitCanvas();
    bindEditPointer();
  }

  function wireVideo() {
    window.StudioPanel.wire({ id: "video", kind: "video", result: "video", ready: "Text-to-video models only. Generation stays in Venice Forge." });
  }

  function applyMovie(data) {
    const m = store.movie;
    m.id = data.id || m.id;
    m.name = data.name || m.name;
    m.frameCount = data.frameCount || 0;
    m.cleanCount = data.cleanCount || 0;
    m.scale = data.scale === "2x" ? "2x" : (data.scale || m.scale);
    m.phase = data.phase || "";
    m.status = data.status || m.status;
    m.tone = data.tone || "";
    m.result = !!data.result;
    m.resultKind = data.resultKind || "";
    m.duration = data.duration || 0;
    m.fps = data.fps || 0;
    m.width = data.width || m.width || 0;
    m.height = data.height || m.height || 0;
    m.outWidth = data.outWidth || 0;
    m.outHeight = data.outHeight || 0;
    m.busy = data.phase === "upscaling" || data.phase === "depixel";
  }

  function pollMovie(ctx) {
    const m = store.movie;
    if (!m.id || !m.busy) return;
    clearTimeout(m.timer);
    m.timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/movie/status?id=" + encodeURIComponent(m.id));
        const data = await res.json().catch(() => ({}));
        if (res.ok) applyMovie(data);
      } catch {}
      if (ctx.state.tab === "Movie Editor") rerender(ctx);
      if (store.movie.busy) pollMovie(ctx);
    }, 1500);
  }

  function wireMovie(ctx) {
    const m = store.movie;
    const file = document.getElementById("movie-file");
    const pick = document.getElementById("movie-pick");
    if (pick) pick.onclick = () => file?.click();
    if (file) file.onchange = async () => {
      const item = file.files?.[0];
      file.value = "";
      if (!item) return;
      m.busy = true;
      m.status = "Splitting frames…";
      m.tone = "";
      m.result = false;
      m.look = 0;
      m.outWidth = 0;
      m.outHeight = 0;
      m.name = item.name;
      rerender(ctx);
      try {
        const res = await fetch("/api/movie/open?name=" + encodeURIComponent(item.name), {
          method: "POST",
          headers: { "Content-Type": item.type || "video/mp4" },
          body: item,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || "That video could not be opened.");
        applyMovie(data);
      } catch (err) {
        m.busy = false;
        m.tone = "error";
        m.status = err?.message || "That video could not be opened.";
      }
      if (ctx.state.tab === "Movie Editor") rerender(ctx);
    };
    document.querySelectorAll("[data-frame]").forEach((btn) => {
      btn.onclick = () => {
        m.look = Number(btn.dataset.frame) || 0;
        rerender(ctx);
      };
    });
    const nsfw = document.getElementById("movie-nsfw");
    if (nsfw) nsfw.onchange = () => {
      if (m.busy) return;
      m.nsfw = nsfw.checked;
      rerender(ctx);
    };
    const run = (action) => {
      if (!m.id || m.busy) return;
      m.busy = true;
      m.phase = action === "pixel" ? "depixel" : "upscaling";
      m.tone = "";
      m.status = action === "pixel" ? "Removing pixelation…" : "Starting the upscale…";
      rerender(ctx);
      fetch("/api/movie/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, action, scale: m.scale, nsfw: !!m.nsfw }),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || "Venice did not start.");
        applyMovie(data);
        if (ctx.state.tab === "Movie Editor") rerender(ctx);
        pollMovie(ctx);
      }).catch((err) => {
        m.busy = false;
        m.phase = "ready";
        m.tone = "error";
        m.status = err?.message || "Venice did not start.";
        if (ctx.state.tab === "Movie Editor") rerender(ctx);
      });
    };
    const up = document.getElementById("movie-upscale");
    const pixel = document.getElementById("movie-pixel");
    if (up) up.onclick = () => run("upscale");
    if (pixel) pixel.onclick = () => run("pixel");
    if (m.busy) pollMovie(ctx);
  }

  function wireAudio() {
    window.StudioPanel.wire({ id: "audio", kind: "audio", result: "audio", ready: "Voice and sound models only. Song models stay on the Music page." });
  }

  function rerender(ctx) {
    const mount = document.querySelector("#screen");
    if (!mount) return;
    mount.innerHTML = renderSync(ctx);
    wire(ctx);
  }

  function renderSync(ctx) {
    switch (ctx.state.tab) {
      case "Image Gen": return imageHtml(ctx);
      case "Video Studio": return videoHtml(ctx);
      case "Movie Editor": return movieHtml(ctx);
      case "Music": return musicHtml(ctx);
      case "Audio Score": return audioHtml(ctx);
      default: return "";
    }
  }

  function render(ctx) { return renderSync(ctx); }

  function wire(ctx) {
    if (ctx.state.tab === "Image Gen") wireImage(ctx);
    else if (ctx.state.tab === "Video Studio") wireVideo(ctx);
    else if (ctx.state.tab === "Movie Editor") wireMovie(ctx);
    else if (ctx.state.tab === "Music") wireMusic(ctx);
    else if (ctx.state.tab === "Audio Score") wireAudio(ctx);
  }

  window.__SCREENS__ = window.__SCREENS__ || [];
  window.__SCREENS__.push({ id: "media", TABS: ["Image Gen", "Video Studio", "Movie Editor", "Music", "Audio Score"], render, wire });
})();
