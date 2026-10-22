# Activity timeline and commitments - agent access

Product map: [activities](../feature-map/activities.md).

## `timeline`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/crm/activities?subjectKind=&subjectId=&cursor=&limit=.

Agent access: `partial` - no dedicated read tool; REST reads are company-scoped and reachable with the agent key, but the native API catalog does not list the route.

Policy: subjectKind and subjectId are required; company-scoped.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts), [service](../../server/src/services/crm/activities.ts).

Verification: `not-run` - read a subject's timeline as an agent and confirm a subject of another company is denied.

Gaps: a read tool for timelines is absent.

## `log`

Review: `baseline`.

API: `present` - POST /api/companies/{companyId}/crm/activities.

Agent access: `available` - crm_log_activity dispatches to this route.

Policy: assertCompanyAccess; the actor is recorded as the run's agent.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts).

Verification: `not-run` - log an activity as an agent and confirm the actor attribution in the timeline.

Gaps: none beyond the gaps of `timeline`.

## `commitments`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/commitments; POST /api/companies/{companyId}/commitments; POST /api/commitments/{id}/resolve.

Agent access: `available` - commitment_create and commitment_resolve dispatch to these routes.

Policy: assertCompanyAccess; resolution records the outcome and resolver.

Evidence: `source-only` - [routes](../../server/src/routes/crm.ts), [service](../../server/src/services/crm/commitments.ts).

Verification: `not-run` - create a commitment as an agent, resolve it as kept, and confirm the resolution is recorded.

Gaps: detected commitments are created by the extraction path, not by this route; that path is covered by the sprint 3 map.
