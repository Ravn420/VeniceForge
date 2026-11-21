/**
 * Browser preview of the Venice Forge renderer.
 * Electron IPC is stubbed so model pickers, login, and deep links work
 * without a desktop shell. Listens on 0.0.0.0:8080 for the live preview.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../src/renderer");
const PORT = Number(process.env.PORT || 8080);
const HOST = "0.0.0.0";

const SURFACES = {
  chat: "https://venice.ai/chat/v2",
  image: "https://venice.ai/studio/image",
  video: "https://venice.ai/studio/video",
  audio: "https://venice.ai/studio/audio",
};

const MODELS = [
  { id: "venice-uncensored", name: "Venice Uncensored", label: "Venice Uncensored (free)", surface: "chat", free: true, available: true, blurb: "Default general chat model. Free on the web app." },
  { id: "venice-coder", name: "Venice Coder", label: "Venice Coder (free)", surface: "chat", free: true, available: true, blurb: "Code-focused chat model. Free on the web app." },
  { id: "venice-reasoner", name: "Venice Reasoner", label: "Venice Reasoner (free)", surface: "chat", free: true, available: true, blurb: "Reasoning model. Free on the web app." },
  { id: "venice-image", name: "Venice Image Studio", label: "Venice Image Studio (free)", surface: "image", free: true, available: true, blurb: "Image studio. Free tier on the web app." },
  { id: "venice-video", name: "Venice Video Studio", label: "Venice Video Studio (free)", surface: "video", free: true, available: true, blurb: "Video studio." },
  { id: "venice-audio", name: "Venice Audio Studio", label: "Venice Audio Studio (free)", surface: "audio", free: true, available: true, blurb: "Audio studio. Free on the web app." },
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const SHIM = `<script>
(function () {
  const MODELS = ${JSON.stringify(MODELS)};
  const SURFACES = ${JSON.stringify(SURFACES)};
  const chat = () => MODELS.filter((m) => m.surface === "chat" || m.surface === "audio");
  const surfaceUrl = (id) => {
    const m = MODELS.find((x) => x.id === id || x.name === id);
    return SURFACES[m?.surface || "chat"];
  };
  const chatLink = (task, model) => {
    const base = surfaceUrl(model || "venice-uncensored");
    const q = String(task || "").trim().slice(0, 2000);
    return q ? base + "?q=" + encodeURIComponent(q) : base;
  };
  const sessionKey = "forge.preview.venice";
  const readSession = () => {
    try { return JSON.parse(localStorage.getItem(sessionKey) || "null"); }
    catch { return null; }
  };
  window.forge = {
    venice: {
      models: async () => MODELS,
      chatModels: async () => chat(),
      surfaceUrl: async (id) => surfaceUrl(id),
      chatLink: async (task, model) => chatLink(task, model),
      processCompletion: async () => "",
      importCookies: async () => ({ imported: 0, loggedIn: !!readSession()?.loggedIn, sources: [] }),
      loginState: async () => readSession() || { loggedIn: false, source: "", skippedLogin: false },
      openBrowserLogin: async () => {
        window.open("https://venice.ai/sign-in", "_blank", "noopener");
        const st = { loggedIn: true, source: "browser", skippedLogin: false };
        localStorage.setItem(sessionKey, JSON.stringify(st));
        return st;
      },
    },
    browser: { open: async (url) => { window.open(url, "_blank", "noopener"); return { ok: true }; } },
    files: {
      openDialog: async () => null,
      exists: async () => false,
      mkdir: async () => {},
      write: async () => {},
      read: async () => "",
      list: async () => [],
      tree: async () => [],
      watch: async () => {},
      saveDialog: async () => null,
      remove: async () => {},
      rename: async () => {},
    },
    git: {
      status: async () => ({ branch: "", dirty: [], ahead: 0 }),
      diff: async () => "",
      commit: async () => ({ ok: false, hash: "" }),
      log: async () => [],
      branch: async () => [],
      checkout: async () => ({ ok: false }),
      init: async () => ({ ok: false }),
    },
    terminal: { create: async () => "preview", write: async () => {}, resize: async () => {}, kill: async () => {}, getData: async () => "", onData: () => {}, onExit: () => {} },
    subagents: { spawn: async () => ({ id: "preview" }), list: async () => [], stop: async () => {}, steer: async () => {}, onResult: () => {} },
    shell: { exec: async () => ({ code: 1, out: "" }), which: async () => null },
    brainstorm: { run: async () => ({ ok: false }), stop: async () => ({ ok: true }), onEvent: () => () => {} },
  };
})();
</script>`;

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const full = normalize(join(ROOT, rel));
  if (!full.startsWith(normalize(ROOT))) return null;
  return full;
}

const server = createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/venice/session")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ loggedIn: false, source: "", skippedLogin: false }));
      return;
    }
    const file = safePath(req.url || "/");
    if (!file) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    let body = await readFile(file);
    const ext = extname(file);
    if (ext === ".html") {
      const html = body.toString("utf8").replace("<div id=\"app\"></div>", SHIM + "\n  <div id=\"app\"></div>");
      body = Buffer.from(html);
    }
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Venice Forge preview http://${HOST}:${PORT}`);
});
