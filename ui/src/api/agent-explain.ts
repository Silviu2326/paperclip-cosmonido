import type { AgentActionExplanation, AgentActionKind } from "@paperclipai/shared";
import { api } from "./client";

export const agentExplainApi = {
  explain: (companyId: string, kind: AgentActionKind, actionId: string) =>
    api.get<AgentActionExplanation>(
      `/companies/${companyId}/agent-actions/${actionId}/explain?kind=${encodeURIComponent(kind)}`,
    ),
};
