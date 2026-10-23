import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, CircleAlert, Film, ListVideo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { useCompany } from "../context/CompanyContext";
import { useTranslation } from "@/i18n";
import { mediaQueueApi } from "../api/media-queue";
import type { MediaQueueJob } from "@paperclipai/shared";

const priorityOptions = [0, 25, 50, 75, 100];

function JobRow({ job, companyId, onChanged }: { job: MediaQueueJob; companyId: string; onChanged: () => void }) {
  const [priority, setPriority] = useState(String(job.priority));
  const save = useMutation({
    mutationFn: () => mediaQueueApi.updatePriority(companyId, job.id, { priority: Number(priority), expectedUpdatedAt: job.updatedAt }),
    onSuccess: onChanged,
  });
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{job.kind.replaceAll("_", " ")}</p>
          <p className="break-all text-sm text-muted-foreground">Job {job.id} · Project {job.projectId}</p>
          <p className="text-xs text-muted-foreground">En cola desde {new Date(job.createdAt).toLocaleString()} · prioridad {job.priority}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label={`Prioridad para job ${job.id}`} value={priority} onChange={(event) => setPriority(event.target.value)} disabled={save.isPending}>
            {priorityOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </NativeSelect>
          <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending || Number(priority) === job.priority}>Guardar</Button>
        </div>
        {save.error ? <p role="alert" className="basis-full text-sm text-destructive">{save.error.message}. Actualiza la cola antes de volver a intentarlo.</p> : null}
      </CardContent>
    </Card>
  );
}

export function MediaQueue() {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const [pageState, setPageState] = useState<{ companyId: string | null; cursors: string[] }>({ companyId: selectedCompanyId, cursors: [] });
  const cursorStack = pageState.companyId === selectedCompanyId ? pageState.cursors : [];
  const cursor = cursorStack.at(-1);
  const queryClient = useQueryClient();
  const queryKey = ["media-queue", selectedCompanyId, cursor];
  const queue = useQuery({ queryKey, queryFn: () => mediaQueueApi.list(selectedCompanyId!, { cursor }), enabled: Boolean(selectedCompanyId), staleTime: 5_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["media-queue", selectedCompanyId] });

  if (!selectedCompany || !selectedCompanyId) return <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6"><Card><CardHeader><CardTitle>{t("uxFiles.production", { defaultValue: "Production" })}</CardTitle><CardDescription>{t("uxFiles.selectCompany", { defaultValue: "Select a company to see its production jobs." })}</CardDescription></CardHeader></Card></main>;
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted-foreground">{selectedCompany.name}</p><h1 className="text-2xl font-semibold">{t("uxFiles.production", { defaultValue: "Production" })}</h1></div><Button variant="outline" onClick={() => queue.refetch()} disabled={queue.isFetching}>{t("uxFiles.refreshQueue", { defaultValue: "Refresh queue" })}</Button></header>
      {queue.error ? <Card><CardContent className="flex items-start gap-3 pt-6"><CircleAlert className="size-5 text-destructive" /><p role="alert" className="text-sm">{queue.error.message}</p></CardContent></Card> : null}
      {queue.isLoading ? <p role="status" className="text-sm text-muted-foreground">Cargando trabajos…</p> : null}
      <section className="flex flex-col gap-3" aria-label="Trabajo en ejecución">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Film className="size-5" />En ejecución</h2>
        {queue.data?.running.length ? queue.data.running.map((job) => <Card key={job.id}><CardContent className="flex items-center gap-3 pt-5"><Film className="size-5 text-muted-foreground" /><div><p className="font-medium">{job.kind.replaceAll("_", " ")}</p><p className="break-all text-sm text-muted-foreground">Job {job.id} · iniciado {job.startedAt ? new Date(job.startedAt).toLocaleString() : "ahora"}</p></div></CardContent></Card>) : <p className="text-sm text-muted-foreground">No hay ningún trabajo en ejecución.</p>}
      </section>
      <section className="flex flex-col gap-3" aria-label="Trabajos pendientes">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ListVideo className="size-5" />Pendientes</h2>
          {queue.data?.jobs.length ? queue.data.jobs.map((job) => <JobRow key={`${job.id}:${job.updatedAt}`} job={job} companyId={selectedCompanyId} onChanged={refresh} />) : !queue.isLoading ? <Card><CardHeader><CardTitle>La cola está vacía</CardTitle><CardDescription>Los trabajos nuevos aparecerán aquí en el orden en que el worker los pueda admitir.</CardDescription></CardHeader></Card> : null}
      </section>
      <footer className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => setPageState({ companyId: selectedCompanyId, cursors: [] })} disabled={!cursor}><ArrowUp data-icon="inline-start" />Primera página</Button>
        {cursor && queue.data ? <Button variant="outline" onClick={() => setPageState({ companyId: selectedCompanyId, cursors: cursorStack.slice(0, -1) })}><ArrowUp data-icon="inline-start" />Página anterior</Button> : null}
        {queue.data?.nextCursor ? <Button onClick={() => setPageState({ companyId: selectedCompanyId, cursors: [...cursorStack, queue.data!.nextCursor!] })}>Siguiente página<ArrowDown data-icon="inline-end" /></Button> : null}
      </footer>
      <p className="text-sm text-muted-foreground">La prioridad ordena sólo los trabajos pendientes (0–100). El trabajo en ejecución no se interrumpe. Una edición concurrente requiere actualizar la cola y volver a guardar.</p>
    </main>
  );
}

export default MediaQueue;
