import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { routinesApi } from "@/api/routines";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, useNavigate } from "@/lib/router";

type DailySummaryIntent = { hour: number; minute: number; cron: string; matchedTime: string | null };

/** Deterministic, visible phrase matching; intentionally no model call. */
export function interpretDailySummaryRequest(text: string): DailySummaryIntent | null {
  if (!/\b(resumen\s+diario|daily\s+summary)\b/i.test(text)) return null;
  const match = text.match(/\b(?:a\s+las?\s+)?([01]?\d|2[0-3])(?::([0-5]\d))\s*(?:h|hrs?)?\b/i);
  const hour = match ? Number(match[1]) : 9;
  const minute = match?.[2] ? Number(match[2]) : 0;
  return { hour, minute, cron: `${minute} ${hour} * * *`, matchedTime: match?.[0] ?? null };
}

export function DailySummaryAssistant({ companyId, snapshot }: { companyId: string; snapshot: { availableAgents: Array<{ id: string; name: string; title: string | null }> } }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [request, setRequest] = useState("");
  const [agentId, setAgentId] = useState("");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [requireActivity, setRequireActivity] = useState(true);
  const [createdRoutine, setCreatedRoutine] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intent = useMemo(() => interpretDailySummaryRequest(request), [request]);
  const timezoneValid = (() => {
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }); return true; }
    catch { return false; }
  })();
  const agent = snapshot.availableAgents.find((item) => item.id === agentId);
  const description = "Prepare a concise, internal daily summary from the company's current Paperclip work and metrics. Create an issue with the summary for human review. Do not send messages, contact customers, publish content, or change external records.";
  const routinePayload = intent && agent ? {
    title: "Resumen diario",
    description,
    assigneeAgentId: agent.id,
    status: "active",
    activityGatePolicy: requireActivity ? "require_external_activity" : "always",
    activityGateScope: "company",
    priority: "medium",
    concurrencyPolicy: "coalesce_if_active",
    catchUpPolicy: "skip_missed",
    variables: [],
  } : null;
  const triggerPayload = intent ? {
    kind: "schedule",
    label: `Diario ${String(intent.hour).padStart(2, "0")}:${String(intent.minute).padStart(2, "0")}`,
    cronExpression: intent.cron,
    timezone,
    enabled: true,
  } : null;
  const confirm = useMutation({
    mutationFn: async () => {
      if (!routinePayload || !triggerPayload || !agent) throw new Error("Completa y revisa la vista previa antes de confirmar.");
      const routine = await routinesApi.create(companyId, routinePayload);
      setCreatedRoutine({ id: routine.id, title: routine.title });
      try {
        await routinesApi.createTrigger(routine.id, triggerPayload);
      } catch (cause) {
        throw new Error(`La rutina se creó, pero su horario no: ${cause instanceof Error ? cause.message : "error desconocido"}. Abre la rutina para terminar la configuración.`);
      }
      return routine;
    },
    onSuccess: async (routine) => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["routines"] });
      navigate(`/routines/${routine.id}?tab=triggers`);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "No se pudo confirmar la configuración."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asistente de configuración por formulario</CardTitle>
        <CardDescription>Interpreta una solicitud de resumen diario con reglas explícitas, sin invocar un LLM. La vista previa no crea rutinas, horarios, permisos ni ejecuciones.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="builder-assistant-request">Describe la configuración que necesitas</Label>
          <Textarea id="builder-assistant-request" rows={3} maxLength={500} value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Quiero un resumen diario a las 09:30" />
          <p className="text-xs text-muted-foreground">Por ahora reconoce únicamente “resumen diario” o “daily summary” y una hora de 24 horas; si no indicas hora propone 09:00.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2"><Label htmlFor="assistant-agent">Agente asignado</Label><select id="assistant-agent" className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Selecciona un agente disponible</option>{snapshot.availableAgents.map((item) => <option key={item.id} value={item.id}>{item.name}{item.title ? ` · ${item.title}` : ""}</option>)}</select></div>
          <div className="flex flex-col gap-2"><Label htmlFor="assistant-timezone">Zona horaria</Label><Input id="assistant-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} maxLength={80} /></div>
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={requireActivity} onChange={(event) => setRequireActivity(event.target.checked)} /><span>Aplicar el gate existente `require_external_activity` para omitir el resumen cuando no haya actividad externa.</span></label>
        {!intent && request.trim() && <p role="status" className="text-sm text-muted-foreground">No se reconoce todavía una configuración admitida. Este asistente sólo crea resúmenes diarios; no inventa reglas de aviso de leads o canales.</p>}
        {intent && <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-sm font-medium">Interpretación determinista</p>
          <p className="text-sm text-muted-foreground">Reconoció “resumen diario”{intent.matchedTime ? ` y la hora “${intent.matchedTime}”` : "; asumió 09:00 porque no se indicó hora"}. Programación: todos los días a {String(intent.hour).padStart(2, "0")}:{String(intent.minute).padStart(2, "0")} ({timezone || "zona horaria sin indicar"}).</p>
          <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">{JSON.stringify({ routine: routinePayload, trigger: triggerPayload, diff: ["crear una rutina interna nueva", "asignarla al agente seleccionado", requireActivity ? "usar el gate require_external_activity" : "ejecutar sin ese gate", "crear un horario diario"], unchanged: ["autonomía", "presupuesto", "conexiones", "canales", "políticas de envío"] }, null, 2)}</pre>
          <p className="text-xs text-muted-foreground">Confirmar guardará la rutina activa y su horario con los permisos actuales. El prompt pide generar una tarea interna; no añade grants de autonomía, presupuesto, canal ni conexión. Las acciones externas existentes continúan sujetas a las políticas actuales.</p>
        </div>}
        {!timezoneValid && <p role="alert" className="text-sm text-destructive">Introduce una zona horaria IANA válida.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {createdRoutine && error && <Link className="text-sm text-primary underline underline-offset-2" to={`/routines/${createdRoutine.id}?tab=triggers`}>Abrir la rutina creada para terminar su horario</Link>}
        <Button type="button" disabled={!intent || !agent || !timezoneValid || confirm.isPending || Boolean(createdRoutine)} onClick={() => { setError(null); confirm.mutate(); }}>{confirm.isPending ? "Guardando configuración…" : "Confirmar y crear configuración diaria"}</Button>
      </CardContent>
    </Card>
  );
}
