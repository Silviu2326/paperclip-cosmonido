---
navigation: {"section":"Customers and sales","sectionOrder":25,"order":80}
---

# Scheduling and public booking

Booking types define how long a meeting lasts and when it can happen, against a connected calendar. Visitors pick a free slot on the company's public booking page; the company sees the event, and can reschedule or cancel it.

Implementation: [schedule](../../ui/src/pages/Schedule.tsx), [public booking route](../../server/src/routes/public/booking.ts), [calendar routes](../../server/src/routes/calendar.ts).
Agent access: [companion](../agent-access-map/schedule.md).

## Sub-features

- `booking-types`: name, duration and availability rules for a meeting type.
- `availability`: free slots for a booking type within a date range.
- `events`: list, open, reschedule and cancel booked events.
- `public-booking`: a visitor reads slots and books one with name, email and phone.

## How to get to it (user POV)

### `schedule-page`

Open `/schedule` to create booking types and review events.

### `public-booking-page`

A visitor opens `/api/p/:companySlug/book/:slug`, chooses a slot and confirms.

## Driving it with Playwright and the Paperclip CLI

Preconditions: disposable company with a booking type; calendar integration status recorded. Without a connected calendar, booking must fail with a clear message.

1. Create a booking type and read its availability; verify slots match its hours.
2. Book from the public page with a unique slot; verify one event and a confirmation.
3. Book the same slot again from a second visitor; verify the second booking is refused.
4. Reschedule and then cancel the event; verify the event status and the freed slot.
5. Attempt a booking for a type with no connected calendar; verify the explicit unavailable response.

Targeted evidence: [google calendar adapter](../../server/src/services/calendar/google-calendar.test.ts), [slot computation](../../server/src/services/calendar/slots.test.ts).

## Gotchas

- The calendar connector is not injected at startup, so booking responds 422 until a connector is supplied.
- The booking type form has no calendar connection selector yet, so new types cannot book.
- Two visitors can race for the same slot; the availability check and insert are not in one transaction.
- Calendar tool names and argument shapes come from the provider's MCP surface and must be checked against the live server.
