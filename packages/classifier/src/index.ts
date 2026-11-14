export { classify, buildSignature } from "./classify.js";
export { DETECTORS } from "./detectors/index.js";
export type { Detector, DetectorInput } from "./detectors/index.js";
export { firstDiagnostic, normalizeDiagnostic, signatureHash, stripAnsi } from "./normalize.js";