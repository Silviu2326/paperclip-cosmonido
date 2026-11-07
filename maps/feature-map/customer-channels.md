---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":60}
---

# Customer messaging channels

Connected accounts that receive and send customer messages on WhatsApp, Messenger, Instagram, Telegram and SMS. Each account is stored with the names of its secrets, never their values. Inbound messages from the provider arrive on signed webhooks and join the customer inbox; outbound replies go through the same send path and gate as every other conversation.

Implementation: [channel settings](../../ui/src/pages/ChannelsSettings.tsx), [channel API client](../../ui/src/api/channels.ts), [inbound webhooks](../../server/src/routes/channels-inbound.ts).
Agent access: [companion](../agent-access-map/customer-channels.md).

## Sub-features

- `accounts`: connect a provider account, record its identifiers and secret names, and test the connection.
- `inbound`: a signed webhook from the provider creates or appends to a conversation for the matching account. A failed signature is refused.
- `outbound`: a reply goes to the provider transport registered at startup. Agent profiles can restrict outbound replies to selected conversation channel types; the server checks the allowlist before staging and again before delivery. Messenger and Instagram replies outside the 24-hour window are refused; WhatsApp may use an approved template.
- `delivery`: provider status callbacks update delivery state. An uncertain send is never resent automatically.

## How to get to it (user POV)

### `channel-settings`

Open `/apps/channels`, or choose a channel in `/conversations` to configure it inside the inbox. Choose existing company secrets or create them from the shared secret picker; account records still store only their names. Add an account, check its status, and run Test connection. The inbox also shows the provider callback URL and setup instructions. A passing credential probe does not prove inbound delivery. Removal of an account is served by the API; the page does not offer it yet.

### `provider-webhook`

Configure the provider to call `/api/webhooks/meta/:companyId`, `/api/webhooks/twilio/:companyId` or `/api/webhooks/telegram/:companyId`. Setup steps are provider-side and are not performed by Paperclip.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company, a test account per provider or signed fixture payloads, and secrets stored under the names the account references. Live provider sends are not part of the default run.

1. Create an account and run Test connection; verify the recorded test result and time.
2. Post a signed inbound fixture for the account; verify one conversation and one inbound message.
3. Post the same fixture with a wrong signature; verify 401 and no message.
4. Send a reply on a Messenger conversation older than 24 hours; verify it is refused with a clear reason.
5. Replay a delivery status callback; verify the delivery state changes once.
6. Configure an agent to send only on email; verify its WhatsApp send is denied while a permitted email send still follows the configured autonomy level. Revoke a channel after an action is approved and verify the send/retry is denied.

Targeted evidence: [channel transports](../../server/src/services/conversations/transports/channels.test.ts), [conversation sends](../../server/src/services/conversations/messages.ts).

## Gotchas

- Signature failures return 401 without detail on every provider, including Meta's verification challenge.
- Behind a proxy, Twilio signatures need the trust-proxy setting or they will not match.
- Read receipts for Messenger and Instagram are not mapped; their watermark does not name a message.
- Two active accounts of the same provider type: outbound uses the older one.
