import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/context/CompanyContext";
import { useTranslation } from "@/i18n";
import { accessApi } from "@/api/access";
import { useAccountIdentity } from "@/api/companies-query";
import { TemplateLibraryNav } from "@/components/team-workspace/TeamWorkspaceLinks";
import { publicCatalogApi, type PublicCatalogEntry } from "@/api/public-catalog";
import type { PublicCatalogSelection } from "@paperclipai/shared/productization/public-catalog";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";

const emptySelection = (): PublicCatalogSelection => ({ teamMembers: [], skills: [], playbooks: [], requestTemplates: [], brandPresets: [], forms: [], meetingTypes: [], connectionRequests: [] });
type CatalogChoice = { section: Exclude<keyof PublicCatalogSelection, "connectionRequests">; id: string; label: string } | { section: "connectionRequests"; id: number; label: string };
type CatalogLabelKey = "catalogPage.skill" | "catalogPage.playbook" | "catalogPage.template" | "catalogPage.brand" | "catalogPage.form" | "catalogPage.meeting" | "catalogPage.connectionRequest";
function selectionFor(pkg: PortablePackage, translate: (key: CatalogLabelKey) => string): CatalogChoice[] {
  return [
    ...pkg.teams.flatMap((team) => team.members.map((member) => ({ section: "teamMembers" as const, id: `${team.id}/${member.id}`, label: `${team.name} / ${member.title}` }))),
    ...pkg.skills.map((item) => ({ section: "skills" as const, id: item.id, label: `${translate("catalogPage.skill")}: ${item.catalogKey}` })),
    ...pkg.playbooks.map((item) => ({ section: "playbooks" as const, id: item.id, label: `${translate("catalogPage.playbook")}: ${item.name}` })),
    ...pkg.requestTemplates.map((item) => ({ section: "requestTemplates" as const, id: item.id, label: `${translate("catalogPage.template")}: ${item.name}` })),
    ...pkg.brandPresets.map((item) => ({ section: "brandPresets" as const, id: item.id, label: `${translate("catalogPage.brand")}: ${item.name}` })),
    ...pkg.forms.map((item) => ({ section: "forms" as const, id: item.id, label: `${translate("catalogPage.form")}: ${item.name}` })),
    ...pkg.meetingTypes.map((item) => ({ section: "meetingTypes" as const, id: item.id, label: `${translate("catalogPage.meeting")}: ${item.name}` })),
    ...pkg.connectionRequests.map((item, index) => ({ section: "connectionRequests" as const, id: index, label: `${translate("catalogPage.connectionRequest")}: ${item.provider}` })),
  ];
}

export default function PublicCatalog() {
  const { selectedCompanyId } = useCompany();
  const identity = useAccountIdentity();
  const key = `${identity.settled ? identity.userId ?? "anonymous" : "pending"}/${selectedCompanyId ?? "no-company"}`;
  return <PublicCatalogForIdentity key={key} selectedCompanyId={selectedCompanyId} identitySettled={identity.settled} identityUserId={identity.userId} />;
}

function PublicCatalogForIdentity({ selectedCompanyId, identitySettled, identityUserId }: { selectedCompanyId: string | null; identitySettled: boolean; identityUserId: string | null }) {
  const { t } = useTranslation();
  const access = useQuery({ queryKey: ["public-catalog", "board-access", identitySettled, identityUserId], queryFn: accessApi.getCurrentBoardAccess, enabled: identitySettled && Boolean(identityUserId), retry: false, staleTime: 30_000 });
  const [entries, setEntries] = useState<PublicCatalogEntry[]>([]);
  const [privatePackages, setPrivatePackages] = useState<Array<{ id: string; name: string; packageKey: string; packageVersion: string; status: string }>>([]);
  const [installations, setInstallations] = useState<Array<{ id: string; packageKey: string; packageVersion: string; status: string }>>([]);
  const [ratingReceipts, setRatingReceipts] = useState<Record<string, string>>({});
  const [ratingValues, setRatingValues] = useState<Record<string, string>>({});
  const [reviewQueue, setReviewQueue] = useState<Array<{ id: string; packageKey: string; packageVersion: string; name: string; description: string; contentHash: string; package: PortablePackage }>>([]);
  const [moderationQueue, setModerationQueue] = useState<Array<{ id: string; listingId: string; packageName: string; rating: number; review: string | null; status: "visible" | "hidden"; createdAt: string }>>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [content, setContent] = useState<PortablePackage | null>(null);
  const [selection, setSelection] = useState<PublicCatalogSelection>(emptySelection);
  const [busy, setBusy] = useState(false);
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async (signal: AbortSignal) => {
    const publicData = await publicCatalogApi.list(signal);
    if (signal.aborted) return;
    setEntries(publicData.items);
    if (identitySettled && identityUserId && selectedCompanyId) {
      const [packages, receipts] = await Promise.all([publicCatalogApi.privatePackages(selectedCompanyId, signal), publicCatalogApi.installations(selectedCompanyId, signal)]);
      if (signal.aborted) return;
      setPrivatePackages(packages); setInstallations(receipts);
    } else { setPrivatePackages([]); setInstallations([]); }
  }, [identitySettled, identityUserId, selectedCompanyId]);
  const isInstanceAdmin = access.data?.source === "local_implicit" || access.data?.isInstanceAdmin === true;
  useEffect(() => {
    if (!isInstanceAdmin) { setReviewQueue([]); setModerationQueue([]); return; }
    const controller = new AbortController();
    void Promise.all([publicCatalogApi.reviewQueue(controller.signal), publicCatalogApi.moderationQueue(controller.signal)]).then(([requests, ratings]) => { if (!controller.signal.aborted) { setReviewQueue(requests); setModerationQueue(ratings); } }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t("catalogPage.queueError")); });
    return () => controller.abort();
  }, [identitySettled, identityUserId, isInstanceAdmin]);
  useEffect(() => {
    const controller = new AbortController();
    setEntries([]); setPrivatePackages([]); setInstallations([]); setRatingReceipts({}); setRatingValues({}); setContent(null); setSelection(emptySelection()); setSelectedPackageId(""); setNotice(null); setError(null); setAttested(false);
    void load(controller.signal).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : t("catalogPage.catalogError")); });
    return () => controller.abort();
  }, [load]);
  const choices = useMemo(() => content ? selectionFor(content, t) : [], [content, t]);
  async function choosePackage(packageId: string) {
    setSelectedPackageId(packageId); setContent(null); setSelection(emptySelection()); setNotice(null); setError(null);
    if (!selectedCompanyId || !packageId) return;
    setBusy(true);
    try { const result = await publicCatalogApi.privatePackage(selectedCompanyId, packageId); setContent(result.content); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("catalogPage.packageError")); }
    finally { setBusy(false); }
  }
  function toggle(choice: CatalogChoice, checked: boolean) {
    setSelection((current) => {
      if (choice.section === "connectionRequests") {
        const values = current.connectionRequests;
        const next = checked ? [...new Set([...values, choice.id])] : values.filter((entry) => entry !== choice.id);
        return { ...current, connectionRequests: next };
      }
      const values = current[choice.section];
      const next = checked ? [...new Set([...values, choice.id])] : values.filter((entry) => entry !== choice.id);
      return { ...current, [choice.section]: next };
    });
  }
  function isSelected(choice: CatalogChoice) {
    return choice.section === "connectionRequests" ? selection.connectionRequests.includes(choice.id) : selection[choice.section].includes(choice.id);
  }
  async function requestPublication() {
    if (!selectedCompanyId || !selectedPackageId) return;
    setBusy(true); setError(null); setNotice(null);
    try { const result = await publicCatalogApi.request(selectedCompanyId, selectedPackageId, selection) as { status: string }; const status = result.status === "pending" ? t("catalogPage.pending") : result.status === "published" ? t("catalogPage.versionPublished") : result.status === "rejected" ? t("catalogPage.versionRejected") : t("catalogPage.unknownStatus"); setNotice(t("catalogPage.requestSent", { status })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("catalogPage.reviewError")); }
    finally { setBusy(false); }
  }
  async function importPackage(entry: PublicCatalogEntry) {
    if (!selectedCompanyId) return;
    setBusy(true); setError(null); setNotice(null);
    try { await publicCatalogApi.importDraft(selectedCompanyId, entry.id); setNotice(t("catalogPage.draftCreated")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("catalogPage.importError")); }
    finally { setBusy(false); }
  }
  async function ratePackage(entry: PublicCatalogEntry) {
    if (!selectedCompanyId) return;
    const receiptId = ratingReceipts[entry.id]; const rating = Number(ratingValues[entry.id]);
    if (!receiptId || rating < 1 || rating > 5) return;
    setBusy(true); setError(null); setNotice(null);
    try { await publicCatalogApi.rate(selectedCompanyId, entry.id, receiptId, rating); setNotice(t("catalogPage.ratingSaved")); await load(new AbortController().signal); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("catalogPage.ratingError")); }
    finally { setBusy(false); }
  }
  async function decide(entry: (typeof reviewQueue)[number], decision: "approve" | "reject") {
    setBusy(true); setError(null); setNotice(null);
    try { await publicCatalogApi.decide(entry.id, entry.contentHash, decision); setReviewQueue((current) => current.filter((item) => item.id !== entry.id)); setNotice(decision === "approve" ? t("catalogPage.versionPublished") : t("catalogPage.versionRejected")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("catalogPage.reviewActionError")); }
    finally { setBusy(false); }
  }
  async function moderateRating(id: string, visible: boolean) {
    setBusy(true); setError(null); setNotice(null);
    try { await publicCatalogApi.moderate(id, visible); setModerationQueue((current) => current.map((item) => item.id === id ? { ...item, status: visible ? "visible" : "hidden" } : item)); setNotice(visible ? t("catalogPage.ratingRestored") : t("catalogPage.ratingHidden")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("catalogPage.moderationError")); }
    finally { setBusy(false); }
  }
  return <main className="space-y-6 p-6">
    {selectedCompanyId && identityUserId && <TemplateLibraryNav current="shared" />}
    <header><h1 className="text-2xl font-semibold">{t("uxTeam.catalog.sharedTitle", { defaultValue: "Plantillas compartidas" })}</h1><p className="text-muted-foreground">{t("catalogPage.description")}</p></header>
    {error && <Card role="alert" className="border-destructive"><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card>}
    {notice && <Card role="status"><CardContent className="pt-6 text-sm">{notice}</CardContent></Card>}
    {isInstanceAdmin && <Card><CardHeader><CardTitle>{t("catalogPage.adminQueue")}</CardTitle></CardHeader><CardContent className="space-y-4">{reviewQueue.length === 0 ? <p className="text-sm text-muted-foreground">{t("catalogPage.noRequests")}</p> : reviewQueue.map((entry) => <article key={entry.id} className="space-y-2 border-b pb-4"><h2 className="font-medium">{entry.name} · {entry.packageVersion}</h2><p>{entry.description}</p><details><summary className="cursor-pointer text-sm">{t("catalogPage.inspect")}</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(entry.package, null, 2)}</pre></details><div className="flex gap-2"><Button disabled={busy} onClick={() => void decide(entry, "approve")}>{t("catalogPage.approve")}</Button><Button variant="outline" disabled={busy} onClick={() => void decide(entry, "reject")}>{t("catalogPage.reject")}</Button></div></article>)}</CardContent></Card>}
    {isInstanceAdmin && <Card><CardHeader><CardTitle>{t("catalogPage.moderation")}</CardTitle></CardHeader><CardContent className="space-y-3">{moderationQueue.length === 0 ? <p className="text-sm text-muted-foreground">{t("catalogPage.noRatings")}</p> : moderationQueue.map((item) => <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-b pb-3"><div><p className="font-medium">{item.packageName} · {item.rating} / 5</p>{item.review && <p className="text-sm text-muted-foreground">{item.review}</p>}<p className="text-xs text-muted-foreground">{item.status}</p></div><Button variant="outline" disabled={busy} onClick={() => void moderateRating(item.id, item.status === "hidden")}>{item.status === "hidden" ? t("catalogPage.restore") : t("catalogPage.hide")}</Button></article>)}</CardContent></Card>}
    <section className="grid gap-4 md:grid-cols-2">{entries.map((entry) => { const receipts = installations.filter((item) => item.packageKey === entry.packageKey && item.packageVersion === entry.packageVersion && item.status === "completed"); return <Card key={entry.id}><CardHeader><CardTitle>{entry.name} <span className="text-sm font-normal text-muted-foreground">v{entry.packageVersion}</span></CardTitle></CardHeader><CardContent className="space-y-3"><p>{entry.description}</p><p className="text-sm text-muted-foreground">{entry.installationCount} completed installs · {entry.averageRating === null ? t("catalogPage.noRating") : `${entry.averageRating.toFixed(1)} / 5 (${entry.ratingCount})`}</p><Button disabled={!selectedCompanyId || busy} onClick={() => void importPackage(entry)}>{t("catalogPage.importDraft")}</Button>{receipts.length > 0 && <div className="flex flex-wrap items-center gap-2"><Select value={ratingReceipts[entry.id] ?? ""} onValueChange={(value) => setRatingReceipts((current) => ({ ...current, [entry.id]: value }))}><SelectTrigger className="w-56"><SelectValue placeholder={t("catalogPage.receipt")} /></SelectTrigger><SelectContent>{receipts.map((receipt) => <SelectItem key={receipt.id} value={receipt.id}>{receipt.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select><Select value={ratingValues[entry.id] ?? ""} onValueChange={(value) => setRatingValues((current) => ({ ...current, [entry.id]: value }))}><SelectTrigger className="w-28"><SelectValue placeholder={t("catalogPage.rating")} /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5].map((value) => <SelectItem key={value} value={String(value)}>{value} / 5</SelectItem>)}</SelectContent></Select><Button variant="outline" disabled={busy || !ratingReceipts[entry.id] || !ratingValues[entry.id]} onClick={() => void ratePackage(entry)}>{t("catalogPage.rateInstall")}</Button></div>}</CardContent></Card>; })}</section>
    <Card><CardHeader><CardTitle>{t("catalogPage.publication")}</CardTitle></CardHeader><CardContent className="space-y-4">
      <Select value={selectedPackageId} onValueChange={(value) => void choosePackage(value)}><SelectTrigger><SelectValue placeholder={t("catalogPage.choosePackage")} /></SelectTrigger><SelectContent>{privatePackages.filter((item) => item.status === "published").map((item) => <SelectItem key={item.id} value={item.id}>{item.name} · {item.packageVersion}</SelectItem>)}</SelectContent></Select>
      {content && <><p className="text-sm text-muted-foreground">{t("catalogPage.disclose")}</p><div className="max-h-80 space-y-2 overflow-auto">{choices.map((choice) => <label key={`${choice.section}:${choice.id}`} className="flex items-center gap-2"><Checkbox checked={isSelected(choice)} onCheckedChange={(checked) => toggle(choice, checked === true)} /><span>{choice.label}</span></label>)}</div><label className="flex items-start gap-2 text-sm"><Checkbox checked={attested} onCheckedChange={(checked) => setAttested(checked === true)} /><span>{t("catalogPage.attestation")}</span></label><Button disabled={busy || !attested || !choices.length || !Object.values(selection).some((items) => items.length)} onClick={() => void requestPublication()}>{t("catalogPage.submitReview")}</Button></>}
    </CardContent></Card>
  </main>;
}
