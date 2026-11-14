import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /EADDRINUSE/i,
  /address already in use/i,
  /Port \d+ is (?:already )?in use/i,
  /could not create any TCP\/IP sockets/i,
  /bind: address already in use/i
];

export const portInUse: Detector = {
  id: "port-in-use",
  priority: 28,
  detect({ stderr }) {
    if (!anyMatch(P, stderr)) return null;
    return hit("port_in_use", 0.96, stderr.slice(0, 200));
  }
};