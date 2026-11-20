/* Venice Forge — Integrations catalogue.
   Browser automation, scraping, and inspection. Public sites only. */
(function () {
  const $ = (sel) => document.querySelector(sel);
  let esc = (s) => String(s ?? "");

  const S = {
    id: "open",
    view: "installed",
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

    { group: "Plugins", id: "slug", name: "Slug", local: "slug", pack: true, needs: ["text"], blurb: "Turn a title into a URL slug." },
    { group: "Plugins", id: "unique", name: "Unique lines", local: "unique", pack: true, needs: ["text"], blurb: "Drop duplicate lines and keep the first copy." },
    { group: "Plugins", id: "csv", name: "CSV to JSON", local: "csv", pack: true, needs: ["text"], labels: { text: "CSV" }, blurb: "Read a comma-separated table into JSON." },
    { group: "Plugins", id: "entities", name: "HTML entities", local: "entities", pack: true, needs: ["text"], blurb: "Encode <, >, and & so text is safe to show." },
    { group: "Plugins", id: "query", name: "Query string", local: "query", pack: true, needs: ["text"], labels: { text: "URL or query" }, blurb: "List the parameters in a URL or query string." },

    { group: "Reverse", id: "xor", name: "Single-byte XOR", local: "xor", pack: true, needs: ["text"], labels: { text: "Hex bytes" }, blurb: "Try all 256 keys on pasted hex and keep the most readable result." },
    { group: "Reverse", id: "endian", name: "Endian swap", local: "endian", pack: true, needs: ["text"], labels: { text: "Hex word" }, blurb: "Reverse a 2, 4, or 8 byte hex word." },
    { group: "Reverse", id: "hexmath", name: "Address math", local: "hexmath", pack: true, needs: ["text", "textB"], labels: { text: "Base", textB: "Offset" }, blurb: "Add and subtract two hex addresses." },
    { group: "Reverse", id: "bits", name: "Bit view", local: "bits", pack: true, needs: ["text"], labels: { text: "Hex bytes" }, blurb: "Show each byte as hex and binary." },
    { group: "Reverse", id: "histogram", name: "Byte histogram", local: "histogram", pack: true, needs: ["text"], labels: { text: "Hex bytes" }, blurb: "Count the most common bytes in a pasted dump." },
    { group: "Reverse", id: "carve", name: "Carve blob", local: "carve", pack: true, needs: ["text"], blurb: "Pull URLs, base64, and hex runs out of a pasted blob." },
    { group: "Reverse", id: "hashid", name: "Hash shape", local: "hashid", pack: true, needs: ["text"], labels: { text: "Hash" }, blurb: "Name a hash from its length. It does not recover the input." },
    { group: "Reverse", id: "guid", name: "GUID bytes", local: "guid", pack: true, needs: ["text"], labels: { text: "UUID" }, blurb: "Show RFC order and Windows mixed-endian bytes." },
    { group: "Reverse", id: "caesar", name: "Caesar", local: "caesar", pack: true, needs: ["text"], blurb: "Score the 26 letter shifts and show the most readable one." },

    { group: "Code", id: "cases", name: "Identifier case", local: "cases", pack: true, needs: ["text"], labels: { text: "Identifier" }, blurb: "camelCase, PascalCase, snake_case, kebab-case, and SCREAMING_SNAKE." },
    { group: "Code", id: "semver", name: "Semver compare", local: "semver", pack: true, needs: ["text", "textB"], labels: { text: "Version", textB: "Other" }, blurb: "Say which release is newer." },
    { group: "Code", id: "dotenv", name: "Env file", local: "dotenv", pack: true, needs: ["text"], labels: { text: ".env" }, blurb: "Read KEY=value lines and skip comments." },
    { group: "Code", id: "color", name: "Hex color", local: "color", pack: true, needs: ["text"], labels: { text: "Hex color" }, blurb: "Turn #rrggbb into RGB channels." },
    { group: "Code", id: "cron", name: "Cron fields", local: "cron", pack: true, needs: ["text"], labels: { text: "Cron" }, blurb: "Label the five fields of a cron expression." },
    { group: "Code", id: "dedent", name: "Dedent", local: "dedent", pack: true, needs: ["text"], blurb: "Remove the shared left indent from a pasted block." },
    { group: "Code", id: "jsonpath", name: "JSON path", local: "jsonpath", pack: true, needs: ["text", "pattern"], labels: { text: "JSON", pattern: "Path" }, blurb: "Read one value, such as user.name or items.0.id." },
    { group: "Code", id: "base", name: "Number bases", local: "base", pack: true, needs: ["text"], labels: { text: "Number" }, blurb: "Show a number in decimal, hex, octal, and binary." },
    { group: "Code", id: "sqlline", name: "SQL one line", local: "sqlline", pack: true, needs: ["text"], labels: { text: "SQL" }, blurb: "Collapse a statement onto one line." },

    { group: "Security", id: "ioc", name: "Extract indicators", local: "ioc", pack: true, needs: ["text"], blurb: "List URLs, emails, IPv4 addresses, and hash-shaped strings from a log." },
    { group: "Security", id: "defang", name: "Defang", local: "defang", pack: true, needs: ["text"], labels: { text: "URL or host" }, blurb: "Make a URL safe to paste into a note." },
    { group: "Security", id: "refang", name: "Refang", local: "refang", pack: true, needs: ["text"], labels: { text: "Defanged URL" }, blurb: "Turn hxxp and [.] back into a normal URL." },
    { group: "Security", id: "ua", name: "User-Agent", local: "ua", pack: true, needs: ["text"], labels: { text: "User-Agent" }, blurb: "Read the browser and operating system from a User-Agent." },
    { group: "Security", id: "basic", name: "Basic auth", local: "basic", pack: true, needs: ["text"], labels: { text: "Authorization" }, blurb: "Decode a Basic token you already have. It does not guess a password." },
    { group: "Security", id: "cidr", name: "CIDR check", local: "cidr", pack: true, needs: ["text", "textB"], labels: { text: "CIDR", textB: "Address" }, blurb: "Say whether an IPv4 address sits inside a range." },
    { group: "Security", id: "cookie", name: "Cookie header", local: "cookie", pack: true, needs: ["text"], labels: { text: "Cookie" }, blurb: "Split a Cookie header into names and values." },

    { group: "Windows", id: "pe-header", name: "PE header", action: "inspect", kind: "pe", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "Machine, subsystem, ASLR, sections, and a CLR check. The first look PE-bear and Ghidra make. Header only." },
    { group: "Windows", id: "pe-die", name: "Packer scan", action: "inspect", kind: "die", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "Packer marks and section entropy. The first look Detect It Easy makes. Nothing is unpacked." },
    { group: "Windows", id: "pe-imports", name: "PE imports", action: "inspect", kind: "imports", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "DLL names from the import table, when that table is in the bytes. PE-bear's import list. The file is not run." },
    { group: "Windows", id: "pe-clr", name: "CLR version", action: "inspect", kind: "clr", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "The .NET runtime version from the CLR header. ILSpy's first look. The IL is not decompiled." },
    { group: "Windows", id: "wide-strings", name: "UTF-16 strings", action: "inspect", kind: "wide", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "Plain UTF-16 strings. The static half of a string pass. Stack strings are not decoded." },
    { group: "Android", id: "dex-header", name: "DEX header", action: "inspect", kind: "dex", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "String, type, method, and class counts from classes.dex. The first look jadx makes. No decompile." },
    { group: "Android", id: "dex-strings", name: "DEX strings", action: "inspect", kind: "dexstr", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "The first strings in a DEX string table. JADX's string list, capped. The bytecode is not decompiled." },
    { group: "Android", id: "apk-files", name: "APK files", action: "inspect", kind: "apk", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "File names in the start of an APK, plus Flutter, Unity, React Native, or Kotlin if they are there. Apktool's first look. Nothing is rebuilt." },
    { group: "Android", id: "il2cpp", name: "IL2CPP version", action: "inspect", kind: "il2cpp", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "The version word in a Unity global-metadata.dat. Version only. Symbols are not restored." },
    { group: "iOS", id: "macho-header", name: "Mach-O header", action: "inspect", kind: "macho", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "CPU, platform, segments, linked libraries, and FairPlay cryptid. The first look otool makes. Nothing is decrypted." },
    { group: "iOS", id: "entitlements", name: "Entitlements", action: "inspect", kind: "entitlements", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "Entitlement keys already present as text. The same list ipsw prints. Nothing is decrypted." },
    { group: "iOS", id: "objc-names", name: "ObjC class names", action: "inspect", kind: "objc", serverText: true, pack: true, needs: ["url", "text"], labels: { text: "Or paste hex", url: "Public URL" }, blurb: "Names in __objc_classname when that section is in the bytes. class-dump's first list. Nothing is decrypted." },
    { group: "Transforms", id: "inflate", name: "Gzip inflate", local: "inflate", pack: true, needs: ["text"], labels: { text: "Hex or base64" }, blurb: "Inflate a gzip or zlib blob you paste. A CyberChef inflate step. It does not decrypt a cipher." },
    { group: "Transforms", id: "httpmsg", name: "HTTP message", local: "httpmsg", pack: true, needs: ["text"], labels: { text: "Request or response" }, blurb: "Split a pasted HTTP message into its start line and headers. Traffic is not intercepted." },
  ];

  const PLUGIN_KEY = "veniceforge.plugins";

  function extraInstalled() {
    try {
      const saved = JSON.parse(localStorage.getItem(PLUGIN_KEY) || "null");
      if (saved && Array.isArray(saved.extra)) return saved.extra.filter((id) => CATALOG.some((t) => t.id === id && t.pack));
    } catch { /* keep the built-in tools */ }
    return [];
  }

  function isInstalled(id) {
    const tool = CATALOG.find((t) => t.id === id);
    if (!tool) return false;
    if (!tool.pack) return true;
    return extraInstalled().includes(id);
  }

  function saveExtra(ids) {
    localStorage.setItem(PLUGIN_KEY, JSON.stringify({ extra: ids }));
  }

  const LABELS = { url: "URL", method: "Method", engine: "Engine", selector: "Selector", headers: "Headers JSON", text: "Text", textB: "Second text", pattern: "Pattern" };

  function toolById(id) {
    return CATALOG.find((t) => t.id === id) || CATALOG[0];
  }

  function visibleTools() {
    const q = S.query.trim().toLowerCase();
    return CATALOG.filter((t) => {
      if (S.view === "available" ? isInstalled(t.id) : !isInstalled(t.id)) return false;
      if (!q) return true;
      return (t.group + " " + t.name + " " + t.blurb).toLowerCase().includes(q);
    });
  }

  function tally() {
    let installed = 0;
    for (const tool of CATALOG) if (isInstalled(tool.id)) installed += 1;
    return { installed, available: CATALOG.length - installed };
  }

  function listHtml() {
    const items = visibleTools();
    if (!items.length) {
      if (S.query.trim()) return '<div class="tool-empty">No matches.</div>';
      return S.view === "available"
        ? '<div class="tool-empty">Everything here is already installed.</div>'
        : '<div class="tool-empty">Nothing installed.</div>';
    }
    let html = "";
    let group = "";
    for (const tool of items) {
      if (tool.group !== group) {
        group = tool.group;
        html += `<div class="tool-group">${esc(group)}</div>`;
      }
      html += `<button type="button" class="tool-item${tool.id === S.id ? " active" : ""}" data-tool="${esc(tool.id)}" title="${esc(tool.blurb)}"><span>${esc(tool.name)}</span></button>`;
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
    const on = isInstalled(tool.id);
    const head = `
      <div class="tool-head">
        <div class="tool-kicker">${esc(tool.group)} · ${on ? "Installed" : "Available"}</div>
        <h2>${esc(tool.name)}</h2>
        <p class="tool-blurb">${esc(tool.blurb)}</p>
      </div>`;
    if (!on) {
      return head + `
        <div class="tool-actions">
          <button type="button" class="btn-primary" id="tool-install">Install</button>
        </div>`;
    }
    const fields = (tool.needs || []).map((key) => fieldBlock(tool, key)).join("");
    const remove = tool.pack ? `<button type="button" class="btn-ghost" id="tool-remove">Remove</button>` : "";
    const foot = (tool.needs || []).includes("url")
      ? `<p class="tool-foot">Public sites only. Private and local addresses are refused.</p>`
      : "";
    return head + `
      ${fields ? `<div class="tool-fields">${fields}</div>` : ""}
      ${tool.hint ? `<p class="tool-hint">${esc(tool.hint)}</p>` : ""}
      <div class="tool-actions">
        <button type="button" class="btn-primary" id="tool-run">${tool.jump ? "Open" : "Run"}</button>
        <button type="button" class="btn-ghost" id="tool-copy">Copy</button>
        ${remove}
      </div>
      <img id="tool-shot" class="tool-shot" alt="Screenshot of the opened page" hidden />
      <pre id="tool-out" class="tool-out" hidden></pre>
      ${foot}`;
  }

  function render(ctx) {
    esc = ctx.esc;
    const counts = tally();
    return `<div class="tools-screen">
      <div class="tools-studio">
      <aside class="tool-rail">
        <div class="tool-switch" id="tool-tabs">
          <button type="button" data-plugin-tab="installed"${S.view === "installed" ? " class=\"is-on\"" : ""}>Installed <em>${counts.installed}</em></button>
          <button type="button" data-plugin-tab="available"${S.view === "available" ? " class=\"is-on\"" : ""}>Available <em>${counts.available}</em></button>
        </div>
        <input id="tool-filter" class="model-filter" placeholder="Filter" value="${esc(S.query)}" />
        <div class="tool-count" id="tool-count" hidden></div>
        <div class="tool-list" id="tool-list">${listHtml()}</div>
      </aside>
      <section class="tool-work" id="tool-work">${workHtml(toolById(S.id))}</section>
    </div></div>`;
  }

  function paintList() {
    const list = $("#tool-list");
    if (list) list.innerHTML = listHtml();
    const count = $("#tool-count");
    if (count) {
      const n = visibleTools().length;
      const filtering = !!S.query.trim();
      count.hidden = !filtering;
      count.textContent = n + " match" + (n === 1 ? "" : "es");
    }
  }

  function paintOut() {
    const pre = $("#tool-out");
    if (pre) {
      const show = !!(S.output || S.image);
      pre.hidden = !show;
      pre.textContent = S.output || "";
      pre.classList.toggle("is-error", S.tone === "error");
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

  function hexBytes(text) {
    const clean = String(text || "").replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
    if (!clean || clean.length % 2) throw new Error("Paste an even number of hex digits.");
    if (clean.length > 8192) throw new Error("Keep the hex under 4096 bytes.");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return bytes;
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
    slug() {
      const slug = S.text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) throw new Error("Paste a title to turn into a slug.");
      return slug;
    },
    unique() {
      const seen = new Set();
      const out = [];
      for (const line of S.text.split("\n")) {
        if (seen.has(line)) continue;
        seen.add(line);
        out.push(line);
      }
      if (!out.length) throw new Error("Paste some lines.");
      return out.join("\n");
    },
    csv() {
      const lines = S.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line) => line.length);
      if (lines.length < 2) throw new Error("Paste a header row and at least one data row.");
      const parse = (line) => {
        const cells = [];
        let cur = "";
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          if (quoted) {
            if (ch === "\"" && line[i + 1] === "\"") { cur += "\""; i += 1; }
            else if (ch === "\"") quoted = false;
            else cur += ch;
          } else if (ch === "\"") quoted = true;
          else if (ch === ",") { cells.push(cur); cur = ""; }
          else cur += ch;
        }
        cells.push(cur);
        return cells;
      };
      const head = parse(lines[0]);
      const rows = lines.slice(1).map((line) => {
        const cells = parse(line);
        const row = {};
        head.forEach((key, i) => { row[key || ("column " + (i + 1))] = cells[i] ?? ""; });
        return row;
      });
      return JSON.stringify(rows, null, 2);
    },
    entities() {
      if (!S.text) throw new Error("Paste some text.");
      return S.text
        .replace(/&/g, "&" + "amp;")
        .replace(/</g, "&" + "lt;")
        .replace(/>/g, "&" + "gt;")
        .replace(/"/g, "&" + "quot;");
    },
    query() {
      const raw = S.text.trim();
      if (!raw) throw new Error("Paste a URL or a query string.");
      const q = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw.replace(/^\?/, "");
      const params = new URLSearchParams(q.split("#")[0]);
      const rows = [...params.entries()];
      if (!rows.length) throw new Error("That text has no query parameters.");
      return rows.map(([key, value]) => key + " = " + value).join("\n");
    },
    xor() {
      const bytes = hexBytes(S.text);
      let best = { key: 0, score: -1, text: "" };
      for (let key = 0; key < 256; key += 1) {
        let score = 0;
        let text = "";
        for (const b of bytes) {
          const n = b ^ key;
          const ok = n === 9 || n === 10 || n === 13 || (n >= 32 && n < 127);
          if (ok) score += 1;
          if (text.length < 2000) text += ok ? String.fromCharCode(n) : ".";
        }
        if (score > best.score) best = { key, score, text };
      }
      return "key 0x" + best.key.toString(16).padStart(2, "0") + "  " + best.score + "/" + bytes.length + " printable\n" + best.text;
    },
    endian() {
      const bytes = hexBytes(S.text);
      if (bytes.length !== 2 && bytes.length !== 4 && bytes.length !== 8) throw new Error("Paste 2, 4, or 8 bytes.");
      return [...bytes].reverse().map((b) => b.toString(16).padStart(2, "0")).join("");
    },
    hexmath() {
      const parse = (value) => {
        const raw = String(value || "").trim().replace(/^0x/i, "");
        if (!/^[0-9a-f]+$/i.test(raw)) throw new Error("Use hex addresses.");
        return BigInt("0x" + raw);
      };
      const fmt = (n) => (n < 0n ? "-0x" : "0x") + (n < 0n ? -n : n).toString(16);
      const base = parse(S.text);
      const off = parse(S.textB);
      return "sum   " + fmt(base + off) + "\ndiff  " + fmt(base - off);
    },
    bits() {
      const bytes = hexBytes(S.text);
      return [...bytes].slice(0, 64).map((b) => b.toString(16).padStart(2, "0") + "  " + b.toString(2).padStart(8, "0")).join("\n");
    },
    histogram() {
      const bytes = hexBytes(S.text);
      const freq = new Array(256).fill(0);
      for (const b of bytes) freq[b] += 1;
      return freq.map((n, i) => ({ i, n })).filter((row) => row.n).sort((a, b) => b.n - a.n).slice(0, 16)
        .map((row) => row.i.toString(16).padStart(2, "0") + "  " + row.n + "  " + (row.n / bytes.length * 100).toFixed(1) + "%").join("\n");
    },
    carve() {
      const text = S.text.slice(0, 20000);
      if (!text.trim()) throw new Error("Paste a blob.");
      const take = (list) => (list || []).slice(0, 20);
      const urls = take(text.match(/https?:\/\/[^\s"'<>]{4,200}/g));
      const b64 = take(text.match(/[A-Za-z0-9+/]{24,}={0,2}/g));
      const hex = take(text.match(/\b(?:[0-9a-fA-F]{2}[:\s]?){8,}/g));
      const block = (name, list) => name + "\n" + (list.length ? list.join("\n") : "(none)");
      return [block("URLs", urls), block("Base64", b64), block("Hex runs", hex)].join("\n\n");
    },
    hashid() {
      const raw = S.text.trim();
      const named = { 32: "MD5 or NTLM", 40: "SHA-1", 56: "SHA-224", 64: "SHA-256", 96: "SHA-384", 128: "SHA-512" };
      if (/^[0-9a-f]+$/i.test(raw) && named[raw.length]) return named[raw.length] + "\n" + raw.length + " hex characters\nThis names the shape only. It does not recover an input.";
      if (/^\$2[aby]\$/.test(raw)) return "bcrypt\nThis does not recover a password.";
      throw new Error("That does not match a common hash shape.");
    },
    guid() {
      const raw = S.text.trim().replace(/[{}]/g, "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) throw new Error("Paste a UUID.");
      const bytes = hexBytes(raw.replace(/-/g, ""));
      const hex = (list) => list.map((b) => b.toString(16).padStart(2, "0")).join(" ");
      const mixed = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => bytes[i]);
      return "RFC\n" + hex(bytes) + "\n\nWindows mixed-endian\n" + hex(mixed);
    },
    caesar() {
      if (!S.text.trim()) throw new Error("Paste some text.");
      const weight = { e: 12, t: 9, a: 8, o: 8, i: 7, n: 7, s: 6, h: 6, r: 6 };
      let best = null;
      for (let shift = 0; shift < 26; shift += 1) {
        let score = 0;
        let out = "";
        for (const ch of S.text) {
          const lower = ch.toLowerCase();
          if (lower >= "a" && lower <= "z") {
            const next = String.fromCharCode(((lower.charCodeAt(0) - 97 + shift) % 26) + 97);
            score += weight[next] || 0;
            out += ch === lower ? next : next.toUpperCase();
          } else out += ch;
        }
        if (!best || score > best.score) best = { shift, score, out: out.slice(0, 2000) };
      }
      return "shift " + best.shift + "\n" + best.out;
    },
    cases() {
      const words = S.text.trim().replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((word) => word.toLowerCase());
      if (!words.length) throw new Error("Paste an identifier.");
      const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);
      return [
        "camel   " + words[0] + words.slice(1).map(cap).join(""),
        "pascal  " + words.map(cap).join(""),
        "snake   " + words.join("_"),
        "kebab   " + words.join("-"),
        "scream  " + words.join("_").toUpperCase(),
      ].join("\n");
    },
    semver() {
      const parse = (value) => {
        const match = String(value || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
        if (!match) throw new Error("Use versions like 1.2.3.");
        return match.slice(1).map(Number);
      };
      const left = parse(S.text);
      const right = parse(S.textB);
      for (let i = 0; i < 3; i += 1) {
        if (left[i] === right[i]) continue;
        return (left[i] > right[i] ? S.text : S.textB).trim() + " is newer";
      }
      return "They are the same release.";
    },
    dotenv() {
      const rows = [];
      for (const line of S.text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const cut = trimmed.indexOf("=");
        if (cut < 1) continue;
        rows.push(trimmed.slice(0, cut) + " = " + trimmed.slice(cut + 1).replace(/^["']|["']$/g, ""));
      }
      if (!rows.length) throw new Error("Paste KEY=value lines.");
      return rows.join("\n");
    },
    color() {
      let hex = S.text.trim().replace(/^#/, "");
      if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
      if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error("Paste a hex color, like #1b6b4a.");
      const n = parseInt(hex, 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      return "rgb(" + r + ", " + g + ", " + b + ")";
    },
    cron() {
      const parts = S.text.trim().split(/\s+/);
      if (parts.length !== 5) throw new Error("Use five fields: minute hour day month weekday.");
      const names = ["minute", "hour", "day of month", "month", "weekday"];
      return parts.map((part, i) => names[i].padEnd(14, " ") + (part === "*" ? "every" : part)).join("\n");
    },
    dedent() {
      const lines = S.text.replace(/\t/g, "  ").split("\n");
      const widths = lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length);
      if (!widths.length) throw new Error("Paste some text.");
      const cut = Math.min(...widths);
      return lines.map((line) => line.slice(cut)).join("\n");
    },
    jsonpath() {
      if (!S.text.trim()) throw new Error("Paste JSON.");
      const path = S.pattern.trim();
      if (!path) throw new Error("Enter a path, like user.name or items.0.id.");
      let cur = JSON.parse(S.text);
      for (const part of path.split(".").filter(Boolean)) {
        if (cur == null || typeof cur !== "object" || !(part in cur)) throw new Error("No value at " + path + ".");
        cur = cur[part];
      }
      return typeof cur === "string" ? cur : JSON.stringify(cur, null, 2);
    },
    base() {
      const raw = S.text.trim().toLowerCase();
      if (!raw) throw new Error("Paste a number.");
      const from = raw.startsWith("0x") ? 16 : raw.startsWith("0b") ? 2 : raw.startsWith("0o") ? 8 : 10;
      const digits = raw.replace(/^0x|^0b|^0o/, "");
      if (!/^[0-9a-f]+$/.test(digits)) throw new Error("That is not a number this tool understands.");
      const n = BigInt(from === 16 ? "0x" + digits : from === 2 ? "0b" + digits : from === 8 ? "0o" + digits : digits);
      return "dec  " + n.toString(10) + "\nhex  0x" + n.toString(16) + "\noct  0o" + n.toString(8) + "\nbin  0b" + n.toString(2);
    },
    sqlline() {
      const sql = S.text.replace(/\s+/g, " ").trim();
      if (!sql) throw new Error("Paste a SQL statement.");
      return sql;
    },
    ioc() {
      const text = S.text.slice(0, 50000);
      if (!text.trim()) throw new Error("Paste a report or a log.");
      const uniq = (list) => [...new Set(list || [])].slice(0, 40);
      const block = (name, list) => name + "\n" + (list.length ? list.join("\n") : "(none)");
      return [
        block("URLs", uniq(text.match(/https?:\/\/[^\s"'<>]{4,200}/g))),
        block("Emails", uniq(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi))),
        block("IPv4", uniq(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g))),
        block("Hashes", uniq(text.match(/\b[a-f0-9]{32}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{64}\b/gi))),
      ].join("\n\n");
    },
    defang() {
      if (!S.text.trim()) throw new Error("Paste a URL or a host.");
      return S.text.replace(/https/gi, "hxxps").replace(/http/gi, "hxxp").replace(/\./g, "[.]");
    },
    refang() {
      if (!S.text.trim()) throw new Error("Paste a defanged URL.");
      return S.text.replace(/hxxps/gi, "https").replace(/hxxp/gi, "http").replace(/\[\.\]/g, ".").replace(/\(dot\)/gi, ".");
    },
    ua() {
      const text = S.text.trim();
      if (!text) throw new Error("Paste a User-Agent.");
      const browser = (text.match(/Edg\/[\d.]+|Chrome\/[\d.]+|Firefox\/[\d.]+|Version\/[\d.]+/) || ["unknown"])[0];
      const os = /Windows/.test(text) ? "Windows" : /Mac OS X/.test(text) ? "macOS" : /Android/.test(text) ? "Android" : /iPhone|iPad/.test(text) ? "iOS" : /Linux/.test(text) ? "Linux" : "unknown";
      return "browser  " + browser + "\nos       " + os;
    },
    basic() {
      const raw = S.text.trim().replace(/^Basic\s+/i, "");
      if (!raw) throw new Error("Paste a Basic authorization value you already have.");
      let decoded = "";
      try { decoded = atob(raw); } catch { throw new Error("That is not base64."); }
      const cut = decoded.indexOf(":");
      if (cut < 1) throw new Error("A Basic token is user:password in base64.");
      return "user  " + decoded.slice(0, cut) + "\npass  " + decoded.slice(cut + 1);
    },
    cidr() {
      const ip4 = (value) => {
        const parts = String(value || "").trim().split(".").map(Number);
        if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error("Use an IPv4 address.");
        return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
      };
      const [net, bitsRaw] = S.text.trim().split("/");
      const bits = Number(bitsRaw);
      if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error("Use a CIDR like 10.0.0.0/8.");
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      const inside = (ip4(S.textB) & mask) === (ip4(net) & mask);
      return inside ? "Inside the range." : "Outside the range.";
    },
    cookie() {
      const parts = S.text.split(";").map((part) => part.trim()).filter(Boolean);
      if (!parts.length) throw new Error("Paste a Cookie header.");
      return parts.map((part) => {
        const cut = part.indexOf("=");
        return cut < 0 ? part : part.slice(0, cut) + " = " + part.slice(cut + 1);
      }).join("\n");
    },
    async inflate() {
      const raw = S.text.trim();
      if (!raw) throw new Error("Paste gzip or zlib bytes as hex or base64.");
      const hexish = raw.replace(/0x/gi, "").replace(/[\s:]/g, "");
      let bytes;
      if (/^[0-9a-f]+$/i.test(hexish) && hexish.length % 2 === 0) bytes = hexBytes(raw);
      else {
        const bin = atob(raw.replace(/\s/g, ""));
        bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      }
      if (bytes.length > 200000) throw new Error("Keep the input under 200 KB.");
      const once = async (format) => {
        const stream = new DecompressionStream(format);
        const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
        const out = new Uint8Array(await response.arrayBuffer());
        return new TextDecoder().decode(out.slice(0, 8000));
      };
      try { return await once("gzip"); }
      catch {
        try { return await once("deflate"); }
        catch { throw new Error("Those bytes are not gzip or zlib."); }
      }
    },
    httpmsg() {
      const text = S.text.replace(/\r\n/g, "\n").trim();
      if (!text) throw new Error("Paste an HTTP request or response.");
      const lines = text.split("\n");
      const headers = [];
      for (let i = 1; i < lines.length; i += 1) {
        if (!lines[i].trim()) break;
        const cut = lines[i].indexOf(":");
        if (cut > 0) headers.push(lines[i].slice(0, cut).trim() + "  " + lines[i].slice(cut + 1).trim());
      }
      return lines[0] + "\n\n" + (headers.join("\n") || "(no headers)") + "\n\nParsed only. Traffic was not intercepted.";
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
    if (typeof data.report === "string") {
      const head = data.url
        ? "HTTP " + data.status + "  " + data.url + "\n" + (data.bytes ?? "") + " bytes\n\n"
        : (data.bytes ?? "") + " bytes from pasted hex\n\n";
      return head + data.report;
    }
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
      if (!isInstalled(tool.id)) throw new Error("Install this plugin first.");
      const wantsUrl = (tool.needs || []).includes("url");
      if (tool.hybrid && !S.url.trim() && !S.text.trim()) throw new Error("Give a public URL or paste text.");
      if (tool.serverText && !S.url.trim() && !S.text.trim()) throw new Error("Give a public URL or paste hex.");
      if (tool.action && wantsUrl && !tool.hybrid && !tool.serverText && !S.url.trim()) throw new Error("Give a public URL.");
      const server = tool.action && (!tool.hybrid || S.url.trim() || tool.serverText);
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

  function showTool(ctx) {
    const work = $("#tool-work");
    if (work) work.innerHTML = workHtml(toolById(S.id));
    paintList();
    bindWork(ctx);
    paintOut();
  }

  function installCurrent(ctx) {
    const tool = toolById(S.id);
    if (!tool.pack || isInstalled(tool.id)) return;
    saveExtra([...new Set([...extraInstalled(), tool.id])]);
    S.view = "installed";
    S.output = "";
    S.image = "";
    S.tone = "";
    ctx.notify(tool.name + " installed");
    const root = document.querySelector(".tools-screen");
    if (!root) return;
    root.outerHTML = render(ctx);
    wire(ctx);
  }

  function removeCurrent(ctx) {
    const tool = toolById(S.id);
    if (!tool.pack) return;
    saveExtra(extraInstalled().filter((id) => id !== tool.id));
    S.view = "available";
    S.output = "";
    S.image = "";
    S.tone = "";
    ctx.notify(tool.name + " removed");
    const root = document.querySelector(".tools-screen");
    if (!root) return;
    root.outerHTML = render(ctx);
    wire(ctx);
  }

  function bindWork(ctx) {
    const run = $("#tool-run");
    if (run) run.onclick = () => execute(ctx);
    const copy = $("#tool-copy");
    if (copy) copy.onclick = () => copyOut(ctx);
    const install = $("#tool-install");
    if (install) install.onclick = () => installCurrent(ctx);
    const remove = $("#tool-remove");
    if (remove) remove.onclick = () => removeCurrent(ctx);
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
    document.querySelectorAll("[data-plugin-tab]").forEach((btn) => {
      btn.onclick = () => {
        const next = btn.dataset.pluginTab === "available" ? "available" : "installed";
        if (next === S.view) return;
        readFields();
        S.view = next;
        S.query = "";
        const items = visibleTools();
        if (!items.some((t) => t.id === S.id)) S.id = items[0] ? items[0].id : S.id;
        const root = document.querySelector(".tools-screen");
        if (!root) return;
        root.outerHTML = render(ctx);
        wire(ctx);
      };
    });
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
        showTool(ctx);
      });
    }
    bindWork(ctx);
  }

  window.__SCREENS__ = window.__SCREENS__ || [];
  window.__SCREENS__.push({ id: "tools", TABS: ["Integrations"], render, wire });
})();
