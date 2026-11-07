---
name: delivery-review
description: Review a content piece before it reaches the client, checking the brief, facts, claims, brand voice, links, format, and sensitive wording, and return approve, revise, or block with a prioritized fix list. The review itself publishes and delivers nothing.
key: paperclipai/optional/content/delivery-review
recommendedForRoles:
  - editor
  - reviewer
  - content-strategist
  - account-manager
tags:
  - content
  - review
  - quality
  - delivery
---

# Delivery Review

Check one content piece against its brief and the delivery standard, then return a verdict the next person can act on: approve, revise with a prioritized list, or block with a reason. The review judges and documents. It does not publish, deliver, or send anything.

## When to use

- A writer has finished a piece and it is ready for editorial review.
- A piece is about to be delivered to a client and needs a final check.
- A client has requested changes and the revised piece must be checked against the original brief.

## When not to use

- The piece has no brief yet. Run `client-brief-intake` first.
- You are asked to rewrite the piece. Review recommends changes; the writer or editor makes them.
- The piece is internal and has no client-facing use. A lighter pass is enough; say so.

## Procedure

1. Read the brief and the client's brand notes with `customer_memory_get`. Note the goal, audience, format, length, and approvers.
2. Check fit to brief: does the piece serve the goal, address the audience, and stay in scope?
3. Check facts. Every number, date, product claim, and quote must trace to a source the brief lists. Mark any untraceable claim as a blocker.
4. Check claims and sensitive wording: medical, financial, legal, or comparative claims, and anything that needs the client's sign-off. Flag them for approval rather than editing them away.
5. Check voice: the client's rules, banned terms, and reading level.
6. Check the mechanics: links resolve, headings are in order, length fits the format, names are spelled as the client spells them, and images have alt text.
7. Return one verdict:
   - Approve: no blockers, no more than minor polish.
   - Revise: list fixes in priority order, each with a location in the text and the reason.
   - Block: a fact, claim, or approval gap that stops delivery. State exactly what is needed to unblock.
8. For external review by the client, create a review link with `review_link_create` and track it with `review_status_get`. Record the agreed deadline for the client's response with `commitment_create`.

## Rules

- Each finding names the location, the problem, and the fix. "Could be stronger" is not a finding.
- Separate blockers from preferences. Preferences never block delivery on their own.
- Do not approve a piece you could not check against a source. Say what was not checked.
- Delivery and publication go through the external action gate. A review verdict is not permission to publish.
