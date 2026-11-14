import { z } from "zod";
import { AgentMode, type AgentMode as AgentModeType } from "@forge/contracts";

export const runAgentRouteBody = z.object({
  task: z.string().min(1),
  mode: AgentMode.default("agent"),
  autonomy: z.number().int().min(0).max(3).default(1),
  sessionId: z.string().optional()
});

export type RunAgentRouteBody = {
  task: string;
  mode: AgentModeType;
  autonomy: number;
  sessionId?: string;
};
