# GOAL — VeniceForge Remediation Complete

**Definition of Done**

All remediation items from `outputs/project-remediation-plan.md` are completed and verified.

**Verified by:**

1. Checklist in this GOAL.md fully checked.
2. `typecheck` + `lint` + `tests` exit 0.
3. Independent reviewer confirms no high/critical issues remain.

Do not weaken, skip, or delete tests. Do not declare done without the exact command outputs.

## Checklist

- [ ] P0.1 — Tenant ownership enforced on all HTTP routes and WebSockets
- [ ] P0.2 — Raw OAuth disabled; registration plan server-controlled
- [ ] P0.3 — Preview proxy requires ownership and only registered ports
- [ ] P1.1 — API file writes use symlink-safe applyEdits
- [ ] P1.2 — Electron IPC hardened (sender auth, workspace scope, no shell interp)
- [ ] P1.3 — Tests/build/lint reproducible; package manager pinned
- [ ] P2.0 — Mock/placeholder functions replaced with real implementations
- [ ] P2.1 — Completion processor is real or clearly marked prototype
- [ ] P2.2 — Subagents have real worker lifecycle or are disabled
- [ ] P2.3 — Local sandbox not used for multi-tenant; Docker enforced in prod
- [ ] P2.4 — Sandbox resource controls implemented (disk quota etc.)
- [ ] P2.5 — Credit charging is atomic
- [ ] P2.6 — Password login route exists (if local creds supported)
- [ ] P2.7 — Command output retention/privacy policy defined
- [ ] P2.8 — Preview design respects sandbox network boundary
- [ ] P2.9 — Auth/config polish (secret strength, bounds, error sanitization)
- [ ] typecheck exits 0
- [ ] lint exits 0
- [ ] tests exit 0
- [ ] Independent review: no high/critical issues remaining
