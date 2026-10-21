import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { convertLeadSchema } from "@paperclipai/shared";
import { notFound } from "../../errors.js";
import type { CrmActor } from "../crm/common.js";
import { leadService, leadListQuerySchema, triageLeadSchema } from "./leads.js";

// Agent tool handlers for the lead_* names in CRM_TOOL_NAMES (pista B).
// Handlers call the lead service directly and enforce the agent's company scope.
// Definitions are plain data so the runner catalog can list them; wiring into the
// vendored runner catalog is an integration step.

export const LEAD_TOOL_NAMES = ["lead_get", "lead_list", "lead_triage", "lead_convert"] as const;
export type LeadToolName = (typeof LEAD_TOOL_NAMES)[number];

const leadIdSchema = z.object({ leadId: z.string().uuid() });

const toolInputSchemas = {
  lead_get: leadIdSchema,
  lead_list: leadListQuerySchema,
  lead_triage: leadIdSchema.extend({
    priority: triageLeadSchema.shape.priority,
    language: triageLeadSchema.shape.language,
    assignedAgentId: triageLeadSchema.shape.assignedAgentId,
  }),
  lead_convert: leadIdSchema.extend({
    customerId: convertLeadSchema.shape.customerId,
    contactId: convertLeadSchema.shape.contactId,
    createOpportunity: convertLeadSchema.shape.createOpportunity,
    opportunityTitle: convertLeadSchema.shape.opportunityTitle,
    idempotencyKey: convertLeadSchema.shape.idempotencyKey,
  }),
} as const;

const toolDescriptions: Record<LeadToolName, string> = {
  lead_get: "Read one lead of the company by id, with its payload, status and links.",
  lead_list: "List leads of the company, filtered by status, source, priority or assignment.",
  lead_triage: "Set priority, language or agent assignment on a lead. A new lead becomes triaged.",
  lead_convert:
    "Convert a lead into customer, contact and optionally an opportunity. Requires idempotencyKey; repeating it is safe.",
};

export const leadToolDefinitions = LEAD_TOOL_NAMES.map((name) => ({
  name,
  description: toolDescriptions[name],
  inputSchema: z.toJSONSchema(toolInputSchemas[name]),
}));

export interface LeadToolContext {
  companyId: string;
  agentId: string;
}

export function leadAgentTools(db: Db) {
  const leads = leadService(db);

  async function ownLead(companyId: string, leadId: string) {
    const lead = await leads.getRow(leadId);
    if (!lead || lead.companyId !== companyId) throw notFound("Lead not found");
    return lead;
  }

  function agentActor(ctx: LeadToolContext): CrmActor {
    return { actorType: "agent", actorId: ctx.agentId, agentId: ctx.agentId, runId: null };
  }

  return {
    definitions: leadToolDefinitions,

    /** Runs one lead_* tool. Arguments are validated with the same schemas as the HTTP routes. */
    async call(name: LeadToolName, rawArgs: unknown, ctx: LeadToolContext) {
      switch (name) {
        case "lead_get": {
          const { leadId } = leadIdSchema.parse(rawArgs);
          return ownLead(ctx.companyId, leadId);
        }
        case "lead_list": {
          return leads.list(ctx.companyId, leadListQuerySchema.parse(rawArgs));
        }
        case "lead_triage": {
          const { leadId, ...input } = toolInputSchemas.lead_triage.parse(rawArgs);
          await ownLead(ctx.companyId, leadId);
          return leads.triage(leadId, triageLeadSchema.parse(input), agentActor(ctx));
        }
        case "lead_convert": {
          const { leadId, ...input } = toolInputSchemas.lead_convert.parse(rawArgs);
          await ownLead(ctx.companyId, leadId);
          const result = await leads.convert(leadId, convertLeadSchema.parse(input), agentActor(ctx));
          return { ...result.lead, replayed: result.replayed };
        }
      }
    },
  };
}
