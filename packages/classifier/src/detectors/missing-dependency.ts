import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /Cannot find (?:module|package) '([^']+)'/i,
  /Module not found: (?:Error: )?Can't resolve '([^']+)'/i,
  /no required module provides package ([\w./-]+)/i,
  /unresolved import `([\w:]+)`/i
];

const PY = [/ModuleNotFoundError: No module named '([^']+)'/i, /ImportError: cannot import name/i];

export const missingDependency: Detector = {
  id: "missing-dependency",
  priority: 20,
  detect({ stderr }) {
    const py = anyMatch(PY, stderr);
    if (py) return hit("missing_dependency", 0.95, stderr.slice(0, 200));
    const m = anyMatch(P, stderr);
    if (!m) return null;
    // A relative path ("./x/y.js", "../a", "/abs") is a missing local file, not a dependency.
    if (/^(?:\.\.?\/|\\|\/)/.test(m[1] ?? "")) return null;
    return hit("missing_dependency", 0.93, stderr.slice(0, 200));
  }
};