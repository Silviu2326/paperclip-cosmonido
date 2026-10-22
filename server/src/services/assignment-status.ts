export function deriveAssignmentStatus(input: { goalStatus: string; issueStatus?: string | null; reviews?: Array<{ state: string; targetKind?: string | null; targetId?: string | null; reviewedAt?: Date | null; createdAt?: Date }> }) {
  if (input.goalStatus === "cancelled" || input.issueStatus === "cancelled") return "cancelled" as const;
  const latestByTarget = new Map<string, NonNullable<typeof input.reviews>[number]>();
  for (const review of input.reviews ?? []) {
    const targetKey = `${review.targetKind ?? "target"}:${review.targetId ?? ""}`;
    const current = latestByTarget.get(targetKey);
    const reviewAt = review.createdAt ?? review.reviewedAt ?? new Date(0);
    const currentAt = current?.createdAt ?? current?.reviewedAt ?? new Date(0);
    if (!current || reviewAt >= currentAt) latestByTarget.set(targetKey, review);
  }
  const latestReviews = [...latestByTarget.values()];
  if (latestReviews.some((review) => review.state === "pending")) return "awaiting_review" as const;
  if (latestReviews.some((review) => review.state === "changes_requested")) return "changes_requested" as const;
  if (input.issueStatus === "done") return latestReviews.length > 0 && latestReviews.every((review) => review.state === "accepted") ? "accepted" as const : "awaiting_review" as const;
  if (input.issueStatus === "in_review") return "awaiting_review" as const;
  if (input.issueStatus && ["todo", "in_progress", "blocked"].includes(input.issueStatus)) return "in_progress" as const;
  return "planned" as const;
}
