import { describe, expect, it } from "vitest";
import type { Customer } from "@paperclipai/shared";
import { filterCustomers, isNewCustomer, needsAttention, nextCustomerSort, sortCustomers } from "./customers-list";

const NOW = new Date("2026-10-24T12:00:00Z");

function customer(name: string, health: Customer["health"], createdAt: string): Customer {
  return {
    id: name, companyId: "c", kind: "organization", name, domain: null, tags: [], ownerUserId: null, ownerAgentId: null,
    status: "active", health, notes: null, archivedAt: null, createdAt, updatedAt: createdAt,
  };
}

const alpha = customer("Alfa", "good", "2025-01-01T00:00:00Z");
const bravo = customer("Bravo", "risk", "2026-10-20T00:00:00Z");
const charlie = customer("Charlie", "watch", "2026-09-01T00:00:00Z");
const delta = customer("Delta", null, "2026-10-01T00:00:00Z");

describe("customers list helpers", () => {
  it("flags low and watch health as needing attention, not unrated", () => {
    expect([alpha, bravo, charlie, delta].filter(needsAttention).map((c) => c.name)).toEqual(["Bravo", "Charlie"]);
  });

  it("treats customers created in the last 30 days as new", () => {
    expect(isNewCustomer(bravo, NOW)).toBe(true);
    expect(isNewCustomer(delta, NOW)).toBe(true);
    expect(isNewCustomer(charlie, NOW)).toBe(false);
    expect(filterCustomers([alpha, bravo, charlie, delta], "new", NOW).map((c) => c.name)).toEqual(["Bravo", "Delta"]);
  });

  it("sorts by health with the worst first and unrated last", () => {
    expect(sortCustomers([alpha, bravo, charlie, delta], { key: "health", direction: "asc" }).map((c) => c.name))
      .toEqual(["Bravo", "Charlie", "Alfa", "Delta"]);
  });

  it("keeps the server order when no sort is set", () => {
    const list = [charlie, alpha];
    expect(sortCustomers(list, null)).toBe(list);
  });

  it("cycles name sort asc, desc, off and starts dates newest first", () => {
    const first = nextCustomerSort(null, "name");
    expect(first).toEqual({ key: "name", direction: "asc" });
    const second = nextCustomerSort(first, "name");
    expect(second).toEqual({ key: "name", direction: "desc" });
    expect(nextCustomerSort(second, "name")).toBeNull();
    expect(nextCustomerSort(null, "created")).toEqual({ key: "created", direction: "desc" });
  });
});
