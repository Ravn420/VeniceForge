import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /AssertionError/i,
  /^\s*FAILED\s+\S+::/m,
  /^\s*FAIL\s+\S+\s+>/m,
  /--- FAIL:/,
  /Expected: .*\nReceived:/,
  /got \d+, want \d+/,
  /Snapshot .* mismatched/i
];

export const testAssertion: Detector = {
  id: "test-assertion",
  priority: 50,
  detect({ stdout, stderr }) {
    const both = `${stdout}\n${stderr}`;
    if (!anyMatch(P, both)) return null;
    return hit("test_assertion", 0.88, both.slice(0, 200));
  }
};