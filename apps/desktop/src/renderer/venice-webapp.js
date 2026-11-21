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
        <button class="btn-ghost" type="button" data-webapp-open="${key}">Open in your browser</button>
      </header>
      <div class="venice-webapp-frame">
        <webview id="venice-webview-${key}" class="venice-webview" partition="persist:venice" allowpopups webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes" aria-label="${esc(title)}"></webview>
        <div class="venice-session-gate" data-webapp-gate="${key}">
          <h2>Checking your browser…</h2>
          <p>Venice.ai has no desktop app. A session that is already in your browser skips login.</p>
        </div>
        <div class="venice-webapp-loading" data-webapp-status="${key}" hidden>Loading Venice.ai…</div>
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
    const gate = document.querySelector(`[data-webapp-gate="${key}"]`);
    const canEmbed = !!(view && typeof view.reload === "function");
    const signedIn = !!ctx?.state?.venice?.loggedIn;
    const showGate = (title, body, label, action) => {
      if (!gate) return;
      gate.hidden = false;
      gate.innerHTML = `<h2>${esc(title)}</h2><p>${esc(body)}</p><button class="btn-primary" type="button">${esc(label)}</button>`;
      const button = gate.querySelector("button");
      if (button) button.onclick = action;
      if (status) status.hidden = true;
    };
    const showError = (message) => {
      if (status) { status.textContent = message; status.hidden = false; }
      if (retry) retry.hidden = false;
      if (gate) gate.hidden = true;
    };
    const clearStatus = () => {
      if (status) status.hidden = true;
      if (retry) retry.hidden = true;
      if (gate) gate.hidden = true;
    };
    if (signedIn && canEmbed && view) {
      if (gate) gate.hidden = true;
      if (status) { status.hidden = false; status.textContent = "Opening your Venice.ai session…"; }
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
      if (!view.src || view.src === "about:blank") view.src = target;
      try { if (!view.isLoading() && view.getURL().startsWith("https://venice.ai/")) clearStatus(); }
      catch { /* webview is still initializing */ }
    } else if (signedIn) {
      const via = ctx.state.venice.source ? ` in ${ctx.state.venice.source}` : "";
      showGate(
        "Already signed in",
        `Login skipped${via}. Venice.ai opens in the browser you already use.`,
        "Open Venice.ai",
        () => (window.enterVenice ? window.enterVenice(target) : window.open(target, "_blank", "noopener"))
      );
    } else {
      showGate(
        "Sign in with your browser",
        "Venice.ai has no desktop app. If you are already signed in there, the login page is skipped and you go straight in.",
        "Continue in your browser",
        () => (window.enterVenice ? window.enterVenice(target) : window.open("https://venice.ai/sign-in", "_blank", "noopener"))
      );
    }
    if (retry && view && canEmbed) retry.onclick = () => {
      retry.hidden = true;
      if (status) { status.hidden = false; status.textContent = "Reloading Venice.ai…"; }
      view.reload();
    };
    if (open) open.onclick = () => {
      if (window.enterVenice) window.enterVenice(target);
      else if (window.openVeniceSurface) window.openVeniceSurface(target);
      else window.open(signedIn ? target : "https://venice.ai/sign-in", "_blank", "noopener");
    };
  }

  window.VeniceWebApp = { render, wire };
})();
