---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":30}
---

# Activity timeline and commitments

A chronological record of what happened for a customer, contact, lead, opportunity, conversation or commitment, plus the promises either side made, with due dates and outcomes.

Implementation: [activity timeline](../../ui/src/components/crm/ActivityTimeline.tsx), [commitments](../../ui/src/components/crm/CommitmentsList.tsx), [customer detail](../../ui/src/pages/crm/CustomerDetail.tsx).
Agent access: [companion](../agent-access-map/activities.md).

## Sub-features

- `timeline`: activities for one subject, newest first, loaded page by page.
- `log`: record a note, call, email, message, meeting or task against a subject.
- `commitments`: a promise by us or them, with an optional due date, created manually or detected, then kept, missed or cancelled.

## How to get to it (user POV)

### `customer-activity`

Open `/customers/:customerId` and the Activity tab to read the customer timeline.

### `opportunity-activity`

On `/opportunities`, open a card or row. The side panel shows that opportunity's timeline and its commitments.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company with one customer, one opportunity and one agent.

1. Log a call on the customer through the API and verify the timeline shows it first after reload.
2. Create a commitment owed by us with a due date on the opportunity; verify it appears in the side panel as open.
3. Resolve it as kept and verify the status and resolution time persist.
4. Request the timeline for a subject kind without an id and verify the request is rejected.

Targeted evidence: [crm agent tools](../../server/src/services/crm/crm-tools.test.ts) and [opportunities service](../../server/src/services/crm/opportunities.test.ts) cover the activity and commitment writes.

## Gotchas

- The activity timeline lists records for one subject; it does not merge the customer's whole history. Use the customer timeline for that.
- Detected commitments carry their evidence but still need a human or agent to resolve them.
- A logged activity is not a message. Sending a message creates its own conversation record.
