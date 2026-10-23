import { describe, expect, it } from "vitest";
import { availableCompanyMemberChoices } from "./ProductAccounts";

describe("availableCompanyMemberChoices", () => {
  it("shows active company-directory users by name/email and omits members already linked to the account", () => {
    expect(availableCompanyMemberChoices([
      { principalId: "user-1", status: "active", user: { id: "user-1", name: "Alex Rivera", email: "alex@example.com", image: null } },
      { principalId: "user-2", status: "active", user: { id: "user-2", name: null, email: "bea@example.com", image: null } },
    ], ["user-1"])).toEqual([
      { id: "user-2", label: "bea@example.com", email: "bea@example.com" },
    ]);
  });

  it("uses the principal ID only when the authorized directory has no profile details", () => {
    expect(availableCompanyMemberChoices([
      { principalId: "user-3", status: "active", user: null },
    ], [])).toEqual([{ id: "user-3", label: "user-3", email: null }]);
  });
});
