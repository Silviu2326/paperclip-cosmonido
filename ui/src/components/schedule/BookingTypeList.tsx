import { useState } from "react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { publicBookingPath, type BookingType } from "../../api/calendar";

interface BookingTypeListProps {
  companyId: string;
  types: BookingType[];
}

/** Booking types with their public link. The link works without a session. */
export function BookingTypeList({ companyId, types }: BookingTypeListProps) {
  const { t } = useTranslation();
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy(slug: string) {
    const url = `${window.location.origin}${publicBookingPath(companyId, slug)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border">
        {types.map((type) => (
          <li key={type.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{type.name}</p>
              <p className="text-xs text-muted-foreground">
                {t("schedule.typeSummary", { minutes: type.durationMinutes, buffer: type.bufferMinutes })}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {publicBookingPath(companyId, type.slug)}
              </p>
              {!type.connectionId ? (
                <p className="text-xs text-muted-foreground">{t("schedule.noConnection")}</p>
              ) : null}
            </div>
            <Button variant="outline" size="sm" onClick={() => copy(type.slug)}>
              {copiedSlug === type.slug ? t("schedule.linkCopied") : t("schedule.copyLink")}
            </Button>
          </li>
        ))}
      </ul>
      {copyFailed ? <p className="text-xs text-destructive">{t("schedule.copyFailed")}</p> : null}
    </div>
  );
}
