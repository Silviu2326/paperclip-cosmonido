---
name: client-brief-intake
description: Turn a client's raw request into a structured content brief covering goal, audience, channels, deliverables, deadline, approvals, source material, and out-of-scope items, and stop to ask when critical fields are missing.
key: paperclipai/optional/content/client-brief-intake
recommendedForRoles:
  - account-manager
  - content-strategist
  - writer
  - product
tags:
  - content
  - client
  - brief
  - planning
---

# Client Brief Intake

Turn an unstructured client request into a brief the writing team can execute without another round of questions. A brief names what will be produced, for whom, by when, and who approves it. When a critical field is missing, ask once, in one message, and wait.

## When to use

- A client sends a request for content, a campaign, or a set of pieces.
- An existing client asks for a new deliverable that is not yet in the delivery plan.
- A brief exists but is missing a critical field the writers need.

## When not to use

- The request is a small correction to a piece already in review. Route it to `delivery-review` and the revision flow.
- The client has not agreed to the scope yet and only wants a price estimate. Do not write a brief for work that is not approved.
- The request asks for something outside the agency's services or brand rules. Escalate to the account owner.

## Procedure

1. Read the client record with `crm_get_customer` and the stored brand notes with `customer_memory_get`. Reuse known voice, banned terms, and approvers instead of asking again.
2. Fill the brief fields in this order:
   - Goal: the outcome the client wants, in one sentence, with a measure if they gave one.
   - Audience: who reads it and what they already know.
   - Channels and formats: for example blog post, newsletter, social posts, with counts.
   - Deliverables: each piece with its format, length, and due date.
   - Source material: links, files, interviews, product facts, and who supplied them.
   - Approvals: who reviews each piece and how many rounds are included.
   - Constraints: brand voice, legal or medical claims that need sign-off, languages.
   - Out of scope: what this brief does not cover.
3. Mark each field as given, inferred, or missing. Never mark an inferred field as given.
4. If a critical field (goal, deliverables, deadline, approver) is missing, send one message listing only those questions and stop. Do not start writing.
5. When the brief is complete, store decisions that will recur with `customer_memory_append` (voice rules, approvers, standing constraints). Save the brief as the project or task description for the writing team.
6. Set each deliverable's deadline as a commitment with `commitment_create` (who `us`) when the client has been told the date.

## Rules

- A brief does not promise results or rankings.
- Quote the client's own words for goals and constraints; do not improve them into claims they did not make.
- Keep client source material inside the client's record; do not paste it into other clients' work.
