# Website chat - agent access

Product map: [webchat](../feature-map/webchat.md).

## `settings`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/webchat/settings; PUT /api/companies/{companyId}/webchat/settings.

Agent access: `restricted` - settings are board-only (assertBoard); an agent cannot enable the widget or change its greeting or color.

Policy: board identity; company-scoped; the change is written to activity.

Evidence: `source-only` - [routes](../../server/src/routes/webchat.ts), [settings service](../../server/src/services/conversations/webchat-settings.ts).

Verification: `not-run` - as an agent attempt a PUT and confirm 403; as a board user change the greeting and read it back.

Gaps: none beyond the shared gaps of the widget.

## `widget`

Review: `baseline`.

API: `present` - GET /api/p/{companySlug}/widget.js; GET /api/p/{companySlug}/chat/config; GET /api/p/{companySlug}/chat/logo.

Agent access: `not-applicable` - public visitor assets; no agent actor.

Policy: served only while the chat is active; the logo is served only for PNG, JPEG, WebP and GIF.

Evidence: `source-only` - [public chat routes](../../server/src/routes/public/chat.ts), [widget](../../server/src/public/widget.js).

Verification: `not-run` - load the script on a test page of another origin and confirm the launcher renders.

Gaps: the widget was not checked in a real browser.

## `session`

Review: `baseline`.

API: `present` - POST /api/p/{companySlug}/chat/session.

Agent access: `not-applicable` - anonymous visitor session; agents do not start sessions.

Policy: a signed token valid for 24 hours; rate-limited at 20 per minute per IP.

Evidence: `source-only` - [public chat routes](../../server/src/routes/public/chat.ts), [tests](../../server/src/routes/public/chat.test.ts).

Verification: `not-run` - start 21 sessions from one IP and confirm the 21st is limited.

Gaps: tokens are not revocable before expiry.

## `identify`

Review: `baseline`.

API: `present` - POST /api/p/{companySlug}/chat/{sessionId}/identify.

Agent access: `not-applicable` - visitor action.

Policy: always answers 200 `{ ok: true }` so it does not reveal whether a lead existed; creates one lead and one contact.

Evidence: `source-only` - [public chat routes](../../server/src/routes/public/chat.ts), [tests](../../server/src/routes/public/chat.test.ts).

Verification: `not-run` - identify twice with the same email and confirm one lead and one contact.

Gaps: none recorded.

## `messages`

Review: `baseline`.

API: `present` - POST /api/p/{companySlug}/chat/{sessionId}/messages; GET /api/p/{companySlug}/chat/{sessionId}/messages?after=.

Agent access: `not-applicable` - visitor messages; agent replies arrive through the conversation send path (see `send` in the conversations companion).

Policy: 30 messages per minute per session; a client sequence number makes retries idempotent; the body limit is checked after parsing.

Evidence: `source-only` - [public chat routes](../../server/src/routes/public/chat.ts), [tests](../../server/src/routes/public/chat.test.ts).

Verification: `not-run` - resend sequence 1 and confirm 200 with no second message.

Gaps: the 4 KB body limit runs after the global parser reads up to 10 MB.

## `handoff`

Review: `baseline`.

API: `present` - POST /api/conversations/{conversationId}/webchat-handoff.

Agent access: `available` - webchat_handoff dispatches to this route through the native runner.

Policy: assertCompanyAccess; records conversation.webchat_handoff and the state change.

Evidence: `source-only` - [routes](../../server/src/routes/webchat.ts), [tools](../../server/src/services/conversations/webchat-tools.ts).

Verification: `not-run` - request a handoff as an agent and confirm the conversation state and activity.

Gaps: none recorded.
