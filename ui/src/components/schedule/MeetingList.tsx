import { useMemo } from "react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import type { CalendarEvent } from "../../api/calendar";
import { StatusBadge } from "./StatusBadge";

interface MeetingListProps {
  events: CalendarEvent[];
  onCancel?: (event: CalendarEvent) => void;
  cancelingId?: string | null;
}

/** Upcoming meetings grouped by customer, then by opportunity, then by attendee. */
export function MeetingList({ events, onCancel, cancelingId }: MeetingListProps) {
  const { t, i18n } = useTranslation();

  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.customerName ?? event.opportunityTitle ?? event.attendeeName ?? t("schedule.noGroup");
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [events, t]);

  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }),
    [i18n.language],
  );

  return (
    <div className="space-y-4">
      {groups.map(([group, items]) => (
        <section key={group} className="space-y-2">
          <h3 className="text-sm font-medium">{group}</h3>
          <ul className="divide-y rounded-md border">
            {items.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatter.format(new Date(event.startsAt))}
                    {event.opportunityTitle ? ` · ${event.opportunityTitle}` : ""}
                    {event.attendeeEmail ? ` · ${event.attendeeEmail}` : ""}
                  </p>
                  {event.status === "proposed" ? (
                    <p className="text-xs text-muted-foreground">{t("schedule.pendingNote")}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={event.status} />
                  {onCancel && event.status !== "cancelled" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancelingId === event.id}
                      onClick={() => onCancel(event)}
                    >
                      {t("schedule.cancelEvent")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
