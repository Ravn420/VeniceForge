import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /EACCES/i,
  /EPERM/i,
  /Permission denied/i,
  /(?:operation not permitted)/i,
  /npm ERR! code EACCES/i
];

export const permissionDenied: Detector = {
  id: "permission-denied",
  priority: 30,
  detect({ stderr, exitCode }) {
    if (!anyMatch(P, stderr)) return null;
    if (exitCode === 0) return null;
    return hit("permission_denied", 0.92, stderr.slice(0, 200));
  }
};