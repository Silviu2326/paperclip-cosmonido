import { useEffect, useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { calendarApi, type CalendarEvent, type CreateBookingTypeBody } from "../api/calendar";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { BookingTypeForm } from "../components/schedule/BookingTypeForm";
import { BookingTypeList } from "../components/schedule/BookingTypeList";
import { MeetingList } from "../components/schedule/MeetingList";

// Sprint 2 pista H (Agenda): upcoming meetings per customer and opportunity,
// booking types with their public link, and proposed/confirmed state.
export function Schedule() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const companyId = selectedCompanyId ?? "";

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.schedule") }]);
  }, [setBreadcrumbs, t]);

  const eventsQuery = useQuery({
    queryKey: queryKeys.calendar.events(companyId),
    queryFn: () => calendarApi.events(companyId, { limit: 100 }),
    enabled: !!companyId,
  });

  const typesKey = ["calendar", companyId, "booking-types"] as const;
  const typesQuery = useQuery({
    queryKey: typesKey,
    queryFn: () => calendarApi.bookingTypes(companyId),
    enabled: !!companyId,
  });

  const createType = useMutation({
    mutationFn: (body: CreateBookingTypeBody) => calendarApi.createBookingType(companyId, body),
    onSuccess: () => {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: typesKey });
      pushToast({ title: t("schedule.typeCreated"), tone: "success" });
    },
    onError: (error: Error) => pushToast({ title: t("schedule.saveFailed"), body: error.message, tone: "error" }),
  });

  const cancelEvent = useMutation({
    mutationFn: (event: CalendarEvent) => calendarApi.cancel(event.id),
    onSuccess: (outcome) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.events(companyId) });
      pushToast({
        title: outcome.event.status === "cancelled" ? t("schedule.cancelled") : t("schedule.cancelPending"),
        tone: "success",
      });
    },
    onError: (error: Error) => pushToast({ title: t("schedule.cancelFailed"), body: error.message, tone: "error" }),
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={CalendarDays} message={t("schedule.selectCompany")} />;
  }

  if (eventsQuery.isLoading || typesQuery.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (eventsQuery.error || typesQuery.error) {
    return <p className="text-sm text-destructive">{t("schedule.loadFailed")}</p>;
  }

  const events = eventsQuery.data ?? [];
  const types = typesQuery.data ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-base font-medium">{t("schedule.upcoming")}</h2>
        {events.length === 0 ? (
          <EmptyState icon={CalendarDays} message={t("schedule.upcomingEmpty")} />
        ) : (
          <MeetingList
            events={events}
            onCancel={(event) => cancelEvent.mutate(event)}
            cancelingId={cancelEvent.isPending ? (cancelEvent.variables?.id ?? null) : null}
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">{t("schedule.bookingTypes")}</h2>
          {!creating ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t("schedule.newType")}
            </Button>
          ) : null}
        </div>
        {creating ? (
          <BookingTypeForm
            pending={createType.isPending}
            onSubmit={(body) => createType.mutate(body)}
            onCancel={() => setCreating(false)}
          />
        ) : null}
        {types.length === 0 && !creating ? (
          <EmptyState icon={CalendarDays} message={t("schedule.bookingTypesEmpty")} />
        ) : (
          <BookingTypeList companyId={companyId} types={types} />
        )}
      </section>
    </div>
  );
}
