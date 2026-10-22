---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":20}
---

# Opportunities and the sales pipeline

Deals a customer may buy. Each opportunity sits in one stage of the `sales` pipeline (new, qualified, proposal, negotiation, won, lost), carries an optional amount and next action, and is changed with a version check so two people cannot overwrite each other silently.

Implementation: [opportunities](../../ui/src/pages/crm/Opportunities.tsx), [create dialog](../../ui/src/components/crm/OpportunityCreateDialog.tsx), [customer opportunities tab](../../ui/src/components/crm/CustomerOpportunitiesTab.tsx), [board](../../ui/src/components/crm/OpportunityBoard.tsx).
Agent access: [companion](../agent-access-map/opportunities.md).

## Sub-features

- `create`: a new opportunity for a customer with title, stage, optional amount and currency, optional next action. A retry key keeps repeated submits from creating duplicates.
- `pipeline`: the board groups opportunities by stage; the list view shows the same records as a table.
- `stage-change`: moving an opportunity to another stage is an external action. A board user applies it immediately; an agent may only get a pending action, which leaves the stage unchanged until approved.
- `close`: mark an opportunity won or lost with a reason.
- `next-action`: set the next action text and its date.
- `customer-tab`: the opportunities of one customer, with a create action that preselects that customer.

## How to get to it (user POV)

### `pipeline-board`

Open `/opportunities`. Choose Board or List. Drag or move a card to another stage. A notice says when the change waits for approval.

### `create-opportunity`

On `/opportunities`, choose New opportunity, pick the customer, enter the title and stage, optionally the amount and next action, and submit. The same action is on the customer's Opportunities tab with the customer already chosen.

### `customer-opportunities`

Open `/customers/:customerId` and the Opportunities tab to see that customer's deals and create one.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company with one customer and one agent. Embedded database; no external provider is needed.

1. Create an opportunity from `/opportunities` with amount 120,50 and currency EUR. Reload and verify the amount, stage and next action persist.
2. From the customer's Opportunities tab, create a second opportunity and verify it appears only under that customer.
3. Post the same creation twice with one idempotency key through the API; verify one row.
4. As a board user move a card to Proposal; verify the change is direct (no pending notice).
5. As an agent under the default draft-only autonomy, request the same move; verify a 202 pending action and an unchanged stage.
6. Send a stage change with a stale expected version and verify 409 `version_conflict`.

Targeted evidence: [opportunities service](../../server/src/services/crm/opportunities.test.ts), [crm agent tools](../../server/src/services/crm/crm-tools.test.ts), [external action gate](../../server/src/services/external-action-gate.test.ts), [create dialog](../../ui/src/components/crm/OpportunityCreateDialog.test.tsx).

## Gotchas

- The sales pipeline does not enforce transitions unless transitions are configured; any stage is reachable.
- The retry key for creation is generated when the dialog opens. A new dialog starts a new opportunity by design.
- A pending agent stage change is not a stage change. Check the action, not the card, before reporting success.
- The create dialog covers the main fields only; owner, primary contact and expected close date are set through the API.
