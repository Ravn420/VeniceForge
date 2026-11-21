import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { z } from "zod";
import { ErrorCode, makeId, type Actor, type FailureSignature } from "@forge/contracts";
import { buildSignature, classify } from "@forge/classifier";
import {
  BoundsTracker, CheckpointStore, RecipeStore, SessionManager, apply, createSandbox,
  decide, diffSince, execute, isSafePath, spawnPty, type RemedyDeps
} from "@forge/runner";
import { fromHeader, maxSandboxes, register, authenticate, revoke, sign } from "./auth.js";
import { CreditMeter } from "./credits.js";
import { IdleReaper, idleMs, type LiveEntry } from "./idle.js";
import { RateLimiter } from "./ratelimit.js";
import { Broadcaster } from "./ws.js";
import { projectRepo } from "./repos/projects.js";
import { runRepo } from "./repos/runs.js";
import { commandRepo } from "./repos/commands.js";
import { escalate } from "./escalate.js";
import { runAgent, chatLink } from "./agent.js";
import { closeDb } from "./db/client.js";
import { gitRoutes } from "./routes/git.js";
import { list as listFs, tree as treeFs } from "./routes/fs.js";
import { createPortMap, portsFromSs, proxy, registerPort } from "./routes/preview.js";
import { runAgentRouteBody } from "./routes/agent-body.js";
import { isRetrySentinel, lastFailed } from "./routes/retry.js";

const app = Fastify({ logger: false });
await app.register(websocket);

const credits = new CreditMeter();
const bus = new Broadcaster();
const limiter = new RateLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE ?? 240));
const rateSweep = setInterval(() => limiter.sweep(), 60_000);
rateSweep.unref();

const bounds = new BoundsTracker({
  maxAttemptsPerSignature: Number(process.env.REMEDY_MAX_ATTEMPTS ?? 3),
  diagnosisAfter: Number(process.env.REMEDY_DIAGNOSIS_AFTER ?? 2),
  allowRepeatConsecutive: false
});

const recipes = new RecipeStore();
const envFingerprint = `${process.platform}-${process.arch}`;
const portMap = createPortMap();

interface Live extends LiveEntry {
  checkpoints: CheckpointStore;
}
const live = new Map<string, Live>();

const reaper = new IdleReaper(live, idleMs(), (id) => {
  bus.emit(id, { type: "session.state", isHumanTyping: false, humanFocusedTab: 0, modelTab: 0 });
});

const COST_PER_COMMAND = 1;

function actorOf(header: string | undefined): Actor {
  const p = fromHeader(header);
  return p ? { kind: "human", userId: p.userId } : { kind: "system" };
}

function entryForProject(projectId: string): Live | null {
  for (const l of live.values()) if (l.manager.session.projectId === projectId) return l;
  return null;
}

function sessionForProject(projectId: string, sessionId: string): Live | null {
  const entry = live.get(sessionId);
  return entry?.manager.session.projectId === projectId ? entry : null;
}

function guard(header: string | undefined) {
  const p = fromHeader(header);
  if (!p) return { p: null, error: { code: ErrorCode.E_UNAUTHORIZED } };
  const limited = limiter.take(p.userId);
  if (limited) return { p: null, error: limited };
  return { p, error: null };
}

app.get("/health", async () => ({ ok: true }));

// ── Real auth: register + login. No anonymous token minting. ──
app.post("/auth/register", async (req, reply) => {
  const body = z.object({
    userId: z.string().min(3).max(64),
    password: z.string().min(8).max(256)
  }).strict().parse(req.body);
  if (!register(body.userId, body.password, "free")) {
    return reply.code(409).send({ code: ErrorCode.E_CONFLICT, message: "user already exists" });
  }
  const auth = authenticate(body.userId, body.password);
  if (!auth) return reply.code(500).send({ code: ErrorCode.E_INTERNAL });
  return { token: sign(auth) };
});

app.post("/auth/oauth", async (_req, reply) => {
  return reply.code(501).send({
    code: "E_NOT_IMPLEMENTED",
    message: "OAuth sign-in is unavailable until provider token verification is configured"
  });
});


app.post("/auth/revoke", async (req, reply) => {
  const p = fromHeader(req.headers.authorization);
  if (!p) return reply.code(401).send({ code: ErrorCode.E_UNAUTHORIZED });
  revoke(p.sid);
  return { ok: true };
});

app.post("/projects", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const body = z.object({ name: z.string().min(1).max(80), repoUrl: z.string().url().nullable().default(null) }).parse(req.body);
  return projectRepo.create(p.userId, body.name, body.repoUrl);
});

app.get("/projects", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  return projectRepo.list(p.userId);
});

app.get("/projects/:id/credits", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  return credits.remaining(id);
});

app.post("/projects/:id/sessions", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const project = await projectRepo.getOwned(id, p.userId);
  if (!project) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });

  if ([...live.values()].filter((l) => l.manager.session.projectId === id).length >= maxSandboxes(p.plan)) {
    return reply.code(429).send({ code: ErrorCode.E_QUOTA_EXCEEDED });
  }

  const sandbox = createSandbox(id);
  gitRoutes.init(sandbox.root);
  const manager = new SessionManager(makeId("ses"), id);
  const checkpoints = new CheckpointStore(sandbox);
  const pty = spawnPty(sandbox, "/app");
  manager.attachPty(0, { write: (d) => pty.write(d), resize: (c, r) => pty.resize(c, r), kill: () => pty.kill() });
  pty.onData((d) => bus.emit(manager.session.id, { type: "command.output", commandId: "", stream: "pty", chunk: d }));
  manager.on("state", (state) => bus.emit(manager.session.id, { type: "session.state", ...state }));
  live.set(manager.session.id, { sandbox, manager, checkpoints, lastActivity: Date.now() });
  return manager.session;
});

app.get("/projects/:id/history/:sessionId", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id, sessionId } = z.object({ id: z.string(), sessionId: z.string() }).parse(req.params);
  const project = await projectRepo.getOwned(id, p.userId);
  if (!project) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  if (!sessionForProject(id, sessionId)) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  return commandRepo.history(sessionId);
});

app.post("/projects/:id/command", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const project = await projectRepo.getOwned(id, p.userId);
  if (!project) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  const body = z.object({
    sessionId: z.string(),
    argv: z.array(z.string()).min(1),
    cwd: z.string().default("/app"),
    autonomy: z.number().int().min(0).max(3).default(1)
  }).parse(req.body);
  const entry = sessionForProject(id, body.sessionId);
  if (!entry) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  reaper.touch(body.sessionId);

  let argv = body.argv;
  let cwd = body.cwd;
  if (isRetrySentinel(argv)) {
    const previous = lastFailed(await commandRepo.history(body.sessionId));
    if (!previous) return reply.code(409).send({ code: ErrorCode.E_CONFLICT, message: "nothing to retry" });
    argv = previous.argv;
    cwd = previous.cwd;
  }

  const over = credits.check(id, COST_PER_COMMAND);
  if (over) return reply.code(402).send(over);
  credits.charge(id, COST_PER_COMMAND);

  const { record } = await execute(argv, {
    sessionId: body.sessionId,
    projectId: id,
    actor: actorOf(req.headers.authorization),
    cwd,
    sandbox: entry.sandbox,
    onChunk: (stream, chunk) => bus.emit(body.sessionId, { type: "command.output", commandId: "", stream, chunk })
  });
  await commandRepo.save(record);
  for (const port of record.portsOpened) registerPort(portMap, id, port);
  bus.emit(body.sessionId, { type: "command.ended", command: record });
  if (record.status !== "failed" && record.status !== "timed_out") return { record, signature: null, decision: null };

  const rawDetection = classify({
    argv: record.argv, stdout: record.stdout, stderr: record.stderr,
    exitCode: record.exitCode, signal: record.signal, cwd: record.cwd
  });
  const escalation = await escalate(rawDetection, record.stderr, record.stdout, record.exitCode);
  const detection = escalation.detection;
  if (!detection) return { record, signature: null, decision: null };

  const signature: FailureSignature = buildSignature(
    { argv: record.argv, stdout: record.stdout, stderr: record.stderr, exitCode: record.exitCode, signal: record.signal, cwd: record.cwd },
    detection,
    { projectId: id, commandId: record.id, platform: envFingerprint, now: Date.now(), makeSigId: () => makeId("sig") }
  );
  bus.emit(body.sessionId, { type: "failure.classified", signature });
  if (escalation.needsHuman) {
    bus.emit(body.sessionId, {
      type: "diagnosis.written",
      diagnosis: {
        id: makeId("dia"),
        signatureId: signature.id,
        summary: "Low-confidence classification — handed to the Venice.ai web app for judgement.",
        evidence: [{ commandId: record.id, quote: detection.evidence }],
        hypotheses: [],
        ruledOut: [],
        recommendation: "Open the Venice.ai chat link with this failure output for a model-assisted diagnosis.",
        needsHuman: true,
        createdAt: Date.now()
      }
    });
  }

  const deps: RemedyDeps = {
    bounds,
    recipes,
    autonomy: body.autonomy,
    envFingerprint,
    checkpoint: async (label) => entry.checkpoints.create("before_remedy", label, record.id)?.id ?? null,
    runStep: async (stepArgv) => {
      const before = entry.sandbox.snapshot();
      const r = await execute(stepArgv, {
        sessionId: body.sessionId, projectId: id, actor: { kind: "system" },
        cwd: record.cwd, sandbox: entry.sandbox
      });
      await commandRepo.save(r.record);
      const delta = diffSince(entry.sandbox.root, before);
      return { ok: r.record.status === "succeeded", commandId: r.record.id, diff: delta || null };
    }
  };

  const decision = await decide(signature, { argv: record.argv, stderr: record.stderr, knownPackages: [], makeAttemptId: () => makeId("att") }, deps);

  if (decision.kind === "diagnose") {
    bus.emit(body.sessionId, { type: "diagnosis.written", diagnosis: decision.diagnosis });
    return { record, signature, decision };
  }
  bus.emit(body.sessionId, { type: "remedy.planned", plan: decision.plan });
  if (decision.kind === "run") {
    const attempt = await apply(signature, decision.plan, deps);
    bus.emit(body.sessionId, { type: "remedy.updated", attempt });
  }
  return { record, signature, decision };
});

app.get("/projects/:id/files", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const q = z.object({ path: z.string().default("") }).parse(req.query);
  const entry = entryForProject(id);
  return entry ? listFs(entry.sandbox.root, q.path) : [];
});

app.get("/projects/:id/file", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const q = z.object({ path: z.string() }).parse(req.query);
  if (!isSafePath(q.path)) return reply.code(400).send({ code: ErrorCode.E_BAD_REQUEST });
  const entry = entryForProject(id);
  if (!entry) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  // Resolve inside the sandbox root and stream the file — never `exec cat`, which
  // trusts shell-side path resolution and can read outside the project.
  const target = join(entry.sandbox.root, q.path);
  const realRoot = realpathSync(entry.sandbox.root);
  const realTarget = realpathSync(target);
  const rel = relative(realRoot, realTarget);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return reply.code(400).send({ code: ErrorCode.E_BAD_REQUEST });
  }
  return { path: q.path, content: readFileSync(realTarget, "utf8") };
});

app.put("/projects/:id/file", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const project = await projectRepo.getOwned(id, p.userId);
  if (!project) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  const body = z.object({ path: z.string(), content: z.string() }).parse(req.body);
  if (!isSafePath(body.path)) return reply.code(400).send({ code: ErrorCode.E_BAD_REQUEST });
  const entry = entryForProject(id);
  if (!entry) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  const { applyEdits } = await import("@forge/runner");
  const result = applyEdits(entry.sandbox.root, [{ path: body.path, content: body.content }]);
  if (result.errors.length) {
    return reply.code(400).send({ code: ErrorCode.E_BAD_REQUEST });
  }
  return { ok: true };
});

app.get("/projects/:id/tree", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const entry = entryForProject(id);
  return { tree: entry ? treeFs(entry.sandbox.root) : "" };
});

app.get("/projects/:id/git", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const entry = entryForProject(id);
  if (!entry) return { branch: "", dirty: [], ahead: 0, diff: "", remotes: [] };
  return {
    ...gitRoutes.status(entry.sandbox.root),
    diff: gitRoutes.diff(entry.sandbox.root),
    remotes: gitRoutes.remotes(entry.sandbox.root)
  };
});

app.post("/projects/:id/git/commit", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const body = z.object({ message: z.string().optional() }).parse(req.body ?? {});
  const entry = entryForProject(id);
  if (!entry) return { ok: false };
  return { ok: true, ...gitRoutes.commit(entry.sandbox.root, body.message) };
});

app.post("/projects/:id/git/remote", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const body = z.object({ name: z.string().min(1), url: z.string().url() }).parse(req.body);
  const entry = entryForProject(id);
  if (!entry) return { ok: false };
  gitRoutes.addRemote(entry.sandbox.root, body.name, body.url);
  return { ok: true };
});

app.post("/projects/:id/git/push", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const body = z.object({ remote: z.string().min(1).default("origin"), ref: z.string().min(1).default("HEAD") }).parse(req.body ?? {});
  const entry = entryForProject(id);
  if (!entry) return { ok: false };
  try { return { ok: true, out: gitRoutes.push(entry.sandbox.root, body.remote, body.ref) } } catch (e) { return { ok: false, out: (e as Error).message } };
});

app.get("/projects/:id/ports", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  return { ports: portsFromSs(portMap, id) };
});

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

app.post("/projects/:id/checkpoints", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const entry = entryForProject(id);
  return entry?.checkpoints.create("manual", "manual snapshot") ?? { ok: false };
});

app.post("/projects/:id/checkpoints/:cp/restore", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id, cp } = z.object({ id: z.string(), cp: z.string() }).parse(req.params);
  const entry = entryForProject(id);
  return entry ? entry.checkpoints.restore(cp) : { ok: false };
});

app.post("/projects/:id/agent", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const body = runAgentRouteBody.parse(req.body);
  const entry = entryForProject(id);
  if (!entry) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  const run = await runRepo.start(id, actorOf(req.headers.authorization), body.mode, body.autonomy, Number(process.env.CREDITS_PER_RUN_CAP ?? 500));
  credits.newRun(id);
  const result = await runAgent(body.task, {
    root: entry.sandbox.root,
    repoMap: () => treeFs(entry.sandbox.root),
    checkpoint: async (label) => entry.checkpoints.create("agent_step", label)?.id ?? null,
    budgetLeft: () => credits.remaining(id).run,
    onStep: async (label, cost) => {
      credits.charge(id, cost);
      await runRepo.addStep(run.id, {
        kind: "note", label, credits: cost, inputTokens: null, outputTokens: null,
        latencyMs: null, commandId: null, checkpointId: null, error: null
      });
    },
    runCommand: async (argv) => {
      const r = await execute(argv, {
        sessionId: body.sessionId ?? "", projectId: id,
        actor: { kind: "model", modelId: "agent", runId: run.id },
        cwd: "/app", sandbox: entry.sandbox
      });
      await commandRepo.save(r.record);
      return { ok: r.record.status === "succeeded", output: `${r.record.stdout}${r.record.stderr}` };
    },
    onRequestModel: (prompt) => {
      const link = chatLink(prompt);
      bus.emit(body.sessionId ?? "", { type: "agent.model_request", link, prompt: prompt.slice(0, 500) });
      return link;
    },
    readModelAnswer: () => null // human answers in the web app; loop pauses
  });
  await runRepo.finish(run.id, result.ok ? "succeeded" : "failed");
  return { run, result };
});

app.get("/runs/:id", async (req, reply) => {
  const { p, error } = guard(req.headers.authorization);
  if (!p) return reply.code(error?.code === ErrorCode.E_RATE_LIMITED ? 429 : 401).send(error);
  const { id } = z.object({ id: z.string() }).parse(req.params);
  const r = await runRepo.getOwned(id, p.userId);
  if (!r) return reply.code(404).send({ code: ErrorCode.E_NOT_FOUND });
  return { run: r, steps: await runRepo.replay(id) };
});

app.get("/ws/:sessionId", { websocket: true }, async (socket, req) => {
  const payload = fromHeader(req.headers.authorization);
  if (!payload) {
    socket.close(4401, "unauthorized");
    return;
  }
  const { sessionId } = z.object({ sessionId: z.string() }).parse(req.params);
  const entry = live.get(sessionId);
  if (!entry) {
    socket.close(4404, "not found");
    return;
  }
  const project = await projectRepo.getOwned(entry.manager.session.projectId, payload.userId);
  if (!project) {
    socket.close(4403, "forbidden");
    return;
  }
  const detach = bus.attach(sessionId, (event) => socket.send(JSON.stringify(event)));
  socket.on("close", detach);
  socket.on("message", (raw: Buffer) => {
    const parsed = z
      .union([
        z.object({ type: z.literal("input"), data: z.string() }),
        z.object({ type: z.literal("resize"), cols: z.number().int().positive(), rows: z.number().int().positive() })
      ])
      .safeParse(JSON.parse(raw.toString()));
    if (!parsed.success) return;
    const entry = live.get(sessionId);
    if (!entry) return;
    reaper.touch(sessionId);
    if (parsed.data.type === "resize") {
      entry.manager.resize(0, parsed.data.cols, parsed.data.rows);
      return;
    }
    entry.manager.noteHumanInput();
    entry.manager.write(0, parsed.data.data);
  });
});

app.addHook("onClose", async () => {
  reaper.stop();
  clearInterval(rateSweep);
  await closeDb();
  for (const l of live.values()) {
    l.manager.close();
    l.sandbox.destroy();
  }
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: "0.0.0.0" });
process.stdout.write(`forge api on ${port}\n`);
export { app };