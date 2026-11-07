import { describe, expect, it } from "vitest";
import { deriveAssignmentStatus } from "../services/assignment-status.js";

describe("deriveAssignmentStatus", () => {
  it("treats cancellation as terminal", () => {
    expect(deriveAssignmentStatus({ goalStatus: "cancelled", issueStatus: "in_progress" })).toBe("cancelled");
  });
  it("keeps a completed task awaiting review until every latest deliverable review is accepted", () => {
    expect(deriveAssignmentStatus({ goalStatus: "active", issueStatus: "done" })).toBe("awaiting_review");
    expect(deriveAssignmentStatus({ goalStatus: "active", issueStatus: "done", reviews: [{ state: "accepted", targetKind: "work_product", targetId: "one", reviewedAt: new Date("2026-01-02") }] })).toBe("accepted");
    expect(deriveAssignmentStatus({ goalStatus: "active", issueStatus: "in_progress", reviews: [{ state: "accepted", targetKind: "work_product", targetId: "one" }] })).toBe("in_progress");
  });
  it("surfaces pending reviews and the latest changes request", () => {
    expect(deriveAssignmentStatus({ goalStatus: "active", issueStatus: "in_progress", reviews: [{ state: "pending" }] })).toBe("awaiting_review");
    expect(deriveAssignmentStatus({ goalStatus: "active", issueStatus: "in_progress", reviews: [{ state: "accepted", targetKind: "work_product", targetId: "one", reviewedAt: new Date("2026-01-01") }, { state: "changes_requested", targetKind: "work_product", targetId: "one", reviewedAt: new Date("2026-01-02") }] })).toBe("changes_requested");
    expect(deriveAssignmentStatus({ goalStatus: "active", issueStatus: "done", reviews: [{ state: "accepted", targetKind: "work_product", targetId: "one", reviewedAt: new Date("2026-01-02") }, { state: "pending", targetKind: "work_product", targetId: "two" }] })).toBe("awaiting_review");
  });
});
