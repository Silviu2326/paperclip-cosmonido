# Scheduling and public booking - agent access

Product map: [schedule](../feature-map/schedule.md).

## `booking-types`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/calendar/booking-types; POST /api/companies/{companyId}/calendar/booking-types.

Agent access: `partial` - no dedicated tool to create or list booking types; REST with the agent key only.

Policy: assertCompanyAccess; a type without a connected calendar cannot book.

Evidence: `source-only` - [routes](../../server/src/routes/calendar.ts), [booking service](../../server/src/services/calendar/booking.ts).

Verification: `not-run` - create a type as an agent and confirm it is company-scoped.

Gaps: the booking type form has no calendar connection selector.

## `availability`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/calendar/availability?bookingTypeId=&from=&to=.

Agent access: `available` - calendar_availability dispatches to this route.

Policy: company-scoped; slots are computed from the type's rules.

Evidence: `source-only` - [routes](../../server/src/routes/calendar.ts), [slots](../../server/src/services/calendar/slots.ts).

Verification: `not-run` - read availability for a type of another company and confirm denial.

Gaps: none recorded.

## `events`

Review: `baseline`.

API: `present` - GET /api/companies/{companyId}/calendar/events; POST /api/companies/{companyId}/calendar/events; GET /api/calendar/events/{id}; POST /api/calendar/events/{id}/reschedule; POST /api/calendar/events/{id}/cancel.

Agent access: `available` - calendar_book, calendar_reschedule and calendar_cancel dispatch to these routes; booking responds 422 until a calendar connector is supplied.

Policy: company-scoped; booking an external meeting is an external action through the gate with actionType booking.

Evidence: `source-only` - [routes](../../server/src/routes/calendar.ts), [google calendar](../../server/src/services/calendar/google-calendar.ts).

Verification: `not-run` - book as an agent with a connected calendar and confirm the event id and confirmed status; without a connector confirm 422.

Gaps: the calendar connector is not injected at startup in the application wiring, so booking is unavailable; provider tool names and arguments must be checked against the live server.

## `public-booking`

Review: `baseline`.

API: `present` - GET /api/p/{companySlug}/book/{slug}; POST /api/p/{companySlug}/book/{slug}.

Agent access: `not-applicable` - visitor booking page.

Policy: the company is resolved from the public slug; name, email and phone are required.

Evidence: `source-only` - [public booking](../../server/src/routes/public/booking.ts), [tests](../../server/src/services/calendar/slots.test.ts).

Verification: `not-run` - book the same slot from two visitors and confirm the second is refused.

Gaps: no transactional guard against a double booking.
