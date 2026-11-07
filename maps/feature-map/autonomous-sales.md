---
navigation: {"section":"Projects and execution","sectionOrder":40,"order":16}
---

# Autonomous sales and delivery (Sprint 3)

Implementation: [playbooks](../../ui/src/pages/Playbooks.tsx), [autonomy](../../ui/src/pages/Autonomy.tsx), [proposals](../../ui/src/pages/Proposals.tsx), [service agreements](../../ui/src/pages/ServiceAgreements.tsx), [commercial decisions](../../ui/src/components/CommercialDecisionsSection.tsx), [explain panel](../../ui/src/components/WhyDidTheAgentDoThis.tsx), [daily brief](../../ui/src/components/DailyBriefPreferences.tsx).
Agent access: [companion](../agent-access-map/autonomous-sales.md).

## Sub-features

- `playbooks`: versioned commercial sequences executed over routines; a run pins its version and only the current step can be advanced.
- `autonomy`: granted autonomy per agent and action type with shadow statistics, a replay bench and immediate revocation.
- `commercial-decisions`: human decisions with a declared subject version and effect, resolvable from a one-time remote link.
- `proposals`: immutable sent revisions, public acceptance with evidence and an optional Stripe deposit link.
- `handoff`: idempotent sale → delivery transfer creating project, assignment, team and brief with a resumable receipt.
- `agreements`: recurring service agreements with one assignment per period and renewal proposals.
- `qualification`: lead qualification against a criteria context document plus paid enrichment.
- `explain`: read-only "why did the agent do this" composition from runs, context reads, tool calls, autonomy and decisions.
- `daily-brief`: per-user daily owner brief with hour, timezone and channel preferences.

## How to get to it (user POV)

Open `/playbooks` to create a draft, edit its steps and publish it; `/playbooks/:id` shows recent runs. Open `/autonomy` for the agent × action matrix, run the bench, raise when the bench passed and revoke with a reason. Open `/sales/proposals` to search and page through proposals, create a draft for a customer or opportunity, then `/sales/proposals/:id` to edit structured line items, send, inspect revisions, acceptance evidence and payment. Sent revisions remain immutable. Opportunities also offer New proposal and link to their proposals. The public page is `/api/public/proposals/:token/view`. Open `/service-agreements` for periods and renewals. Inicio shows "Necesita tu decisión (comercial)". The proposal detail page carries the "Por qué hizo esto" panel. Personal preferences hold the daily brief card.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company with one active agent, embedded PGlite, Stripe in test mode or no key (payment link then reports unavailable).

1. Create and publish a playbook, start a run with an agent, advance with a stale `expectedStepIndex` and verify 409; publish version 2 and verify the run stays pinned to version 1.
2. Grant autonomy above `draft_only` without a valid bench and verify 409. The current mount has no replay/judge adapters, so requesting a bench must return actionable 422 without creating a run. After real adapters are wired, use at least 20 cases and a non-heuristic judge before raising; revoke and verify pending playbook triggers are disabled. This updated recipe has not been run.
3. Create a proposal, send it, revise it (revision 2), accept revision 1 publicly and verify 409; accept revision 2 and inspect the stored evidence.
4. Hand off the accepted proposal twice and verify one project and one assignment; inject a failing brief step and retry.
5. Resolve a commercial decision twice and verify a single effect application; use an expired remote token and verify 410.
6. Preview the daily brief and tick the scheduler at the configured hour; verify a single send per day.

Targeted evidence: [playbooks](../../server/src/__tests__/playbooks-services.integration.test.ts), [autonomy](../../server/src/__tests__/autonomy-services.integration.test.ts), [bench](../../server/src/__tests__/autonomy-bench.test.ts), [decisions](../../server/src/__tests__/commercial-decisions.integration.test.ts), [proposals](../../server/src/__tests__/proposals.integration.test.ts), [handoff](../../server/src/__tests__/handoff.integration.test.ts), [agreements](../../server/src/__tests__/service-agreements.integration.test.ts), [qualification](../../server/src/__tests__/lead-qualification.integration.test.ts), [explain](../../server/src/__tests__/agent-explain.integration.test.ts), [daily brief](../../server/src/__tests__/daily-brief.test.ts).

## Gotchas

- The Sprint 2 tables (leads, opportunities, conversations, commitments, customers) exist in the integrated branch, but sprint 3 tables store their ids without foreign keys; each subject still needs its own company check, and the companion records what is verified.
- An unconfigured bench returns 422 before creating a run; it cannot echo the reference to produce a passing score. Autonomy promotion rejects heuristic/unnamed judges and fewer than 20 cases. The current server mount still lacks real replay and judge adapters (source-only, not run).
- Commercial decisions can only originate from an agent run bound to an issue, because `decisions` requires an origin run.
- Acceptance and payment of a proposal are separate facts; a paid deposit never implies acceptance.
