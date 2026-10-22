import type { Customer } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";

function formatWhen(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function CustomerSummary({ customer }: { customer: Customer }) {
  const { t, i18n } = useTranslation();
  const rows: Array<{ label: string; value: string }> = [
    { label: t("crm.customers.fieldName"), value: customer.name },
    {
      label: t("crm.customers.fieldKind"),
      value: customer.kind === "person" ? t("crm.customers.kindPerson") : t("crm.customers.kindOrganization"),
    },
    { label: t("crm.customers.fieldDomain"), value: customer.domain ?? t("crm.customers.noDomain") },
    { label: t("crm.customers.fieldCreated"), value: formatWhen(customer.createdAt, i18n.language) },
    { label: t("crm.customers.fieldUpdated"), value: formatWhen(customer.updatedAt, i18n.language) },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={customer.status === "archived" ? "outline" : "secondary"}>
          {customer.status === "archived" ? t("crm.customers.archivedBadge") : t("crm.customers.statusActive")}
        </Badge>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label + row.value} className="space-y-0.5">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className="break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
