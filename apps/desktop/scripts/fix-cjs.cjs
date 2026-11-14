/**
 * Post-build fixup for Electron:
 *  1. Copies tsc output (dist/*.js) to .cjs so Electron's CJS module loader
 *     picks the built-in `electron` module (ESM shadowing by the npm shim is
 *     avoided entirely).
 *  2. Rewrites intra-app relative requires from "./x.js" to "./x.cjs".
 *  3. Copies the browser UI (src/renderer) verbatim to dist/renderer so it is
 *     NOT re-emitted as CommonJS modules by tsc (which would inject
 *     `Object.defineProperty(exports, ...)` and break the renderer when
 *     loaded as <script src> inside Electron.
 * Idempotent — safe on every build.
 */
const fs = require("node:fs");
const path = require("node:path");
const { join } = require("node:path");
const { existsSync } = require("node:fs");

const dist = join(__dirname, "..", "dist");
if (!existsSync(dist)) {
  console.error("dist/ missing — run tsc first");
  process.exit(1);
}

// 1. & 2. tsc outputs of the main/preload modules: .js -> .cjs.
for (const f of fs.readdirSync(dist)) {
  if (!f.endsWith(".js")) continue;
  const from = join(dist, f);
  const to = join(dist, f.replace(/\.js$/, ".cjs"));
  fs.copyFileSync(from, to);
  const src = fs.readFileSync(to, "utf8");
  const fixed = src
    .replace(/require\(".\/([a-zA-Z0-9_-]+)\.js"\)/g, 'require("./$1.cjs")')
    .replace(/require\(".\/([a-zA-Z0-9_-]+)"\)/g, 'require("./$1.cjs")');
  fs.writeFileSync(to, fixed);
}

// 3. Copy the browser UI (src/renderer) verbatim into dist so tsc does not
//    re-emit it as a CommonJS module (which would break <script src> loads).
const srcRenderer = path.join(__dirname, "..", "src", "renderer");
const distRenderer = join(dist, "renderer");
if (fs.existsSync(srcRenderer)) {
  fs.rmSync(distRenderer, { recursive: true, force: true });
  fs.cpSync(srcRenderer, distRenderer, { recursive: true });
  console.log("copied src/renderer -> dist/renderer");
}

console.log("dist/*.cjs generated");
