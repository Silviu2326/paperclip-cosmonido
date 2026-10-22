import { PLAYBOOK_TOOL_NAMES, playbookToolDefinitions, callPlaybookTool } from "./playbook-tools.js";
import { PROPOSAL_TOOL_NAMES, proposalToolDefinitions, callProposalTool } from "./proposal-tools.js";
import { COMMERCIAL_DECISION_TOOL_NAMES, commercialDecisionToolDefinitions, callCommercialDecisionTool } from "./commercial-decision-tools.js";
import { HANDOFF_TOOL_NAMES, handoffToolDefinitions, callHandoffTool } from "./handoff-tools.js";
import { AGREEMENT_TOOL_NAMES, agreementToolDefinitions, callAgreementTool } from "./agreement-tools.js";
import { LEAD_TOOL_NAMES, leadToolDefinitions, callLeadTool } from "./lead-tools.js";
import { COMMITMENT_TOOL_NAMES, commitmentToolDefinitions, callCommitmentTool } from "./commitment-tools.js";
import { CAPABILITY_SEMANTIC_TOOL_CATALOG } from "../vendor/paperclip-runner/index.js";

/** Common call shape every Sprint 3 tool wrapper accepts (each wrapper ignores the fields it does not need). */
export interface Sprint3ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  companyId: string;
  issueId: string;
  agentId: string;
  conversation?: boolean;
}
type Sprint3Dispatcher = (input: Sprint3ToolCall) => Promise<unknown>;

const GROUPS: Array<{ names: readonly string[]; definitions: (workMode: string) => Array<{ name: string; description: string; inputSchema: unknown }>; call: Sprint3Dispatcher }> = [
  { names: PLAYBOOK_TOOL_NAMES, definitions: playbookToolDefinitions, call: (input) => callPlaybookTool(input) },
  { names: PROPOSAL_TOOL_NAMES, definitions: proposalToolDefinitions, call: (input) => callProposalTool(input) },
  { names: COMMERCIAL_DECISION_TOOL_NAMES, definitions: commercialDecisionToolDefinitions, call: (input) => callCommercialDecisionTool(input) },
  { names: HANDOFF_TOOL_NAMES, definitions: handoffToolDefinitions, call: (input) => callHandoffTool(input) },
  { names: AGREEMENT_TOOL_NAMES, definitions: agreementToolDefinitions, call: (input) => callAgreementTool(input) },
  { names: LEAD_TOOL_NAMES, definitions: leadToolDefinitions, call: (input) => callLeadTool(input) },
  { names: COMMITMENT_TOOL_NAMES, definitions: commitmentToolDefinitions, call: (input) => callCommitmentTool(input) },
];

export const SPRINT3_TOOL_NAMES: readonly string[] = GROUPS.flatMap((group) => [...group.names]);

/**
 * Tool definitions of every Sprint 3 work package for the given work mode (media tools stay in media-tools.ts).
 * The runner catalog is the single source of truth for which modes may see a tool: write tools only in
 * standard/skill_test, read tools also in ask/planning. Per-package filters cannot widen that.
 */
export function sprint3ToolDefinitions(workMode: string) {
  return GROUPS.flatMap((group) => group.definitions(workMode)).filter((tool) => {
    const entry = CAPABILITY_SEMANTIC_TOOL_CATALOG.find((candidate) => candidate.operationId === tool.name);
    return entry ? entry.allowedModes.includes(workMode as "standard") : false;
  });
}

/** Resolves the wrapper that handles a Sprint 3 tool name; null when the name belongs to another family. */
export function dispatchSprint3Tool(name: string): Sprint3Dispatcher | null {
  const group = GROUPS.find((candidate) => candidate.names.includes(name));
  return group ? group.call : null;
}
