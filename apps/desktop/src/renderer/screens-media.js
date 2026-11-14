/* ============================================================
   Venice Forge — screens: Image Gen, Video Studio, Movie Editor, Audio Score
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
  function imageHtml(ctx) {
    return window.VeniceWebApp.render({ id: "image", url: "https://venice.ai/studio/image", title: "Venice Image Studio", subtitle: "Generate and edit with Venice.ai’s own model picker and web-app controls." });
  }

  /* ============================================================
     VIDEO STUDIO
     ============================================================ */
  function videoHtml(ctx) {
    return window.VeniceWebApp.render({ id: "video", url: "https://venice.ai/studio/video", title: "Venice Video Studio", subtitle: "Choose a video model and create clips in Venice.ai’s web app." });
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
     AUDIO SCORE
     ============================================================ */
  function audioHtml(ctx) {
    return window.VeniceWebApp.render({ id: "audio", url: "https://venice.ai/studio/audio", title: "Venice Audio Studio", subtitle: "Choose an audio model and create music or sound in Venice.ai’s web app." });
  }

  /* ============================================================
     wiring
     ============================================================ */
  function wireImage(ctx) {
    window.VeniceWebApp.wire(ctx, { id: "image", url: "https://venice.ai/studio/image" });
  }

  function wireVideo(ctx) {
    window.VeniceWebApp.wire(ctx, { id: "video", url: "https://venice.ai/studio/video" });
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
    if (play) play.onclick = () => ctx.notify("Timeline playback is a preview placeholder.");
  }

  function wireAudio(ctx) {
    window.VeniceWebApp.wire(ctx, { id: "audio", url: "https://venice.ai/studio/audio" });
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
      case "Audio Score": return audioHtml(ctx);
      default: return "";
    }
  }

  function render(ctx) { return renderSync(ctx); }

  function wire(ctx) {
    if (ctx.state.tab === "Image Gen") wireImage(ctx);
    else if (ctx.state.tab === "Video Studio") wireVideo(ctx);
    else if (ctx.state.tab === "Movie Editor") wireMovie(ctx);
    else if (ctx.state.tab === "Audio Score") wireAudio(ctx);
  }

  window.__SCREENS__ = window.__SCREENS__ || [];
  window.__SCREENS__.push({ id: "media", TABS: ["Image Gen", "Video Studio", "Movie Editor", "Audio Score"], render, wire });
})();
