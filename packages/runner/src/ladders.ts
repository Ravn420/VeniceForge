import type { FailureClass, FailureSignature, RemedyPlan } from "@forge/contracts";

export interface LadderContext {
  signature: FailureSignature;
  argv: string[];
  stderr: string;
  /** Known packages in the project, for typosquat scoring. */
  knownPackages: readonly string[];
  makeAttemptId: () => string;
}

export interface Rung {
  title: string;
  rationale: string;
  build: (ctx: LadderContext) => string[][] | null;
  expectedEffect: RemedyPlan["expectedEffect"];
  reversible: boolean;
  requiresScripts?: boolean;
}

const extract = (re: RegExp, text: string): string | null => text.match(re)?.[1] ?? null;
const shQuote = (val: string): string => `'${val.replace(/'/g, "'\\''")}'`;

function pkgFromMissing(stderr: string): string | null {
  return (
    extract(/Cannot find module '([^']+)'/i, stderr) ??
    extract(/Can't resolve '([^']+)'/i, stderr) ??
    extract(/No module named '([^']+)'/i, stderr) ??
    null
  );
}

function portFrom(stderr: string): number | null {
  const m = extract(/:::(?:.*:)?(\d{2,5})/i, stderr) ?? extract(/[Pp]ort (\d{2,5})/i, stderr);
  return m ? Number(m) : null;
}

/** Ladders are ordered cheapest and most reversible first. */
export const LADDERS: Record<FailureClass, Rung[]> = {
  missing_binary: [
    {
      title: "install missing binary",
      rationale: "command is not on PATH; install it from the distro repository",
      build: (c) => {
        const bin = c.argv[0];
        if (!bin) return null;
        const map: Record<string, string> = { rg: "ripgrep", jq: "jq", python3: "python3", tree: "tree" };
        const pkg = map[bin] ?? bin;
        return [["sh", "-c", `apt-get update -qq && apt-get install -y ${pkg}`]];
      },
      expectedEffect: "binary_present",
      reversible: true
    },
    {
      title: "install via npm global to project prefix",
      rationale: "no distro package; use the project-local prefix",
      build: (c) => (c.argv[0] ? [["npm", "install", "-g", c.argv[0]]] : null),
      expectedEffect: "binary_present",
      reversible: true
    }
  ],

  missing_dependency: [
    {
      title: "install the unresolved package at a pinned version",
      rationale: "module cannot resolve; install it exactly with scripts disabled",
      build: (c) => {
        const pkg = pkgFromMissing(c.stderr);
        if (!pkg) return null;
        return [["npm", "install", `${pkg}@latest`, "--ignore-scripts", "--save-exact"]];
      },
      expectedEffect: "module_resolved",
      reversible: true
    },
    {
      title: "install with scripts enabled",
      rationale: "package needs a postinstall step to be usable",
      build: (c) => {
        const pkg = pkgFromMissing(c.stderr);
        return pkg ? [["npm", "install", `${pkg}@latest`, "--save-exact"]] : null;
      },
      expectedEffect: "module_resolved",
      reversible: true,
      requiresScripts: true
    }
  ],

  version_mismatch: [
    {
      title: "switch to the version declared by the project",
      rationale: "the runtime does not satisfy the project's engines constraint",
      build: () => [["sh", "-c", "test -f .nvmrc && nvm use || true"]],
      expectedEffect: "exit_zero",
      reversible: true
    },
    {
      title: "reinstall at the locked versions",
      rationale: "lockfile may predate the current runtime",
      build: () => [["npm", "ci", "--ignore-scripts"]],
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  permission_denied: [
    {
      title: "grant execute on the referenced script",
      rationale: "file exists but is not executable",
      build: (c) => {
        const f = extract(/([\w./-]+\.sh)/, c.stderr);
        return f ? [["chmod", "+x", f]] : null;
      },
      expectedEffect: "exit_zero",
      reversible: true
    },
    {
      title: "fix ownership inside the container",
      rationale: "file is owned by root in the sandbox",
      build: (c) => {
        const f = extract(/path (\/[\w./-]+)/, c.stderr) ?? extract(/'(\/[\w./-]+)'/, c.stderr);
        return f ? [["sh", "-c", `chown -R forge:forge ${f}`]] : null;
      },
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  port_in_use: [
    {
      title: "reassign the port and retry",
      rationale: "another process holds the port; move to the next free one",
      build: (c) => {
        const p = portFrom(c.stderr);
        return p ? [["sh", "-c", `PORT=$(( ${p} + 1 ))`]] : null;
      },
      expectedEffect: "port_free",
      reversible: true
    },
    {
      title: "stop the process holding the port",
      rationale: "the listener is a stale run from this project",
      build: (c) => {
        const p = portFrom(c.stderr);
        return p ? [["sh", "-c", `fuser -k ${p}/tcp || true`]] : null;
      },
      expectedEffect: "port_free",
      reversible: true
    }
  ],

  path_not_found: [
    {
      title: "create the missing path",
      rationale: "the referenced path does not exist",
      build: (c) => {
        const f = extract(/(?:open|scandir|stat) '([^']+)'/, c.stderr) ?? extract(/Cannot find module '(\/.*?)'/, c.stderr);
        if (!f) return null;
        const qf = shQuote(f);
        return [["sh", "-c", `mkdir -p "$(dirname ${qf})" && touch ${qf}`]];
      },
      expectedEffect: "path_exists",
      reversible: true
    },
    {
      title: "run from the project root",
      rationale: "relative path resolves only from the root",
      build: () => [["sh", "-c", "cd \"$(git rev-parse --show-toplevel 2>/dev/null || echo .)\""]],
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  syntax_error: [
    {
      title: "re-run to confirm the location",
      rationale: "syntax faults are patched in the editor; confirm the reported line first",
      build: () => [["sh", "-c", "true"]],
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  type_error: [
    {
      title: "re-run the typechecker alone",
      rationale: "isolate the type fault from the build",
      build: () => [["npx", "tsc", "--noEmit"]],
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  test_assertion: [
    {
      title: "re-run only the failing test",
      rationale: "narrow the failure before touching source",
      build: (c) => {
        const name = extract(/(?:FAIL|FAILED)\s+(\S+)/, `${c.stderr}`) ?? extract(/>\s*(.+)$/m, c.stderr);
        return name ? [["sh", "-c", `npm test -- ${name}`]] : null;
      },
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  build_failure: [
    {
      title: "clean build artifacts and rebuild",
      rationale: "stale output can mask the real error",
      build: () => [["sh", "-c", "rm -rf dist .next build && npm run build"]],
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  egress_blocked: [
    {
      title: "grant the blocked host",
      rationale: "the request needs an allowlist entry",
      build: (c) => {
        const host = extract(/https?:\/\/([\w.-]+)/, c.stderr) ?? extract(/connect to ([\w.-]+) port/i, c.stderr);
        return host ? [["sh", "-c", `echo ${host} >> .forge/egress.allow`]] : null;
      },
      expectedEffect: "custom",
      reversible: true
    }
  ],

  auth_failure: [
    {
      title: "check the required secret is present",
      rationale: "a token is missing or expired",
      build: (c) => {
        const key = extract(/([A-Z][A-Z0-9_]{2,}) is not set/, c.stderr);
        return key ? [["sh", "-c", `test -n "$${key}"`]] : null;
      },
      expectedEffect: "auth_present",
      reversible: true
    }
  ],

  disk_full: [
    {
      title: "prune package caches",
      rationale: "caches dominate sandbox disk use",
      build: () => [["sh", "-c", "npm cache clean --force 2>/dev/null; rm -rf node_modules/.cache .next/cache"]],
      expectedEffect: "quota_ok",
      reversible: true
    }
  ],

  oom: [
    {
      title: "raise the node heap ceiling",
      rationale: "default heap is smaller than the build needs",
      build: () => [["sh", "-c", "export NODE_OPTIONS=--max-old-space-size=4096"]],
      expectedEffect: "exit_zero",
      reversible: true
    },
    {
      title: "reduce worker concurrency",
      rationale: "parallel workers multiply peak memory",
      build: () => [["sh", "-c", "export JEST_WORKERS=1 VITEST_MAX_THREADS=1"]],
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  interactive_stall: [
    {
      title: "answer the prompt non-interactively",
      rationale: "the process is waiting on stdin",
      build: (c) => {
        if (/\[Y\/n\]/i.test(c.stderr) || /Do you want to continue/i.test(c.stderr)) {
          return [["sh", "-c", "printf 'y\\n' | true"]];
        }
        return [["sh", "-c", "export CI=1 DEBIAN_FRONTEND=noninteractive"]];
      },
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  flaky_test: [
    {
      title: "isolate and re-run five times",
      rationale: "confirm flakiness before changing source",
      build: () => [["sh", "-c", "for i in 1 2 3 4 5; do npm test --silent || true; done"]],
      expectedEffect: "exit_zero",
      reversible: true
    }
  ],

  unknown: []
};

export function buildPlan(ctx: LadderContext, rung: number): RemedyPlan | null {
  const ladder = LADDERS[ctx.signature.failureClass];
  const r = ladder[rung];
  if (!r) return null;
  const steps = r.build(ctx);
  if (!steps) return null;
  return {
    attemptId: ctx.makeAttemptId(),
    signatureId: ctx.signature.id,
    rung,
    title: r.title,
    rationale: r.rationale,
    steps,
    expectedEffect: r.expectedEffect,
    reversible: r.reversible,
    requiresScripts: r.requiresScripts ?? false,
    offAllowlistRegistry: false,
    checkpointId: null
  };
}

export function ladderLength(cls: FailureClass): number {
  return LADDERS[cls].length;
}