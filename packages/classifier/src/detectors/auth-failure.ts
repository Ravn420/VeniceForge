import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /\b401\b.*Unauthorized/i,
  /\b403\b.*Forbidden/i,
  /authentication required/i,
  /token (?:expired|invalid)/i,
  /is not set$/i,
  /unauthorized:/i
];

export const authFailure: Detector = {
  id: "auth-failure",
  priority: 70,
  detect({ stderr }) {
    if (!anyMatch(P, stderr)) return null;
    return hit("auth_failure", 0.82, stderr.slice(0, 200));
  }
};