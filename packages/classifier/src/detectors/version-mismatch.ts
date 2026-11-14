import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /EBADENGINE/i,
  /requires (?:go|node|python) ?[><=]+ ?[\d.]+/i,
  /requires Python 3\.\d+ or newer/i,
  /unsupported (?:engine|runtime|node) version/i,
  /(?:running|current):? \{[^}]*"node": "[^"]+"\}/i
];

export const versionMismatch: Detector = {
  id: "version-mismatch",
  priority: 25,
  detect({ stderr }) {
    if (!anyMatch(P, stderr)) return null;
    return hit("version_mismatch", 0.9, stderr.slice(0, 200));
  }
};