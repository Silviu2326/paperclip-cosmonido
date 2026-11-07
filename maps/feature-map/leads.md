---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":40}
---

# Leads intake and qualification

Inbound interest before it becomes a customer. Leads come from a public form, a CSV import, a channel, the API or by hand. Each lead is triaged, then converted into a customer, contact and optionally an opportunity, or discarded with a reason.

Implementation: [leads](../../ui/src/pages/crm/Leads.tsx), [lead detail](../../ui/src/pages/crm/LeadDetail.tsx), [CSV import](../../ui/src/components/crm/LeadImportDialog.tsx).
Agent access: [companion](../agent-access-map/leads.md).

## Sub-features

- `intake`: a lead is created from a public form submission, a previewed and then confirmed CSV import, a channel message, the API or a manual entry. Source and source reference together identify the origin.
- `triage`: set priority and language.
- `edit`: edit contact details, priority, language and the human or agent responsible; retain additional source payload fields.
- `convert`: create or link a customer and contact, optionally open an opportunity; repeated conversions with the same key return the same result.
- `discard`: mark a lead discarded with an optional reason.
- `activity`: the activity log of a lead.

## How to get to it (user POV)

### `lead-list`

Open `/sales/leads`. Choose New lead for manual intake, or Import for the previewed CSV flow. Filter by status, source, priority or a named responsible person/agent. Contact details and responsible names appear in the table. Select loaded rows to assign/unassign, triage eligible leads, or discard them with a reason; failed rows remain selected for retry. Loaded results can be sorted locally, and the page reports when more records remain beyond the loaded pages.

### `lead-detail`

Open `/sales/leads/:leadId`. Edit contact details and assignment, record an activity, triage or discard. Create opportunity from lead uses the same dialog from list and detail, always creates the opportunity and opens its linked detail. The API retains its optional-opportunity conversion contract. The converted opportunity inherits the lead's responsible person or agent.

### `public-form`

A visitor submits the form published for the company at `/api/p/:companySlug/form/:formSlug`. The submission creates a lead; it does not create a customer.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company, a published form from `/sales/forms`, a CSV file with two new rows and one duplicate source reference.

1. Import the CSV: verify the preview lists three rows, and after confirming, two leads are created and the duplicate reports as skipped.
2. Submit the public form twice with the same visitor data; verify one lead per source reference.
3. Triage a lead to high priority and language `es`; reload and verify both persist.
4. Convert with Create opportunity and a title; verify customer, contact and opportunity exist and the lead shows converted.
5. Convert again with the same key; verify no second customer.
6. Discard another lead with a reason and verify it leaves the open list.
7. Create a manual lead, edit email and responsible agent, convert it, and verify the specific opportunity opens with that agent. Add forecast and follow-up dates, then create its proposal.

Targeted evidence: [leads service](../../server/src/services/leads/leads.test.ts), [CSV import](../../server/src/services/leads/csv-import.test.ts), [lead routes](../../server/src/__tests__/leads-routes.test.ts), [public form](../../server/src/routes/public/leads.test.ts).

## Gotchas

- Lead forms are created and published from `/sales/forms`.
- A conversion creates records but does not send anything to the visitor.
- A lead's conversation is shown on its detail page through the lead's conversation link and its contact; the conversations list cannot be filtered by lead id.
- Triage of a converted or discarded lead returns 409; the detail page hides the forms once the lead is closed.
