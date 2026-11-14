import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /JavaScript heap out of memory/i,
  /Reached heap limit/i,
  /MemoryError/i,
  /Cannot allocate memory/i,
  /^Killed$/m
];

export const oom: Detector = {
  id: "oom",
  priority: 78,
  detect({ stderr, signal, exitCode }) {
    if (anyMatch(P, stderr)) return hit("oom", 0.9, stderr.slice(0, 200));
    if (signal === "SIGKILL" && exitCode === 137) return hit("oom", 0.7, "SIGKILL with 137");
    return null;
  }
};