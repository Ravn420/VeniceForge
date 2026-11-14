import { anyMatch, hit, type Detector } from "./types.js";

const P = [/ENOSPC/i, /no space left on device/i, /Disk quota exceeded/i, /disk full/i];

export const diskFull: Detector = {
  id: "disk-full",
  priority: 75,
  detect({ stderr }) {
    if (!anyMatch(P, stderr)) return null;
    return hit("disk_full", 0.95, stderr.slice(0, 200));
  }
};