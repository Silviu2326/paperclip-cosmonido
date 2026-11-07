import { expect, it } from "vitest";
import { buildLeadConversion } from "./lead-conversion";

it("builds the same request from the quick action and the detail form", () => {
  expect(buildLeadConversion({ idempotencyKey: "k" })).toEqual({ createOpportunity: false, opportunityTitle: undefined, idempotencyKey: "k" });
  expect(buildLeadConversion({ createOpportunity: true, opportunityTitle: "  Deal  ", idempotencyKey: "k" }))
    .toEqual({ createOpportunity: true, opportunityTitle: "Deal", idempotencyKey: "k" });
  expect(buildLeadConversion({ createOpportunity: false, opportunityTitle: "ignored", idempotencyKey: "k" }).opportunityTitle).toBeUndefined();
});
