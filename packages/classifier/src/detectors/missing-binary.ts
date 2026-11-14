import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /(?:bash|sh|zsh|dash): (?:line \d+: )?([\w.@/+-]+): (?:command )?not found/i,
  /([\w.@/+-]+): command not found/i,
  /'([\w.@/+-]+)' is not recognized as an internal or external command/i,
  /executable file not found in \$PATH/i
];

export const missingBinary: Detector = {
  id: "missing-binary",
  priority: 10,
  detect({ stderr }) {
    const m = anyMatch(P, stderr);
    if (!m) return null;
    return hit("missing_binary", 0.97, stderr.slice(0, 200));
  }
};