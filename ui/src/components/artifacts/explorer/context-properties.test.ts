import { describe, expect, it } from "vitest";
import type { CompanyFile } from "@/api/company-files";
import {
  applyContextFilter,
  authorizedContextProjectId,
  buildFileUpdate,
  contextFilterParams,
  draftChanged,
  draftFromFile,
  parseContextFilter,
  updateInputFromDraft,
} from "./context-properties";

const NOW = new Date("2026-10-23T12:00:00Z");

function file(overrides: Partial<CompanyFile>): CompanyFile {
  return {
    id: "f", name: "f.md", contextRole: "offer", audienceKind: "company", audienceId: null, validUntil: null,
    ...overrides,
  } as CompanyFile;
}

describe("authorizedContextProjectId", () => {
  it("accepts a requested project only when it is present in the active company project list", () => {
    expect(authorizedContextProjectId("project-1", [{ id: "project-1" }, { id: "project-2" }])).toBe("project-1");
    expect(authorizedContextProjectId("project-outside-scope", [{ id: "project-1" }])).toBeNull();
    expect(authorizedContextProjectId("project-1", undefined)).toBeNull();
  });
});

describe("context filter URL", () => {
  it("is off unless context=1", () => {
    expect(parseContextFilter(new URLSearchParams("role=brand"))).toBeNull();
  });

  it("treats a bare projectId as that project's audience", () => {
    expect(parseContextFilter(new URLSearchParams("context=1&projectId=p1"))).toEqual({
      role: "any", validity: "all", audience: "project", projectId: "p1",
    });
  });

  it("ignores unknown values and round-trips through params", () => {
    const filter = parseContextFilter(new URLSearchParams("context=1&role=nope&validity=expired&audience=company"))!;
    expect(filter).toEqual({ role: "any", validity: "expired", audience: "company", projectId: null });
    expect(contextFilterParams(filter)).toEqual({ context: "1", role: null, validity: "expired", audience: "company", projectId: null });
  });
});

describe("applyContextFilter", () => {
  const files = [
    file({ id: "none", contextRole: null }),
    file({ id: "offer" }),
    file({ id: "brand-old", contextRole: "brand", validUntil: new Date("2026-01-01") }),
    file({ id: "proj-a", audienceKind: "project", audienceId: "a" }),
    file({ id: "proj-b", audienceKind: "project", audienceId: "b", validUntil: new Date("2027-01-01") }),
  ];
  const base = { role: "any", validity: "all", audience: "any", projectId: null } as const;
  const ids = (filter: Parameters<typeof applyContextFilter>[1]) => applyContextFilter(files, filter, NOW).map(item => item.id);

  it("only lists files that carry a context role", () => {
    expect(ids(base)).toEqual(["offer", "brand-old", "proj-a", "proj-b"]);
  });

  it("filters by role, expiry and audience", () => {
    expect(ids({ ...base, role: "brand" })).toEqual(["brand-old"]);
    expect(ids({ ...base, validity: "expired" })).toEqual(["brand-old"]);
    expect(ids({ ...base, validity: "active" })).toEqual(["offer", "proj-a", "proj-b"]);
    expect(ids({ ...base, audience: "project", projectId: "b" })).toEqual(["proj-b"]);
    expect(ids({ ...base, audience: "company" })).toEqual(["offer", "brand-old"]);
  });
});

describe("editing", () => {
  it("refuses a project audience without a project", () => {
    expect(updateInputFromDraft({ role: "offer", audienceKind: "project", audienceId: "", validUntil: "" })).toBeNull();
  });

  it("clears the audience id and expiry for a company audience", () => {
    expect(updateInputFromDraft({ role: null, audienceKind: "company", audienceId: "x", validUntil: "" })).toEqual({
      contextRole: null, audienceKind: "company", audienceId: null, validUntil: null,
    });
  });

  it("does not rewrite a customer audience the user did not touch", () => {
    const customerFile = file({ audienceKind: "customer", audienceId: "c1" });
    const draft = draftFromFile(customerFile);
    expect(draftChanged(customerFile, draft)).toBe(false);
    const update = buildFileUpdate(customerFile, { ...draft, role: "brand" })!;
    expect(update).not.toHaveProperty("audienceKind");
    expect(update).not.toHaveProperty("audienceId");
    expect(update.contextRole).toBe("brand");
  });
});
