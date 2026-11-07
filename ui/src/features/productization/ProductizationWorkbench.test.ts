// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { assignmentTaskHref, workbenchTabFromHash } from "./ProductizationWorkbench";

describe("workbenchTabFromHash", () => {
  it("opens template selection for #team, the create-team entry point", () => {
    expect(workbenchTabFromHash("#team")).toBe("catalog");
    expect(workbenchTabFromHash("#TEAM")).toBe("catalog");
    expect(workbenchTabFromHash("#catalog")).toBe("catalog");
  });

  it("keeps the read-only roster tab reachable under its own hash", () => {
    expect(workbenchTabFromHash("#current-team")).toBe("team");
  });

  it("maps the remaining steps and ignores unknown or empty hashes", () => {
    expect(workbenchTabFromHash("#hiring")).toBe("hiring");
    expect(workbenchTabFromHash("#onboarding")).toBe("onboarding");
    expect(workbenchTabFromHash("")).toBeNull();
    expect(workbenchTabFromHash("#unknown")).toBeNull();
  });
});

describe("assignmentTaskHref", () => {
  it("opens the principal task when the assignment has one", () => {
    expect(assignmentTaskHref({ id: "assignment-1", rootIssueId: "issue 1" })).toBe("/issues/issue%201");
  });

  it("falls back to the assignment alias the parent keeps when there is no principal task", () => {
    expect(assignmentTaskHref({ id: "assignment/1", rootIssueId: null })).toBe("/assignments/assignment%2F1");
  });
});
