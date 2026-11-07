import { useEffect } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, MessageCircle, Phone, Star, Users, type LucideIcon } from "lucide-react";
import { Link, useParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { crmApi } from "../../api/crm";
import { ApiError } from "../../api/client";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { queryKeys } from "../../lib/queryKeys";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { AccentPill, LILAC, MUTED, PanelCard, PanelTitle, PartyAvatar, SKY, YELLOW, useHealthMeta } from "../../components/crm/CustomerListParts";
import { cn } from "@/lib/utils";
import { PersonCustomerLinks } from "../../components/crm/PersonCustomerLinks";

/** A person: contact data, the customers they belong to and their colleagues there. */
export function PersonDetail() {
  const { contactId = "" } = useParams<{ contactId: string }>();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const healthMeta = useHealthMeta();

  const contactQuery = useQuery({
    queryKey: queryKeys.contacts.detail(contactId),
    queryFn: () => crmApi.contacts.get(contactId),
    enabled: !!contactId,
  });
  const contact = contactQuery.data;
  const customersQuery = useQuery({
    queryKey: [...queryKeys.contacts.detail(contactId), "customers"],
    queryFn: () => crmApi.contacts.listCustomers(contactId),
    enabled: !!contact,
  });
  const linkedCustomers = customersQuery.data ?? [];
  const colleagueQueries = useQueries({
    queries: linkedCustomers.map((row) => ({
      queryKey: ["crm-customer-contacts", row.customer.id],
      queryFn: () => crmApi.customers.listContacts(row.customer.id),
    })),
  });
  const colleagues = new Map<string, { id: string; name: string; subtitle: string }>();
  for (const query of colleagueQueries) {
    for (const row of query.data ?? []) {
      if (row.contact.id === contactId || colleagues.has(row.contact.id)) continue;
      colleagues.set(row.contact.id, {
        id: row.contact.id,
        name: row.contact.displayName,
        subtitle: row.contact.title ?? row.contact.primaryEmail ?? "",
      });
    }
  }

  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav.customers"), href: "/customers" },
      { label: t("uxCrm.list.people", { defaultValue: "Personas" }), href: "/customers/contacts" },
      { label: contact?.displayName ?? "…" },
    ]);
  }, [setBreadcrumbs, t, contact?.displayName]);

  if (contactQuery.isLoading) return <PageSkeleton variant="detail" />;
  if (contactQuery.error || !contact) {
    const err = contactQuery.error;
    const message = err instanceof ApiError && err.status === 403
      ? t("crm.customers.forbidden")
      : t("uxCrm.list.personNotFound", { defaultValue: "No hemos encontrado a esta persona." });
    return <EmptyState icon={Users} message={message} />;
  }

  const primaryLink = linkedCustomers.find((row) => row.isPrimary) ?? linkedCustomers[0];
  const isPrimaryAnywhere = linkedCustomers.some((row) => row.isPrimary);
  const channelLabels: Record<string, string> = {
    email: t("uxCrm.list.fieldEmail", { defaultValue: "Email" }),
    whatsapp: "WhatsApp",
    phone: t("uxCrm.list.fieldPhone", { defaultValue: "Teléfono" }),
    sms: "SMS",
  };
  const languageName = (code: string | null) => {
    if (!code) return null;
    try {
      return new Intl.DisplayNames(undefined, { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  };
  const rows: [string, string | null, LucideIcon][] = [
    [t("uxCrm.list.fieldEmail", { defaultValue: "Email" }), contact.primaryEmail, Mail],
    [t("uxCrm.list.fieldPhone", { defaultValue: "Teléfono" }), contact.primaryPhone, Phone],
    [t("uxCrm.list.fieldChannel", { defaultValue: "Canal preferido" }), contact.preferredChannel ? channelLabels[contact.preferredChannel] ?? contact.preferredChannel : null, MessageCircle],
    [t("uxCrm.list.fieldLanguage", { defaultValue: "Idioma" }), languageName(contact.language), MessageCircle],
  ];
  const archived = contact.status === "archived";

  return (
    <div className="flex flex-col gap-6">
      <Link to="/customers/contacts" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t("uxCrm.list.people", { defaultValue: "Personas" })}
      </Link>

      <header className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-card p-5">
        <PartyAvatar name={contact.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold [overflow-wrap:anywhere]">
            {contact.displayName}
            {isPrimaryAnywhere ? <Star className="h-4 w-4 shrink-0 fill-current" style={{ color: YELLOW }} aria-label={t("crm.customers.primaryContact")} /> : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            {contact.title ?? t("uxCrm.list.noRole", { defaultValue: "Sin cargo" })}
            {primaryLink ? ` · ${primaryLink.customer.name}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {archived ? <AccentPill color={MUTED}>{t("crm.contacts.archivedBadge")}</AccentPill> : null}
            {linkedCustomers.map((row) => (
              <Link key={row.customer.id} to={`/customers/${row.customer.id}`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <AccentPill color={row.customer.status === "archived" ? MUTED : healthMeta(row.customer.health).color}>{row.customer.name}</AccentPill>
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <PanelCard className="lg:col-span-2">
          <PanelTitle icon={Mail} color={SKY}>{t("uxCrm.list.contactData", { defaultValue: "Datos de contacto" })}</PanelTitle>
          <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {rows.map(([label, value, Icon]) => (
              <div key={label} className="flex items-center gap-3 p-3 text-sm">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <dt className="w-36 text-muted-foreground">{label}</dt>
                <dd className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>{value ?? t("uxCrm.list.notAdded", { defaultValue: "Sin añadir" })}</dd>
              </div>
            ))}
          </dl>
        </PanelCard>

        <div className="flex flex-col gap-6">
          <PanelCard>
            <PanelTitle icon={Users} color={LILAC}>{t("nav.customers")}</PanelTitle>
            <PersonCustomerLinks key={contact.id} companyId={contact.companyId} contactId={contact.id}
              linked={linkedCustomers} loading={customersQuery.isLoading} loadError={!!customersQuery.error} />
          </PanelCard>
          {colleagues.size > 0 ? (
            <PanelCard>
              <PanelTitle icon={Users} color={SKY}>{t("uxCrm.list.colleagues", { defaultValue: "Más personas del cliente" })}</PanelTitle>
              {[...colleagues.values()].map((other) => (
                <Link key={other.id} to={`/customers/contacts/${other.id}`} className="flex items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <PartyAvatar name={other.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{other.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{other.subtitle}</span>
                  </span>
                </Link>
              ))}
            </PanelCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
