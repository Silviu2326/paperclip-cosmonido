import { buildLeadConversion } from "@/lib/lead-conversion";
import { useEffect, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Lead } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Link, useParams } from "@/lib/router";
import { leadsApi } from "../../api/leads";
import { useCompany } from "../../context/CompanyContext";
import { useBreadcrumbs } from "../../context/BreadcrumbContext";
import { queryKeys } from "../../lib/queryKeys";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { LinkedConversations } from "../../components/crm/LinkedConversations";
import { leadTitle } from "./Leads";

const activityKey = (id: string) => ["leads", "activity", id] as const;

function payloadValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function LeadDetail() {
  const { selectedCompanyId } = useCompany();
  const { leadId = "" } = useParams<{ leadId: string }>();
  const { t, i18n } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  // One key per page view: retries of the same conversion are idempotent.
  const [conversionKey] = useState(() => crypto.randomUUID());
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "">("");
  const [language, setLanguage] = useState("");
  const [createOpportunity, setCreateOpportunity] = useState(false);
  const [opportunityTitle, setOpportunityTitle] = useState("");
  const [discardReason, setDiscardReason] = useState("");

  const leadQuery = useQuery({
    queryKey: queryKeys.leads.detail(leadId),
    queryFn: () => leadsApi.get(leadId),
    enabled: Boolean(leadId),
    retry: false,
  });
  const activityQuery = useQuery({
    queryKey: activityKey(leadId),
    queryFn: () => leadsApi.activity(leadId),
    enabled: Boolean(leadId) && leadQuery.isSuccess,
  });

  const lead = leadQuery.data;

  useEffect(() => {
    setBreadcrumbs([
      { label: t("uxCrm.leads", { defaultValue: "Leads" }), href: "/sales/leads" },
      { label: lead ? leadTitle(lead) : t("crm.leads.title") },
    ]);
  }, [setBreadcrumbs, t, lead]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.leads.detail(leadId) });
    queryClient.invalidateQueries({ queryKey: activityKey(leadId) });
    if (selectedCompanyId) queryClient.invalidateQueries({ queryKey: queryKeys.leads.list(selectedCompanyId) });
  };

  const triageMutation = useMutation({
    mutationFn: () =>
      leadsApi.triage(leadId, {
        priority: priority || undefined,
        language: language.trim() || undefined,
      }),
    onSuccess: () => {
      setPriority("");
      setLanguage("");
      refresh();
    },
  });

  const convertMutation = useMutation({
    mutationFn: () =>
      leadsApi.convert(leadId, buildLeadConversion({ createOpportunity, opportunityTitle, idempotencyKey: conversionKey })),
    onSuccess: refresh,
  });

  const discardMutation = useMutation({
    mutationFn: () => leadsApi.discard(leadId, discardReason.trim() || undefined),
    onSuccess: () => {
      setDiscardReason("");
      refresh();
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={UserPlus} message={t("crm.leads.selectCompany")} />;
  }
  if (leadQuery.isLoading) return <PageSkeleton variant="detail" />;
  if (leadQuery.error || !lead) {
    return <EmptyState icon={UserPlus} message={t("crm.leads.detail.notFound")} />;
  }

  const open = lead.status !== "converted" && lead.status !== "discarded";
  const mutationError = [triageMutation.error, convertMutation.error, discardMutation.error].find(Boolean) as Error | undefined;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const payloadEntries = Object.entries(lead.payload ?? {});

  const submitTriage = (event: FormEvent) => {
    event.preventDefault();
    triageMutation.mutate();
  };
  const submitConvert = (event: FormEvent) => {
    event.preventDefault();
    convertMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{leadTitle(lead)}</h1>
        <Badge variant="outline">{t(`crm.leads.status.${lead.status}`)}</Badge>
        <span className="text-sm text-muted-foreground">{t(`crm.leads.source.${lead.source}`)}</span>
      </header>

      {mutationError && <p className="text-sm text-destructive">{mutationError.message}</p>}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("crm.leads.detail.payload")}</h2>
        {payloadEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("crm.leads.detail.noPayload")}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {payloadEntries.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="break-words">{payloadValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("crm.leads.detail.identity")}</h2>
        <LinkedRecords lead={lead} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("crm.conversations.title")}</h2>
        <LinkedConversations
          companyId={lead.companyId}
          filter={lead.contactId ? { contactId: lead.contactId } : null}
          conversationIds={lead.conversationId ? [lead.conversationId] : []}
        />
      </section>

      {open && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("crm.leads.detail.triage")}</h2>
          <form onSubmit={submitTriage} className="flex flex-wrap items-center gap-2">
            <NativeSelect value={priority} onChange={(event) => setPriority(event.target.value as "low" | "normal" | "high" | "")} aria-label={t("crm.leads.detail.priority")}>
              <option value="">{t("crm.leads.detail.keepPriority")}</option>
              <option value="high">{t("crm.leads.priority.high")}</option>
              <option value="normal">{t("crm.leads.priority.normal")}</option>
              <option value="low">{t("crm.leads.priority.low")}</option>
            </NativeSelect>
            <Input
              className="w-32"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              placeholder={t("crm.leads.detail.language")}
              aria-label={t("crm.leads.detail.language")}
              maxLength={10}
            />
            <Button type="submit" size="sm" variant="outline" disabled={triageMutation.isPending}>
              {t("crm.leads.actions.saveTriage")}
            </Button>
          </form>
        </section>
      )}

      {open && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("crm.leads.detail.convert")}</h2>
          <form onSubmit={submitConvert} className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createOpportunity} onChange={(event) => setCreateOpportunity(event.target.checked)} />
              {t("crm.leads.convert.createOpportunity")}
            </label>
            {createOpportunity && (
              <Input
                className="w-64"
                value={opportunityTitle}
                onChange={(event) => setOpportunityTitle(event.target.value)}
                placeholder={t("crm.leads.convert.opportunityTitle")}
                aria-label={t("crm.leads.convert.opportunityTitle")}
                maxLength={200}
              />
            )}
            <Button type="submit" size="sm" disabled={convertMutation.isPending}>
              {t("crm.leads.actions.convert")}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">{t("crm.leads.convert.hint")}</p>
        </section>
      )}

      {open && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("crm.leads.detail.discard")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-64"
              value={discardReason}
              onChange={(event) => setDiscardReason(event.target.value)}
              placeholder={t("crm.leads.discard.reasonPlaceholder")}
              aria-label={t("crm.leads.discard.reasonLabel")}
              maxLength={500}
            />
            <Button size="sm" variant="outline" disabled={discardMutation.isPending} onClick={() => discardMutation.mutate()}>
              {t("crm.leads.actions.discard")}
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t("crm.leads.detail.activity")}</h2>
        {activityQuery.isLoading && <PageSkeleton variant="list" />}
        {activityQuery.data && activityQuery.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("crm.leads.detail.noActivity")}</p>
        )}
        {activityQuery.data && activityQuery.data.length > 0 && (
          <ul className="space-y-1 text-sm">
            {activityQuery.data.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-2">
                <span className="text-muted-foreground">{dateFormat.format(new Date(entry.occurredAt))}</span>
                <span>{entry.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LinkedRecords({ lead }: { lead: Lead }) {
  const { t } = useTranslation();
  const rows: Array<[string, string | null, string | null]> = [
    [t("crm.leads.detail.contact"), lead.contactId, null],
    [t("crm.leads.detail.customer"), lead.customerId, lead.customerId ? `/customers/${lead.customerId}` : null],
    [t("crm.leads.detail.opportunity"), lead.opportunityId, "/sales/opportunities"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {rows.map(([label, id, href]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>
            {!id ? (
              <span className="text-muted-foreground">{t("crm.leads.detail.none")}</span>
            ) : href ? (
              <Link to={href} className="hover:underline">{id.slice(0, 8)}</Link>
            ) : (
              <span>{id.slice(0, 8)}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
