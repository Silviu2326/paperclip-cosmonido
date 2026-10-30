import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SALES_STAGE_KEYS, type Opportunity, type SalesStageKey } from "@paperclipai/shared";
import { crmApi } from "@/api/crm";
import { proposalsApi } from "@/api/proposals";
import { useTranslation } from "@/i18n";
import { Link, useNavigate } from "@/lib/router";
import { salesOwnerValue } from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ActivityTimeline } from "./ActivityTimeline";
import { CommitmentsList } from "./CommitmentsList";
import { OpportunityCreateDialog } from "./OpportunityCreateDialog";
import { ProposalEditorDialog } from "./ProposalEditorDialog";
import { SalesFollowUp } from "./SalesFollowUp";
import { useSalesOwners } from "./SalesOwnerSelect";
import { formatOpportunityAmount, isNextActionOverdue } from "./OpportunityBoard";

export function OpportunityDetailSheet({ companyId, id, onClose, onMove, moving }: {
  companyId: string; id: string; onClose: () => void; onMove: (item: Opportunity, stage: SalesStageKey) => void; moving: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const owners = useSalesOwners(companyId);
  const [editing, setEditing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const query = useQuery({ queryKey: ["sales-opportunity", companyId, id], queryFn: () => crmApi.opportunities.get(id) });
  const item = query.data?.companyId === companyId ? query.data : undefined;
  const customer = useQuery({ queryKey: ["sales-customer-option", companyId, item?.customerId], queryFn: () => crmApi.customers.get(item!.customerId), enabled: !!item });
  const proposals = useQuery({ queryKey: ["proposals", companyId, "opportunity", id], queryFn: () => proposalsApi.list(companyId, { opportunityId: id, limit: 200 }), enabled: !!item });
  const date = (value: string | null) => value ? new Date(value).toLocaleString() : t("salesWorkspace.notSet");
  return <Sheet open onOpenChange={(open) => !open && onClose()}>
    <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
      <SheetHeader><SheetTitle>{item?.title ?? t("salesWorkspace.opportunity")}</SheetTitle></SheetHeader>
      {query.isLoading ? <PageSkeleton variant="detail" /> : !item ? <div className="flex flex-col gap-2 p-4"><p role="alert" className="text-sm text-destructive">{query.error?.message ?? t("salesWorkspace.notFound")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("salesWorkspace.retry")}</Button></div> : <div className="flex flex-col gap-5 p-4">
        <div className="flex flex-wrap gap-2"><Button onClick={() => setEditing(true)}>{t("salesWorkspace.editOpportunity")}</Button><Button variant="outline" onClick={() => setProposing(true)}>{t("salesWorkspace.newProposal")}</Button></div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t("salesWorkspace.customer")}</dt><dd><Link className="underline" to={`/customers/${item.customerId}`}>{customer.data?.name ?? t("salesWorkspace.selectedCustomer")}</Link></dd></div>
          <div><dt className="text-muted-foreground">{t("salesWorkspace.amount")}</dt><dd>{formatOpportunityAmount(item.amountCents, item.currency) ?? t("salesWorkspace.notSet")}</dd></div>
          <div><dt className="text-muted-foreground">{t("salesWorkspace.owner")}</dt><dd>{owners.name(salesOwnerValue(item.ownerUserId, item.ownerAgentId)) ?? t(item.ownerUserId || item.ownerAgentId ? "salesWorkspace.savedOwner" : "salesWorkspace.unassigned")}</dd></div>
          <div><dt className="text-muted-foreground">{t("salesWorkspace.probability")}</dt><dd>{item.probability == null ? t("salesWorkspace.notSet") : `${item.probability}%`}</dd></div>
          <div><dt className="text-muted-foreground">{t("salesWorkspace.expectedClose")}</dt><dd>{date(item.expectedCloseAt)}</dd></div>
          <div><dt className="text-muted-foreground">{t("salesWorkspace.nextAction")}</dt><dd className={isNextActionOverdue(item) ? "text-destructive" : undefined}>{item.nextAction ?? t("salesWorkspace.notSet")} · {date(item.nextActionAt)}</dd></div>
        </dl>
        {customer.error && <p role="alert" className="text-sm text-destructive">{customer.error.message}</p>}
        <div className="flex flex-col gap-1.5"><Label htmlFor="detail-stage">{t("salesWorkspace.stage")}</Label><NativeSelect id="detail-stage" disabled={moving} value={item.stageKey ?? "new"} onChange={(event) => onMove(item, event.target.value as SalesStageKey)}>{SALES_STAGE_KEYS.map((stage) => <option key={stage} value={stage}>{t(`crm.opportunities.stages.${stage}`)}</option>)}</NativeSelect></div>
        {item.lostReason && <p className="text-sm">{t("salesWorkspace.lostReason")}: {item.lostReason}</p>}
        <section className="flex flex-col gap-2"><h3 className="text-sm font-medium">{t("uxCrm.proposals")}</h3>
          {proposals.isLoading && <PageSkeleton variant="list" />}
          {proposals.error && <p role="alert" className="text-sm text-destructive">{proposals.error.message}</p>}
          {!proposals.isLoading && !proposals.error && !proposals.data?.length && <p className="text-sm text-muted-foreground">{t("proposals.empty")}</p>}
          {(proposals.data ?? []).map((proposal) => <Link key={proposal.id} className="text-sm underline" to={`/sales/proposals/${proposal.id}`}>{proposal.title} · {t(`proposals.status.${proposal.status}`)}</Link>)}
          <Link className="text-sm underline" to={`/sales/proposals?opportunityId=${item.id}`}>{t("salesWorkspace.allProposals")}</Link>
        </section>
        <SalesFollowUp companyId={companyId} subjectKind="opportunity" subjectId={item.id} customerId={item.customerId} />
        <section className="flex flex-col gap-2"><h3 className="text-sm font-medium">{t("crm.commitments.title")}</h3><CommitmentsList companyId={companyId} opportunityId={item.id} /></section>
        <section className="flex flex-col gap-2"><h3 className="text-sm font-medium">{t("crm.activities.title")}</h3><ActivityTimeline companyId={companyId} subjectKind="opportunity" subjectId={item.id} /></section>
        <OpportunityCreateDialog open={editing} onOpenChange={setEditing} companyId={companyId} opportunity={item} />
        {proposing && <ProposalEditorDialog companyId={companyId} opportunity={item} onClose={() => setProposing(false)} onSaved={(proposal) => navigate(`/sales/proposals/${proposal.id}`)} />}
      </div>}
    </SheetContent>
  </Sheet>;
}
