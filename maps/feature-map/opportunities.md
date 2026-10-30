---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":20}
---

# Opportunities and the sales pipeline

Deals a customer may buy. Each opportunity sits in one stage of the `sales` pipeline (new, qualified, proposal, negotiation, won, lost), carries an optional amount and next action, and is changed with a version check so two people cannot overwrite each other silently.

Implementation: [opportunities](../../ui/src/pages/crm/Opportunities.tsx), [create dialog](../../ui/src/components/crm/OpportunityCreateDialog.tsx), [customer opportunities tab](../../ui/src/components/crm/CustomerOpportunitiesTab.tsx), [board](../../ui/src/components/crm/OpportunityBoard.tsx).
Agent access: [companion](../agent-access-map/opportunities.md).

## Sub-features

- `create`: a new opportunity for a customer with title, stage, optional amount and currency, optional next action. A retry key keeps repeated submits from creating duplicates.
- `edit`: edit title, customer, amount, currency, responsible person/agent, probability, expected close and dated next action with the loaded version.
- `follow-up`: record notes, calls, meetings and outcomes, create dated commitments and resolve existing commitments from the detail sheet.
- `pipeline`: the board groups opportunities by stage; the list view shows the same records as a table.
- `stage-change`: moving an opportunity to another stage is an external action. A board user applies it immediately; an agent may only get a pending action, which leaves the stage unchanged until approved.
- `close`: mark an opportunity won or lost with a reason.
- `next-action`: set the next action text and its date.
- `customer-tab`: the opportunities of one customer, with a create action that preselects that customer.

## How to get to it (user POV)

### `pipeline-board`

Open `/sales` to land on `/sales/opportunities` in Board view. Empty boards retain all stages and creation controls. Choose Board or List, search or filter by owner/status. Load more follows the server cursor; counts and currency-separated stage totals are explicitly partial while more pages exist. Drag or move a card to another stage; moving to Lost asks for a reason. Pending approval remains visible.

### `create-opportunity`

Choose New opportunity globally or within an open stage. Search and page through customers, or create one inside the picker. Enter amount, currency, probability, expected close, responsible person/agent and dated next action. Creation opens the new detail; Edit saves against the version loaded when the form opened. The customer tab preselects its customer and links each opportunity to this same detail.

### `opportunity-detail`

Open `/sales/opportunities?opportunityId={id}` directly, including a record outside the loaded board page. Edit its fields, record activity, add/resolve commitments, change stage, or create a structured proposal. Related proposals link to their detail; proposal detail links back to this opportunity and its customer.

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
7. Edit probability, expected close and follow-up date, reload, and verify the forecast includes the persisted fields. Add a note and a dated commitment, then resolve it.
8. Create a proposal from the opportunity, edit item quantities/descriptions, save and send via link; inspect revision history and navigate back to the same opportunity.

Targeted evidence: [opportunities service](../../server/src/services/crm/opportunities.test.ts), [crm agent tools](../../server/src/services/crm/crm-tools.test.ts), [external action gate](../../server/src/services/external-action-gate.test.ts), [create dialog](../../ui/src/components/crm/OpportunityCreateDialog.test.tsx).

## Gotchas

- The sales pipeline does not enforce transitions unless transitions are configured; any stage is reachable.
- The retry key for creation is generated when the dialog opens. A new dialog starts a new opportunity by design.
- A pending agent stage change is not a stage change. Check the action, not the card, before reporting success.
- Primary contact is retained but is still selected through the API; owner, forecast fields and follow-up date are editable on the board.
