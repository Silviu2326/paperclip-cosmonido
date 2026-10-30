import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Download, Search } from "lucide-react";
import type { CatalogTeam } from "@paperclipai/shared";
import { agentCatalogOptions, catalogAgents, catalogAgentPresentation } from "../lib/agent-catalog";
import { teamCatalogApi } from "../api/teamCatalog";
import { adaptersApi } from "../api/adapters";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useTranslation } from "../i18n";
import { Link } from "../lib/router";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { NativeSelect } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";

function InstallAgent({ companyId, team, slug, onClose }: { companyId: string; team: CatalogTeam; slug: string; onClose: () => void }) {
  const { t } = useTranslation();
  const cache = useQueryClient();
  const [adapter, setAdapter] = useState("");
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const presentation = catalogAgentPresentation(team, slug, (key, fallback) => t(key, { defaultValue: fallback }));
  const options = agentCatalogOptions(slug, presentation.name);
  const preview = useQuery({ queryKey: ["agent-catalog", "preview", companyId, team.id, slug, team.contentHash, presentation.name], queryFn: () => teamCatalogApi.preview(companyId, team.id, options), retry: false, staleTime: 0 });
  const adapters = useQuery({ queryKey: ["agent-catalog", "adapters", companyId], queryFn: () => adaptersApi.list({ companyId }) });
  const choices = (adapters.data ?? []).filter((entry) => entry.loaded && !entry.disabled && !["process", "http"].includes(entry.type));
  const sourceAgent = preview.data?.portabilityPreview.manifest.agents.find((entry) => entry.slug === slug);
  const chosenAdapter = adapter || (choices.some((entry) => entry.type === sourceAgent?.adapterType) ? sourceAgent!.adapterType : choices[0]?.type) || "";
  const inputs = (preview.data?.portabilityPreview.envInputs ?? []).filter((entry) => !entry.agentSlug || entry.agentSlug === slug);
  const invalidSelection = Boolean(preview.data && (preview.data.portabilityPreview.selectedAgentSlugs.length !== 1 || preview.data.portabilityPreview.selectedAgentSlugs[0] !== slug));
  const errors = preview.data?.errors ?? [];
  const blocked = !preview.data || preview.isFetching || errors.length > 0 || invalidSelection || !choices.some((choice) => choice.type === chosenAdapter) || inputs.some((entry) => entry.requirement === "required" && !secrets[entry.key]?.trim() && !entry.defaultValue);
  const install = useMutation({
    mutationFn: async () => {
      const result = await teamCatalogApi.install(companyId, team.id, { ...options, adapterOverrides: { [slug]: { adapterType: chosenAdapter } }, secretValues: secrets });
      if (!result.portabilityImport.agents.some((agent) => agent.slug === slug && agent.id)) throw new Error(t("agentCatalog.invalidSelection"));
      return result;
    },
    onSuccess: () => {
      setSecrets({});
      void cache.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
      void cache.invalidateQueries({ queryKey: queryKeys.org(companyId) });
      void cache.invalidateQueries({ queryKey: queryKeys.teamCatalog.installed(companyId) });
    },
  });
  const installed = install.data?.portabilityImport.agents.find((agent) => agent.slug === slug && agent.id);
  return <Dialog open onOpenChange={(open) => { if (!open && !install.isPending) onClose(); }}>
    <DialogContent className="max-h-dvh overflow-y-auto">
      <DialogHeader><DialogTitle>{t("agentCatalog.installTitle")}</DialogTitle><DialogDescription>{t("agentCatalog.installHint")}</DialogDescription></DialogHeader>
      {install.isSuccess ? <div className="space-y-3" role="status"><Check className="size-6 text-primary" /><p>{t("agentCatalog.installed", { name: installed?.name ?? slug })}</p><p className="text-sm text-muted-foreground">{t("agentCatalog.connectionHint")}</p>{install.data.warnings.map((warning, index) => <p key={index} className="text-sm text-muted-foreground">{warning}</p>)}</div> : <div className="space-y-4">
        {preview.isPending && <p role="status">{t("agentCatalog.preparing")}</p>}
        {preview.isError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{preview.error.message}</p><Button variant="outline" onClick={() => void preview.refetch()}>{t("agentCatalog.retry")}</Button></div>}
        {sourceAgent && <div className="space-y-1 rounded-lg bg-muted p-3"><h3 className="font-semibold">{presentation.name}</h3><p className="text-sm text-muted-foreground">{presentation.teamName}</p><p className="text-sm">{presentation.description}</p>{sourceAgent.skills.length > 0 && <details className="text-xs text-muted-foreground"><summary>{t("agentCatalog.technicalDetails")}</summary><p>{sourceAgent.skills.join(" · ")}</p></details>}</div>}
        {errors.map((error, index) => <p key={index} role="alert" className="text-sm text-destructive">{error}</p>)}
        {invalidSelection && <p role="alert" className="text-sm text-destructive">{t("agentCatalog.invalidSelection")}</p>}
        {preview.data?.warnings.map((warning, index) => <p key={index} className="text-sm text-muted-foreground">{warning}</p>)}
        {adapters.isError && <p role="alert" className="text-sm text-destructive">{adapters.error.message}</p>}
        {preview.data && <div className="space-y-2"><label htmlFor="catalog-agent-adapter" className="text-sm font-medium">{t("agentCatalog.adapter")}</label><NativeSelect id="catalog-agent-adapter" value={chosenAdapter} onChange={(event) => setAdapter(event.target.value)} disabled={install.isPending || adapters.isPending}><option value="" disabled>{t("agentCatalog.chooseAdapter")}</option>{choices.map((choice) => <option key={choice.type} value={choice.type}>{choice.label}</option>)}</NativeSelect><p className="text-xs text-muted-foreground">{t("agentCatalog.connectionHint")}</p></div>}
        {inputs.map((input) => <div key={input.key} className="space-y-2"><label htmlFor={`catalog-secret-${input.key}`} className="text-sm">{input.description ?? input.key}{input.requirement === "required" ? " *" : ""}</label><Input id={`catalog-secret-${input.key}`} type={input.kind === "secret" ? "password" : "text"} autoComplete="off" disabled={install.isPending} value={secrets[input.key] ?? ""} onChange={(event) => setSecrets({ ...secrets, [input.key]: event.target.value })} /></div>)}
        {install.isError && <p role="alert" className="text-sm text-destructive">{install.error.message}</p>}
      </div>}
      <DialogFooter className="flex-row items-center justify-between sm:justify-between"><Button variant="ghost" disabled={install.isPending} onClick={onClose}>{t("agentCatalog.close")}</Button>{install.isSuccess ? installed && <Button asChild><Link to={`/agents/${installed.id}`}>{t("agentCatalog.openAgent")}</Link></Button> : <Button disabled={blocked || install.isPending} onClick={() => install.mutate()}>{install.isPending ? t("agentCatalog.installing") : t("agentCatalog.install")}</Button>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function AgentCatalog() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<{ team: CatalogTeam; slug: string } | null>(null);
  const catalog = useQuery({ queryKey: ["agent-catalog", "entries"], queryFn: () => teamCatalogApi.catalogList(), enabled: Boolean(selectedCompanyId) });
  useEffect(() => { setBreadcrumbs([{ label: t("agentCatalog.agents"), href: "/agents/all" }, { label: t("agentCatalog.title") }]); }, [setBreadcrumbs, t]);
  const entries = catalogAgents(catalog.data ?? [], search, category, (key, fallback) => t(key, { defaultValue: fallback }));
  const categories = [...new Set((catalog.data ?? []).map((team) => team.category))].sort();
  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">{t("agentCatalog.chooseCompany")}</p>;
  return <div className="space-y-6">
    <header className="space-y-3"><div className="flex flex-wrap gap-2"><Button asChild variant="ghost" size="sm"><Link to="/agents/all">{t("agentCatalog.myAgents")}</Link></Button><Button variant="secondary" size="sm" aria-current="page">{t("agentCatalog.title")}</Button></div><h1 className="text-2xl font-semibold">{t("agentCatalog.title")}</h1><p className="max-w-2xl text-sm text-muted-foreground">{t("agentCatalog.description")}</p></header>
    <div className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><Input aria-label={t("agentCatalog.search")} placeholder={t("agentCatalog.search")} className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div><NativeSelect className="sm:w-auto" aria-label={t("agentCatalog.category")} value={category} onChange={(event) => setCategory(event.target.value)}><option value="">{t("agentCatalog.allCategories")}</option>{categories.map((value) => <option key={value} value={value}>{t(`agentCatalog.categories.${value}`, { defaultValue: value.replace(/-/g, " ") })}</option>)}</NativeSelect></div>
    {catalog.isPending && <p role="status">{t("agentCatalog.loading")}</p>}
    {catalog.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{catalog.error.message}</p><Button variant="outline" onClick={() => void catalog.refetch()}>{t("agentCatalog.retry")}</Button></div>}
    {catalog.isSuccess && entries.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{t("agentCatalog.empty")}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{entries.map(({ team, slug, name, description, teamName }) => <article key={`${team.id}:${slug}`} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5"><div className="flex items-start gap-3"><span className="rounded-lg bg-accent p-2 text-accent-foreground"><Bot className="size-5" /></span><div className="min-w-0"><h2 className="text-base font-semibold">{name}</h2><p className="text-xs text-muted-foreground">{teamName}</p></div></div><p className="flex-1 text-sm text-muted-foreground">{description}</p><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{t(`agentCatalog.categories.${team.category}`, { defaultValue: team.category.replace(/-/g, " ") })}</span><Button variant="outline" size="sm" onClick={() => setSelected({ team, slug })}><Download className="size-4" />{t("agentCatalog.install")}</Button></div></article>)}</div>
    {selected && <InstallAgent key={`${selectedCompanyId}:${selected.team.id}:${selected.slug}`} companyId={selectedCompanyId} {...selected} onClose={() => setSelected(null)} />}
  </div>;
}
