# S95 public catalog and verified ratings

## Behavior

An authenticated company operator can request publication only from an intact, already-published private package version. The operator chooses individual manifest items and attests to ownership and privacy review. The server revalidates the private package hash, validates the selected manifest with `portablePackageSchema`, runs `findPackagePrivacyIssues`, and pins the selected content and hash in a pending row. An instance administrator approves or rejects that exact hash with a conditional state transition. Public reads expose only approved selected content and anonymous aggregate counts.

Importing creates a new company-private draft and a provenance row that links it to the immutable public listing. It does not request package review, create an installation receipt, hire agents, establish connections, or grant permissions. The existing private catalog and receipt workflow remains the only installation path. A rating requires an authenticated board user, access to the target company, and a completed receipt whose imported private package points to the exact listing and whose receipt hash matches its published content hash. One principal can rate a version once; they can edit a visible rating, while instance administrators can hide or restore ratings. Installation counts come from completed receipts only.

## Security and privacy boundaries

Public APIs return no source company, requester, installer, receipt, or rating-author identifiers. Requester and reviewer identities remain server-side for governance and activity logs. Publication content is selected by the owner, checked by the existing portable-package schema and privacy detector, and reviewed by an instance administrator. Imports preserve exact version provenance. Owner withdrawal prevents future reads and ratings; prior receipts and ratings remain associated with the version for audit and aggregate history. Admin approval and moderation use instance-admin checks, not company membership.

Public listing and rating reads are bounded to 50 entries; catalog pages use an opaque UUID keyset cursor. The server never counts clicks as usage. No provider, connection, hiring, or grant action occurs in this feature.

## Scope limits

This source change adds the service, route factory, shared contracts, schema, API client, and page. Root owns app mounting, schema/shared barrel exports, OpenAPI and map updates, and the consolidated migration/journal. No checks, builds, typechecks, server starts, provider calls, or migration execution were run here, per task constraints.


## Estado posterior de integración

El integrador montó las rutas, páginas, workers y contratos aplicables de esta ficha en el worktree aislado. Las instrucciones anteriores de montaje describen el handoff original. La evidencia ejecutada y los límites finales se registran en [el corte S95](2026-10-22-sprints-95.md); las comprobaciones de fuente no equivalen a verificación de proveedores ni a aceptación de los cuatro sprints.
