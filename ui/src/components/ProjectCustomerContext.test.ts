import { describe, expect, it } from "vitest";
import type { Customer } from "@paperclipai/shared";
import { filterProjectCustomerOptions } from "./ProjectCustomerContext";

function customer(id: string, companyId: string, status: Customer["status"] = "active"): Customer {
  return {
    id,
    companyId,
    kind: "organization",
    name: `Customer ${id}`,
    domain: null,
    tags: [],
    ownerUserId: null,
    ownerAgentId: null,
    status,
    health: null,
    notes: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("filterProjectCustomerOptions", () => {
  it("only exposes active customers belonging to the project company", () => {
    expect(filterProjectCustomerOptions([
      customer("same-company", "company-1"),
      customer("other-company", "company-2"),
      customer("archived", "company-1", "archived"),
    ], "company-1").map(item => item.id)).toEqual(["same-company"]);
  });
});
