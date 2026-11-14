// Load the BUILT dist renderer scripts in jsdom (as the real app does) and
// report errors + DOM state. This is the decisive test for the blank-screen bug.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const APP_DIR = "C:/Users/Zeref/Downloads/venicestudio/Build files/apps/desktop/dist/renderer";
const files = ["venice-webapp.js", "screens-chat.js", "screens-media.js", "screens-dev.js", "renderer.js"]
  .map((f) => fs.readFileSync(path.join(APP_DIR, f), "utf8"));

const html = "<!DOCTYPE html><html><head></head><body><div id=\"app\"></div><div id=\"statusbar\"></div><div id=\"toast\"></div></body></html>";
const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const doc = w.document;

const errors = [];
w.addEventListener("error", (e) => errors.push("window-error: " + (e.message || e.target?.error?.message)));
w.addEventListener("unhandledrejection", (e) => errors.push("unhandled-rejection: " + (e.reason?.message || e.reason)));

for (const code of files) {
  try {
    w.eval(code);
  } catch (e) {
    errors.push("SCRIPT-EVAL-ERROR: " + (e.stack || e.message));
  }
}

setTimeout(() => {
  console.log("=== DIST-RENDERER BOOT TEST ===");
  console.log("scripts evaluated:", files.length);
  console.log("app.innerHTML length:", doc.getElementById("app").innerHTML.length);
  console.log("statusbar.innerHTML length:", doc.getElementById("statusbar").innerHTML.length);
  console.log("W.__SCREENS__ count:", w.__SCREENS__ ? w.__SCREENS__.length : "UNDEF");
  console.log("window.VeniceWebApp defined:", typeof w.VeniceWebApp !== "undefined");
  console.log("window.forge defined:", typeof w.forge !== "undefined");
  console.log("errors:", errors.length ? JSON.stringify(errors) : "none");
  console.log("app innerHTML head:", doc.getElementById("app").innerHTML.slice(0, 200).replace(/\n/g, " "));
  process.exit(0);
}, 80);
