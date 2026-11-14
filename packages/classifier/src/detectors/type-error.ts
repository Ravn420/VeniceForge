import { anyMatch, hit, type Detector } from "./types.js";

const P = [
  /error TS2\d{3}:/i,
  /error TS7\d{3}:/i,
  /Incompatible return value type/i,
  /Argument of type .* is not assignable/i,
  /is possibly 'undefined'/i,
  /Property '.*' does not exist on type/i
];

export const typeError: Detector = {
  id: "type-error",
  priority: 45,
  detect({ stderr }) {
    if (!anyMatch(P, stderr)) return null;
    return hit("type_error", 0.9, stderr.slice(0, 200));
  }
};