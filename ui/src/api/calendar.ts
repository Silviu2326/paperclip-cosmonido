import { api } from "./client";

// DTOs mirror server/src/services/calendar (booking.ts, routes/calendar.ts).

export interface CalendarSlot {
  start: string;
  end: string;
}

export interface BookingWeeklyHour {
  weekday: number;
  start: string;
  end: string;
}

export interface BookingType {
  id: string;
  companyId: string;
  slug: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  timezone: string;
  weeklyHours: BookingWeeklyHour[];
  connectionId: string | null;
  hostAgentId: string | null;
  hostUserId: string | null;
}

export type CalendarEventStatus = "proposed" | "confirmed" | "cancelled";

export interface CalendarEvent {
  id: string;
  companyId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: CalendarEventStatus;
  attendeeName: string | null;
  attendeeEmail: string | null;
  meetingLink: string | null;
  customerId: string | null;
  customerName: string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
  bookingTypeId: string | null;
  bookingTypeName: string | null;
}

export interface CreateBookingTypeBody {
  slug: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  timezone: string;
  weeklyHours: BookingWeeklyHour[];
  connectionId?: string | null;
}

export interface BookingOutcome {
  event: CalendarEvent;
  created: boolean;
  mode: "draft" | "approval" | "direct" | null;
  actionStatus: string | null;
}

export const calendarApi = {
  bookingTypes: (companyId: string) =>
    api.get<BookingType[]>(`/companies/${companyId}/calendar/booking-types`),
  createBookingType: (companyId: string, body: CreateBookingTypeBody) =>
    api.post<BookingType>(`/companies/${companyId}/calendar/booking-types`, body),
  availability: (companyId: string, params: { bookingTypeId: string; from: string; to: string }) => {
    const qs = new URLSearchParams({ bookingTypeId: params.bookingTypeId, from: params.from, to: params.to });
    return api.get<{ bookingType: { id: string; slug: string; name: string }; slots: CalendarSlot[] }>(
      `/companies/${companyId}/calendar/availability?${qs.toString()}`,
    );
  },
  events: (companyId: string, params: { status?: CalendarEventStatus; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<CalendarEvent[]>(`/companies/${companyId}/calendar/events${suffix}`);
  },
  event: (id: string) => api.get<CalendarEvent>(`/calendar/events/${id}`),
  reschedule: (id: string, startsAt: string) =>
    api.post<BookingOutcome>(`/calendar/events/${id}/reschedule`, { startsAt }),
  cancel: (id: string) => api.post<BookingOutcome>(`/calendar/events/${id}/cancel`, {}),
};

/** Public booking path for a booking type, as mounted by public-surface.ts under /api/p. */
export function publicBookingPath(companyId: string, slug: string): string {
  return `/api/p/${companyId}/book/${slug}`;
}
