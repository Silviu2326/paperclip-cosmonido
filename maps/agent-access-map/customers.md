# Customers, contacts and identity - agent access

Product map: [customers](../feature-map/customers.md).

## `customers`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/customers; POST /api/companies/{companyId}/customers; GET /api/customers/{id}; PATCH /api/customers/{id}; GET /api/customers/{id}/contacts; POST /api/customers/{id}/contacts; DELETE /api/customers/{id}/contacts/{contactId}. Customer table actions reuse the existing issue-creation dialog and CRM detail link; they add no API permission.

Agent access: `available` - crm_search, crm_get_customer and crm_create_customer dispatch through the native runner (services/sprint2-tools.ts) to these routes with the run's token. Archive and status edits use the same routes and are not separate tools.

Policy: assertCompanyAccess on every route; an agent key cannot read or write another company. Create responds with a duplicate conflict unless the caller forces it. Mutations write activity.

POST and PATCH also accept optional `contactName`, `contactEmail`, `phone`, `address`, `city`, `postalCode`, `country`, `legalName`, `taxId` and `notes`. GET returns saved values. These are customer profile data; they do not create a contact identity or grant permission to message anyone. Omitted PATCH properties are preserved; null clears a value.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts), [service](../../server/src/services/crm/customers.ts), [agent tools](../../server/src/services/sprint2-tools.ts).

Verification: `not-run` - follow the customers journey with a permitted agent; assert a cross-company customer id is denied and a duplicate create returns the conflict.

Gaps: the agent tool registry admits these names, but a live run has not been used to prove admission; catalog declarations are not evidence.

## `contacts`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/contacts (includes linked customer id/name summaries per person); POST /api/companies/{companyId}/contacts; GET /api/contacts/{id}; GET /api/contacts/{id}/customers; PATCH /api/contacts/{id}. People table actions reuse existing CRM edit/link APIs and the issue-creation dialog; they add no API permission.

Agent access: `available` - crm_create_contact creates a contact through the contact route; listing and editing contacts use REST with the agent's company-scoped key.

Policy: assertCompanyAccess on each route; consents are stored as given and are not a grant for any outbound action.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts), [service](../../server/src/services/crm/contacts.ts).

Verification: `not-run` - create a contact with an agent and confirm it cannot update a contact of another company.

Gaps: no dedicated agent tool for contact update; REST is the only path for that operation.

## `identity`

Review: `baseline`.

API: `not-applicable` - identifier resolution runs inside inbound transports and lead intake; it has no route of its own. Its public effects are visible through the contact and conversation routes.

Agent access: `not-applicable` - no agent entry point; agents receive resolved contacts through the routes above.

Policy: identifiers are normalized before the unique (company, channel, identifier) lookup; the lookup is company-scoped.

Evidence: `source-only` - [service](../../server/src/services/crm/identity.ts), [tests](../../server/src/services/crm/identity.test.ts).

Verification: `not-run` - post an inbound fixture for a known identifier and confirm the existing contact is reused.

Gaps: none for the enumerated normalization rules; phone formats beyond E.164 are not covered by a live test.

## `duplicates`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/crm/duplicates?name=...&domain=...&contactEmail=...

Agent access: `partial` - the create tools call the same create routes, so a duplicate conflict reaches the agent. Whether crm_create_customer exposes the forced-create flag was not verified.

Policy: company-scoped candidate lookup; candidates list only records the caller may read.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts).

Verification: `not-run` - request candidates for a name that exists and confirm the candidate list is company-scoped.

Gaps: forced create by an agent is unverified; the duplicate check is advisory and never merges.
