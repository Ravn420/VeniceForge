import { z } from "zod";
import { CommandRecord } from "./terminal.js";
import { FailureSignature } from "./failure.js";
import { Diagnosis, RemedyAttempt, RemedyPlan } from "./remedy.js";
import { Checkpoint } from "./checkpoint.js";
import { AgentStep } from "./agent.js";

const base = { seq: z.number().int().nonnegative(), at: z.number().int().nonnegative() };

export const Event = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("command.started"), command: CommandRecord }),
  z.object({ ...base, type: z.literal("command.output"), commandId: z.string(), stream: z.enum(["stdout", "stderr", "pty"]), chunk: z.string() }),
  z.object({ ...base, type: z.literal("command.ended"), command: CommandRecord }),
  z.object({ ...base, type: z.literal("failure.classified"), signature: FailureSignature }),
  z.object({ ...base, type: z.literal("remedy.planned"), plan: RemedyPlan }),
  z.object({ ...base, type: z.literal("remedy.updated"), attempt: RemedyAttempt }),
  z.object({ ...base, type: z.literal("diagnosis.written"), diagnosis: Diagnosis }),
  z.object({ ...base, type: z.literal("checkpoint.created"), checkpoint: Checkpoint }),
  z.object({ ...base, type: z.literal("agent.step"), step: AgentStep }),
  z.object({ ...base, type: z.literal("injection.suspected"), commandId: z.string(), quote: z.string(), source: z.string() }),
  z.object({ ...base, type: z.literal("session.state"), isHumanTyping: z.boolean(), humanFocusedTab: z.number().int(), modelTab: z.number().int() }),
  z.object({ ...base, type: z.literal("session.closed"), reason: z.enum(["idle", "manual", "error"]) })
]);
export type Event = z.infer<typeof Event>;

export const EVENT_TYPES = [
  "command.started", "command.output", "command.ended", "failure.classified",
  "remedy.planned", "remedy.updated", "diagnosis.written", "checkpoint.created",
  "agent.step", "injection.suspected", "session.state", "session.closed"
] as const;