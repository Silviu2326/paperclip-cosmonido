import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, BellRing, CircleAlert, Clock3, CloudOff, Lock, Plug, RefreshCw, Rocket, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Progress } from "../parts";
import type { DemoApp } from "./demo-data";
import type { AppsConfig } from "./scenarios";

export type AppsVariantId = "a" | "b" | "c";

/** What the current member may do with connections, derived from the scenario. */
export interface AppRules {
  readOnly: boolean;
  plan: { name: string; max: number } | null;
  used: number;
  atLimit: boolean;
}

export function appRules(config: AppsConfig, apps: DemoApp[]): AppRules {
  const used = apps.filter((app) => app.state === "connected" || app.state === "attention").length;
  return { readOnly: config.readOnly, plan: config.plan, used, atLimit: config.plan !== null && used >= config.plan.max };
}

function Bone({ className, delay = 0 }: { className?: string; delay?: number }) {
  const tokens = useMotionTokens();
  return (
    <motion.div aria-hidden="true" className={cn("rounded-lg", className)} style={{ background: tint(ACCENT.muted, 22) }}
      animate={tokens.base > 0 ? { opacity: [0.45, 1, 0.45] } : { opacity: 0.7 }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay }} />
  );
}

/** Loading state shaped like the layout of each variant. */
export function AppsSkeleton({ variant = "a" }: { variant?: AppsVariantId }) {
  return (
    <div role="status" aria-label="Cargando apps" className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <div className="flex flex-col gap-2"><Bone className="h-7 w-24" /><Bone className="h-4 w-60" delay={0.1} /></div>
      {variant === "c" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((index) => <Bone key={index} className="h-20" delay={index * 0.08} />)}</div>
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 p-3"><Bone className="h-10 w-10" delay={index * 0.06} /><div className="flex flex-1 flex-col gap-2"><Bone className="h-4 w-1/3" delay={index * 0.06} /><Bone className="h-3 w-1/2" delay={index * 0.06 + 0.1} /></div><Bone className="hidden h-8 w-24 sm:block" delay={index * 0.06} /></div>
            ))}
          </div>
        </>
      ) : variant === "b" ? (
        <>
          <Bone className="h-6 w-72" />
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Bone key={index} className="h-32 rounded-2xl" delay={index * 0.07} />)}</div>
        </>
      ) : (
        <>
          <div className="flex gap-2"><Bone className="h-9 w-72 rounded-xl" /></div>
          <div className="flex gap-1.5">{[0, 1, 2, 3, 4].map((index) => <Bone key={index} className="h-7 w-20 rounded-full" delay={index * 0.06} />)}</div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
                <div className="flex items-center gap-3"><Bone className="h-11 w-11" delay={index * 0.07} /><div className="flex flex-1 flex-col gap-2"><Bone className="h-4 w-2/3" delay={index * 0.07} /><Bone className="h-3 w-full" delay={index * 0.07 + 0.1} /></div></div>
                <Bone className="h-6 w-24 rounded-full" delay={index * 0.07 + 0.15} />
                <Bone className="h-8 w-full" delay={index * 0.07 + 0.2} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AppsError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 p-10 text-center" role="alert">
      <IconTile icon={CloudOff} color={ACCENT.risk} />
      <div className="max-w-md">
        <h2 className="text-lg font-semibold">No hemos podido cargar tus apps</h2>
        <p className="text-sm text-muted-foreground">No sabemos qué apps tienes conectadas ahora mismo, pero tus agentes siguen funcionando con ellas. Esto solo afecta a esta pantalla.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onRetry} disabled={retrying}><RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} />{retrying ? "Reintentando…" : "Reintentar"}</Button>
        <Button variant="outline">Ver estado del servicio</Button>
      </div>
      <p className="text-xs text-muted-foreground">Código de error 503 · se reintentará solo en unos segundos</p>
    </div>
  );
}

function Banner({ color, icon: Icon, children, actions }: { color: string; icon: typeof CircleAlert; children: ReactNode; actions?: ReactNode }) {
  const tokens = useMotionTokens();
  return (
    <motion.div role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl p-3" style={{ background: `linear-gradient(90deg, ${tint(color, 24)}, ${tint(color, 7)})` }}>
        <Icon className="h-4 w-4 shrink-0" style={{ color: readable(color) }} />
        <div className="min-w-0 flex-1 text-sm">{children}</div>
        {actions}
      </div>
    </motion.div>
  );
}

/** What the scenario wants to say before the apps: read-only, plan limit, waiting approvals and failed checks. */
export function AppsBanners({ rules, apps, onRemind, onCheck, onUpgrade }: {
  rules: AppRules;
  apps: DemoApp[];
  onRemind: (app: DemoApp) => void;
  onCheck: (app: DemoApp) => void;
  onUpgrade: () => void;
}) {
  const [requested, setRequested] = useState(false);
  const pending = apps.filter((app) => app.state === "pending");
  const failed = apps.filter((app) => app.check === "failed");
  return (
    <AnimatePresence initial={false}>
      {rules.readOnly ? (
        <Banner key="ro" color={ACCENT.sky} icon={Lock} actions={<Button size="sm" variant="outline" disabled={requested} onClick={() => setRequested(true)}>{requested ? "Aviso enviado a los administradores" : "Pedir a un administrador"}</Button>}>
          <strong>Solo ves el estado.</strong> Conectar, reconectar o cambiar los permisos de una app lo hace un administrador de la empresa.
        </Banner>
      ) : null}
      {rules.plan ? (
        <Banner key="plan" color={rules.atLimit ? ACCENT.yellow : ACCENT.turquoise} icon={Plug} actions={<Button size="sm" onClick={onUpgrade} style={rules.atLimit ? { background: ACCENT.yellow, color: ink(ACCENT.yellow) } : undefined} variant={rules.atLimit ? "default" : "outline"}><Rocket className="h-3.5 w-3.5" />Ver planes</Button>}>
          <div className="flex flex-col gap-1.5">
            <span><strong>{rules.used} de {rules.plan.max} conexiones</strong> del plan {rules.plan.name}.{rules.atLimit ? " Has llegado al límite: para conectar otra app, mejora el plan o desconecta una." : ""}</span>
            <div className="max-w-xs"><Progress value={(rules.used / rules.plan.max) * 100} color={rules.atLimit ? ACCENT.yellow : ACCENT.turquoise} /></div>
          </div>
        </Banner>
      ) : null}
      {pending.length ? (
        <Banner key="pending" color={ACCENT.lilac} icon={Clock3}>
          <strong>{pending.length} {pending.length === 1 ? "solicitud espera" : "solicitudes esperan"} a un administrador:</strong>{" "}
          {pending.map((app, index) => (
            <span key={app.id}>{index ? ", " : ""}{app.name} <span className="text-muted-foreground">({app.pending?.approver.split(" (")[0]}, {app.pending?.since})</span>{" "}
              <button type="button" onClick={() => onRemind(app)} className="underline underline-offset-2">Recordar</button></span>
          ))}
        </Banner>
      ) : null}
      {failed.length ? (
        <Banner key="failed" color={ACCENT.yellow} icon={Stethoscope}>
          <strong>No hemos podido comprobar {failed.length === 1 ? "una conexión" : `${failed.length} conexiones`}.</strong> Siguen funcionando, pero no sabemos si están sanas.
          <span className="mt-1.5 flex flex-wrap gap-2">
            {failed.map((app) => <Button key={app.id} size="sm" variant="outline" onClick={() => onCheck(app)}><RefreshCw className="h-3.5 w-3.5" />Comprobar {app.name.length > 24 ? `${app.name.slice(0, 24)}…` : app.name}</Button>)}
          </span>
        </Banner>
      ) : null}
    </AnimatePresence>
  );
}

/** The one primary action of an app, which depends on its state, the member's rights and the plan. */
export function AppPrimaryAction({ app, rules, onOpen, onConnect, onRequest, onRemind, onUpgrade }: {
  app: DemoApp;
  rules: AppRules;
  onOpen: () => void;
  onConnect: () => void;
  onRequest: () => void;
  onRemind: () => void;
  onUpgrade: () => void;
}) {
  if (app.state === "pending") return <Button size="sm" variant="outline" onClick={onRemind}><BellRing className="h-3.5 w-3.5" />Recordar</Button>;
  if (app.state === "connected") return <Button size="sm" variant="outline" onClick={onOpen}>{rules.readOnly ? "Ver" : "Gestionar"}<ArrowRight className="h-3.5 w-3.5" /></Button>;
  if (rules.readOnly) return <Button size="sm" variant="outline" onClick={onRequest}>Pedir {app.state === "attention" ? "reconexión" : "conexión"}</Button>;
  if (app.state === "attention") return <Button size="sm" onClick={onConnect} style={{ background: ACCENT.yellow, color: ink(ACCENT.yellow) }}><RefreshCw className="h-3.5 w-3.5" />Reconectar</Button>;
  if (rules.atLimit) return <Button size="sm" variant="outline" onClick={onUpgrade}><Rocket className="h-3.5 w-3.5" />Mejorar plan</Button>;
  return <Button size="sm" onClick={onConnect} style={{ background: app.brand, color: ink(app.brand) }}><Plug className="h-3.5 w-3.5" />Conectar</Button>;
}
