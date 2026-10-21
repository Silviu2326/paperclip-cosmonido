import { api } from "./client";

// Shapes are placeholders until pista H defines the calendar DTOs in packages/shared.
export interface CalendarSlot {
  start: string;
  end: string;
}

export interface CalendarEvent {
  id: string;
  companyId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export const calendarApi = {
  availability: (companyId: string, params: { from: string; to: string; durationMinutes?: number }) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.durationMinutes) qs.set("durationMinutes", String(params.durationMinutes));
    return api.get<CalendarSlot[]>(`/companies/${companyId}/calendar/availability?${qs.toString()}`);
  },
  events: (companyId: string) => api.get<CalendarEvent[]>(`/companies/${companyId}/calendar/events`),
  event: (id: string) => api.get<CalendarEvent>(`/calendar/events/${id}`),
};
