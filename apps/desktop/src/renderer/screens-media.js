/* ============================================================
   Venice Forge — screens: Image Gen, Video Studio, Movie Editor, Music, Audio Score
   Classic-script module. Registers on window.__SCREENS__.
   Contract: { id, TABS, render(ctx), wire(ctx) }
   ============================================================ */
(function () {
  "use strict";

  const store = {
    movieClips: [
      { id: 1, track: "V1", name: "Arrival", start: 0, len: 4.2, color: "#8175ff" },
      { id: 2, track: "V1", name: "Threshold", start: 5.1, len: 3.6, color: "#9ea9ff" },
      { id: 3, track: "V2", name: "Score bed", start: 0, len: 12, bars: 44, color: "#72ddb8" },
    ],
  };

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ============================================================
     IMAGE GEN
     ============================================================ */
  function imageHtml() {
    return window.StudioPanel.render({
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
  function movieHtml(ctx) {
    const total = store.movieClips.reduce((sum, c) => sum + (c.len || 0), 0);
    return `
      <div class="workspace" style="grid-template-columns:1fr 304px">
        <section class="center">
          <div class="editor-tabs">
            <span class="editor-tab active">Timeline</span>
            <span style="flex:1"></span>
            <span style="font-size:10px;color:var(--fg-muted);padding-right:12px">1920 × 1080 · 24 fps · Stereo</span>
          </div>
          <div class="editor-body">
            <div style="flex:1;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#10151f,#0b0f19)">
              <div class="editor-empty" style="height:auto"><div class="big">Preview</div><div class="sub">Select a clip to preview it here.</div></div>
            </div>
            <div style="border-top:1px solid var(--border);background:var(--panel);padding:12px 16px 16px">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <button class="icon-btn" id="m-play" aria-label="Play timeline" title="Play">▶</button>
                <button class="icon-btn" id="m-stop" title="Stop">■</button>
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--fg-muted)">00:00:00</span>
                <span style="flex:1"></span>
                <span style="font-size:10px;color:var(--fg-muted)">${store.movieClips.length} clips · ${total}s</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;position:relative">
                <div style="position:absolute;top:0;bottom:0;left:47%;width:1px;background:var(--accent);opacity:.6"></div>
                ${["V1", "V2", "A1"].map((track) => `
                  <div style="display:flex;align-items:center;gap:10px;height:34px">
                    <span style="width:32px;font-size:9px;font-weight:600;color:var(--fg-muted)">${track}</span>
                    <div style="flex:1;position:relative;height:24px;background:var(--panel-raised);border-radius:4px">
                      ${store.movieClips.filter((c) => c.track === track).map((c) => `
                        <div class="clip" data-clip="${c.id}" style="position:absolute;left:${(c.start / total) * 100}%;width:${(c.len / total) * 100}%;top:3px;bottom:3px;background:${c.color};border-radius:3px;cursor:pointer;opacity:.85" aria-label="${c.name} clip"></div>`).join("")}
                    </div>
                  </div>`).join("")}
              </div>
            </div>
          </div>
        </section>
        <aside class="inspector">
          <div class="panel-head"><span class="panel-title">Inspector</span></div>
          <div class="inspector-scroll">
            <div class="field-label">Clip</div>
            <div id="clip-props">
              ${(() => { const c = store.movieClips[0]; return `
                <div class="kv"><span class="k">Name</span><span class="v">${esc(c.name)}</span></div>
                <div class="kv"><span class="k">Track</span><span class="v">${esc(c.track)}</span></div>
                <div class="kv"><span class="k">Start</span><span class="v">${c.start}s</span></div>
                <div class="kv"><span class="k">Length</span><span class="v">${c.len}s</span></div>`; })()}
            </div>
            <div class="field-label">Transition</div>
            <div class="select-box"><span>Cross dissolve</span><span style="color:var(--fg-muted)">⌄</span></div>
            <div class="field-label">Export</div>
            <button class="btn-primary">Export movie</button>
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
  function wireImage() {
    window.StudioPanel.wire({ id: "image", kind: "image", result: "image", ready: "Pick an image model. Generation stays in Venice Forge." });
  }

  function wireVideo() {
    window.StudioPanel.wire({ id: "video", kind: "video", result: "video", ready: "Text-to-video models only. Generation stays in Venice Forge." });
  }

  function wireMovie(ctx) {
    document.querySelectorAll("[data-clip]").forEach((n) => n.onclick = () => {
      const c = store.movieClips.find((x) => x.id === +n.dataset.clip);
      const props = document.querySelector("#clip-props");
      if (c && props) props.innerHTML = `
        <div class="kv"><span class="k">Name</span><span class="v">${esc(c.name)}</span></div>
        <div class="kv"><span class="k">Track</span><span class="v">${esc(c.track)}</span></div>
        <div class="kv"><span class="k">Start</span><span class="v">${c.start}s</span></div>
        <div class="kv"><span class="k">Length</span><span class="v">${c.len}s</span></div>`;
    });
    const play = document.querySelector("#m-play");
    if (play) play.onclick = () => ctx.notify("This timeline is a cut list. Playback isn’t available yet.");
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
