# Venice Forge — prioritized remediation plan

**Scope:** Based on the read-only project audit. This document proposes changes; it does not apply them. Patch excerpts are targeted to the current source layout and should be implemented with tests in a dedicated branch.

## Executive order of work

1. **P0 — Close tenant authorization gaps** across HTTP routes and WebSockets. Treat every project/session/run ID as untrusted, even after bearer-token validation.
2. **P0 — Stop unauthenticated identity assertion.** Disable the current OAuth endpoint until it verifies provider-issued credentials. Remove client-selected subscription plans from registration.
3. **P0 — Remove unauthenticated localhost proxying.** Require ownership and only proxy a port actually exposed by that owner’s live sandbox.
4. **P1 — Make API writes symlink-safe.** Use the runner’s safe atomic patch helper rather than direct host-side `writeFileSync`.
5. **P1 — Harden Electron IPC and shell operations.** Authenticate the IPC sender, scope filesystem/terminal operations to the selected workspace, and remove shell interpolation.
6. **P1 — Make test/build/lint reproducible and add regression coverage.** Repair package-manager/tooling access before considering this remediated.
7. **P2 — Correct unfinished or misleading functionality** (replace mock/placeholder functions with real implementations: AI completion, subagents, file watching, local sandbox boundaries, disk limits, and API session flows).

A fourth high-priority issue was found during plan preparation: `/auth/register` accepts a caller-chosen `plan`, which can mint a `pro` or `max` token. It is included below even though the top-three patch set focuses on tenant access, OAuth identity, and the preview proxy.

---

## P0.1 — Enforce project/session/run ownership everywhere

**Evidence:** `apps/api/src/server.ts:115–440, 443–469`; `apps/api/src/repos/projects.ts:46–49`; `apps/api/src/repos/runs.ts:106–129`. The existing `guard()` checks token validity and rate limit, but route handlers generally do not compare the token’s `userId` with the resource owner. Session IDs are also not checked against the path’s project ID.

### Patch A: add owner-scoped repository methods

In `apps/api/src/repos/projects.ts`, add a query that never loads a project outside the requesting user’s scope:

```ts
async getOwned(id: string, userId: string): Promise<ProjectRecord | null> {
  const row = getDb()
    .prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .get(id, userId) as Row | undefined;
  return row ? toRecord(row) : null;
}
```

In `apps/api/src/repos/runs.ts`, add an owner-scoped run lookup:

```ts
async getOwned(id: string, userId: string): Promise<AgentRun | null> {
  const row = getDb()
    .prepare(`
      SELECT r.* FROM agent_runs r
      JOIN projects p ON p.id = r.project_id
      WHERE r.id = ? AND p.user_id = ?
    `)
    .get(id, userId) as AgentRunRow | undefined;
  return row ? toRun(row) : null;
}
```

### Patch B: use owner-scoped lookups and bind each session to the path project

Add a helper in `apps/api/src/server.ts`:

```ts
function sessionForProject(projectId: string, sessionId: string): Live | null {
  const entry = live.get(sessionId);
  return entry?.manager.session.projectId === projectId ? entry : null;
}
```

Then, in **every** `/projects/:id/...` handler, after `guard()` and parameter parsing, establish ownership before returning data or acting on `live`, `credits`, Git, filesystem, checkpoint, command, or run state:

```ts
const project = await projectRepo.getOwned(id, p.userId);
if (!project) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
```

For command execution, require the session to belong to the same project as well as the user:

```ts
const entry = sessionForProject(id, body.sessionId);
if (!entry) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
```

Apply the same ownership checks to session creation, credits, history, file read/write/list/tree, Git status/commit/remote/push, ports, checkpoints/restore, and agent runs. For history, confirm that the requested session is live and belongs to the owned project before calling `commandRepo.history`; ideally also scope the SQL query by `project_id`.

Change `GET /runs/:id` to call `runRepo.getOwned(id, p.userId)` rather than `runRepo.get(id)`. Do not rely on random IDs as authorization.

For WebSockets, resolve the live session and verify its project owner before subscribing or accepting input:

```ts
const entry = live.get(sessionId);
if (!entry) { socket.close(4404, "not found"); return; }
const project = await projectRepo.getOwned(entry.manager.session.projectId, payload.userId);
if (!project) { socket.close(4403, "forbidden"); return; }
```

If the WebSocket framework callback cannot await directly in the chosen version, use an async IIFE and ensure the socket is not subscribed until the lookup succeeds.

### Acceptance tests

- User A cannot create a session for User B’s project.
- User A cannot read or write User B’s files, history, Git state, credits, checkpoint, or run.
- A valid session ID from project A cannot be combined with project B’s path ID to execute commands.
- User A’s WebSocket cannot receive events from or write terminal input to User B’s session.
- Negative cases return a consistent 404 (to avoid resource enumeration) or 403 by documented policy.

---

## P0.2 — Replace raw OAuth identity assertions; remove plan self-assignment

**Evidence:** `apps/api/src/server.ts:80–104`; `apps/api/src/auth.ts:69–87`. The current `/auth/oauth` accepts a raw provider name and provider ID and signs a token without validating a provider-issued credential. Separately, `/auth/register` accepts `plan` from the caller and uses it when signing the new token.

### Immediate safe patch: disable unverified OAuth; make registration plan server-controlled

Until a real provider verifier is integrated, fail closed on the current OAuth route:

```ts
app.post("/auth/oauth", async (_req, reply) => {
  return reply.code(501).send({
    code: "E_NOT_IMPLEMENTED",
    message: "OAuth sign-in is unavailable until provider token verification is configured"
  });
});
```

Remove `plan` from the public registration schema and always assign the least-privileged default:

```ts
const body = z.object({
  userId: z.string().min(3).max(64),
  password: z.string().min(8).max(256)
}).strict().parse(req.body);

if (!register(body.userId, body.password, "free")) {
  return reply.code(409).send({ code: ErrorCode.E_CONFLICT, message: "user already exists" });
}
const auth = authenticate(body.userId, body.password);
```

Subscription changes must be performed by a trusted billing/admin workflow, not by this endpoint. Add `.strict()` to authentication schemas so unexpected privilege fields are rejected rather than silently ignored.

### Re-enable OAuth only after token verification exists

Replace the raw `providerId` with a provider-issued `idToken` or authorization code. Verify signature and key rotation, issuer, audience/client ID, expiry, nonce/state, and subject using a maintained OIDC library and an explicit provider allowlist. Only use the verified `sub` as the external identity. Test invalid signature, wrong audience, expired token, wrong issuer, replayed state/nonce, and an unknown provider. Never make a caller-supplied subject sufficient to authenticate.

### Additional auth hardening

- Rate-limit registration and login/OAuth by IP and account identifier, with bounded concurrent password-hash work.
- Add a password-login endpoint if local credentials are intended to be supported; test that existing users can obtain a new session without re-registering.
- Ensure account plan is loaded from trusted server state, not trusted from a signed token whose plan may become stale after subscription changes; consider reloading entitlements for privileged actions.

---

## P0.3 — Secure the preview proxy and eliminate arbitrary loopback access

**Evidence:** `apps/api/src/server.ts:363–375, 482–484`; `apps/api/src/routes/preview.ts:24–64`. The current preview route has no bearer guard and accepts any port in the URL. The proxy forwards arbitrary GET requests to `127.0.0.1`.

### Patch

Use the same auth/owner checks as other project routes. Do not hijack the response until authorization and port validation pass:

```ts
app.get("/projects/:id/preview/:port/*", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) {
    return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  }

  const { id, port: portText } = z.object({
    id: z.string(),
    port: z.string().regex(/^\d{1,5}$/)
  }).parse(req.params);
  const project = await projectRepo.getOwned(id, p.userId);
  if (!project) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });

  const port = Number(portText);
  const entry = entryForProject(id);
  if (!entry || !portsFromSs(portMap, id).includes(port)) {
    return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  }

  const star = (req.params as Record<string, string>)["*"] ?? "";
  reply.hijack();
  proxy(port, `/${star}`, `/api/projects/${id}/preview/${port}/`, reply.raw);
});
```

This is a minimum containment patch, not a complete sandbox transport design. Prefer proxying through the project’s sandbox/runtime handle rather than host loopback. Preserve the sandbox boundary; do not add a broad host port mapping as a workaround. Add request timeouts, response-size limits, hop-by-hop header filtering, and safe `Location` rewriting in the proxy.

### Acceptance tests

- Unauthenticated preview request is rejected.
- User A cannot proxy User B’s project.
- Unregistered ports and malformed/out-of-range ports are rejected.
- Only the explicitly registered port for an owned live session is proxied.
- Requests cannot reach arbitrary local services or leak loopback response headers.

---

## P1.1 — Fix symlink escape on API file writes

**Evidence:** `apps/api/src/server.ts:297–308`; `packages/runner/src/patch.ts:39–73, 83–140`. The API write route uses lexical validation, then writes directly through host filesystem path resolution. The runner already exports `applyEdits`, which resolves paths, rejects symlink targets/out-of-root parents, validates all edits, and stages replacements atomically.

Use the existing helper instead of direct `mkdirSync` / `writeFileSync`:

```ts
import { applyEdits, /* existing imports */ } from "@forge/runner";

// inside PUT /projects/:id/file, after ownership + session checks:
const result = applyEdits(entry.sandbox.root, [{ path: body.path, content: body.content }]);
if (result.errors.length) {
  return reply.code(400).send({ code: ErrorCode.E_BAD_REQUEST });
}
return { ok: true };
```

Remove the direct `mkdirSync(dirname(target), { recursive: true })` and `writeFileSync(target, ...)` path. Keep error details out of public responses unless sanitized. Add a test where a parent symlink and a leaf symlink target a file outside the sandbox. Review residual time-of-check/time-of-use races if sandbox commands can concurrently mutate these paths; a stronger design uses a dedicated filesystem boundary or handle-relative operations.

---

## P1.2 — Harden Electron IPC, filesystem scope, and terminal boundaries

**Evidence:** `apps/desktop/src/ipc.ts:20–63, 108–133`; `apps/desktop/src/file-tools.ts:23–33, 109–125`; `apps/desktop/src/main.ts:28–35`; `apps/desktop/src/terminal.ts:12–25`.

### IPC sender validation

Pass the main window’s expected `webContents` and allowed origin into IPC registration. For each privileged handler, reject callers other than the trusted top-level app frame. Validate file paths, terminal IDs, and argument types/lengths centrally. Restrict development origins to loopback and only when explicitly in development mode; do not trust an arbitrary `VITE_DEV_SERVER_URL` in production.

### Scope file and terminal operations

Track the folder selected by the native open dialog as the current workspace. Require reads/writes/renames/removals and terminal `cwd` to be contained under that workspace. Require a fresh explicit confirmation for recursive deletion or writes outside the workspace. Do not silently swallow write/delete failures; return structured errors to the renderer.

### Remove shell interpolation

Replace `execSync` in `shell:which` with an argument-vector call:

```ts
ipc.handle("shell:which", async (_e, bin: string) => {
  if (!/^[A-Za-z0-9._+-]{1,128}$/.test(bin)) return null;
  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    return execFileSync(cmd, [bin], { encoding: "utf8", timeout: 5_000 }).trim().split(/\r?\n/)[0] ?? null;
  } catch {
    return null;
  }
});
```

`execFileSync` already avoids shell parsing in `shell:exec`, but that handler still needs workspace validation, executable/argument limits, a timeout, bounded output, and an explicit user action when a command is initiated from model-generated content.

### Electron defaults and CSP

Set `sandbox: true` on the main renderer after verifying preload compatibility. Add a restrictive CSP to `apps/desktop/src/renderer/index.html` (script from self; object/frame ancestors denied; only required Venice origin allowed for frames/webviews; avoid broad `unsafe-eval`). Keep `contextIsolation: true` and `nodeIntegration: false`. Validate the exact webview navigation origin and disable unneeded popup permissions.

---

## P1.3 — Tests, tooling, and release gating

**Current limitation:** Project scripts depend on `pnpm`, which is not available in the inspected terminal. Direct installed Vitest, ESLint, and TypeScript launchers failed with `EPERM` while opening pnpm-store files. No tests completed successfully; this is not a passing result.

- Choose one package manager and pin its version (`packageManager` field plus CI setup). Remove or intentionally document competing root lockfiles.
- Ensure a clean CI install runs `build`, `typecheck`, `lint`, and `test`; capture exit codes and artifacts.
- Add a `test` script to `packages/runner`, since it contains tests but currently defines only build/typecheck/lint.
- Add API tests for auth/ownership/preview/write paths and Electron tests for IPC/shell/path handling. Add desktop tests for AI and subagent behavior.
- Run the full test suite against a clean install in CI, not against leftover `dist` files or reinstall-backup directories.
- Resolve the local `EPERM` issue at its source; do not weaken project permissions or skip checks as a workaround.

Suggested runner script:

```json
"test": "vitest run"
```

Suggested root verification gate remains the existing scripts, but must run successfully under the documented package manager before merging.

---

## P2 — Remaining audited gaps

### P2.0 — Replace mock / placeholder functions with real implementations

Several features currently exist only as stubs, no-ops, or canned heuristics that present as real functionality. Replace them with working implementations (or clearly disable and label them as not implemented) before treating the surfaces as complete.

**Identified mocks / placeholders (from audit):**

- `apps/desktop/src/file-tools.ts` — `watch()` is a pure no-op that returns the path and performs no filesystem watching. Replace with a real watcher (e.g. `fs.watch` / chokidar-style) scoped to the current workspace, or remove the IPC surface until implemented.
- `apps/desktop/src/subagents.ts` — `steer()` is an empty stub (`/* ... */`); `spawn()` only stores a record and starts no worker; callback registration is incomplete. Implement a real worker lifecycle (or disable the UI controls).
- `apps/desktop/src/completion-processor.ts` — `processCompletion()` ignores the selected model and returns keyword-matched canned snippets (greet / calculator / sum). Either wire to a real model path with provenance, or stop presenting the output as model-generated.
- Agent loop `readModelAnswer` (in `apps/api/src/agent.ts` / server route) always returns `null` by design for web-app handoff. Keep the handoff explicit; do not leave silent fallbacks that look like model results.

**Requirements for real implementations:**

- Subagents: actual process or task worker, model/tool allowlists, cancellation, bounded output, permission gates, and structured status events. Test spawn / steer / stop / error paths.
- File watch: emit change events only for paths under the selected workspace; handle errors and cleanup.
- Completion: if real inference is added, route by selected model, surface provenance, and fail visibly instead of falling back to canned text. Otherwise remove or clearly mark the feature as prototype.
- Preserve the existing Venice.ai web-app deep-link handoff as the primary model path; do not introduce unauthenticated or mock model calls.

Add regression tests that fail if the previous stub behavior returns.

### P2.1 — Completion is a canned local heuristic, not model inference

`apps/desktop/src/completion-processor.ts:89–107, 136–169` ignores the selected model and returns keyword-based canned text, while `screens-dev.js:575–580` presents it as a completion. Either wire it to a real approved provider/model integration with visible model provenance, or mark it as a prototype, remove claims that text was generated by a model, and keep the Venice web-app handoff explicit. Add tests proving selected-model routing and that failure does not silently become a misleading canned completion.

### P2.2 — Subagents are currently placeholders

`apps/desktop/src/subagents.ts:22–36` stores a record but starts no worker; `steer` and callback registration are stubs. Either implement an actual worker lifecycle with model/tool allowlists, cancellation, bounded output, and permission gates, or disable the controls and label the feature as not implemented. Test spawn/result/stop/error states.

### P2.3 — Local sandbox is not a security sandbox

`LocalSandbox` runs child processes on the host, and `resolveCwd` only remaps exactly `/app`; other cwd values are accepted (`packages/runner/src/sandbox.ts:180–220`). Do not use this runtime for untrusted or multi-tenant workloads. Enforce Docker isolation in production, fail startup if an unsafe runtime is selected in production, and reject cwd values that resolve outside the sandbox root. Review environment inheritance: the current secret denylist does not cover all cloud/model credentials, so prefer a minimal allowlist over a growing blocklist.

### P2.4 — Sandbox resource controls are incomplete

`diskMb` is declared but unused (`sandbox.ts:9–13, 223–243`). Implement a real disk quota/ephemeral volume limit and validate CPU/memory/disk settings as finite positive bounded numbers before starting a container. Add tests for invalid configuration and actual exhaustion behavior.

### P2.5 — Credit charging can race

Command routes check and charge separately before/around async command execution (`apps/api/src/server.ts:188–200`; `apps/api/src/credits.ts:42–58`). Concurrent requests can both pass the check before either charge is observed. Use a single SQLite transaction/conditional update to reserve credits atomically; refund on pre-execution failure if policy requires it. Add concurrency tests.

### P2.6 — API login/session lifecycle needs completion

The visible API supports registration and token revocation, but there is no password-login route in the audited server source. Decide whether local credentials are supported. If so, add a rate-limited login route that uses the stored password hash and issues a new session; test login, wrong password, expiry, and revocation. Do not expose password hashes or distinguish unknown-user vs wrong-password errors.

### P2.7 — Persisted command output and agent/run data need a privacy policy

`commandRepo.save` stores stdout/stderr in SQLite up to 100 KB each (`apps/api/src/repos/commands.ts:46–63`), and the DB has no visible retention/cleanup policy. Command output can contain tokens, paths, or personal data. Define retention, redact known secret formats before persistence, restrict read access through the ownership fixes, and provide a deletion policy. Avoid logging request bodies, credentials, cookie values, or raw model prompts.

### P2.8 — Preview design likely conflicts with the Docker network boundary

Docker sandboxes are started with `--network none` (`packages/runner/src/sandbox.ts:106–123`), but preview currently proxies from the host to loopback (`routes/preview.ts:34–44`). Validate the intended preview data path; implement a narrowly scoped transport without giving the sandbox general egress or exposing arbitrary host services. Add an end-to-end test for a sandbox-hosted web server.

### P2.9 — Authentication and configuration polish

- Validate `AUTH_SECRET` strength and rotation procedures in deployment configuration; keep the existing production missing-secret guard.
- Bound and validate `RATE_LIMIT_PER_MINUTE`, `REMEDY_MAX_ATTEMPTS`, timeouts, ports, and sandbox configuration at startup; reject NaN/negative values.
- Add payload-size and command/output limits to Fastify routes and WebSocket messages.
- Ensure errors returned from OAuth/database/proxy operations do not expose internal details (`server.ts:99–104`, preview proxy error handling).
- Confirm the production deployment uses TLS and does not expose the API directly without an ingress/firewall policy.

---

## Completion criteria

Do not call this remediation complete until all of the following hold:

1. Cross-tenant HTTP and WebSocket regression tests pass for every resource class.
2. Raw OAuth subject claims cannot mint tokens; paid plans cannot be selected through public registration.
3. Preview requires ownership and cannot reach unregistered localhost services.
4. Symlink escape tests pass for both API writes and runner patch operations.
5. Electron IPC rejects untrusted frames and prevents out-of-workspace filesystem/terminal actions.
6. `pnpm`/the selected package manager can run build, typecheck, lint, and every test on a clean checkout in CI.
7. AI completion, subagents, file watching, and other previously stubbed surfaces either have real implementations with tests or are explicitly disabled and labeled as not implemented.
8. Security review confirms production sandbox, secret-handling, and retention settings.
