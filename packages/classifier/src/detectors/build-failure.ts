import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /\[ERROR\]/,
  /linking with `cc` failed/i,
  /undefined reference to/i,
  /Build failed/i,
  /webpack \d+ errors?/i,
  /rollup failed/i
];

export const buildFailure: Detector = {
  id: "build-failure",
  priority: 60,
  detect({ stderr, exitCode }) {
    if (exitCode === 0) return null;
    if (!anyMatch(P, stderr)) return null;
    return hit("build_failure", 0.75, stderr.slice(0, 200));
  }
};