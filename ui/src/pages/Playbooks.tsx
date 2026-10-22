import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutonomyLevel, CreatePlaybookInput, PlaybookStep, PlaybookStepKind, PlaybookChannel } from "@paperclipai/shared";
import { ArrowDown, ArrowUp, BookOpen, Plus, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { playbooksApi } from "@/api/playbooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";

const STEP_KINDS: PlaybookStepKind[] = ["qualify", "respond", "follow_up", "propose", "book", "close", "handoff", "wait"];
const CHANNELS: PlaybookChannel[] = ["email", "whatsapp", "sms", "chat", "call", "internal"];
const AUTONOMY_LEVELS: AutonomyLevel[] = ["draft_only", "send_with_approval", "send_direct"];

const stepKindLabels: Record<string, string> = {
  qualify: "Cualificar", respond: "Responder", follow_up: "Seguimiento", propose: "Proponer",
  book: "Reservar", close: "Cerrar", handoff: "Pasar a persona", wait: "Esperar",
};
const autonomyLabels: Record<string, string> = {
  draft_only: "Solo borrador", send_with_approval: "Enviar con aprobación", send_direct: "Enviar directamente",
};
const statusLabels: Record<string, string> = { draft: "Borrador", active: "Activo", archived: "Archivado" };
const runStatusLabels: Record<string, string> = {
  running: "En curso", waiting: "Esperando", paused: "Pausado", done: "Completado", failed: "Fallido", cancelled: "Cancelado",
};

function newStep(existing: PlaybookStep[]): PlaybookStep {
  let n = existing.length + 1;
  while (existing.some((step) => step.key === `paso-${n}`)) n += 1;
  return { key: `paso-${n}`, kind: "respond", autonomy: "draft_only", maxAttempts: 1, delayHours: null, channel: null, templateKey: null, condition: null, title: null, instructions: null };
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function Playbooks() {
  const { selectedCompanyId } = useCompany();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => { setBreadcrumbs([{ label: t("nav.playbooks", { defaultValue: "Playbooks" }) }]); }, [setBreadcrumbs, t]);
  const list = useQuery({ queryKey: ["playbooks", selectedCompanyId], queryFn: () => playbooksApi.list(selectedCompanyId!), enabled: !!selectedCompanyId });
  const usage = useQuery({ queryKey: ["playbook-usage", selectedCompanyId], queryFn: () => playbooksApi.usage(selectedCompanyId!), enabled: !!selectedCompanyId });
  if (!selectedCompanyId) return <EmptyState icon={BookOpen} message={t("goals.selectOrg", { defaultValue: "Selecciona una empresa." })} />;
  if (list.isLoading) return <PageSkeleton variant="list" />;
  if (list.error) return <p role="alert" className="text-sm text-destructive">{list.error.message}</p>;

  const usageFor = (playbookId: string) => {
    const row = usage.data?.find((item) => item.playbookId === playbookId);
    if (!row) return t("playbooks.noUsage", { defaultValue: "Sin ejecuciones" });
    return t("playbooks.usageCounts", {
      defaultValue: "En curso {{running}} · Esperando {{waiting}} · Completados {{done}} · Fallidos {{failed}}",
      running: row.runningRuns, waiting: row.waitingRuns, done: row.doneRuns, failed: row.failedRuns,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("playbooks.intro", { defaultValue: "Secuencias comerciales versionadas que se ejecutan paso a paso." })}</p>
        <NewPlaybookDialog companyId={selectedCompanyId} />
      </div>
      {usage.error && <p role="alert" className="text-sm text-destructive">{usage.error.message}</p>}
      {!list.data?.length ? (
        <EmptyState icon={BookOpen} message={t("playbooks.empty", { defaultValue: "Aún no hay playbooks." })} />
      ) : list.data.map((playbook) => (
        <Card key={playbook.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-4">
              <Link to={`/playbooks/${playbook.id}`}>{playbook.name}</Link>
              <Badge variant="secondary">{t(`playbooks.status.${playbook.status}`, { defaultValue: statusLabels[playbook.status] ?? playbook.status })}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="text-muted-foreground">{playbook.key} · v{playbook.version} · {playbook.steps.length} {t("playbooks.steps", { defaultValue: "pasos" })}</p>
            <p>{usageFor(playbook.id)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NewPlaybookDialog({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PlaybookStepKind>("respond");
  const [autonomy, setAutonomy] = useState<AutonomyLevel>("draft_only");
  const create = useMutation({
    mutationFn: (input: CreatePlaybookInput) => playbooksApi.create(companyId, input),
    onSuccess: async (playbook) => {
      await qc.invalidateQueries({ queryKey: ["playbooks", companyId] });
      setOpen(false);
      navigate(`/playbooks/${playbook.id}`);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus data-icon="inline-start" />{t("playbooks.new", { defaultValue: "Nuevo playbook" })}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("playbooks.new", { defaultValue: "Nuevo playbook" })}</DialogTitle>
          <DialogDescription>{t("playbooks.formDescription", { defaultValue: "Define la clave, el nombre y el primer paso. Podrás añadir más pasos en el editor." })}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const key = String(form.get("key") ?? "").trim();
            const name = String(form.get("name") ?? "").trim();
            const stepKey = String(form.get("stepKey") ?? "").trim() || "respond";
            if (!key || !name) return;
            create.mutate({
              key,
              name,
              description: String(form.get("description") ?? "").trim() || null,
              scopeKind: "lead_type",
              steps: [{ key: stepKey, kind, autonomy, maxAttempts: 1 }],
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="playbook-key">{t("playbooks.key", { defaultValue: "Clave" })}</Label>
            <Input id="playbook-key" name="key" required maxLength={80} pattern="[a-z0-9][a-z0-9_-]*" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="playbook-name">{t("common.name", { defaultValue: "Nombre" })}</Label>
            <Input id="playbook-name" name="name" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="playbook-description">{t("common.description", { defaultValue: "Descripción" })}</Label>
            <Textarea id="playbook-description" name="description" />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="playbook-step-key">{t("playbooks.stepKey", { defaultValue: "Clave del paso" })}</Label>
              <Input id="playbook-step-key" name="stepKey" defaultValue="respond" maxLength={80} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("playbooks.stepKind", { defaultValue: "Tipo de paso" })}</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as PlaybookStepKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STEP_KINDS.map((item) => <SelectItem key={item} value={item}>{t(`playbooks.kind.${item}`, { defaultValue: stepKindLabels[item] })}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("playbooks.autonomy", { defaultValue: "Autonomía" })}</Label>
              <Select value={autonomy} onValueChange={(value) => setAutonomy(value as AutonomyLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AUTONOMY_LEVELS.map((item) => <SelectItem key={item} value={item}>{t(`playbooks.autonomyLevel.${item}`, { defaultValue: autonomyLabels[item] })}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {create.error && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", { defaultValue: "Cancelar" })}</Button>
            <Button type="submit" disabled={create.isPending}>{t("playbooks.create", { defaultValue: "Crear playbook" })}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlaybookDetail() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["playbook", id], queryFn: () => playbooksApi.get(id), enabled: !!id });
  const playbook = query.data;
  const versions = useQuery({ queryKey: ["playbook-versions", playbook?.companyId, playbook?.key], queryFn: () => playbooksApi.list(playbook!.companyId, { key: playbook!.key }), enabled: !!playbook });
  const runs = useQuery({ queryKey: ["playbook-runs", playbook?.companyId, id], queryFn: () => playbooksApi.runs(playbook!.companyId, { playbookId: id, limit: 20 }), enabled: !!playbook });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<PlaybookStep[]>([]);
  const [selected, setSelected] = useState(0);

  // Reset the local editor whenever the server copy changes (new version or after save).
  useEffect(() => {
    if (!playbook) return;
    setName(playbook.name);
    setDescription(playbook.description ?? "");
    setSteps(playbook.steps);
    setSelected((index) => Math.min(index, Math.max(playbook.steps.length - 1, 0)));
  }, [playbook?.id, playbook?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setBreadcrumbs([
      { label: t("nav.playbooks", { defaultValue: "Playbooks" }), href: "/playbooks" },
      { label: playbook?.name ?? "…" },
    ]);
  }, [setBreadcrumbs, playbook?.name, t]);

  const refresh = async (playbookId: string, companyId: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["playbook", playbookId] }),
      qc.invalidateQueries({ queryKey: ["playbooks", companyId] }),
      qc.invalidateQueries({ queryKey: ["playbook-versions", companyId] }),
    ]);
  };
  const save = useMutation({
    mutationFn: () => playbooksApi.update(id, { name, description: description.trim() || null, steps }),
    onSuccess: (updated) => refresh(updated.id, updated.companyId),
  });
  const publish = useMutation({
    mutationFn: () => playbooksApi.publish(id),
    onSuccess: (updated) => refresh(updated.id, updated.companyId),
  });
  const newDraft = useMutation({
    mutationFn: () => playbooksApi.newDraft(id),
    onSuccess: async (draft) => {
      await refresh(draft.id, draft.companyId);
      navigate(`/playbooks/${draft.id}`);
    },
  });

  if (query.isLoading) return <PageSkeleton variant="detail" />;
  if (query.error || !playbook) return <p role="alert" className="text-sm text-destructive">{query.error?.message ?? t("playbooks.notFound", { defaultValue: "Playbook no encontrado" })}</p>;

  const isDraft = playbook.status === "draft";
  const current = steps[selected];
  const updateStep = (index: number, patch: Partial<PlaybookStep>) => setSteps((items) => items.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((items) => {
      const next = [...items];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setSelected(target);
  };
  const removeStep = (index: number) => {
    setSteps((items) => items.filter((_, i) => i !== index));
    setSelected((value) => Math.max(0, Math.min(value, steps.length - 2)));
  };
  const addStep = () => {
    setSteps((items) => [...items, newStep(items)]);
    setSelected(steps.length);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3">
            <span>{playbook.name} · v{playbook.version}</span>
            <Badge variant="secondary">{t(`playbooks.status.${playbook.status}`, { defaultValue: statusLabels[playbook.status] ?? playbook.status })}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">{playbook.key} · {t("playbooks.scope", { defaultValue: "Ámbito" })}: {playbook.scopeKind}{playbook.scopeValue ? ` (${playbook.scopeValue})` : ""}</p>
          <div className="flex flex-wrap items-center gap-3">
            {versions.data?.map((version) => (
              <Button key={version.id} size="sm" variant={version.id === id ? "default" : "outline"} asChild>
                <Link to={`/playbooks/${version.id}`}>v{version.version} · {t(`playbooks.status.${version.status}`, { defaultValue: statusLabels[version.status] ?? version.status })}</Link>
              </Button>
            ))}
          </div>
          {!isDraft && playbook.status === "active" && (
            <p className="text-sm text-muted-foreground">{t("playbooks.activeHint", { defaultValue: "Esta versión está activa. Para cambiarla, crea un nuevo borrador: los runs en curso conservan la versión con la que empezaron." })}</p>
          )}
          {(save.error || publish.error || newDraft.error) && (
            <p role="alert" className="text-sm text-destructive">{(save.error ?? publish.error ?? newDraft.error)?.message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("playbooks.stepsTitle", { defaultValue: "Pasos" })}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="playbook-edit-name">{t("common.name", { defaultValue: "Nombre" })}</Label>
              <Input id="playbook-edit-name" value={name} disabled={!isDraft} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="playbook-edit-description">{t("common.description", { defaultValue: "Descripción" })}</Label>
              <Input id="playbook-edit-description" value={description} disabled={!isDraft} onChange={(event) => setDescription(event.target.value)} />
            </div>
          </div>

          <ol className="flex flex-col gap-2">
            {steps.map((step, index) => (
              <li key={`${step.key}-${index}`} className="flex flex-wrap items-center justify-between gap-2">
                <Button variant={index === selected ? "default" : "outline"} size="sm" onClick={() => setSelected(index)}>
                  {index + 1}. {step.title?.trim() || step.key} · {t(`playbooks.kind.${step.kind}`, { defaultValue: stepKindLabels[step.kind] ?? step.kind })}
                </Button>
                {isDraft && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={t("playbooks.moveUp", { defaultValue: "Subir paso" })} disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp /></Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("playbooks.moveDown", { defaultValue: "Bajar paso" })} disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown /></Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {isDraft && <Button variant="outline" size="sm" className="self-start" onClick={addStep}><Plus data-icon="inline-start" />{t("playbooks.addStep", { defaultValue: "Añadir paso" })}</Button>}

          {current && (
            <fieldset className="grid gap-4 md:grid-cols-2" disabled={!isDraft}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="step-key">{t("playbooks.stepKey", { defaultValue: "Clave del paso" })}</Label>
                <Input id="step-key" value={current.key} maxLength={80} onChange={(event) => updateStep(selected, { key: event.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("playbooks.stepKind", { defaultValue: "Tipo de paso" })}</Label>
                <Select value={current.kind} onValueChange={(value) => updateStep(selected, { kind: value as PlaybookStepKind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STEP_KINDS.map((item) => <SelectItem key={item} value={item}>{t(`playbooks.kind.${item}`, { defaultValue: stepKindLabels[item] })}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="step-title">{t("common.title", { defaultValue: "Título" })}</Label>
                <Input id="step-title" value={current.title ?? ""} maxLength={200} onChange={(event) => updateStep(selected, { title: event.target.value || null })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("playbooks.channel", { defaultValue: "Canal" })}</Label>
                <Select value={current.channel ?? "none"} onValueChange={(value) => updateStep(selected, { channel: value === "none" ? null : (value as PlaybookChannel) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("playbooks.noChannel", { defaultValue: "Sin canal" })}</SelectItem>
                    {CHANNELS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="step-delay">{t("playbooks.delayHours", { defaultValue: "Esperar (horas)" })}</Label>
                <Input id="step-delay" type="number" min="0" step="1" value={current.delayHours ?? ""} onChange={(event) => updateStep(selected, { delayHours: parseOptionalNumber(event.target.value) })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("playbooks.autonomy", { defaultValue: "Autonomía" })}</Label>
                <Select value={current.autonomy} onValueChange={(value) => updateStep(selected, { autonomy: value as AutonomyLevel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AUTONOMY_LEVELS.map((item) => <SelectItem key={item} value={item}>{t(`playbooks.autonomyLevel.${item}`, { defaultValue: autonomyLabels[item] })}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="step-max-attempts">{t("playbooks.maxAttempts", { defaultValue: "Intentos máximos" })}</Label>
                <Input id="step-max-attempts" type="number" min="1" max="50" step="1" value={current.maxAttempts ?? ""} onChange={(event) => updateStep(selected, { maxAttempts: parseOptionalNumber(event.target.value) })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="step-template">{t("playbooks.templateKey", { defaultValue: "Clave de plantilla" })}</Label>
                <Input id="step-template" value={current.templateKey ?? ""} maxLength={120} onChange={(event) => updateStep(selected, { templateKey: event.target.value || null })} />
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="step-condition">{t("playbooks.condition", { defaultValue: "Condición" })}</Label>
                <Input id="step-condition" value={current.condition ?? ""} maxLength={2000} onChange={(event) => updateStep(selected, { condition: event.target.value || null })} />
              </div>
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="step-instructions">{t("playbooks.instructions", { defaultValue: "Instrucciones" })}</Label>
                <Textarea id="step-instructions" value={current.instructions ?? ""} maxLength={10000} onChange={(event) => updateStep(selected, { instructions: event.target.value || null })} />
              </div>
              {isDraft && (
                <div className="md:col-span-2">
                  <Button variant="ghost" size="sm" onClick={() => removeStep(selected)} disabled={steps.length <= 1}>
                    <Trash2 data-icon="inline-start" />{t("playbooks.removeStep", { defaultValue: "Quitar paso" })}
                  </Button>
                </div>
              )}
            </fieldset>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button variant="outline" onClick={() => { setName(playbook.name); setDescription(playbook.description ?? ""); setSteps(playbook.steps); }} disabled={!isDraft}>
              {t("common.cancel", { defaultValue: "Cancelar" })}
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {isDraft ? (
                <>
                  <Button variant="outline" onClick={() => publish.mutate()} disabled={publish.isPending || save.isPending}>{t("playbooks.publish", { defaultValue: "Publicar" })}</Button>
                  <Button onClick={() => save.mutate()} disabled={save.isPending || steps.length === 0 || !name.trim()}>{t("common.save", { defaultValue: "Guardar" })}</Button>
                </>
              ) : (
                <Button onClick={() => newDraft.mutate()} disabled={newDraft.isPending}>{t("playbooks.newDraft", { defaultValue: "Nuevo borrador" })}</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("playbooks.recentRuns", { defaultValue: "Ejecuciones recientes" })}</CardTitle></CardHeader>
        <CardContent>
          {runs.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Cargando…" })}</p>
          ) : runs.error ? (
            <p role="alert" className="text-sm text-destructive">{runs.error.message}</p>
          ) : !runs.data?.length ? (
            <p className="text-sm text-muted-foreground">{t("playbooks.noRuns", { defaultValue: "Esta versión aún no tiene ejecuciones." })}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.data.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{run.subjectKind} · {run.subjectId} · {t("playbooks.stepNumber", { defaultValue: "paso" })} {run.currentStepIndex + 1}</span>
                  <Badge variant="secondary">{t(`playbooks.runStatus.${run.status}`, { defaultValue: runStatusLabels[run.status] ?? run.status })}</Badge>
                  {run.failureReason && <span className="text-destructive">{run.failureReason}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

