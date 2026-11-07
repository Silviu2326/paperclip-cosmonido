---
name: booking-etiquette
description: Arrange, move, or cancel a meeting with a contact by offering verified slots in their time zone, booking only on their explicit choice, and confirming in writing. Every external booking goes through the action gate.
key: paperclipai/optional/sales/booking-etiquette
recommendedForRoles:
  - sdr
  - sales
  - assistant
  - scheduler
tags:
  - sales
  - scheduling
  - calendar
  - communication
---

# Booking Etiquette

Get a meeting onto both calendars with as little back-and-forth as possible, without booking anything the contact has not chosen. Every booking, reschedule, and cancellation is an external action and goes through the gate.

## When to use

- A contact has asked for a call, demo, or meeting, or the sales step calls for one.
- An existing booking must move or be cancelled.
- A contact has picked one of the offered slots and the booking must be confirmed.

## When not to use

- The contact has not asked for a meeting and the step does not call for one. Do not book on your own initiative.
- The contact has not confirmed a channel that can carry the confirmation. Ask on the conversation first.
- The request is to change a meeting's agenda or attendees beyond the event itself. Escalate to the owner.

## Procedure

1. Read the conversation with `conversation_get` and the contact's time zone from the contact or conversation record. If the time zone is unknown, ask one question before offering any time.
2. Read free slots with `calendar_availability` for the agreed window. Offer two or three slots, each with the day, date, and time with the time zone written out.
3. Wait for the contact to choose. Do not book a slot the contact did not choose, and do not treat "sometime next week" as a choice.
4. Book with `calendar_book` only after the explicit choice. Include a one-line agenda and the names of the people attending. The call goes through the gate and is executed or drafted according to the autonomy level.
5. Confirm in writing on the same channel using `message_draft` (or `message_reply` when the gate allows it). State the date, time, time zone, and how to join or reschedule.
6. To reschedule, use `calendar_reschedule`. Acknowledge the change first, then offer new slots. Give notice; never move a meeting silently.
7. To cancel, use `calendar_cancel`, state the reason neutrally, and offer one alternative slot.
8. If the contact does not answer after two attempts spaced by a reasonable interval, stop. Log the state with `crm_log_activity` and leave the next step to the owner.

## Rules

- Never book two events in the same slot for the same person.
- Keep the time zone in every message that mentions a time.
- Do not share another attendee's details in the invitation text.
- Record each booking, move, or cancellation in the CRM activity log so the next person can see the history.
