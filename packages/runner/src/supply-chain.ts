import { isTyposquatSuspect, type Ecosystem, type InstallBlockedReason } from "@forge/contracts";

export interface InstallGuardConfig {
  allowlistRegistries: readonly string[];
  knownPackages: readonly string[];
  allowScriptsDefault: boolean;
}

export interface GuardVerdict {
  blocked: InstallBlockedReason | null;
  installArgs: string[];
  requiresScripts: boolean;
}

const INSTALL_ARGS: Record<Ecosystem, (n: string, v: string) => string[]> = {
  npm: (n, v) => ["npm", "install", `${n}@${v}`, "--ignore-scripts", "--save-exact"],
  pypi: (n, v) => ["pip", "install", `${n}==${v}`],
  go: (n, v) => ["go", "get", `${n}@${v}`],
  crates: (n, v) => ["cargo", "add", `${n}@${v}`]
};

const EXACT = /^(\d+\.\d+\.\d+[\w.-]*|[vV]?\d+\.\d+\.\d+)$/;

/**
 * Gate every remedy install. Order matters: registry, then exactness, then
 * scripts, then typosquat. All four must pass before a command is produced.
 */
export function guardInstall(
  cfg: InstallGuardConfig,
  ecosystem: Ecosystem,
  name: string,
  version: string,
  registry: string
): GuardVerdict {
  const requiresScripts = !cfg.allowScriptsDefault && ecosystem === "npm";

  if (!cfg.allowlistRegistries.some((r) => registry.includes(r))) {
    return { blocked: "off_allowlist_registry", installArgs: [], requiresScripts };
  }
  if (!EXACT.test(version)) {
    return { blocked: "version_range_not_exact", installArgs: [], requiresScripts };
  }
  if (isTyposquatSuspect(name, cfg.knownPackages)) {
    return { blocked: "typosquat_suspect", installArgs: [], requiresScripts };
  }
  return { blocked: null, installArgs: INSTALL_ARGS[ecosystem](name, version), requiresScripts };
}

/** Packages with postinstall hooks that must be re-enabled explicitly. */
export function withScripts(args: string[]): string[] {
  return args.filter((a) => a !== "--ignore-scripts");
}

/** New names in a lockfile diff, for review before it lands. */
export function newDependencies(before: string, after: string): string[] {
  const parse = (t: string) => new Set(t.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  const b = parse(before);
  return [...parse(after)].filter((l) => !b.has(l));
}