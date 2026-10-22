---
name: channel-reply
description: Write a reply inside an existing conversation on any channel, matched to the channel's length and tone, and draft it for approval instead of sending it. Covers email, WhatsApp, Messenger, Instagram, Telegram, and web chat.
key: paperclipai/optional/sales/channel-reply
recommendedForRoles:
  - sdr
  - sales
  - support
  - customer-success
tags:
  - sales
  - support
  - messaging
  - communication
---

# Channel Reply

Write the next reply in a conversation so it reads as written for that channel, answers what the contact asked, and ends with one clear next step. The reply is drafted, not sent. Sending goes through the external action gate and depends on the agent's autonomy level.

## When to use

- A conversation has a new inbound message and a reply is due.
- A follow-up is needed after a call, a booking, or a quote.
- A conversation is waiting on us and the contact has to be told what happens next.

## When not to use

- The request needs a human decision: price exceptions, refunds, legal or compliance questions, a complaint about a person, or a security incident. Escalate with `conversation_set_state` (priority `high`) and say why in the note. Do not answer the substance.
- The contact has asked not to be contacted, or consent for that channel is missing in the contact record. Stop and report it.
- There is no inbound message to answer and nothing is due. Do not send a "checking in" message on your own initiative.

## Procedure

1. Read the thread with `conversation_get`, including the recent messages. Identify the last inbound message and the exact question or request in it.
2. Read the customer context with `crm_get_customer` and `customer_memory_get`. Check open promises and deadlines made earlier.
3. Write in the contact's language. Use the conversation or contact `language` field. If it is empty, match the language of the last inbound message.
4. Match the channel:
   - Email: a short greeting, at most about 150 words unless the contact asked for detail, a clear subject if one is needed.
   - WhatsApp, SMS, Telegram: one to three short sentences. No attachments unless asked.
   - Messenger, Instagram, web chat: short paragraphs, plain text, no headings.
5. Answer the question first. Then add only what the contact needs to act. Do not promise anything that is not shipped, scheduled, or approved.
6. End with one next step: a question to answer, a time to confirm, or a link. Not several.
7. Save the reply with `message_draft`. Use `message_reply` only when the gate and the agent's autonomy level allow it; otherwise the result is a draft awaiting approval.
8. If a promise was made, record it with `commitment_create` (who `us`, with a due date when one exists). Set the conversation to `waiting_them` with `conversation_set_state` when the next move belongs to the contact.

## Rules

- Never send a reply that you could not explain to the contact's account owner in one sentence.
- Do not quote prices, discounts, or delivery dates unless the CRM record or an approved source says so.
- Do not copy another contact's personal data into a reply.
- A reply that lacks a verifiable fact is a draft with a question to the owner, not a guess.
