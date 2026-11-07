import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import type { CalendarEventStatus } from "../../api/calendar";

const VARIANT: Record<CalendarEventStatus, "default" | "secondary" | "outline"> = {
  confirmed: "default",
  proposed: "secondary",
  cancelled: "outline",
};

/** Event state as the provider confirms it: proposed means no receipt yet. */
export function StatusBadge({ status }: { status: CalendarEventStatus }) {
  const { t } = useTranslation();
  return <Badge variant={VARIANT[status]}>{t(`schedule.status.${status}`)}</Badge>;
}
