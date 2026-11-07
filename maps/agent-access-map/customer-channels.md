# Customer messaging channels - agent access

Product map: [customer-channels](../feature-map/customer-channels.md).

## `accounts`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/customer-channels; POST /api/companies/{companyId}/customer-channels; PATCH /api/customer-channels/{id}; DELETE /api/customer-channels/{id}; POST /api/customer-channels/{id}/test.

Agent access: `restricted` - account management is board-only (assertBoard); an agent cannot connect, edit, test or remove a provider account.

Policy: board identity required for mutations and tests; the stored record keeps secret names only, never values. The conversation setup reuses these routes and the existing company-secret picker without granting new agent authority.

Evidence: `source-only` - [routes](../../server/src/routes/customer-channels.ts), [accounts service](../../server/src/services/customer-channels/accounts.ts).

Verification: `not-run` - as an agent, attempt to create an account and confirm 403; as a board user, create and test an account.

Gaps: the page does not offer removal; the API route exists.

## `inbound`

Review: `baseline`.

API: `present` - GET /api/webhooks/meta/{companyId} (verification challenge); POST /api/webhooks/meta/{companyId}; POST /api/webhooks/twilio/{companyId}; POST /api/webhooks/telegram/{companyId}.

Agent access: `not-applicable` - provider callbacks authenticated by signature; no agent actor is involved.

Policy: the signature is checked over raw bytes before any field is used; failures return 401 without detail. Twilio signs the URL built from the request host.

Evidence: `source-only` - [routes](../../server/src/routes/channels-inbound.ts), [channel tests](../../server/src/services/conversations/transports/channels.test.ts).

Verification: `not-run` - post a validly signed fixture and confirm one message; post an invalid signature and confirm 401.

Gaps: the inbox displays webhook URLs and provider setup instructions; applying that configuration at the provider remains manual.

## `outbound`

Review: `baseline`.

API: `present` - POST /api/messages/{id}/send (shared with conversations).

Agent access: `restricted` - the agent sends through message_send and message_reply like any conversation, subject to its `channels:message` grant and optional per-agent channel allowlist.

Policy: `gateExternalAction` with actionType `message` or `email` still controls autonomy. When `agents.metadata.profile.messageChannels` is present, the requested conversation channel must be in that allowlist before an action is staged and again immediately before delivery, including approved-action retries. Missing allowlist preserves legacy unrestricted channel behavior. A Messenger or Instagram reply outside the 24-hour window is refused before any call.

Evidence: `source-only` - [message service](../../server/src/services/conversations/messages.ts), [capability policy](../../server/src/services/agent-capabilities.ts), [transports](../../server/src/services/conversations/transports/meta.ts), [register](../../server/src/services/conversations/transports/register.ts).

Verification: `not-run` - allow an agent to use email but not WhatsApp; confirm email reaches the existing autonomy gate and WhatsApp is rejected before an external action is staged. Then revoke WhatsApp after approval and confirm execution/retry is rejected. Also reply outside the Messenger/Instagram window and confirm a refusal with a reason.

Gaps: only the first approved WhatsApp template is used, without variables. Channel access is selected from Paperclip's supported conversation channel types; an active provider transport/account is still required to deliver a message.

## `delivery`

Review: `baseline`.

API: `present` - provider status callbacks through POST /api/webhooks/meta/{companyId}, POST /api/webhooks/twilio/{companyId} and POST /api/webhooks/telegram/{companyId}.

Agent access: `not-applicable` - status callbacks are provider-signed; agents observe the resulting delivery state through conversation_get.

Policy: an uncertain send is never resent automatically; a board user resolves it through the reconcile route.

Evidence: `source-only` - [delivery status](../../server/src/services/conversations/transports/delivery-status.ts).

Verification: `not-run` - replay a delivered callback and confirm one state change.

Gaps: Messenger and Instagram read events are not mapped.
