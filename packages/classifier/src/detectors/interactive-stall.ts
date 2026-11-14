import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /\[Y\/n\]/i,
  /\(y\/N\)/i,
  /Do you want to continue\?/i,
  /package name: \(/i,
  /Press any key/i,
  /^:\s*$/m,
  /Password:/i,
  /Overwrite\? /i
];

export const interactiveStall: Detector = {
  id: "interactive-stall",
  priority: 82,
  detect({ stdout, exitCode }) {
    if (exitCode !== null && exitCode !== 0) return null;
    if (!anyMatch(P, stdout)) return null;
    return hit("interactive_stall", 0.8, stdout.slice(-200));
  }
};