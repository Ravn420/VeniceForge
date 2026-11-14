/* Venice Forge — Integrations catalogue.
   Browser automation, scraping, and inspection. Public sites only. */
(function () {
  const $ = (sel) => document.querySelector(sel);
  let esc = (s) => String(s ?? "");

  const S = {
    id: "open",
    query: "",
    url: "https://example.com",
    selector: "a",
    text: "",
    textB: "",
    method: "GET",
    engine: "chromium",
    headers: "",
    pattern: "",
    busy: false,
    output: "",
    image: "",
    tone: "",
  };

  const CATALOG = [
    { group: "Browser", id: "engines", name: "Headless engines", action: "engines", needs: [], blurb: "Launch Chromium, Firefox, and WebKit and read each engine's real identity." },
    { group: "Browser", id: "frameworks", name: "Automation frameworks", action: "frameworks", needs: [], blurb: "Run Playwright, Puppeteer, and Selenium against the same public page." },
    { group: "Browser", id: "open", name: "Open page", action: "open", needs: ["engine", "url"], blurb: "Load a public page in the engine you pick." },
    { group: "Browser", id: "scrape", name: "Scrape page", action: "scrape", needs: [], hint: "Uses the page opened above.", blurb: "Title, text, headings, and links." },
    { group: "Browser", id: "click", name: "Click", action: "click", needs: ["selector"], hint: "Uses the page opened above.", blurb: "Click an element by CSS selector." },
    { group: "Browser", id: "fill", name: "Type into field", action: "fill", needs: ["selector", "text"], labels: { text: "Value" }, hint: "Uses the page opened above.", blurb: "Fill an input, then leave it for the next step." },
    { group: "Browser", id: "shot", name: "Screenshot", action: "shot", needs: [], hint: "Uses the page opened above.", blurb: "Capture the current viewport." },
    { group: "Browser", id: "outline", name: "DOM outline", action: "outline", needs: [], hint: "Uses the page opened above.", blurb: "Headings, forms, and tag counts." },
    { group: "Browser", id: "assets", name: "Scripts and styles", action: "assets", needs: [], hint: "Uses the page opened above.", blurb: "Stylesheets and script URLs on the page." },
    { group: "Browser", id: "network", name: "Network log", action: "network", needs: [], hint: "Uses the page opened above.", blurb: "Requests the page made while it loaded." },
    { group: "Browser", id: "console", name: "Console", action: "console", needs: [], hint: "Uses the page opened above.", blurb: "Console messages from the opened page." },
    { group: "Browser", id: "cookies", name: "Page cookies", action: "cookies", needs: [], hint: "Cookies of the studio browser only.", blurb: "Cookies set by the page you opened." },
    { group: "Browser", id: "wait", name: "Wait for element", action: "wait", needs: ["selector"], hint: "Uses the page opened above.", blurb: "Wait until a selector is in the document." },
    { group: "Browser", id: "back", name: "Back", action: "back", needs: [], hint: "Uses the page opened above.", blurb: "Return to the previous public page." },

    { group: "Web", id: "http", name: "HTTP request", action: "http", needs: ["url", "method", "headers", "text"], labels: { text: "POST body" }, blurb: "GET, HEAD, or POST. Shows status, headers, and body." },
    { group: "Web", id: "security", name: "Security headers", action: "security", needs: ["url"], blurb: "HSTS, CSP, frame options, and the rest of the response." },
    { group: "Web", id: "robots", name: "robots.txt", action: "robots", needs: ["url"], blurb: "robots.txt, sitemap lines, and security.txt." },
    { group: "Web", id: "dns", name: "DNS records", action: "dns", needs: ["url"], labels: { url: "Host or URL" }, blurb: "A, AAAA, MX, TXT, NS, and CNAME." },
    { group: "Web", id: "cert", name: "TLS certificate", action: "cert", needs: ["url"], labels: { url: "Host or URL" }, blurb: "Subject, issuer, dates, and fingerprint of a public host." },

    { group: "Inspect", id: "strings", name: "Strings", action: "inspect", kind: "strings", hybrid: true, needs: ["url", "text"], labels: { text: "Or paste text" }, blurb: "Printable strings from a public file, or from pasted text." },
    { group: "Inspect", id: "hex", name: "Hex dump", action: "inspect", kind: "hex", hybrid: true, needs: ["url", "text"], labels: { text: "Or paste text" }, blurb: "First bytes, hex and ASCII, from a URL or pasted text." },
    { group: "Inspect", id: "magic", name: "File signature", action: "inspect", kind: "magic", hybrid: true, needs: ["url", "text"], labels: { text: "Or paste text" }, blurb: "Identify a file from its magic bytes." },
    { group: "Inspect", id: "entropy", name: "Entropy", action: "inspect", kind: "entropy", hybrid: true, needs: ["url", "text"], labels: { text: "Or paste text" }, blurb: "Shannon entropy of a file or of pasted text." },
    { group: "Inspect", id: "hash", name: "File hash", action: "inspect", kind: "hash", hybrid: true, needs: ["url", "text"], labels: { text: "Or paste text" }, blurb: "SHA-256 and SHA-1. Identification only, not cracking." },
    { group: "Inspect", id: "binary", name: "ELF / PE header", action: "inspect", kind: "binary", needs: ["url"], blurb: "Read an ELF or PE header. Nothing is unpacked or executed." },

    { group: "Transform", id: "json", name: "Format JSON", local: "json", needs: ["text"], blurb: "Parse and pretty-print JSON." },
    { group: "Transform", id: "jwt", name: "Decode JWT", local: "jwt", needs: ["text"], labels: { text: "Token" }, blurb: "Show the header and payload. The signature is not checked." },
    { group: "Transform", id: "b64e", name: "Base64 encode", local: "b64e", needs: ["text"], blurb: "Encode text as base64." },
    { group: "Transform", id: "b64d", name: "Base64 decode", local: "b64d", needs: ["text"], labels: { text: "Base64" }, blurb: "Decode a base64 string." },
    { group: "Transform", id: "urle", name: "URL encode", local: "urle", needs: ["text"], blurb: "Percent-encode text." },
    { group: "Transform", id: "urld", name: "URL decode", local: "urld", needs: ["text"], blurb: "Decode a percent-encoded string." },
    { group: "Transform", id: "hexe", name: "Hex encode", local: "hexe", needs: ["text"], blurb: "Text to hexadecimal bytes." },
    { group: "Transform", id: "hexd", name: "Hex decode", local: "hexd", needs: ["text"], labels: { text: "Hex" }, blurb: "Hexadecimal bytes back to text." },
    { group: "Transform", id: "sha", name: "SHA-256", local: "sha", needs: ["text"], blurb: "Hash pasted text. This does not crack a hash." },
    { group: "Transform", id: "regex", name: "Regex find", local: "regex", needs: ["pattern", "text"], blurb: "List matches. The input is capped so a pattern cannot run away." },
    { group: "Transform", id: "diff", name: "Line diff", local: "diff", needs: ["text", "textB"], labels: { text: "Left", textB: "Right" }, blurb: "Compare two texts, up to 400 lines each." },
    { group: "Transform", id: "unix", name: "Unix time", local: "unix", needs: ["text"], labels: { text: "Stamp or date" }, blurb: "Convert a unix stamp or a date. Empty uses now." },
    { group: "Transform", id: "uuid", name: "UUID", local: "uuid", needs: [], blurb: "Generate a random UUID." },
    { group: "Transform", id: "points", name: "Code points", local: "points", needs: ["text"], blurb: "Unicode code points of the text." },
    { group: "Transform", id: "stats", name: "Text stats", local: "stats", needs: ["text"], blurb: "Bytes, characters, lines, and words." },

    { group: "Studio", id: "go-library", name: "Library", jump: "Library", needs: [], blurb: "Open the project library." },
    { group: "Studio", id: "go-chat", name: "Chat", jump: "Chat", needs: [], blurb: "Text models, inside Venice Forge." },
    { group: "Studio", id: "go-image", name: "Image Gen", jump: "Image Gen", needs: [], blurb: "Image models, inside Venice Forge." },
    { group: "Studio", id: "go-video", name: "Video Studio", jump: "Video Studio", needs: [], blurb: "Text-to-video models, inside Venice Forge." },
    { group: "Studio", id: "go-music", name: "Music", jump: "Music", needs: [], blurb: "Song models stay on the Music page." },
    { group: "Studio", id: "go-audio", name: "Audio Score", jump: "Audio Score", needs: [], blurb: "Voice and sound, not songs." },
    { group: "Studio", id: "go-dev", name: "AI Dev Studio", jump: "AI Dev Studio", needs: [], blurb: "Open the coding workspace." },
  ];

  const LABELS = { url: "URL", method: "Method", engine: "Engine", selector: "Selector", headers: "Headers JSON", text: "Text", textB: "Second text", pattern: "Pattern" };

  function toolById(id) {
    return CATALOG.find((t) => t.id === id) || CATALOG[0];
  }

  function visibleTools() {
    const q = S.query.trim().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter((t) => (t.group + " " + t.name + " " + t.blurb).toLowerCase().includes(q));
  }

  function listHtml() {
    const items = visibleTools();
    if (!items.length) return '<div class="tool-empty">Nothing in the catalogue matches.</div>';
    let html = "";
    let group = "";
    for (const t of items) {
      if (t.group !== group) {
        group = t.group;
        html += `<div class="tool-group">${esc(group)}</div>`;
      }
      html += `<button type="button" class="tool-item${t.id === S.id ? " active" : ""}" data-tool="${esc(t.id)}"><span>${esc(t.name)}</span><small>${esc(t.blurb)}</small></button>`;
    }
    return html;
  }

  function fieldBlock(tool, key) {
    const label = (tool.labels && tool.labels[key]) || LABELS[key] || key;
    if (key === "method") {
      const opts = ["GET", "HEAD", "POST"].map((m) => `<option value="${m}"${S.method === m ? " selected" : ""}>${m}</option>`).join("");
      return `<label class="tool-field"><span class="field-label">${esc(label)}</span><select id="tool-method">${opts}</select></label>`;
    }
    if (key === "engine") {
      const opts = [["chromium", "Chromium"], ["firefox", "Firefox"], ["webkit", "WebKit"]]
        .map(([id, name]) => `<option value="${id}"${S.engine === id ? " selected" : ""}>${name}</option>`).join("");
      return `<label class="tool-field"><span class="field-label">${esc(label)}</span><select id="tool-engine">${opts}</select></label>`;
    }
    if (key === "text" || key === "textB" || key === "headers") {
      const id = key === "text" ? "tool-text" : key === "textB" ? "tool-textb" : "tool-headers";
      const val = key === "text" ? S.text : key === "textB" ? S.textB : S.headers;
      return `<label class="tool-field"><span class="field-label">${esc(label)}</span><textarea id="${id}" class="tool-text">${esc(val)}</textarea></label>`;
    }
    const id = key === "url" ? "tool-url" : key === "selector" ? "tool-selector" : "tool-pattern";
    const val = key === "url" ? S.url : key === "selector" ? S.selector : S.pattern;
    const ph = key === "url" ? "https://example.com" : key === "selector" ? "h1, a, button" : "TODO|FIXME";
    return `<label class="tool-field"><span class="field-label">${esc(label)}</span><input id="${id}" class="tool-input" value="${esc(val)}" placeholder="${ph}" /></label>`;
  }

  function workHtml(tool) {
    const fields = (tool.needs || []).map((key) => fieldBlock(tool, key)).join("");
    return `
      <div class="tool-head">
        <div class="tool-kicker">${esc(tool.group)}</div>
        <h2>${esc(tool.name)}</h2>
        <p class="tool-blurb">${esc(tool.blurb)}</p>
      </div>
      ${fields ? `<div class="tool-fields">${fields}</div>` : ""}
      ${tool.hint ? `<p class="tool-hint">${esc(tool.hint)}</p>` : ""}
      <div class="tool-actions">
        <button type="button" class="btn-primary" id="tool-run">${tool.jump ? "Open" : "Run"}</button>
        <button type="button" class="btn-ghost" id="tool-copy">Copy result</button>
      </div>
      <img id="tool-shot" class="tool-shot" alt="Screenshot of the opened page" hidden />
      <pre id="tool-out" class="tool-out"></pre>
      <p class="tool-foot">Public http and https only. Private networks, local addresses, and credentialed URLs are refused.</p>`;
  }

  function render(ctx) {
    esc = ctx.esc;
    return `<div class="tools-studio">
      <aside class="tool-rail">
        <input id="tool-filter" class="model-filter" placeholder="Filter the catalogue" value="${esc(S.query)}" />
        <div class="tool-count" id="tool-count"></div>
        <div class="tool-list" id="tool-list">${listHtml()}</div>
      </aside>
      <section class="tool-work" id="tool-work">${workHtml(toolById(S.id))}</section>
    </div>`;
  }

  function paintList() {
    const list = $("#tool-list");
    if (list) list.innerHTML = listHtml();
    const count = $("#tool-count");
    if (count) {
      const n = visibleTools().length;
      count.textContent = n === CATALOG.length ? CATALOG.length + " tools" : n + " of " + CATALOG.length;
    }
  }

  function paintOut() {
    const pre = $("#tool-out");
    if (pre) {
      const placeholder = !S.output && !S.image;
      pre.textContent = placeholder ? "Results from the live tool appear here." : S.output;
      pre.classList.toggle("is-error", S.tone === "error");
      pre.classList.toggle("is-placeholder", placeholder);
    }
    const img = $("#tool-shot");
    if (img) {
      if (S.image) {
        img.hidden = false;
        img.src = S.image;
      } else {
        img.hidden = true;
        img.removeAttribute("src");
      }
    }
    const btn = $("#tool-run");
    if (btn) {
      btn.disabled = S.busy;
      btn.textContent = S.busy ? "Running…" : (toolById(S.id).jump ? "Open" : "Run");
    }
  }

  function readFields() {
    const url = $("#tool-url"); if (url) S.url = url.value;
    const method = $("#tool-method"); if (method) S.method = method.value;
    const engine = $("#tool-engine"); if (engine) S.engine = engine.value;
    const selector = $("#tool-selector"); if (selector) S.selector = selector.value;
    const headers = $("#tool-headers"); if (headers) S.headers = headers.value;
    const text = $("#tool-text"); if (text) S.text = text.value;
    const textB = $("#tool-textb"); if (textB) S.textB = textB.value;
    const pattern = $("#tool-pattern"); if (pattern) S.pattern = pattern.value;
  }

  function bytesOf(text) {
    return new TextEncoder().encode(text || "");
  }

  function hexOf(bytes, max) {
    const n = Math.min(bytes.length, max || bytes.length);
    const lines = [];
    for (let i = 0; i < n; i += 16) {
      const slice = bytes.subarray(i, Math.min(i + 16, n));
      const hex = [...slice].map((b) => b.toString(16).padStart(2, "0")).join(" ");
      const ascii = [...slice].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
      lines.push(i.toString(16).padStart(8, "0") + "  " + hex.padEnd(47, " ") + "  " + ascii);
    }
    return lines.join("\n");
  }

  function localStrings() {
    const bytes = bytesOf(S.text);
    const out = [];
    let cur = "";
    const flush = () => { if (cur.length >= 4) out.push(cur); cur = ""; };
    for (const b of bytes) {
      if (b >= 32 && b < 127) cur += String.fromCharCode(b);
      else flush();
      if (out.length >= 200) break;
    }
    flush();
    return (out.join("\n") || "(no printable strings of 4 or more characters)") + "\n\n" + bytes.length + " bytes";
  }

  function localEntropy() {
    const bytes = bytesOf(S.text);
    if (!bytes.length) throw new Error("Paste some text, or give a URL.");
    const freq = new Array(256).fill(0);
    for (const b of bytes) freq[b]++;
    let h = 0;
    for (const f of freq) {
      if (!f) continue;
      const p = f / bytes.length;
      h -= p * Math.log2(p);
    }
    return h.toFixed(3) + "\n" + bytes.length + " bytes\n0 is one repeated byte. 8 is the maximum.";
  }

  function localMagic() {
    const bytes = bytesOf(S.text);
    if (!bytes.length) throw new Error("Paste some text, or give a URL.");
    const hex = [...bytes.subarray(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const table = [["7f454c46", "ELF"], ["4d5a", "MZ / PE"], ["504b0304", "ZIP"], ["89504e47", "PNG"], ["ffd8ff", "JPEG"], ["25504446", "PDF"], ["1f8b", "gzip"], ["2321", "script shebang"]];
    for (const [sig, name] of table) if (hex.startsWith(sig)) return name + "\n" + sig;
    return "unrecognized\n" + hex.slice(0, 16);
  }

  async function shaHex(alg, bytes) {
    const buf = await crypto.subtle.digest(alg, bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  const LOCAL = {
    json() {
      if (!S.text.trim()) throw new Error("Paste JSON in the text box.");
      return JSON.stringify(JSON.parse(S.text), null, 2);
    },
    jwt() {
      const parts = S.text.trim().split(".");
      if (parts.length < 2) throw new Error("A JWT has a header and a payload, separated by dots.");
      const decode = (part) => {
        const pad = part.replace(/-/g, "+").replace(/_/g, "/");
        const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
      };
      return JSON.stringify({ header: decode(parts[0]), payload: decode(parts[1]), signatureChecked: false }, null, 2);
    },
    b64e() {
      let bin = "";
      for (const b of bytesOf(S.text)) bin += String.fromCharCode(b);
      return btoa(bin);
    },
    b64d() {
      const clean = S.text.trim().replace(/\s/g, "");
      if (!clean) throw new Error("Paste a base64 string.");
      const bin = atob(clean);
      return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    },
    urle() { return encodeURIComponent(S.text); },
    urld() { return decodeURIComponent(S.text.trim()); },
    hexe() { return [...bytesOf(S.text)].map((b) => b.toString(16).padStart(2, "0")).join(" "); },
    hexd() {
      const clean = S.text.replace(/[^0-9a-f]/gi, "");
      if (!clean || clean.length % 2) throw new Error("Hex needs an even number of digits.");
      const bytes = new Uint8Array(clean.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      return new TextDecoder().decode(bytes);
    },
    async sha() {
      const bytes = bytesOf(S.text);
      return "SHA-256  " + await shaHex("SHA-256", bytes) + "\nSHA-1    " + await shaHex("SHA-1", bytes) + "\n" + bytes.length + " bytes";
    },
    regex() {
      if (!S.pattern.trim()) throw new Error("Enter a pattern.");
      if (S.pattern.length > 120) throw new Error("Keep the pattern under 120 characters.");
      let re;
      try { re = new RegExp(S.pattern, "g"); } catch (err) { throw new Error(err.message); }
      const src = S.text.slice(0, 8000);
      const out = [];
      let guard = 0;
      let match;
      while ((match = re.exec(src)) && out.length < 40) {
        out.push(String(match[0]).slice(0, 200));
        if (match[0] === "") re.lastIndex += 1;
        if (++guard > 200) break;
      }
      return out.length ? out.join("\n") : "No matches.";
    },
    diff() {
      const A = S.text.split("\n").slice(0, 400);
      const B = S.textB.split("\n").slice(0, 400);
      const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
      for (let i = A.length - 1; i >= 0; i--) {
        for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
      const out = [];
      let i = 0;
      let j = 0;
      while (i < A.length && j < B.length) {
        if (A[i] === B[j]) { out.push("  " + A[i]); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push("- " + A[i]); i++; }
        else { out.push("+ " + B[j]); j++; }
      }
      while (i < A.length) out.push("- " + A[i++]);
      while (j < B.length) out.push("+ " + B[j++]);
      return out.join("\n");
    },
    unix() {
      const raw = S.text.trim();
      if (!raw) {
        const now = new Date();
        return now.toISOString() + "\n" + Math.floor(now.getTime() / 1000);
      }
      if (/^-?\d+(\.\d+)?$/.test(raw)) {
        const n = Number(raw);
        const ms = Math.abs(n) < 1e12 ? n * 1000 : n;
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) throw new Error("That stamp is not a date.");
        return d.toISOString();
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new Error("That is not a date this studio understands.");
      return d.toISOString() + "\n" + Math.floor(d.getTime() / 1000);
    },
    uuid() { return crypto.randomUUID(); },
    points() {
      if (!S.text) throw new Error("Paste some text.");
      return [...S.text].slice(0, 400).map((ch) => "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
    },
    stats() {
      const text = S.text;
      const lines = text ? text.split("\n").length : 0;
      const words = (text.trim().match(/\S+/g) || []).length;
      return bytesOf(text).length + " bytes\n" + text.length + " characters\n" + lines + " lines\n" + words + " words";
    },
    strings: localStrings,
    hex() { return hexOf(bytesOf(S.text), 768) || "(empty)"; },
    magic: localMagic,
    entropy: localEntropy,
    hash: async function () {
      const bytes = bytesOf(S.text);
      if (!bytes.length) throw new Error("Paste some text, or give a URL.");
      return "SHA-256  " + await shaHex("SHA-256", bytes) + "\nSHA-1    " + await shaHex("SHA-1", bytes) + "\n" + bytes.length + " bytes";
    },
  };

  function formatResult(data) {
    if (data == null) return "";
    if (typeof data === "string") return data;
    if (Array.isArray(data.engines)) {
      return data.engines.map((e) => {
        const head = e.name + (data.active === e.id ? "  ·  current session" : "");
        if (!e.installed) return head + "\n  Not installed.";
        if (e.error) return head + "\n  " + e.error;
        return [head, "  " + (e.version || ""), e.vendor ? "  " + e.vendor : "", "  webdriver " + (e.webdriver ? "yes" : "no"), "  " + (e.userAgent || "")].filter((line) => line.trim()).join("\n");
      }).join("\n\n");
    }
    if (Array.isArray(data.frameworks)) {
      return data.frameworks.map((f) => {
        const head = f.name + (f.version ? "  " + f.version : "");
        if (!f.installed) return head + "\n  Not installed.";
        if (f.error) return head + "\n  " + f.error;
        const result = typeof f.status === "number"
          ? "  HTTP " + f.status + "  " + (f.title || "") + "  " + f.milliseconds + " ms"
          : "  " + (f.title || "") + "  " + f.milliseconds + " ms";
        return [
          head,
          f.protocol ? "  " + f.protocol : "",
          f.drove ? "  " + f.drove : "",
          result,
          f.userAgent ? "  " + f.userAgent : "",
        ].filter((line) => line.trim()).join("\n");
      }).join("\n\n");
    }
    if (data.engine && data.title != null) {
      const headers = Object.entries(data.headers || {}).map(([k, v]) => k + ": " + v).join("\n");
      return [data.engine + (data.browser ? "  " + data.browser : ""), data.userAgent || "", "", "HTTP " + data.status + "  " + data.url, data.title, "", headers].join("\n");
    }
    if (typeof data.hex === "string") return data.hex + "\n\n" + data.bytes + " bytes · HTTP " + data.status + "\n" + data.url;
    if (Array.isArray(data.strings)) {
      const body = data.strings.length ? data.strings.join("\n") : "(no printable strings)";
      return body + "\n\n" + data.bytes + " bytes · HTTP " + data.status + "\n" + data.url;
    }
    if (typeof data.robots === "string") {
      let out = "HTTP " + data.robotsStatus + "  " + data.origin + "/robots.txt\n\n" + (data.robots || "(empty)");
      if (data.sitemaps && data.sitemaps.length) out += "\n\nSitemaps\n" + data.sitemaps.join("\n");
      if (data.securityTxt) out += "\n\nsecurity.txt\n" + data.securityTxt;
      return out;
    }
    if (typeof data.body === "string" && data.headers) {
      const sec = (data.security || []).map((s) => (s.present ? "set   " : "miss  ") + s.name + (s.value ? "  " + s.value : "")).join("\n");
      return "HTTP " + data.status + "  " + data.url + "\n" + (data.contentType || "") + "  " + (data.bytes ?? "") + " bytes\n\n" + sec + "\n\n" + data.body;
    }
    if (Array.isArray(data.security) && data.headers && data.body == null && data.title == null) {
      const lines = data.security.map((s) => (s.present ? "set   " : "miss  ") + s.name + (s.value ? "  " + s.value : ""));
      const rest = Object.entries(data.headers).map(([k, v]) => k + ": " + v).join("\n");
      return "HTTP " + data.status + "  " + data.url + "\n\n" + lines.join("\n") + "\n\n" + rest;
    }
    return JSON.stringify(data, null, 2);
  }

  async function execute(ctx) {
    if (S.busy) return;
    readFields();
    const tool = toolById(S.id);
    if (tool.jump) {
      ctx.go(tool.jump);
      return;
    }
    S.busy = true;
    S.tone = "";
    S.image = "";
    S.output = "Running…";
    paintOut();
    try {
      const wantsUrl = (tool.needs || []).includes("url");
      if (tool.hybrid && !S.url.trim() && !S.text.trim()) throw new Error("Give a public URL or paste text.");
      if (tool.action && wantsUrl && !tool.hybrid && !S.url.trim()) throw new Error("Give a public URL.");
      const server = tool.action && (!tool.hybrid || S.url.trim());
      if (server) {
        const res = await fetch("/api/tools/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: tool.action,
            kind: tool.kind || "",
            url: S.url.trim(),
            selector: S.selector,
            text: S.text,
            method: S.method,
            engine: S.engine,
            headers: S.headers,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || "The tool failed.");
        if (data.image) S.image = data.image;
        S.output = formatResult(data);
      } else if (tool.local && LOCAL[tool.local]) {
        S.output = await LOCAL[tool.local]();
      } else if (tool.hybrid && LOCAL[tool.kind]) {
        S.output = await LOCAL[tool.kind]();
      } else {
        throw new Error("This tool is not available.");
      }
      S.tone = "";
    } catch (err) {
      S.tone = "error";
      S.image = "";
      S.output = err && err.message ? err.message : "The tool failed.";
    } finally {
      S.busy = false;
      paintOut();
    }
  }

  async function copyOut(ctx) {
    if (!S.output || S.output === "Running…") {
      ctx.notify("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(S.output);
      ctx.notify("Copied");
    } catch {
      ctx.notify("Copy failed");
    }
  }

  function bindWork(ctx) {
    const run = $("#tool-run");
    if (run) run.onclick = () => execute(ctx);
    const copy = $("#tool-copy");
    if (copy) copy.onclick = () => copyOut(ctx);
    const work = $("#tool-work");
    if (work) {
      work.onkeydown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          execute(ctx);
        }
      };
    }
  }

  function wire(ctx) {
    esc = ctx.esc;
    paintList();
    paintOut();
    const filter = $("#tool-filter");
    if (filter) {
      filter.addEventListener("input", () => {
        S.query = filter.value;
        paintList();
      });
    }
    const list = $("#tool-list");
    if (list) {
      list.addEventListener("click", (e) => {
        const button = e.target.closest("[data-tool]");
        if (!button || button.dataset.tool === S.id) return;
        readFields();
        S.id = button.dataset.tool;
        S.output = "";
        S.image = "";
        S.tone = "";
        const work = $("#tool-work");
        if (work) work.innerHTML = workHtml(toolById(S.id));
        paintList();
        bindWork(ctx);
        paintOut();
      });
    }
    bindWork(ctx);
  }

  window.__SCREENS__ = window.__SCREENS__ || [];
  window.__SCREENS__.push({ id: "tools", TABS: ["Integrations"], render, wire });
})();
