import { authFailure } from "./auth-failure.js";
import { buildFailure } from "./build-failure.js";
import { diskFull } from "./disk-full.js";
import { egressBlocked } from "./egress-blocked.js";
import { flakyTest } from "./flaky-test.js";
import { interactiveStall } from "./interactive-stall.js";
import { missingBinary } from "./missing-binary.js";
import { missingDependency } from "./missing-dependency.js";
import { oom } from "./oom.js";
import { pathNotFound } from "./path-not-found.js";
import { permissionDenied } from "./permission-denied.js";
import { portInUse } from "./port-in-use.js";
import { syntaxError } from "./syntax-error.js";
import { testAssertion } from "./test-assertion.js";
import { typeError } from "./type-error.js";
import { unknown } from "./unknown.js";
import { versionMismatch } from "./version-mismatch.js";
import type { Detector } from "./types.js";

/** Ordered by priority. Specific faults run before generic ones. */
export const DETECTORS: readonly Detector[] = [
  missingBinary,
  missingDependency,
  versionMismatch,
  portInUse,
  permissionDenied,
  pathNotFound,
  syntaxError,
  typeError,
  testAssertion,
  buildFailure,
  egressBlocked,
  authFailure,
  diskFull,
  oom,
  interactiveStall,
  flakyTest,
  unknown
].sort((a, b) => a.priority - b.priority);

export type { Detector, DetectorInput } from "./types.js";