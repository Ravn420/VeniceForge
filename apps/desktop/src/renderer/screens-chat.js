/* ============================================================
   Venice Forge — screens: Chat + Library
   Classic-script module. Registers on window.__SCREENS__.
   Contract: { id, TABS, render(ctx), wire(ctx) }
   ============================================================ */
(function () {
  "use strict";

  /* ---------- shared module state ---------- */
  const store = {
    libItems: [],
    libSelected: null,
    libQuery: "",
    libView: "grid",
  };

  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ============================================================
     CHAT
     ============================================================ */
  function chatHtml(ctx) {
    return window.VeniceWebApp.render({ id: "chat", url: "https://venice.ai/chat/v2", title: "Venice Chat", subtitle: "Chat and select models directly in Venice.ai’s web app." });
  }

  function wireChat(ctx) {
    window.VeniceWebApp.wire(ctx, { id: "chat", url: "https://venice.ai/chat/v2" });
  }

  /* ============================================================
     LIBRARY
     ============================================================ */
  function kindOf(name) {
    const ext = name.split(".").pop().toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "Image";
    if (["mp4", "mov", "webm", "mkv", "avi"].includes(ext)) return "Video";
    if (["mp3", "wav", "flac", "ogg", "m4a"].includes(ext)) return "Audio";
    if (["json", "md", "txt", "csv", "yml", "yaml", "toml", "ini", "log"].includes(ext)) return "Text";
    if (["ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "c", "cpp", "h"].includes(ext)) return "Code";
    return "File";
  }

  function libraryHtml(ctx) {
    const items = store.libItems;
    const q = store.libQuery.toLowerCase();
    const shown = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    const sel = store.libSelected;
    return `
      <div class="workspace" style="grid-template-columns:1fr 340px">
        <section class="center">
          <div class="editor-tabs" style="padding:0 16px;gap:18px;align-items:center">
            <span class="panel-title" style="font-size:14px;font-weight:600;color:var(--fg)">Library</span>
            <span style="flex:1"></span>
            <div class="search" style="margin:8px 0;width:240px;height:32px">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
              <input id="lib-q" placeholder="Search…" value="${esc(store.libQuery)}" />
            </div>
            <button class="mode-chip ${store.libView === "grid" ? "active" : ""}" id="v-grid" style="height:28px;padding:0 12px">Grid</button>
            <button class="mode-chip ${store.libView === "list" ? "active" : ""}" id="v-list" style="height:28px;padding:0 12px">List</button>
          </div>
          <div class="editor-body" style="padding:8px 16px;overflow:auto">
            ${items.length === 0 ? `
              <div class="editor-empty" style="height:100%">
                <div class="big">Nothing here yet</div>
                <div class="sub">Open a project folder to index its files, or drop assets into the library.</div>
                <button class="btn-primary" id="lib-open" style="width:auto;margin-top:10px;padding:0 18px">Open folder</button>
              </div>` : `
              <div style="display:${store.libView === "grid" ? "grid" : "flex"};${store.libView === "grid" ? "grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px" : "flex-direction:column;gap:4px"}">
                ${shown.map((it) => store.libView === "grid" ? `
                  <div class="template-card ${sel && sel.name === it.name ? "active" : ""}" data-lib="${esc(it.name)}" style="margin:0">
                    <div style="height:74px;border-radius:5px;background:var(--panel-active);display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:8px">${iconFor(it.name)}</div>
                    <div class="t-name" style="font-size:10px">${esc(it.name)}</div>
                    <div class="t-sub">${esc(kindOf(it.name))} · ${esc(it.size || "")}</div>
                  </div>` : `
                  <div class="tree-item ${sel && sel.name === it.name ? "active" : ""}" data-lib="${esc(it.name)}" style="padding-left:12px">
                    <span class="file-ico">${iconFor(it.name)}</span>
                    <span class="name">${esc(it.name)}</span>
                    <span class="badge">${esc(kindOf(it.name))} · ${esc(it.size || "")}</span>
                  </div>`).join("")}
              </div>`}
          </div>
        </section>
        <aside class="inspector">
          <div class="panel-head"><span class="panel-title">Details</span></div>
          <div class="inspector-scroll">
            ${sel ? `
              <div style="height:120px;border-radius:6px;background:var(--panel-active);display:flex;align-items:center;justify-content:center;font-size:34px;margin-bottom:14px">${iconFor(sel.name)}</div>
              <div class="field-label">Name</div>
              <div style="font-size:12px;color:var(--fg);word-break:break-all">${esc(sel.name)}</div>
              <div class="field-label">Kind</div>
              <div class="kv"><span class="k">Type</span><span class="v">${esc(kindOf(sel.name))}</span></div>
              <div class="kv"><span class="k">Size</span><span class="v">${esc(sel.size || "—")}</span></div>
              <div class="kv"><span class="k">Path</span><span class="v" style="max-width:190px;overflow:hidden;text-overflow:ellipsis">${esc(sel.path || "")}</span></div>
              ${sel.preview ? `<div class="field-label">Preview</div><div class="code-block" style="max-height:180px;overflow:auto">${esc(sel.preview)}</div>` : ""}
            ` : `<div class="editor-empty" style="height:100%"><div class="big">No selection</div><div class="sub">Pick a file to inspect it.</div></div>`}
          </div>
        </aside>
      </div>`;
  }

  function iconFor(name) {
    const k = kindOf(name);
    return { Image: "🖼", Video: "🎬", Audio: "🎵", Code: "🧩", Text: "📄", File: "📦" }[k] || "📦";
  }

  async function loadLibrary(ctx) {
    if (!ctx.state.projectDir) { store.libItems = []; return; }
    try {
      const entries = await ctx.forge.files.list(ctx.state.projectDir);
      const flat = [];
      const walk = async (dir, prefix) => {
        let list = [];
        try { list = await ctx.forge.files.list(dir); } catch { return; }
        for (const e of list) {
          if (e.dir) { await walk(e.path, prefix + e.name + "/"); continue; }
          flat.push({ name: prefix + e.name, path: e.path, size: e.size ? fmtSize(e.size) : "" });
        }
      };
      for (const e of entries) {
        if (e.dir) { await walk(e.path, e.name + "/"); continue; }
        flat.push({ name: e.name, path: e.path, size: e.size ? fmtSize(e.size) : "" });
      }
      store.libItems = flat;
    } catch { store.libItems = []; }
  }

  function fmtSize(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  function renderLibraryOnly(ctx) {
    const mount = document.querySelector("#screen");
    if (mount && ctx.state.tab === "Library") { mount.innerHTML = libraryHtml(ctx); wireLibrary(ctx); }
  }

  function wireLibrary(ctx) {
    const q = document.querySelector("#lib-q");
    if (q) q.oninput = () => { store.libQuery = q.value; renderLibraryOnly(ctx); const nq = document.querySelector("#lib-q"); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } };
    const g = document.querySelector("#v-grid"); if (g) g.onclick = () => { store.libView = "grid"; renderLibraryOnly(ctx); };
    const l = document.querySelector("#v-list"); if (l) l.onclick = () => { store.libView = "list"; renderLibraryOnly(ctx); };
    const op = document.querySelector("#lib-open"); if (op) op.onclick = () => ctx.openProject().then(() => loadLibrary(ctx).then(() => renderLibraryOnly(ctx)));
    document.querySelectorAll("[data-lib]").forEach((n) => n.onclick = async () => {
      const name = n.dataset.lib;
      const item = store.libItems.find((i) => i.name === name);
      if (!item) return;
      if (kindOf(name) === "Text" || kindOf(name) === "Code") {
        try { item.preview = (await ctx.forge.files.read(item.path)).slice(0, 4000); } catch {}
      }
      store.libSelected = item;
      renderLibraryOnly(ctx);
    });
  }

  /* ============================================================
     module export
     ============================================================ */
  async function render(ctx) {
    if (ctx.state.tab === "Chat") return chatHtml(ctx);
    if (ctx.state.tab === "Library") { await loadLibrary(ctx); return libraryHtml(ctx); }
    return "";
  }

  function wire(ctx) {
    if (ctx.state.tab === "Chat") wireChat(ctx);
    else if (ctx.state.tab === "Library") wireLibrary(ctx);
  }

  window.__SCREENS__ = window.__SCREENS__ || [];
  window.__SCREENS__.push({ id: "chat", TABS: ["Chat", "Library"], render, wire });
})();
