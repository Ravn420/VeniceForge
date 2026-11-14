import { describe, expect, it } from "vitest";
import type { FailureClass } from "@forge/contracts";
import { buildSignature, classify } from "../src/index.js";

interface Fixture {
  id: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  expectedClass: FailureClass;
  heldOut: boolean;
}

const FIXTURES: Fixture[] = [
  // missing_binary
  { id: "mb-1", stdout: "", stderr: "bash: rg: command not found", exitCode: 127, signal: null, expectedClass: "missing_binary", heldOut: false },
  { id: "mb-2", stdout: "", stderr: "sh: line 1: jq: not found", exitCode: 127, signal: null, expectedClass: "missing_binary", heldOut: false },
  { id: "mb-3", stdout: "", stderr: "'vitest' is not recognized as an internal or external command", exitCode: 1, signal: null, expectedClass: "missing_binary", heldOut: false },
  { id: "mb-4", stdout: "", stderr: "exec: \"docker\": executable file not found in $PATH", exitCode: 127, signal: null, expectedClass: "missing_binary", heldOut: true },
  // missing_dependency
  { id: "md-1", stdout: "", stderr: "Error: Cannot find module 'zod'", exitCode: 1, signal: null, expectedClass: "missing_dependency", heldOut: false },
  { id: "md-2", stdout: "", stderr: "Module not found: Error: Can't resolve 'react-router-dom'", exitCode: 1, signal: null, expectedClass: "missing_dependency", heldOut: false },
  { id: "md-3", stdout: "", stderr: "ModuleNotFoundError: No module named 'fastapi'", exitCode: 1, signal: null, expectedClass: "missing_dependency", heldOut: false },
  { id: "md-4", stdout: "", stderr: "no required module provides package github.com/gin-gonic/gin", exitCode: 1, signal: null, expectedClass: "missing_dependency", heldOut: true },
  // version_mismatch
  { id: "vm-1", stdout: "", stderr: "npm ERR! code EBADENGINE", exitCode: 1, signal: null, expectedClass: "version_mismatch", heldOut: false },
  { id: "vm-2", stdout: "", stderr: "Package requires Python 3.11 or newer", exitCode: 1, signal: null, expectedClass: "version_mismatch", heldOut: false },
  { id: "vm-3", stdout: "", stderr: "Error: unsupported node version", exitCode: 1, signal: null, expectedClass: "version_mismatch", heldOut: true },
  // port_in_use
  { id: "pu-1", stdout: "", stderr: "Error: listen EADDRINUSE: address already in use :::3000", exitCode: 1, signal: null, expectedClass: "port_in_use", heldOut: false },
  { id: "pu-2", stdout: "", stderr: "Port 8080 is already in use", exitCode: 1, signal: null, expectedClass: "port_in_use", heldOut: false },
  { id: "pu-3", stdout: "", stderr: "bind: address already in use", exitCode: 1, signal: null, expectedClass: "port_in_use", heldOut: true },
  // permission_denied
  { id: "pd-1", stdout: "", stderr: "Error: EACCES: permission denied, open '/etc/shadow'", exitCode: 1, signal: null, expectedClass: "permission_denied", heldOut: false },
  { id: "pd-2", stdout: "", stderr: "bash: ./deploy.sh: Permission denied", exitCode: 126, signal: null, expectedClass: "permission_denied", heldOut: false },
  { id: "pd-3", stdout: "", stderr: "EPERM: operation not permitted", exitCode: 1, signal: null, expectedClass: "permission_denied", heldOut: true },
  // path_not_found
  { id: "pnf-1", stdout: "", stderr: "Error: ENOENT: no such file or directory, open '/app/config.json'", exitCode: 1, signal: null, expectedClass: "path_not_found", heldOut: false },
  { id: "pnf-2", stdout: "", stderr: "Cannot find module './missing/helper.js'", exitCode: 1, signal: null, expectedClass: "path_not_found", heldOut: false },
  { id: "pnf-3", stdout: "", stderr: "cat: missing.txt: No such file or directory", exitCode: 1, signal: null, expectedClass: "path_not_found", heldOut: true },
  // syntax_error
  { id: "se-1", stdout: "", stderr: "src/index.ts(12,5): error TS1005: ';' expected.", exitCode: 2, signal: null, expectedClass: "syntax_error", heldOut: false },
  { id: "se-2", stdout: "", stderr: "SyntaxError: Unexpected token '}'", exitCode: 1, signal: null, expectedClass: "syntax_error", heldOut: false },
  { id: "se-3", stdout: "", stderr: "IndentationError: unexpected indent", exitCode: 1, signal: null, expectedClass: "syntax_error", heldOut: true },
  // type_error
  { id: "te-1", stdout: "", stderr: "src/app.ts(4,10): error TS2322: Type 'string' is not assignable to type 'number'.", exitCode: 2, signal: null, expectedClass: "type_error", heldOut: false },
  { id: "te-2", stdout: "", stderr: "error TS2339: Property 'foo' does not exist on type 'Bar'.", exitCode: 2, signal: null, expectedClass: "type_error", heldOut: false },
  { id: "te-3", stdout: "", stderr: "Argument of type 'null' is not assignable to parameter of type 'string'", exitCode: 2, signal: null, expectedClass: "type_error", heldOut: true },
  // test_assertion
  { id: "ta-1", stdout: "", stderr: "AssertionError: expected 2 to equal 3", exitCode: 1, signal: null, expectedClass: "test_assertion", heldOut: false },
  { id: "ta-2", stdout: "FAILED tests/test_api.py::test_login", stderr: "", exitCode: 1, signal: null, expectedClass: "test_assertion", heldOut: false },
  { id: "ta-3", stdout: "--- FAIL: TestHandler (0.01s)", stderr: "", exitCode: 1, signal: null, expectedClass: "test_assertion", heldOut: true },
  // build_failure
  { id: "bf-1", stdout: "", stderr: "[ERROR] Failed to compile bundle", exitCode: 1, signal: null, expectedClass: "build_failure", heldOut: false },
  { id: "bf-2", stdout: "", stderr: "error: linking with `cc` failed: exit status: 1", exitCode: 1, signal: null, expectedClass: "build_failure", heldOut: false },
  { id: "bf-3", stdout: "", stderr: "webpack 3 errors in build", exitCode: 1, signal: null, expectedClass: "build_failure", heldOut: true },
  // egress_blocked
  { id: "eb-1", stdout: "", stderr: "Error: EGRESS_DENIED connecting to https://api.example.com", exitCode: 1, signal: null, expectedClass: "egress_blocked", heldOut: false },
  { id: "eb-2", stdout: "", stderr: "curl: (7) Failed to connect to example.org port 443", exitCode: 7, signal: null, expectedClass: "egress_blocked", heldOut: false },
  { id: "eb-3", stdout: "", stderr: "Error: getaddrinfo ENOTFOUND registry.internal", exitCode: 1, signal: null, expectedClass: "egress_blocked", heldOut: true },
  // auth_failure
  { id: "af-1", stdout: "", stderr: "HTTP 401 Unauthorized", exitCode: 1, signal: null, expectedClass: "auth_failure", heldOut: false },
  { id: "af-2", stdout: "", stderr: "Error: VENICE_API_KEY is not set", exitCode: 1, signal: null, expectedClass: "auth_failure", heldOut: false },
  { id: "af-3", stdout: "", stderr: "403 Forbidden: token expired", exitCode: 1, signal: null, expectedClass: "auth_failure", heldOut: true },
  // disk_full
  { id: "df-1", stdout: "", stderr: "Error: ENOSPC: no space left on device, write", exitCode: 1, signal: null, expectedClass: "disk_full", heldOut: false },
  { id: "df-2", stdout: "", stderr: "Disk quota exceeded", exitCode: 1, signal: null, expectedClass: "disk_full", heldOut: true },
  // oom
  { id: "oom-1", stdout: "", stderr: "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory", exitCode: 134, signal: null, expectedClass: "oom", heldOut: false },
  { id: "oom-2", stdout: "", stderr: "MemoryError", exitCode: 1, signal: null, expectedClass: "oom", heldOut: false },
  { id: "oom-3", stdout: "", stderr: "", exitCode: 137, signal: "SIGKILL", expectedClass: "oom", heldOut: true },
  // interactive_stall
  { id: "is-1", stdout: "Do you want to continue? [Y/n] ", stderr: "", exitCode: null, signal: null, expectedClass: "interactive_stall", heldOut: false },
  { id: "is-2", stdout: "Password: ", stderr: "", exitCode: null, signal: null, expectedClass: "interactive_stall", heldOut: true },
  // flaky_test
  { id: "ft-1", stdout: "", stderr: "Error: connect ECONNREFUSED 127.0.0.1:5432", exitCode: 1, signal: null, expectedClass: "flaky_test", heldOut: false },
  { id: "ft-2", stdout: "", stderr: "Test timed out after 5000ms", exitCode: 1, signal: null, expectedClass: "flaky_test", heldOut: true }
];

const base = { argv: [], signal: null, cwd: "/app" };

describe("classify against the corpus", () => {
  it("classifies every tuning fixture correctly", () => {
    const wrong: string[] = [];
    for (const f of FIXTURES.filter((x) => !x.heldOut)) {
      const got = classify({ ...base, stdout: f.stdout, stderr: f.stderr, exitCode: f.exitCode, signal: f.signal });
      if (got?.failureClass !== f.expectedClass) wrong.push(`${f.id}: want ${f.expectedClass} got ${got?.failureClass ?? "null"}`);
    }
    expect(wrong).toEqual([]);
  });

  it("reaches at least 60% on held-out fixtures", () => {
    const held = FIXTURES.filter((x) => x.heldOut);
    const right = held.filter((f) => {
      const got = classify({ ...base, stdout: f.stdout, stderr: f.stderr, exitCode: f.exitCode, signal: f.signal });
      return got?.failureClass === f.expectedClass;
    });
    expect(right.length / held.length).toBeGreaterThanOrEqual(0.6);
  });

  it("returns null for a clean run", () => {
    expect(classify({ ...base, stdout: "ok", stderr: "", exitCode: 0 })).toBeNull();
  });
});

describe("signatures", () => {
  it("is stable across volatile values", () => {
    const a = classify({ ...base, stdout: "", stderr: "EADDRINUSE :::3000", exitCode: 1 });
    const b = classify({ ...base, stdout: "", stderr: "EADDRINUSE :::8080", exitCode: 1 });
    expect(a && b).toBeTruthy();
    if (!a || !b) return;
    const meta = { projectId: "prj_0123456789abcdefghijklmn", commandId: "cmd_0123456789abcdefghijklmn", platform: "linux", now: 1, makeSigId: () => "sig_0123456789abcdefghijklmn" };
    const sa = buildSignature({ ...base, stdout: "", stderr: "EADDRINUSE :::3000", exitCode: 1 }, a, meta);
    const sb = buildSignature({ ...base, stdout: "", stderr: "EADDRINUSE :::8080", exitCode: 1 }, b, meta);
    expect(sa.hash).toBe(sb.hash);
  });
});
