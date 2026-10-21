import { z } from "zod";
import {
  changeOpportunityStageSchema,
  createCommitmentSchema,
  createContactSchema,
  createCrmActivitySchema,
  createCustomerSchema,
  createOpportunitySchema,
  resolveCommitmentSchema,
} from "@paperclipai/shared";
import { badRequest } from "../../errors.js";
import { setNextActionSchema } from "./opportunities.js";

// Sprint 2 pista A2. Agent tools for the CRM. They follow services/project-tools.ts: every tool
// is a call to the normal authenticated API, so validation, company checks, the external action
// gate and activity logging all apply. The company is always the run's company, never an argument.

export const CRM_A2_TOOL_NAMES = [
  "crm_search",
  "crm_get_customer",
  "crm_create_customer",
  "crm_create_contact",
  "crm_create_opportunity",
  "crm_update_opportunity_stage",
  "crm_set_next_action",
  "crm_log_activity",
  "commitment_create",
  "commitment_resolve",
] as const;
export type CrmA2ToolName = (typeof CRM_A2_TOOL_NAMES)[number];

export function isCrmA2ToolName(name: string): name is CrmA2ToolName {
  return (CRM_A2_TOOL_NAMES as readonly string[]).includes(name);
}

type ApiCall = (method: "GET" | "POST", path: string, body?: unknown) => Promise<unknown>;

interface CrmToolScope {
  companyId: string;
  call: ApiCall;
}

interface CrmToolSpec {
  description: string;
  input: z.ZodType;
  run: (args: any, scope: CrmToolScope) => Promise<unknown>;
}

const guid = z.string().guid();
const searchLimit = z.number().int().min(1).max(50).optional();

const TOOL_SPECS: Record<CrmA2ToolName, CrmToolSpec> = {
  crm_search: {
    description: "Search customers and opportunities of this company by text.",
    input: z.object({ q: z.string().trim().min(1).max(200), limit: searchLimit }),
    run: async (args: { q: string; limit?: number }, { companyId, call }) => {
      const query = new URLSearchParams({ q: args.q, limit: String(args.limit ?? 10) });
      const [customers, opportunities] = await Promise.all([
        call("GET", `/companies/${companyId}/customers?${query}`),
        call("GET", `/companies/${companyId}/opportunities?${query}`),
      ]);
      return { customers, opportunities };
    },
  },
  crm_get_customer: {
    description: "Get one customer of this company with its open opportunities.",
    input: z.object({ customerId: guid }),
    run: async (args: { customerId: string }, { companyId, call }) => {
      const customer = await call("GET", `/customers/${args.customerId}`);
      const openOpportunities = await call(
        "GET",
        `/companies/${companyId}/opportunities?customerId=${args.customerId}&status=open&limit=50`,
      );
      return { customer, openOpportunities };
    },
  },
  crm_create_customer: {
    description: "Create a customer (person or organization) in this company.",
    input: createCustomerSchema,
    run: (args, { companyId, call }) => call("POST", `/companies/${companyId}/customers`, args),
  },
  crm_create_contact: {
    description: "Create a contact and optionally link it to a customer.",
    input: createContactSchema,
    run: (args, { companyId, call }) => call("POST", `/companies/${companyId}/contacts`, args),
  },
  crm_create_opportunity: {
    description: "Create an opportunity for a customer in the sales pipeline.",
    input: createOpportunitySchema,
    run: (args, { companyId, call }) => call("POST", `/companies/${companyId}/opportunities`, args),
  },
  crm_update_opportunity_stage: {
    description:
      "Move an opportunity to another sales stage. Agents may need approval first; the result tells whether it was applied or is pending.",
    input: z.object({ opportunityId: guid }).extend(changeOpportunityStageSchema.shape),
    run: (args: { opportunityId: string } & Record<string, unknown>, { call }) => {
      const { opportunityId, ...body } = args;
      return call("POST", `/opportunities/${opportunityId}/stage`, body);
    },
  },
  crm_set_next_action: {
    description: "Set the next action and its date on an opportunity.",
    input: z.object({ opportunityId: guid }).extend(setNextActionSchema.shape),
    run: (args: { opportunityId: string } & Record<string, unknown>, { call }) => {
      const { opportunityId, ...body } = args;
      return call("POST", `/opportunities/${opportunityId}/next-action`, body);
    },
  },
  crm_log_activity: {
    description: "Record a note, call, email, message or meeting on a CRM record.",
    input: createCrmActivitySchema,
    run: (args, { companyId, call }) => call("POST", `/companies/${companyId}/crm/activities`, args),
  },
  commitment_create: {
    description: "Record a commitment made by us or by the customer.",
    input: createCommitmentSchema,
    run: (args, { companyId, call }) => call("POST", `/companies/${companyId}/commitments`, args),
  },
  commitment_resolve: {
    description: "Mark a commitment as kept, missed or cancelled.",
    input: z.object({ commitmentId: guid }).extend(resolveCommitmentSchema.shape),
    run: (args: { commitmentId: string } & Record<string, unknown>, { call }) => {
      const { commitmentId, ...body } = args;
      return call("POST", `/commitments/${commitmentId}/resolve`, body);
    },
  },
};

/** Definitions for the agent runtime: the closed list of A2 tools with their JSON Schemas. */
export function crmToolDefinitions() {
  return CRM_A2_TOOL_NAMES.map((name) => ({
    name,
    description: TOOL_SPECS[name].description,
    inputSchema: z.toJSONSchema(TOOL_SPECS[name].input),
  }));
}

export interface CallCrmToolInput {
  name: string;
  arguments: Record<string, unknown>;
  apiUrl: string;
  token: string;
  /** Company of the run. Tool arguments cannot change it. */
  companyId: string;
  /** Test seam; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export async function callCrmTool(input: CallCrmToolInput): Promise<unknown> {
  if (!isCrmA2ToolName(input.name)) throw badRequest(`Unknown CRM tool: ${input.name}`);
  const spec = TOOL_SPECS[input.name];
  const args = spec.input.parse(input.arguments ?? {}) as Record<string, unknown>;
  const base = `${input.apiUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api`;
  const fetchImpl = input.fetchImpl ?? fetch;

  const call: ApiCall = async (method, path, body) => {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60_000),
    });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    // 202 is the gate answer for agent actions that wait for approval; it is a success for the tool.
    if (!response.ok && response.status !== 202) {
      throw new Error(typeof result.error === "string" ? result.error : `CRM tool failed (${response.status})`);
    }
    return result;
  };

  return spec.run(args, { companyId: input.companyId, call });
}
