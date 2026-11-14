import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /EGRESS_DENIED/i,
  /blocked by egress policy/i,
  /failed to connect .* port \d+/i,
  /EAI_AGAIN/i,
  /getaddrinfo ENOTFOUND/i
];

export const egressBlocked: Detector = {
  id: "egress-blocked",
  priority: 65,
  detect({ stderr }) {
    if (!anyMatch(P, stderr)) return null;
    return hit("egress_blocked", 0.86, stderr.slice(0, 200));
  }
};