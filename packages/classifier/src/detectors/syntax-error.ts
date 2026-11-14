import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /error TS1\d{3}:/i,
  /SyntaxError:/i,
  /IndentationError:/i,
  /Unexpected (?:token|end of input)/i,
  /expected `[;,}]`, found/i,
  /mapping values are not allowed in this context/i,
  /ParseError/i
];

export const syntaxError: Detector = {
  id: "syntax-error",
  priority: 40,
  detect({ stderr }) {
    if (!anyMatch(P, stderr)) return null;
    return hit("syntax_error", 0.9, stderr.slice(0, 200));
  }
};