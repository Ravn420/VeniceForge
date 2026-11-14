import { describe, expect, it } from "vitest";
import { DETECTORS } from "../src/index.js";

const base = { argv: [], signal: null, cwd: "/app" };

describe("detector registry", () => {
  it("has 17 detectors", () => expect(DETECTORS).toHaveLength(17));

  it("is ordered by priority", () => {
    const ps = DETECTORS.map((d) => d.priority);
    expect([...ps].sort((a, b) => a - b)).toEqual(ps);
  });

  it("has unique ids", () => {
    expect(new Set(DETECTORS.map((d) => d.id)).size).toBe(17);
  });
});

describe("specificity ordering", () => {
  it("prefers missing_binary over unknown for exit 127", () => {
    const got = DETECTORS.map((d) => d.detect({ ...base, stdout: "", stderr: "bash: rg: command not found", exitCode: 127 }));
    const first = got.find((g) => g !== null);
    expect(first?.failureClass).toBe("missing_binary");
  });

  it("does not fire permission_denied on success", () => {
    const d = DETECTORS.find((x) => x.id === "permission-denied");
    expect(d?.detect({ ...base, stdout: "", stderr: "EACCES", exitCode: 0 })).toBeNull();
  });
});