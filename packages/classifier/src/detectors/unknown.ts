import { hit, type Detector } from "./types.js";

export const unknown: Detector = {
  id: "unknown",
  priority: 999,
  detect({ exitCode, signal }) {
    if (signal === "SIGSEGV") return hit("unknown", 0.4, `signal ${signal}`);
    if (exitCode !== null && exitCode !== 0) return hit("unknown", 0.2, `exit ${exitCode}`);
    return null;
  }
};