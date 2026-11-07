import type { ReactNode } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Lock, MessageCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useMotionTokens } from "@/hooks/useMotionTokens";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { accentInk, accentReadable, accentTint, brandAccent } from "@/lib/accent";

const MINT = brandAccent(8);
const SKY = brandAccent(7);
const LILAC = brandAccent(2);
const RISK = "var(--destructive)";

function Shell({ tint, icon, title, children, action }: { tint: string; icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  const tokens = useMotionTokens();
  return (
    <motion.div
      role={tint === RISK ? "alert" : undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut }}
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-6 py-16 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: accentTint(tint, 24), color: accentReadable(tint) }}>
        {icon}
      </span>
      <div>
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{title}</h2>
        <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      </div>
      {action}
    </motion.div>
  );
}

/** Nothing is open yet: choose an agent from the list. */
export function ChatNoSelection({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const tokens = useMotionTokens();
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-12 text-center">
      <motion.span
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: tokens.slow, ease: tokens.easeOut }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: `linear-gradient(135deg, ${MINT}, ${SKY})`, color: accentInk(SKY) }}
      >
        <MessageCircle className="h-6 w-6" />
      </motion.span>
      <div>
        <h1 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{t("agentChats.chooseTitle", { defaultValue: "Elige con quién hablar" })}</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t("agentChats.chooseText", { defaultValue: "Cada agente guarda una sola conversación contigo, con sus encargos y archivos al lado." })}</p>
      </div>
      {children}
    </div>
  );
}

/** The company has no agents to talk to. */
export function ChatNoAgents({ onAddAgent }: { onAddAgent: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell
      tint={MINT}
      icon={<MessageCircle className="h-6 w-6" />}
      title={t("agentChats.noAgentsTitle", { defaultValue: "Aún no tienes agentes con quien hablar" })}
      action={<Button onClick={onAddAgent}>{t("agentChats.addAgentButton", { defaultValue: "Añadir agente" })}</Button>}
    >
      {t("agentChats.addAgent")}
    </Shell>
  );
}

/** The conversation or the list could not load; retry in place. */
export function ChatLoadError({ onRetry, retrying, detail }: { onRetry: () => void; retrying: boolean; detail?: string }) {
  const { t } = useTranslation();
  return (
    <Shell
      tint={RISK}
      icon={<AlertTriangle className="h-6 w-6" />}
      title={t("agentChats.errorTitle", { defaultValue: "No se pudo cargar tus conversaciones" })}
      action={
        <Button onClick={onRetry} disabled={retrying}>
          <RefreshCw className={retrying ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          {retrying ? t("agentChats.retrying", { defaultValue: "Reintentando…" }) : t("agentChats.tryAgain")}
        </Button>
      }
    >
      {detail ?? t("agentChats.errorText", { defaultValue: "El chat no pudo conectarse. Tus datos están a salvo; vuelve a intentarlo en unos segundos." })}
    </Shell>
  );
}

/** The viewer's role does not include chatting with agents. */
export function ChatNoAccess() {
  const { t } = useTranslation();
  return (
    <Shell
      tint={LILAC}
      icon={<Lock className="h-6 w-6" />}
      title={t("agentChats.noAccessTitle", { defaultValue: "No tienes acceso al chat con agentes" })}
    >
      {t("agentChats.noAccessText", { defaultValue: "Tu rol no incluye este permiso. Pídeselo a un administrador de la empresa; mientras tanto el resto de la aplicación sigue disponible." })}
    </Shell>
  );
}

/** Loading placeholder shaped like a conversation: agent header, bubbles and composer. */
export function ChatSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6" aria-busy="true">
      <p role="status" className="sr-only">{t("agentChat.loading")}</p>
      <div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-xl" /><Skeleton className="h-5 w-40" /></div>
      <Skeleton className="h-14 w-2/3 rounded-2xl" />
      <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
      <Skeleton className="h-20 w-3/5 rounded-2xl" />
      <Skeleton className="mt-auto h-14 w-full rounded-2xl" />
    </div>
  );
}
