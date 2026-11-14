/* Shared first-party Venice.ai web-app view. The guest webContents is isolated from Forge. */
(function () {
  "use strict";

  const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeId = (value) => String(value || "view").replace(/[^a-z0-9_-]/gi, "-");
  const safeUrl = (value) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "venice.ai") throw new Error("Only official Venice.ai pages are allowed.");
    return url.href;
  };

  function render({ id, url, title, subtitle }) {
    const key = safeId(id);
    const target = safeUrl(url);
    return `<section class="venice-webapp-workspace" aria-label="${esc(title)}">
      <header class="venice-webapp-toolbar">
        <div><div class="venice-webapp-title">${esc(title)}</div><div class="venice-webapp-subtitle">${esc(subtitle)}</div></div>
        <button class="btn-ghost" type="button" data-webapp-open="${key}">Open in separate window</button>
      </header>
      <div class="venice-webapp-frame">
        <webview id="venice-webview-${key}" class="venice-webview" src="${esc(target)}" partition="persist:venice" allowpopups webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes" aria-label="${esc(title)}"></webview>
        <div class="venice-webapp-loading" data-webapp-status="${key}">Loading Venice.ai…</div>
        <button class="btn-ghost venice-webapp-retry" data-webapp-retry="${key}" type="button" hidden>Reload Venice.ai</button>
      </div>
    </section>`;
  }

  function wire(ctx, { id, url }) {
    const key = safeId(id);
    const target = safeUrl(url);
    const view = document.querySelector(`#venice-webview-${key}`);
    const status = document.querySelector(`[data-webapp-status="${key}"]`);
    const retry = document.querySelector(`[data-webapp-retry="${key}"]`);
    const open = document.querySelector(`[data-webapp-open="${key}"]`);
    const showError = (message) => {
      if (status) { status.textContent = message; status.hidden = false; }
      if (retry) retry.hidden = false;
    };
    const clearStatus = () => {
      if (status) status.hidden = true;
      if (retry) retry.hidden = true;
    };
    if (view) {
      view.addEventListener("dom-ready", clearStatus);
      view.addEventListener("did-finish-load", clearStatus);
      view.addEventListener("did-fail-load", (event) => {
        if (event.isMainFrame === false || event.errorCode === -3) return;
        showError(`Could not load Venice.ai: ${event.errorDescription || "connection failed"}`);
      });
      view.addEventListener("will-navigate", (event) => {
        try { if (new URL(event.url).protocol !== "https:") event.preventDefault(); }
        catch { event.preventDefault(); }
      });
      try { if (!view.isLoading() && view.getURL().startsWith("https://venice.ai/")) clearStatus(); }
      catch { /* webview is still initializing */ }
    } else {
      showError("The Venice web view is unavailable in this build.");
    }
    if (retry && view) retry.onclick = () => {
      retry.hidden = true;
      if (status) { status.hidden = false; status.textContent = "Reloading Venice.ai…"; }
      view.reload();
    };
    if (open) open.onclick = () => {
      const browser = ctx?.forge?.browser;
      if (!browser?.open) { ctx?.notify?.("Separate browser window is unavailable."); return; }
      browser.open(target).catch((error) => ctx?.notify?.("Could not open Venice.ai: " + error.message));
    };
  }

  window.VeniceWebApp = { render, wire };
})();
