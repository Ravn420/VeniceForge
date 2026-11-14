import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /expected \d+ to be less than \d+/i,
  /ECONNREFUSED 127\.0\.0\.1/i,
  /timed out after \d+ms/i,
  /Expected .* to equal .*insertion order/i,
  /flaky/i
];

export const flakyTest: Detector = {
  id: "flaky-test",
  priority: 85,
  detect({ stdout, stderr }) {
    const both = `${stdout}\n${stderr}`;
    if (!anyMatch(P, both)) return null;
    return hit("flaky_test", 0.6, both.slice(0, 200));
  }
};