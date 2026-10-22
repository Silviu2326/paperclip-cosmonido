import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DailyBriefChannel } from "@paperclipai/shared";
import { dailyBriefApi } from "@/api/daily-brief";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useTranslation } from "@/i18n";

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Personal preferences card for the daily owner brief (Sprint 3 WP13). */
export function DailyBriefPreferences({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  // Null until the user edits the field; the input then shows the stored value.
  const [timezoneDraft, setTimezoneDraft] = useState<string | null>(null);
  const prefsKey = ["daily-brief", "preferences", companyId];

  const prefsQuery = useQuery({
    queryKey: prefsKey,
    queryFn: () => dailyBriefApi.getPreferences(companyId),
    enabled: Boolean(companyId),
  });

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof dailyBriefApi.updatePreferences>[1]) =>
      dailyBriefApi.updatePreferences(companyId, patch),
    onSuccess: async () => {
      setTimezoneDraft(null);
      await qc.invalidateQueries({ queryKey: prefsKey });
    },
  });

  const preview = useQuery({
    queryKey: ["daily-brief", "preview", companyId],
    queryFn: () => dailyBriefApi.preview(companyId),
    enabled: previewOpen && Boolean(companyId),
  });

  const prefs = prefsQuery.data;

  if (prefsQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("dailyBrief.loading", { defaultValue: "Cargando preferencias…" })}
      </p>
    );
  }
  if (prefsQuery.isError || !prefs) {
    return (
      <p className="text-sm text-destructive">
        {t("dailyBrief.loadError", { defaultValue: "No se pudieron cargar las preferencias del resumen diario." })}
      </p>
    );
  }

  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const saveFailed = update.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("dailyBrief.title", { defaultValue: "Resumen diario" })}</CardTitle>
        <CardDescription>
          {t("dailyBrief.description", {
            defaultValue: "Recibe cada día lo hecho, lo entrado, lo que necesita tu decisión, los compromisos y el coste.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="daily-brief-enabled">
            {t("dailyBrief.enable", { defaultValue: "Activar resumen diario" })}
          </Label>
          <ToggleSwitch
            id="daily-brief-enabled"
            checked={prefs.enabled}
            disabled={update.isPending}
            onCheckedChange={(enabled) => update.mutate({ enabled })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="daily-brief-channel">
            {t("dailyBrief.channel", { defaultValue: "Canal" })}
          </Label>
          <NativeSelect
            id="daily-brief-channel"
            value={prefs.channel}
            disabled={update.isPending}
            onChange={(event) => update.mutate({ channel: event.target.value as DailyBriefChannel })}
          >
            <option value="email">{t("dailyBrief.channelEmail", { defaultValue: "Correo" })}</option>
            <option value="whatsapp">{t("dailyBrief.channelWhatsapp", { defaultValue: "WhatsApp" })}</option>
            <option value="none">{t("dailyBrief.channelNone", { defaultValue: "Ninguno" })}</option>
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="daily-brief-hour">
            {t("dailyBrief.hour", { defaultValue: "Hora de envío" })}
          </Label>
          <NativeSelect
            id="daily-brief-hour"
            value={String(prefs.hourLocal)}
            disabled={update.isPending}
            onChange={(event) => update.mutate({ hourLocal: Number(event.target.value) })}
          >
            {hours.map((hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, "0")}:00
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="daily-brief-timezone">
            {t("dailyBrief.timezone", { defaultValue: "Zona horaria" })}
          </Label>
          <Input
            id="daily-brief-timezone"
            value={timezoneDraft ?? prefs.timezone}
            onChange={(event) => setTimezoneDraft(event.target.value)}
            onBlur={() => {
              const next = (timezoneDraft ?? "").trim();
              if (next && next !== prefs.timezone) update.mutate({ timezone: next });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={update.isPending}
            onClick={() => {
              const detected = browserTimezone();
              setTimezoneDraft(null);
              if (detected !== prefs.timezone) update.mutate({ timezone: detected });
            }}
          >
            {t("dailyBrief.useBrowserTimezone", { defaultValue: "Usar la del navegador" })}
          </Button>
        </div>

        {saveFailed ? (
          <p className="text-sm text-destructive">
            {t("dailyBrief.saveError", { defaultValue: "No se pudo guardar. Revisa los datos e inténtalo de nuevo." })}
          </p>
        ) : null}

        <div>
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
            {t("dailyBrief.preview", { defaultValue: "Ver vista previa" })}
          </Button>
        </div>
      </CardContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dailyBrief.previewTitle", { defaultValue: "Vista previa del resumen" })}</DialogTitle>
            <DialogDescription>
              {t("dailyBrief.previewDescription", { defaultValue: "Así se verá el resumen de hoy con tus preferencias." })}
            </DialogDescription>
          </DialogHeader>
          {preview.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("dailyBrief.loading", { defaultValue: "Cargando preferencias…" })}
            </p>
          ) : preview.isError ? (
            <p className="text-sm text-destructive">
              {t("dailyBrief.previewError", { defaultValue: "No se pudo generar la vista previa." })}
            </p>
          ) : (
            <pre className="whitespace-pre-wrap text-sm">{preview.data?.markdown}</pre>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
