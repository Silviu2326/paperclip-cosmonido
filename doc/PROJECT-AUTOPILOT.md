# Project autonomy

Project → **Autonomía** connects a product objective to persistent discovery,
implementation, independent review and deployment-verification tasks. Existing
project repository workspaces, GitHub authorization, agent adapters, budgets,
completion controls and app tool policies remain authoritative.

## Setup

1. Apply migration `0355_luxuriant_alex_power.sql` through the normal migrator.
2. Create a project and attach its GitHub repositories, either in the existing
   repository picker or the Autonomía tab. Managed execution prepares the selected
   repositories on its execution host; this is not the browser's filesystem.
3. Configure a planner, a builder and a different reviewer. An optional fallback
   agent can receive new planning/building tasks; it cannot be the reviewer.
4. Set an objective, product context, automatic risk threshold, capacity reserve,
   interval, daily cycle limit and bounded correction attempts.
5. Connect authorized GitHub/Vercel/Railway tools through Apps and install them
   for the relevant agents. Configure exact deployment project, repository,
   environment and optional service/health URL. Enabling autonomy starts discovery
   on the next scheduler sweep; manual selection waits for the operator.

## Visible and durable behavior

- Discovery submits exactly three options: essential, balanced, ambitious.
  Each includes observations, assumptions, expected benefit, effort, risk,
  affected repositories, steps and acceptance criteria. Financial benefits
  require evidence; the system must not invent customer or revenue numbers.
- Automatic selection uses the recommendation only within the authorized risk
  threshold. High-risk plans always wait for explicit selection.
- Work is ordinary task-backed execution. Each stage has a task and an assigned
  agent. Result submissions are bound to the authenticated run and assignment.
- A report alone never advances work. The task must complete, the provider run
  must stop and native workspace finalization must finish before handoff.
- Builders record commit SHAs for every affected repository when push is enabled.
  The assignment authorizes feature-branch pushes, not force pushes or default
  branch writes. Existing tool policies enforce actual external authority.
- Review is performed by a separately configured agent. Corrections return to
  implementation up to the configured limit. Missing reports and unresolved
  blockers stay visible instead of being treated as success.
- Deployment verification is an agent observation through the authorized provider
  tools. A passing report requires the exact configured provider/project/service/
  environment, the implementation's full commit SHA, ready status and a passed
  health check for every configured target. Reports retain agent and run provenance;
  they are not independent server-side provider attestations.
- Plans, recent reports, feedback and the last 100 state transitions appear in
  the project. Tasks keep their full ordinary histories. Up to 30 reports and
  feedback entries are retained in the project summary; no unbounded JSON history.
- Pause stops new admissions. A current task may finish and submit its result;
  Stop remains the task's existing execution control. Company/project pauses,
  archived projects, budgets and connection approvals are never bypassed.

## Capacity and resumption

Managed AI bindings are read from the agent's `runtimeConfig.aiConnection`.
Quota observation selects that exact authorized account, not another account
of the same provider. All blocking windows and the configured reserve count;
when several windows are exhausted, resumption waits for the latest reset.
Unmodified local Codex/Claude CLI identities can also be observed in local-trusted mode, with bounded cached probes; remote environments, project credential overlays and modified CLI identities are never substituted with host quota. Unknown quota stays explicitly unknown and cannot guarantee a reserve. Existing
heartbeat quota recovery retains an already admitted task; a fallback agent is
only selected for a new task, never by transplanting a live provider session.
Existing AI connection pools remain available for supported account routing.

The scheduler sweeps every 30 seconds, examines at most 20 due projects, and
limits preparation concurrency to two. Per-project database locks, revisions,
task idempotency keys and persisted due dates prevent duplicate cycle admission.
Wakeup failure leaves the task attached and retries its ordinary assignment wake;
restarting the server preserves all admitted work. Daily cycle limits use UTC.

## API

All paths start with `/api/projects/:projectId/autopilot` and enforce company and
project access. UUID project IDs are used.

| Method/path | Actor | Purpose |
| --- | --- | --- |
| GET `/` | Project reader | Read configuration, plans, progress and evidence |
| PUT `/` | Board with `tasks:assign` | Save `{config, expectedRevision}` |
| POST `/discover` | Board with `tasks:assign` | Request a fresh analysis |
| POST `/select` | Board with `tasks:assign` | Select `{planId}` |
| POST `/feedback` | Board with `tasks:assign` | Save `{text}` for future tasks |
| POST `/plans` | Current assigned agent run | Submit the three discovery options |
| POST `/reports` | Current assigned agent run | Submit stage outcome and evidence |

Schemas are shared between OpenAPI, the server and the UI. Native agents use
`search_api`/`call_api`; CLI agents can use their injected run API bridge. No
credentials belong in project context, plan text or result payloads.

## Qualification boundaries

- Vercel's existing catalog entry is marked unavailable because it requires
  provider client approval. The UI displays that restriction. Configuring a target
  does not create or authorize a provider connection. Existing authorized/generic
  connections still use normal gateway policy; no vendor restriction is removed.
- Railway's existing connection still requires its account-bound authorization
  and live qualification. Provider availability cannot be proved by fixture tests.
- Configuring production intent is part of the agent assignment, not an extra
  enforcement layer over external tools. Configure actual allowed actions and
  resource/environment filters in Apps.
- No paid AI API, login, repository push, provider deployment or real customer
  data operation is performed merely by installing this code. The configured
  agents and connections are required for an end-to-end autonomous live cycle.
- The project summary represents recorded agent reports. Browser acceptance,
  provider commit verification and tests are performed by the assigned agents;
  structural validation cannot establish that a dishonest report is truthful.

## Verification

`packages/shared/src/autopilot.test.ts` tests quota/reset boundaries and strict
deployment/plan contracts. `server/src/__tests__/project-autopilot.test.ts` uses
real PostgreSQL to test concurrent admission, persisted restart state, completion
handoff, high-risk selection, company/repository boundaries and pause semantics.
`ui/src/components/ProjectAutopilotPanel.test.tsx` tests selection, active-task
controls and pause messaging. A disposable database may be supplied through
`PAPERCLIP_AUTOPILOT_TEST_DATABASE_URL`; never point it at a production database.

## Implementation validation

The focused validation passed 51 tests: 12 PostgreSQL workflow/authorization
tests, 22 quota and assignment tests, 11 shared contract tests, three interface
interaction tests, two OpenAPI/route-coverage tests and one migration drift test.
The migration drift check used a 30-second timeout after the default five-second
budget expired on this host. UI type checking and a production UI build passed.
Module boundaries, migration safety/numbering and the runtime push gate passed.
An isolated semantic check of the new backend sources also passed; it does not
replace the full server check.

Full server type checking exceeded the available memory. The normal server
build/typecheck preflight also requires Cargo, which is not installed here.
The full repository token gate has 109 pre-existing violations outside the new
autonomy panel. The cloud browser could not reach the local UI review server;
interface interactions were checked in jsdom, without a live browser screenshot.
No live provider deployment or credentialed autonomous cycle was performed.
