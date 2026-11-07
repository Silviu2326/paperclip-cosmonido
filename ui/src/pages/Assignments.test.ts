import { describe, expect, it } from "vitest";
import { assignmentTaskCollectionPath, assignmentTaskPath } from "./Assignments";

describe("legacy assignment task destinations", () => {
  it("keeps current filters, query context, hash, and forces the result-required collection", () => {
    expect(assignmentTaskCollectionPath("?projectId=p1&review=pending", "#activity"))
      .toBe("/issues?projectId=p1&review=required#activity");
  });

  it("keeps search and hash when resolving an assignment to its authorized root task", () => {
    expect(assignmentTaskPath("PAP-12", "?tab=activity", "#review"))
      .toBe("/issues/PAP-12?tab=activity#review");
  });

  it("opens the result disclosure from a legacy assignment link without overriding an explicit hash", () => {
    expect(assignmentTaskPath("PAP-12", "?tab=activity", ""))
      .toBe("/issues/PAP-12?tab=activity#outcome");
    expect(assignmentTaskPath("PAP-12", "", "#custom"))
      .toBe("/issues/PAP-12#custom");
  });
});
