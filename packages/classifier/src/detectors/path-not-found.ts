import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /ENOENT: no such file or directory, (?:open|scandir|stat) '([^']+)'/i,
  /Cannot find module '([^']+)'/i,
  /no such file or directory/i
];

export const pathNotFound: Detector = {
  id: "path-not-found",
  priority: 35,
  detect({ stderr }) {
    const m = anyMatch(P, stderr);
    if (!m) return null;
    // A bare "Cannot find module 'x'" with no slash is a dependency, not a path.
    if (/Cannot find module '([^'/]+)'/i.test(stderr)) return null;
    return hit("path_not_found", 0.85, stderr.slice(0, 200));
  }
};