import { motion } from "motion/react";
import { Lock, RefreshCw, WifiOff } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useMotionTokens } from "@/hooks/useMotionTokens";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { accentReadable, accentTint } from "@/lib/accent";
import { LILAC, RISK } from "./CustomerListParts";

/** Loading placeholder shaped like the customers page: header, summary cards, toolbar and rows. */
export function CustomersSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">{t("crm.customers.loading")}</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex w-full max-w-xs flex-col gap-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-full" /></div>
        <div className="flex gap-2"><Skeleton className="h-9 w-36" /><Skeleton className="h-9 w-32" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
      </div>
      <div className="flex flex-wrap gap-3"><Skeleton className="h-10 min-w-48 flex-1" /><Skeleton className="h-10 w-72 max-w-full" /></div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-xl border border-border p-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The list could not load: says so, keeps the user's data safe in the message, and retries in place. */
export function CustomersLoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const { t } = useTranslation();
  const tokens = useMotionTokens();
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl border border-border p-10 text-center"
      style={{ background: `linear-gradient(135deg, ${accentTint(RISK, 10)}, transparent 70%)` }}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: accentTint(RISK, 22), color: accentReadable(RISK) }}>
        <WifiOff className="h-7 w-7" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">{t("uxCrm.list.errorTitle", { defaultValue: "No hemos podido cargar tus clientes" })}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("uxCrm.list.errorText", { defaultValue: "La conexión con el servidor se interrumpió. Es temporal casi siempre." })}</p>
      </div>
      <Button onClick={onRetry} disabled={retrying}>
        <RefreshCw className={retrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {retrying ? t("uxCrm.list.retrying", { defaultValue: "Reintentando…" }) : t("uxCrm.list.retry", { defaultValue: "Reintentar" })}
      </Button>
      <p className="text-xs text-muted-foreground">{t("uxCrm.list.errorHelp", { defaultValue: "Tus datos no se han perdido. Si el problema sigue, avisa a un administrador." })}</p>
    </motion.div>
  );
}

/** The viewer's role does not include customers. */
export function CustomersNoAccess() {
  const { t } = useTranslation();
  const tokens = useMotionTokens();
  return (
    <motion.div
      role="note"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"
      style={{ background: accentTint(LILAC, 14) }}
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentReadable(LILAC) }} />
      <div className="min-w-0">
        <p className="font-medium">{t("uxCrm.list.noAccessTitle", { defaultValue: "No tienes acceso a los clientes" })}</p>
        <p className="text-muted-foreground">{t("uxCrm.list.noAccessText", { defaultValue: "Tu rol no incluye esta sección. Pídele acceso a un administrador." })}</p>
      </div>
    </motion.div>
  );
}
