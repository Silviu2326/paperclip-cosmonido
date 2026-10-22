---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":70}
---

# Website chat

A chat widget a company embeds on its own site. Visitors start an anonymous session, may identify themselves once, and write to the company inbox; replies appear in the widget only after they are sent. A visitor can ask for a person, which hands the conversation to a board user.

Implementation: [webchat settings](../../ui/src/pages/WebchatSettings.tsx), [webchat API client](../../ui/src/api/webchat.ts), [public chat routes](../../server/src/routes/public/chat.ts), [widget](../../server/src/public/widget.js).
Agent access: [companion](../agent-access-map/webchat.md).

## Sub-features

- `settings`: enable the chat, set the greeting and brand color, and show the embed snippet and logo for the company.
- `widget`: the embeddable script at `/api/p/:companySlug/widget.js`; it renders in a shadow root and does not depend on the host page.
- `session`: an anonymous session token that lasts 24 hours and is rate-limited per session and per IP.
- `identify`: optional name, email and phone; creates one lead and one contact, even when the first message came earlier.
- `messages`: visitor messages are stored once per client sequence number; the widget polls only while open.
- `handoff`: a visitor or an agent asks for a person; the conversation moves to human handling.

## How to get to it (user POV)

### `webchat-settings`

Open `/webchat-settings`. Turn the chat on, write the greeting, choose the color and copy the embed snippet. The snippet points at the current origin.

### `widget-on-site`

On a test page that includes the snippet, the launcher opens a panel. Type a message and identify when asked. Replies sent from the inbox appear there.

### `handoff`

In the widget, choose to speak to a person. The inbox conversation shows the handoff.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company with the chat enabled, a static test page on a different origin than the API, and one agent. The widget has been checked in a headless DOM test only; a real browser pass is still required.

1. Enable the chat and load the snippet on the test page; verify the launcher appears and the panel opens with Escape closing it.
2. Send a message; verify it appears in the inbox once after reload of the widget.
3. Reuse the same sequence number on a retry; verify 200 and no second message.
4. Identify with an email; verify one lead and one contact exist after repeating identify.
5. Reply from the inbox and verify the reply shows in the widget only once it is sent.
6. Request a person and verify the handoff record and the conversation state.

Targeted evidence: [public chat routes](../../server/src/routes/public/chat.test.ts).

## Gotchas

- Message bodies are limited to 4 KB, but the check runs after the global JSON parser reads up to 10 MB; a dedicated small limit in front of the chat routes is still pending.
- The widget was smoke-tested in jsdom only; its appearance in a real browser is unverified.
- Session tokens are not revocable before their 24-hour expiry.
- Replies are sent through the same gate as other conversations; an agent reply may wait for approval.
