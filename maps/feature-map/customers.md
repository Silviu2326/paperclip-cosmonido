---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":10}
---

# Customers, contacts and identity

People and organizations the company serves. A customer groups contacts, opportunities, conversations and memory; a contact is one person reachable through one or more identities (email, phone, chat handle). Creating a record first checks for likely duplicates; nothing is merged automatically.

Implementation: [customers](../../ui/src/pages/crm/Customers.tsx), [customer detail](../../ui/src/pages/crm/CustomerDetail.tsx), [contacts](../../ui/src/pages/crm/Contacts.tsx), [duplicate notice](../../ui/src/components/crm/CustomerDuplicateNotice.tsx).
Agent access: [companion](../agent-access-map/customers.md).

## Sub-features

- `customers`: create an organization or person, edit it, archive and restore it; health and tags are kept on the record.
- `contacts`: create and edit contacts with language, preferred channel and per-channel consents; link contacts to a customer with a role and a primary flag.
- `identity`: an inbound email, phone or chat identifier resolves to one contact. Identifiers are normalized (lowercase emails, E.164 phones) and unique per company and channel.
- `duplicates`: a create request that matches an existing customer or contact by name, domain or contact email returns a conflict listing the candidates; the user may create anyway.

## How to get to it (user POV)

### `customer-list`

Open `/customers` from the Business group. Summary cards show active customers, those needing attention, open proposals and running services (the services card opens a popup listing them). Search by name or domain, filter by All, Attention, New or Archived, sort the table by name, health or date, or switch to cards, then choose New customer. Each row has a New proposal button and an Open button; archived rows have Restore. A possible duplicate shows a notice with the matching records; choose Create anyway only when the match is a different entity.

### `customer-detail`

Open `/customers/:customerId`. Summary, Contacts, Opportunities, Activity, Conversations and Memory are tabs. Archive or restore the customer from the header. Contacts are linked or unlinked in the Contacts tab.

### `contact-list`

Open the People tab next to Customers (`/customers/contacts`) to list and create contacts as a table. Link them to a customer from the customer's Contacts tab. The services page (`/customers/services`) no longer has its own tab; it opens from the services card or its popup.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company on an isolated embedded database, one agent, two customers that share a domain.

1. Create a customer whose domain matches an existing one; verify the duplicate notice lists the existing customer and that nothing is created until Create anyway is chosen.
2. Create a contact, link it to a customer with the primary flag, reload and verify the link and the primary badge persist.
3. Submit the same customer creation twice through the API with the same retry data; verify the duplicate conflict rather than a second record.
4. Archive a customer, confirm it leaves the default list, restore it, and verify the status survives reload.
5. Post an inbound identifier for an existing contact and verify it resolves to that contact rather than creating a second one.

Targeted evidence: [customers](../../server/src/services/crm/customers.test.ts), [contacts](../../server/src/services/crm/contacts.test.ts), [identity](../../server/src/services/crm/identity.test.ts).

## Gotchas

- A duplicate candidate is advice, not a merge. Two customers with the same domain can be legitimate.
- Archived customers are hidden from the default list; they are not deleted and their conversations stay linked.
- Consent flags are stored per channel, but the external action gate does not check them before sending.
- The customer list and detail pages are verified in the source; a live click-through of the duplicate flow has not been recorded.
