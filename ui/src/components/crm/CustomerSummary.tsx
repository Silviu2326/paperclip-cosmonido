import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileText, Repeat, Star, Users } from "lucide-react";
import type { Customer } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { proposalsApi } from "../../api/proposals";
import { nextPeriodEnd } from "../../pages/ServiceAgreements";
import { AccentPill, MINT, PanelCard, PanelTitle, PartyAvatar, SKY, YELLOW, formatShortDate } from "./CustomerListParts";
import { isRunningAgreement, useServiceAgreements } from "./ServicesDialog";
import { customerDetailFields } from "./CustomerDetailsFields";
import { CustomerCreateDialog } from "./CustomerCreateDialog";
import { Button } from "@/components/ui/button";

const OPEN_PROPOSAL_STATUSES = new Set(["draft", "sent", "viewed"]);

function formatWhen(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

/** Customer overview: their people, running services and open proposals, with the record's own data beside them. */
export function CustomerSummary({ customer }: { customer: Customer }) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const contacts = useQuery({
    queryKey: ["crm-customer-contacts", customer.id],
    queryFn: () => crmApi.customers.listContacts(customer.id),
  });
  const agreements = useServiceAgreements(customer.companyId);
  const proposals = useQuery({
    queryKey: ["proposals", customer.companyId, "customer", customer.id],
    queryFn: () => proposalsApi.list(customer.companyId),
    retry: false,
  });
  const people = contacts.data ?? [];
  const services = (agreements.data ?? []).filter((agreement) => agreement.customerId === customer.id && isRunningAgreement(agreement));
  const openProposals = (proposals.data ?? []).filter((proposal) => proposal.customerId === customer.id && OPEN_PROPOSAL_STATUSES.has(proposal.status));
  const proposalStatus: Record<string, string> = {
    draft: t("uxCrm.list.proposalDraft", { defaultValue: "Borrador" }),
    sent: t("uxCrm.list.proposalSent", { defaultValue: "Enviada" }),
    viewed: t("uxCrm.list.proposalViewed", { defaultValue: "Vista" }),
  };
  const rows: Array<{ label: string; value: string }> = [
    {
      label: t("crm.customers.fieldKind"),
      value: customer.kind === "person" ? t("crm.customers.kindPerson") : t("crm.customers.kindOrganization"),
    },
    ...customerDetailFields.flatMap(({ key, label }) => customer[key] ? [{ label: t(label), value: customer[key]! }] : []),
    ...(customer.notes ? [{ label: t("crm.customers.fieldNotes"), value: customer.notes }] : []),
    { label: t("crm.customers.fieldCreated"), value: formatWhen(customer.createdAt, i18n.language) },
    { label: t("crm.customers.fieldUpdated"), value: formatWhen(customer.updatedAt, i18n.language) },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-6 lg:col-span-2">
        <PanelCard>
          <PanelTitle icon={Users} color={SKY}>{t("uxCrm.list.summaryPeople", { count: people.length, defaultValue: "Personas · {{count}}" })}</PanelTitle>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">{contacts.isLoading ? t("crm.contacts.loading") : t("crm.customers.contactsEmpty")}</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {people.map((row) => (
                <Link
                  key={row.contact.id}
                  to={`/customers/contacts/${row.contact.id}`}
                  className="group flex w-full items-center gap-3 p-3 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <PartyAvatar name={row.contact.displayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-medium">
                      {row.contact.displayName}
                      {row.isPrimary ? <Star className="h-3 w-3 shrink-0 fill-current" style={{ color: YELLOW }} aria-label={t("crm.customers.primaryContact")} /> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.role ?? row.contact.title ?? t("uxCrm.list.noRole", { defaultValue: "Sin cargo" })} · {row.contact.primaryEmail ?? row.contact.primaryPhone ?? t("crm.contacts.noEmail")}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard>
          <PanelTitle icon={Repeat} color={MINT}>{t("uxCrm.list.summaryServices", { count: services.length, defaultValue: "Servicios · {{count}}" })}</PanelTitle>
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("uxCrm.noCustomerServices", { defaultValue: "Este cliente todavía no tiene servicios recurrentes." })}</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {services.map((agreement) => {
                const next = nextPeriodEnd(agreement);
                return (
                  <Link
                    key={agreement.id}
                    to={`/customers/services/${agreement.id}`}
                    className="flex items-center gap-3 p-3 text-sm transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{agreement.title}</p>
                      {next ? <p className="text-xs text-muted-foreground">{t("uxCrm.list.servicesRenews", { date: formatShortDate(next), defaultValue: "renueva {{date}}" })}</p> : null}
                    </div>
                    {agreement.status === "notice" ? <AccentPill color={YELLOW}>{t("serviceAgreements.status.notice", { defaultValue: "Aviso de renovación" })}</AccentPill> : null}
                  </Link>
                );
              })}
            </div>
          )}
        </PanelCard>

        <PanelCard>
          <PanelTitle icon={FileText} color={SKY}>{t("uxCrm.list.statProposals", { defaultValue: "Propuestas abiertas" })}</PanelTitle>
          {openProposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("uxCrm.noCustomerProposals", { defaultValue: "Este cliente todavía no tiene propuestas." })}</p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {openProposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  to={`/sales/proposals?customerId=${encodeURIComponent(customer.id)}`}
                  className="flex items-center gap-3 p-3 text-sm transition-colors duration-(--motion-duration-fast) hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{proposal.title}</span>
                  <AccentPill color={proposal.status === "viewed" ? MINT : SKY}>{proposalStatus[proposal.status] ?? proposal.status}</AccentPill>
                  <span className="w-24 text-right tabular-nums">{formatMoney(proposal.priceCents, proposal.currency)}</span>
                </Link>
              ))}
            </div>
          )}
        </PanelCard>
      </div>

      <PanelCard className="h-fit">
        <PanelTitle icon={Users} color={MINT}>{t("uxCrm.list.summaryData", { defaultValue: "Datos" })}</PanelTitle>
        <dl className="flex flex-col gap-3 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="whitespace-pre-wrap break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
        <Button variant="outline" className="mt-4" onClick={() => setEditing(true)}>{t("crm.customers.edit")}</Button>
        <CustomerCreateDialog open={editing} onOpenChange={setEditing} companyId={customer.companyId} customer={customer} />
      </PanelCard>
    </div>
  );
}
