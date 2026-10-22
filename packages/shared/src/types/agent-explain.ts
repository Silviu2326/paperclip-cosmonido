/** Sprint 3 WP12: "why did the agent do this" read model. Composed from existing tables; never written. */
export type AgentActionKind = "decision" | "tool_action" | "run" | "proposal" | "playbook_run" | "message" | "booking";

export interface AgentExplainTimelineEntry {
  at: string;
  kind: "context_read" | "tool_call" | "gate" | "autonomy" | "decision" | "result" | "run_event" | "note";
  title: string;
  detail: string | null;
  link: { type: "issue" | "run" | "decision" | "document" | "company_file" | "proposal" | "playbook_run"; id: string } | null;
}

export interface AgentActionExplanation {
  companyId: string;
  action: { kind: AgentActionKind; id: string; title: string; at: string | null };
  agent: { id: string; name: string } | null;
  run: { id: string; issueId: string | null; status: string; startedAt: string | null; finishedAt: string | null } | null;
  contextUsed: Array<{ fileId: string; name: string; contextRole: string | null; readAt: string }>;
  toolsCalled: Array<{ name: string; at: string; status: string | null; source: "run_log" | "tool_action" }>;
  gate: { applied: boolean; actionType: string | null; levelAtTheTime: string | null; policyId: string | null } | null;
  humanDecision: { decisionId: string; status: string; chosenOptionId: string | null; decidedByUserId: string | null; decidedAt: string | null } | null;
  result: { kind: string; id: string; summary: string } | null;
  timeline: AgentExplainTimelineEntry[];
  /** Sections the explainer could not fill because the source does not exist yet (e.g. Sprint 2 tables). */
  missing: string[];
}
