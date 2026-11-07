import type { ConvertLead } from "@paperclipai/shared";

/**
 * One builder for both conversion entry points (list quick action and lead detail), so the same
 * choices always produce the same request. The quick action in the list never creates an opportunity;
 * the detail form is where that choice is offered.
 */
export function buildLeadConversion(input: { createOpportunity?: boolean; opportunityTitle?: string; idempotencyKey: string }): ConvertLead {
  const createOpportunity = input.createOpportunity === true;
  const title = createOpportunity ? input.opportunityTitle?.trim() : undefined;
  return { createOpportunity, opportunityTitle: title || undefined, idempotencyKey: input.idempotencyKey };
}
