# Product notifications and PWA

Date: 2026-10-22

## Contract

- Notification scope and browser/Web Push opt-in are stored per board user and company. Endpoints require board identity and company access. The inbox only includes unexpired open decisions, pending deliverable reviews assigned to the user or board, and visible open tasks assigned to that exact user.
- The inbox is a read-only projection of canonical S1–S3 records. Its links open the relevant decision queue, task, or assignment; opening a notice never approves, resolves, or changes a record.
- The UI consumes the existing company live-event provider and invalidates the projection on activity and run-status events. It does not create a second event stream or use a local timer for delivery.
- The PWA service worker keeps the existing cache boundary: only hashed static build assets are cacheable; `/api`, private responses, tokens, push subscriptions, and authenticated HTML are never cached. Browser notices are generic (no task/customer text) and require explicit per-user/company opt-in and browser permission. Their tags dedupe by category, source identity, and source revision, and foreground notices are invalidated when the active account/company changes.
- Remote Web Push is implemented through the standard `web-push` 3.x library. It remains blocked until `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT` are configured. Complete browser subscription material is encrypted through the existing `localEncryptedProvider`; only the endpoint hash/host and encrypted material are persisted. Endpoint URLs must be HTTPS, port 443, and match the allowlist in the service. Payloads are limited to one KiB, contain only a category, an opaque dedupe tag, and a company-prefixed same-origin path, and are sent with an 8-second library timeout and five-minute TTL. The Service Worker renders generic text and never stores push payloads or API data.
- Durable activity signals and delivery outbox rows dedupe by company/activity and by subscription/source/revision. The signal helper `enqueueProductNotificationActivitySignal` takes the caller's DB transaction and performs no network call; the root integrator should invoke it from `persistActivity` immediately after the activity insert. The bounded `drainSignals` and `deliverOutbox` methods must be mounted on a server scheduler by the root integrator. Delivery rechecks company membership, category consent, preference, subscription state, and expiration. Retryable failures are capped at five attempts; 404/410 revokes the subscription. Network calls occur outside DB transactions.
- WhatsApp remains blocked until an already-authorized channel and consent gate are connected. No browser timer, custom cryptography, fabricated consent, or fake sender is used.

## SQL fragment

See `2026-10-22-s80-notificaciones.sql`. The repository integrator owns schema export and migration registration.

## Integration and limits

The inbox is derived from current canonical states, not a durable read/dismiss history. Browser notifications require the application to be open and connected to company live events. Remote delivery requires root-owned schema exports/migration, API route registration and a scheduler invoking both workers. No VAPID credentials were configured and no remote push was sent during implementation. The notification page is mobile responsive and groups attention into decisions, reviews, and assigned tasks.

## Standards and implementation reference

- [`web-push` library API](https://github.com/web-push-libs/web-push/blob/master/README.md): `sendNotification`, VAPID configuration, timeout, TTL, and delivery response/status semantics.
- [MDN `PushManager.subscribe()`](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe): secure context, `userVisibleOnly`, application server key, and user-gesture subscription.
