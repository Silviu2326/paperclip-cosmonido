import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { leadsApi } from "@/api/leads";
import { crmApi } from "@/api/crm";
import { useTranslation } from "@/i18n";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { Link, useParams } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { salesOwnerValue } from "@/lib/sales";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LeadEditorDialog } from "@/components/crm/LeadEditorDialog";
import { LeadConvertDialog } from "@/components/crm/LeadConvertDialog";
import { SalesFollowUp } from "@/components/crm/SalesFollowUp";
import { ActivityTimeline } from "@/components/crm/ActivityTimeline";
import { LinkedConversations } from "@/components/crm/LinkedConversations";
import { useSalesOwners } from "@/components/crm/SalesOwnerSelect";
import { leadTitle } from "./Leads";

export function LeadDetail() {
  const { selectedCompanyId } = useCompany();
  const { leadId = "" } = useParams<{ leadId: string }>();
  return <LeadRecord key={`${selectedCompanyId}:${leadId}`} companyId={selectedCompanyId ?? ""} id={leadId} />;
}

function LeadRecord({ companyId, id }: { companyId: string; id: string }) {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const client = useQueryClient();
  const owners = useSalesOwners(companyId);
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [reason, setReason] = useState("");
  const query = useQuery({ queryKey: queryKeys.leads.detail(id), queryFn: () => leadsApi.get(id), enabled: !!companyId && !!id });
  const lead = query.data?.companyId === companyId ? query.data : undefined;
  const customer = useQuery({ queryKey: ["sales-customer-option", companyId, lead?.customerId], queryFn: () => crmApi.customers.get(lead!.customerId!), enabled: !!lead?.customerId });
  const refresh = () => { void client.invalidateQueries({ queryKey: queryKeys.leads.detail(id) }); void client.invalidateQueries({ queryKey: queryKeys.leads.list(companyId) }); void client.invalidateQueries({ queryKey: ["crm", "activities", companyId, "lead", id] }); };
  const triage = useMutation({ mutationFn: () => leadsApi.triage(id, {}), onSuccess: refresh });
  const discard = useMutation({ mutationFn: () => leadsApi.discard(id, reason.trim() || undefined), onSuccess: refresh });
  useEffect(() => setBreadcrumbs([{ label: t("uxCrm.leads"), href: "/sales/leads" }, { label: lead ? leadTitle(lead) : t("crm.leads.title") }]), [setBreadcrumbs, lead, t]);
  if (!companyId) return <EmptyState icon={UserPlus} message={t("crm.leads.selectCompany")} />;
  if (query.isLoading) return <PageSkeleton variant="detail" />;
  if (!lead) return <div className="flex flex-col gap-2"><p role="alert" className="text-sm text-destructive">{query.error?.message ?? t("crm.leads.detail.notFound")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("salesWorkspace.retry")}</Button></div>;
  const open = lead.status !== "converted" && lead.status !== "discarded";
  return <div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold">{leadTitle(lead)}</h1><Badge variant="outline">{t(`crm.leads.status.${lead.status}`)}</Badge></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditing(true)}>{t("salesWorkspace.editLead")}</Button>{open && <Button onClick={() => setConverting(true)}>{t("salesWorkspace.convertLead")}</Button>}{lead.opportunityId && <Button asChild><Link to={`/sales/opportunities?opportunityId=${lead.opportunityId}`}>{t("salesWorkspace.openOpportunity")}</Link></Button>}</div></header>
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      {["name", "company", "email", "phone", "message"].map((field) => <div key={field}><dt className="text-muted-foreground">{t(`salesWorkspace.${field}`)}</dt><dd className="whitespace-pre-wrap break-words">{typeof lead.payload[field] === "string" ? lead.payload[field] as string : "—"}</dd></div>)}
      <div><dt className="text-muted-foreground">{t("salesWorkspace.owner")}</dt><dd>{owners.name(salesOwnerValue(lead.assignedUserId, lead.assignedAgentId)) ?? t(lead.assignedUserId || lead.assignedAgentId ? "salesWorkspace.savedOwner" : "salesWorkspace.unassigned")}</dd></div>
      <div><dt className="text-muted-foreground">{t("salesWorkspace.priority")}</dt><dd>{lead.priority ? t(`crm.leads.priority.${lead.priority}`) : "—"}</dd></div>
      <div><dt className="text-muted-foreground">{t("salesWorkspace.language")}</dt><dd>{lead.language ?? "—"}</dd></div>
      <div><dt className="text-muted-foreground">{t("crm.leads.columns.source")}</dt><dd>{t(`crm.leads.source.${lead.source}`)}</dd></div>
      {lead.customerId && <div><dt className="text-muted-foreground">{t("salesWorkspace.customer")}</dt><dd><Link className="underline" to={`/customers/${lead.customerId}`}>{customer.data?.name ?? t("salesWorkspace.selectedCustomer")}</Link></dd></div>}
    </dl>
    {customer.error && <p role="alert" className="text-sm text-destructive">{customer.error.message}</p>}
    {Object.keys(lead.payload).some((key) => !["name", "company", "email", "phone", "message"].includes(key)) && <details><summary className="text-sm font-medium">{t("salesWorkspace.additionalData")}</summary><dl className="flex flex-col gap-2 text-sm">{Object.entries(lead.payload).filter(([key]) => !["name", "company", "email", "phone", "message"].includes(key)).map(([key, value]) => <div key={key}><dt>{key}</dt><dd className="break-words">{typeof value === "string" ? value : JSON.stringify(value)}</dd></div>)}</dl></details>}
    {open && lead.status === "new" && <div><Button variant="outline" disabled={triage.isPending} onClick={() => triage.mutate()}>{t("crm.leads.actions.triage")}</Button>{triage.error && <p role="alert" className="text-sm text-destructive">{triage.error.message}</p>}</div>}
    <section className="flex flex-col gap-2"><h2 className="text-sm font-medium">{t("crm.conversations.title")}</h2><LinkedConversations companyId={companyId} filter={lead.contactId ? { contactId: lead.contactId } : null} conversationIds={lead.conversationId ? [lead.conversationId] : []} /></section>
    <SalesFollowUp companyId={companyId} subjectKind="lead" subjectId={id} />
    <section className="flex flex-col gap-2"><h2 className="text-sm font-medium">{t("crm.activities.title")}</h2><ActivityTimeline companyId={companyId} subjectKind="lead" subjectId={id} /></section>
    {open && <form className="flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); if (!discard.isPending) discard.mutate(); }}><Label htmlFor="discard-reason">{t("crm.leads.discard.reasonLabel")}</Label><Input id="discard-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /><div><Button type="submit" variant="outline" disabled={discard.isPending}>{t("crm.leads.actions.discard")}</Button></div>{discard.error && <p role="alert" className="text-sm text-destructive">{discard.error.message}</p>}</form>}
    {lead.discardReason && <p className="text-sm">{lead.discardReason}</p>}
    {editing && <LeadEditorDialog companyId={companyId} lead={lead} onClose={() => setEditing(false)} />}
    {converting && <LeadConvertDialog lead={lead} onClose={() => setConverting(false)} />}
  </div>;
}
