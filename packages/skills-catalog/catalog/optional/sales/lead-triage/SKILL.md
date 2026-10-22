---
name: lead-triage
description: Triage a new inbound lead: check for duplicates, judge fit and urgency, set priority and owner, and decide whether to qualify, reply, or discard. Triage records a decision and never contacts the lead.
key: paperclipai/optional/sales/lead-triage
recommendedForRoles:
  - sales
  - sdr
  - founder
tags:
  - sales
  - leads
  - triage
  - crm
---

# Lead Triage

Decide what happens next to each new lead: qualify it, reply to it, or discard it. Triage is a classification step. It records a decision on the lead record. It does not contact the lead.

## When to use

- A lead arrives from any source (form, CSV import, email, chat, API) and still has status `new`.
- A lead has waited untriaged longer than the team's response window.

## When not to use

- The lead is already `triaged`, `qualified`, `converted`, or `discarded`. Read it and move on; do not triage it twice.
- The message is a support question from an existing customer. Route it to the conversation flow (`channel-reply`) instead.
- You need to send anything. Triage never sends. Replies are drafted with `message_draft` and leave through the external action gate.

## Procedure

1. Load the lead with `lead_get`. Read the source payload, not only the summary line.
2. Check for duplicates with `crm_search` using the lead's email, phone, and company domain. If a customer or contact already exists, note it. The lead will be converted onto that record, not a new one.
3. Judge fit against the company's ideal-customer notes. If the lead matches a known customer, read the memory notes with `customer_memory_get` first. Mark the lead as fits, unclear, or out of scope.
4. Judge urgency. An explicit deadline, a stated budget, or a named decision maker raises priority to `high`. General interest is `normal`. Spam, job seekers, unsolicited vendor pitches, and messages with no identifiable need are discard candidates.
5. Apply the decision with `lead_triage`:
   - Fits or unclear with a real need: set priority and assignee, status becomes `triaged`.
   - Out of scope or spam: discard with a one-line `discard_reason` that a human can read.
6. Record the reasoning in one short note with `crm_log_activity` (subject kind `lead`, kind `note`). Keep it to facts: what the lead asked for and what was missing.
7. If the lead needs a first response, hand off to the reply step (`channel-reply`) and to the qualification questions. Do not write the reply inside triage.

## Rules

- Do not discard on a judgment you cannot explain in one sentence. Leave the lead `triaged` with priority `low` and state what is unclear.
- Never invent budget, timeline, company size, or role. Missing fields stay empty.
- Keep personal data in the lead and CRM records. Do not copy more of it into notes than the decision needs.
- A discard is a decision a human may review later. Write the reason so that reviewer can understand it without rereading the payload.
