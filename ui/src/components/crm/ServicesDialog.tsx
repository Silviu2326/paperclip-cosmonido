import { useQuery } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import type { Customer, ServiceAgreement } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { serviceAgreementsApi } from "@/api/service-agreements";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { accentReadable, accentTint } from "@/lib/accent";
import { nextPeriodEnd } from "@/pages/ServiceAgreements";
import { AccentPill, MINT, PartyAvatar, YELLOW, formatShortDate } from "./CustomerListParts";

/** Agreements that still run: not ended or cancelled. */
export const isRunningAgreement = (agreement: Pick<ServiceAgreement, "status">) =>
  agreement.status === "active" || agreement.status === "notice" || agreement.status === "renewed";

export function useServiceAgreements(companyId: string | null) {
  return useQuery({
    queryKey: ["service-agreements", companyId],
    queryFn: () => serviceAgreementsApi.list(companyId!),
    enabled: !!companyId,
  });
}

/** Recurring services of every customer, in a popup. Each row leads to the agreement. */
export function ServicesDialog({ open, onOpenChange, agreements, customers }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agreements: ServiceAgreement[];
  /** Customers already loaded on the page, to name each agreement's owner. */
  customers: Customer[];
}) {
  const { t } = useTranslation();
  const nameOf = (id: string | null) =>
    customers.find((customer) => customer.id === id)?.name ?? t("uxCrm.list.servicesNoCustomer", { defaultValue: "Sin cliente" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen max-w-xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `linear-gradient(135deg, ${accentTint(MINT, 34)}, ${accentTint(MINT, 16)})`, boxShadow: `inset 0 0 0 1px ${accentTint(MINT, 32)}`, color: accentReadable(MINT) }}
            >
              <Repeat className="h-5 w-5" />
            </span>
            <div className="min-w-0 text-left">
              <DialogTitle>{t("uxCrm.services", { defaultValue: "Servicios recurrentes" })}</DialogTitle>
              <DialogDescription>{t("uxCrm.list.servicesSummary", { count: agreements.length, defaultValue: "{{count}} servicios en marcha" })}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {agreements.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("uxCrm.list.servicesEmpty", { defaultValue: "Todavía no hay servicios recurrentes." })}
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {agreements.map((agreement) => {
              const next = nextPeriodEnd(agreement);
              const name = nameOf(agreement.customerId);
              return (
                <Link
                  key={agreement.id}
                  to={`/customers/services/${agreement.id}`}
                  onClick={() => onOpenChange(false)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <PartyAvatar name={name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{agreement.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {name}
                      {next ? ` · ${t("uxCrm.list.servicesRenews", { date: formatShortDate(next), defaultValue: "renueva {{date}}" })}` : ""}
                    </p>
                  </div>
                  {agreement.status === "notice" ? (
                    <AccentPill color={YELLOW}>{t("serviceAgreements.status.notice", { defaultValue: "Aviso de renovación" })}</AccentPill>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
        <Link to="/customers/services" onClick={() => onOpenChange(false)} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          {t("uxCrm.list.servicesViewAll", { defaultValue: "Ver todos los servicios" })}
        </Link>
      </DialogContent>
    </Dialog>
  );
}
