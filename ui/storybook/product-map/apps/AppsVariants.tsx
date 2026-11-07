import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Mail,
  Megaphone,
  MessageCircle,
  Plug,
  RefreshCw,
  Share2,
  Stethoscope,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Panel, Pill, Progress, SectionTitle } from "../parts";
import { AppDetail, AppLogo, ConnectDialog, STATE } from "./AppsProposal";
import { AppPrimaryAction, AppsBanners, appRules } from "./AppsStates";
import type { DemoApp } from "./demo-data";
import type { AppsConfig } from "./scenarios";

/* ------------------------------------------------------------------ */
/* Shared behaviour of the two variants                                */
/* ------------------------------------------------------------------ */

function useAppsController(config: AppsConfig) {
  const [apps, setApps] = useState(config.apps);
  const [connecting, setConnecting] = useState<DemoApp | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rules = appRules(config, apps);
  const update = (id: string, patch: Partial<DemoApp>) => setApps((current) => current.map((app) => app.id === id ? { ...app, ...patch } : app));
  const say = (text: string) => { setToast(text); window.setTimeout(() => setToast(null), 4000); };
  const actions = {
    onRequest: (app: DemoApp) => say(`Pedido enviado a los administradores: conectar ${app.name}.`),
    onRemind: (app: DemoApp) => say(`Le hemos recordado a ${app.pending?.approver.split(" (")[0] ?? "un administrador"} la solicitud de ${app.name}.`),
    onUpgrade: () => say("Los planes se cambian en Ajustes → Facturación."),
    onCheck: (app: DemoApp) => { update(app.id, { check: undefined, checkError: undefined, lastCheck: "ahora mismo" }); say(`${app.name} comprobada: todo en orden.`); },
  };
  const finishConnect = (app: DemoApp, account: string) => {
    update(app.id, { state: "connected", account, attention: null, lastCheck: "ahora mismo", usedBy: app.usedBy || 1, permissions: app.permissions.map((permission, index) => index === 0 ? { ...permission, access: permission.access === "none" ? "ask" : permission.access } : permission) });
    setConnecting(null);
    say(`${app.name} conectada. Marta puede usarla pidiéndote permiso antes de actuar.`);
  };
  return { apps, rules, update, connecting, setConnecting, openId, setOpenId, toast, setToast, say, actions, finishConnect };
}

type Controller = ReturnType<typeof useAppsController>;

function Toast({ controller }: { controller: Controller }) {
  const tokens = useMotionTokens();
  return (
    <AnimatePresence>
      {controller.toast ? (
        <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span>{controller.toast}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => controller.setToast(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Header({ controller, subtitle }: { controller: Controller; subtitle?: string }) {
  const attention = controller.apps.filter((app) => app.state === "attention").length;
  return (
    <header>
      <h1 className="text-2xl font-semibold">Apps</h1>
      <p className="text-sm text-muted-foreground">{subtitle ?? `${controller.rules.used} conectadas · ${attention ? `${attention} ${attention === 1 ? "necesita" : "necesitan"} atención` : "todo en orden"}`}</p>
    </header>
  );
}

function Detail({ controller, backLabel }: { controller: Controller; backLabel: string }) {
  const open = controller.apps.find((app) => app.id === controller.openId);
  if (!open) return null;
  return (
    <AppDetail key={open.id} app={open} readOnly={controller.rules.readOnly} backLabel={backLabel} onBack={() => controller.setOpenId(null)} onUpdate={(patch) => controller.update(open.id, patch)} onReconnect={() => controller.setConnecting(open)}
      onDisconnect={() => { controller.update(open.id, { state: "available", account: null, lastCheck: null, attention: null, usedBy: 0, check: undefined, checkError: undefined }); controller.setOpenId(null); controller.say(`${open.name} desconectada.`); }} />
  );
}

/* ------------------------------------------------------------------ */
/* Variant B — "what do you want to achieve?"                          */
/* ------------------------------------------------------------------ */

interface Goal {
  id: string;
  title: string;
  text: string;
  icon: LucideIcon;
  color: string;
  appIds: string[];
  why: Record<string, string>;
  outcome: string;
}

const GOALS: Goal[] = [
  { id: "cobrar", title: "Cobrar a mis clientes", text: "Enlaces de pago y seguimiento de cobros desde tus propuestas.", icon: CreditCard, color: ACCENT.mint, appIds: ["stripe"], why: { stripe: "Crea los enlaces de pago y muestra qué cobros siguen pendientes." }, outcome: "Diego añadirá un enlace de pago a cada propuesta y tú lo apruebas antes de enviarla." },
  { id: "whatsapp", title: "Atender por WhatsApp", text: "Responder a tus clientes en minutos, también fuera de horario.", icon: MessageCircle, color: ACCENT.turquoise, appIds: ["whatsapp", "gmail"], why: { whatsapp: "Recibe y responde los mensajes de tus clientes.", gmail: "Si un cliente no contesta, el seguimiento sale por correo." }, outcome: "Nora responderá en menos de 2 minutos y te pasará solo lo que no sepa contestar." },
  { id: "redes", title: "Publicar en redes", text: "Un calendario de contenido que se programa y publica solo.", icon: Share2, color: ACCENT.lilac, appIds: ["instagram", "drive"], why: { instagram: "Programa y publica los posts que apruebes.", drive: "De ahí salen las fotos y vídeos de cada cliente." }, outcome: "Marta programará el calendario del mes y publicará cuando des el visto bueno." },
  { id: "newsletter", title: "Enviar newsletters", text: "Boletines a tus listas sin tocar una plantilla.", icon: Mail, color: ACCENT.sky, appIds: ["mailchimp", "gmail"], why: { mailchimp: "Guarda las listas y lanza las campañas.", gmail: "Para las pruebas y las respuestas de los suscriptores." }, outcome: "Nora preparará el boletín, te lo enseña y lo envía cuando lo apruebes." },
  { id: "reuniones", title: "Gestionar reuniones", text: "Que los clientes reserven y tú no pierdas horas cuadrando agendas.", icon: CalendarDays, color: ACCENT.yellow, appIds: ["gcal"], why: { gcal: "Consulta tus huecos libres y crea las reuniones." }, outcome: "Diego ofrecerá huecos reales a cada cliente y creará la reunión al confirmarse." },
  { id: "anuncios", title: "Anunciarme", text: "Campañas con presupuesto vigilado y resultados a la vista.", icon: Megaphone, color: ACCENT.mint, appIds: ["gads"], why: { gads: "Lee los resultados y propone cambios de puja para que los apruebes." }, outcome: "Marta revisará las campañas cada semana y te propondrá ajustes, nunca los aplica sola." },
];

function LogoStack({ apps }: { apps: DemoApp[] }) {
  return (
    <span className="flex -space-x-2" aria-hidden="true">
      {apps.map((app) => <span key={app.id} className="rounded-xl ring-2 ring-background"><AppLogo app={app} size="sm" /></span>)}
    </span>
  );
}

/** Goals first: pick what you want to achieve, and the page lists exactly which apps to connect. */
export function AppsGoals({ config }: { config: AppsConfig }) {
  const tokens = useMotionTokens();
  const controller = useAppsController(config);
  const { apps, rules } = controller;
  const [goalId, setGoalId] = useState<string | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const byId = (id: string) => apps.find((app) => app.id === id);
  const goals = GOALS.map((goal) => ({ ...goal, apps: goal.appIds.map(byId).filter((app): app is DemoApp => Boolean(app)) })).filter((goal) => goal.apps.length > 0);
  const ready = (app: DemoApp) => app.state === "connected" && app.check !== "failed";
  const goal = goals.find((candidate) => candidate.id === goalId) ?? null;
  const doneCount = goal ? goal.apps.filter(ready).length : 0;
  const allDone = goal !== null && doneCount === goal.apps.length;

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <Header controller={controller} />
      <AnimatePresence mode="wait" initial={false}>
        {controller.openId ? (
          <motion.div key="detail" exit={{ opacity: 0 }}><Detail controller={controller} backLabel="Volver a los objetivos" /></motion.div>
        ) : (
          <motion.div key="goals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex min-w-0 flex-col gap-6">
            <AppsBanners rules={rules} apps={apps} onRemind={controller.actions.onRemind} onCheck={controller.actions.onCheck} onUpgrade={controller.actions.onUpgrade} />
            <section className="flex min-w-0 flex-col gap-3">
              <div>
                <h2 className="text-lg font-semibold">¿Qué quieres conseguir?</h2>
                <p className="text-sm text-muted-foreground">Elige un objetivo y te decimos qué apps conectar, con qué permisos y qué hará tu equipo por ti.</p>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {goals.map((item, index) => {
                  const done = item.apps.filter(ready).length;
                  const complete = done === item.apps.length;
                  const selected = item.id === goalId;
                  return (
                    <motion.button key={item.id} type="button" aria-pressed={selected} onClick={() => setGoalId(selected ? null : item.id)}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
                      className={cn("group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md", selected ? "border-transparent" : "border-border")}
                      style={{ boxShadow: selected ? `0 0 0 2px ${item.color}` : undefined, background: `linear-gradient(135deg, ${tint(item.color, 16)}, transparent 70%)` }}>
                      <span className="flex items-start gap-3">
                        <IconTile icon={item.icon} color={item.color} />
                        <span className="min-w-0 flex-1"><span className="block font-semibold">{item.title}</span><span className="block text-xs text-muted-foreground">{item.text}</span></span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <LogoStack apps={item.apps} />
                        {complete ? <Pill color={ACCENT.mint} strong><Check className="h-3 w-3" />Listo</Pill> : <span className="text-xs text-muted-foreground">{done} de {item.apps.length} {item.apps.length === 1 ? "lista" : "listas"}</span>}
                      </span>
                      <Progress value={(done / item.apps.length) * 100} color={complete ? ACCENT.mint : item.color} />
                    </motion.button>
                  );
                })}
              </div>
            </section>

            <AnimatePresence initial={false}>
              {goal ? (
                <motion.section key={goal.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden" aria-label={`Plan: ${goal.title}`}>
                  <Panel>
                    <SectionTitle color={goal.color} icon={goal.icon}>Para «{goal.title.toLowerCase()}» necesitas {goal.apps.length === 1 ? "1 app" : `${goal.apps.length} apps`}</SectionTitle>
                    <ol className="flex min-w-0 flex-col divide-y divide-border">
                      {goal.apps.map((app, index) => (
                        <li key={app.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={ready(app) ? { background: ACCENT.mint, color: ink(ACCENT.mint) } : { background: tint(ACCENT.muted, 25) }}>{ready(app) ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                          <AppLogo app={app} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium"><span className="min-w-0 truncate" title={app.name}>{app.name}</span><Pill color={STATE[app.state].color}>{STATE[app.state].label}</Pill>{app.check === "failed" ? <Pill color={ACCENT.yellow}>Sin comprobar</Pill> : null}</p>
                            <p className="text-xs text-muted-foreground">{goal.why[app.id] ?? app.tagline}</p>
                          </div>
                          <AppPrimaryAction app={app} rules={rules} onOpen={() => controller.setOpenId(app.id)} onConnect={() => controller.setConnecting(app)} onRequest={() => controller.actions.onRequest(app)} onRemind={() => controller.actions.onRemind(app)} onUpgrade={controller.actions.onUpgrade} />
                        </li>
                      ))}
                    </ol>
                    <AnimatePresence initial={false}>
                      {allDone ? (
                        <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex items-start gap-3 rounded-xl p-3 text-sm" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.mint, 28)}, ${tint(ACCENT.turquoise, 14)})` }}>
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: readable(ACCENT.mint) }} />
                          <span><strong>¡Listo!</strong> {goal.outcome}</span>
                        </motion.div>
                      ) : (
                        <motion.p key="todo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-muted-foreground">Cuando conectes {goal.apps.length - doneCount === 1 ? "la que falta" : "las que faltan"}: {goal.outcome}</motion.p>
                      )}
                    </AnimatePresence>
                  </Panel>
                </motion.section>
              ) : null}
            </AnimatePresence>

            <section className="flex min-w-0 flex-col gap-3">
              <button type="button" aria-expanded={allOpen} onClick={() => setAllOpen(!allOpen)} className="flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">
                <motion.span animate={{ rotate: allOpen ? 0 : -90 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-4 w-4" /></motion.span>
                Ver todas las apps ({apps.length})
              </button>
              <AnimatePresence initial={false}>
                {allOpen ? (
                  <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                    {apps.slice(0, 40).map((app) => (
                      <li key={app.id} className="flex min-w-0 items-center gap-3 px-3 py-2">
                        <AppLogo app={app} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={app.name}>{app.name}</span>
                        <Pill color={STATE[app.state].color}>{STATE[app.state].label}</Pill>
                        <AppPrimaryAction app={app} rules={rules} onOpen={() => controller.setOpenId(app.id)} onConnect={() => controller.setConnecting(app)} onRequest={() => controller.actions.onRequest(app)} onRemind={() => controller.actions.onRemind(app)} onUpgrade={controller.actions.onUpgrade} />
                      </li>
                    ))}
                    {apps.length > 40 ? <li className="px-3 py-2 text-center text-xs text-muted-foreground">Y {apps.length - 40} más en el catálogo completo</li> : null}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
      <ConnectDialog app={controller.connecting} onClose={() => controller.setConnecting(null)} onDone={controller.finishConnect} />
      <Toast controller={controller} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Variant C — connection health dashboard                             */
/* ------------------------------------------------------------------ */

type Light = "ok" | "warn" | "bad" | "wait";
const LIGHT_COLOR: Record<Light, string> = { ok: ACCENT.mint, warn: ACCENT.yellow, bad: ACCENT.risk, wait: ACCENT.lilac };
const LIGHT_LABEL: Record<Light, string> = { ok: "Sanas", warn: "Con aviso", bad: "Reconectar", wait: "Esperando" };
const LIGHT_ORDER: Light[] = ["bad", "warn", "wait", "ok"];

function lightOf(app: DemoApp): Light {
  if (app.state === "attention") return "bad";
  if (app.state === "pending") return "wait";
  if (app.check === "failed") return "warn";
  return "ok";
}

/** Deterministic 30-day history: each bar is a day; red/amber bars are failed checks. */
function history(app: DemoApp, light: Light): { height: number; color: string }[] {
  let seed = [...app.id].reduce((sum, char) => sum + char.charCodeAt(0), 7);
  const next = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  return Array.from({ length: 30 }, (_, day) => {
    const recent = 29 - day;
    const failed = (light === "bad" && recent < 3) || (light === "warn" && recent < 2);
    return { height: failed ? 100 : 35 + Math.round(next() * 60), color: failed ? (light === "bad" ? ACCENT.risk : ACCENT.yellow) : ACCENT.mint };
  });
}

function Pulse({ color, active }: { color: string; active: boolean }) {
  const tokens = useMotionTokens();
  return (
    <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
      {active && tokens.base > 0 ? <motion.span className="absolute inset-0 rounded-full" style={{ background: color }} animate={{ scale: [1, 2.4], opacity: [0.6, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }} /> : null}
      <span className="relative h-3 w-3 rounded-full" style={{ background: color }} />
    </span>
  );
}

/** Health first: a traffic light per connection, 30-day history and the quick action that fixes it. */
export function AppsHealth({ config }: { config: AppsConfig }) {
  const tokens = useMotionTokens();
  const controller = useAppsController(config);
  const { apps, rules } = controller;
  const [filter, setFilter] = useState<Light | "all">("all");
  const [running, setRunning] = useState<string | null>(null);
  const [runAll, setRunAll] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);
  const [availableLimit, setAvailableLimit] = useState(12);
  const appsRef = useRef(apps);
  appsRef.current = apps;

  const inUse = apps.filter((app) => app.state !== "available");
  const available = apps.filter((app) => app.state === "available");
  const counts = useMemo(() => {
    const result: Record<Light, number> = { ok: 0, warn: 0, bad: 0, wait: 0 };
    for (const app of inUse) result[lightOf(app)] += 1;
    return result;
  }, [inUse]);
  const rows = [...inUse].filter((app) => filter === "all" || lightOf(app) === filter).sort((a, b) => LIGHT_ORDER.indexOf(lightOf(a)) - LIGHT_ORDER.indexOf(lightOf(b)));

  function checkOne(app: DemoApp): Promise<void> {
    return new Promise((resolve) => {
      setRunning(app.id);
      window.setTimeout(() => {
        // An attention app still fails its check: the check cannot repair a revoked sign-in.
        controller.update(app.id, app.state === "attention" ? { lastCheck: "ahora mismo" } : { lastCheck: "ahora mismo", check: undefined, checkError: undefined });
        setRunning(null);
        resolve();
      }, tokens.base > 0 ? 800 : 0);
    });
  }
  async function checkAll() {
    setRunAll(true);
    for (const app of appsRef.current.filter((candidate) => candidate.state === "connected" || candidate.state === "attention")) await checkOne(app);
    setRunAll(false);
    controller.say("Comprobación terminada. Las que siguen en rojo necesitan reconectarse.");
  }
  useEffect(() => () => setRunning(null), []);

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Header controller={controller} subtitle={`${inUse.length} en uso · ${counts.bad + counts.warn ? `${counts.bad + counts.warn} con problemas` : "todas sanas"}`} />
        <Button variant="outline" disabled={runAll || !inUse.length} onClick={() => void checkAll()}><Stethoscope className={cn("h-4 w-4", runAll && "animate-pulse")} />{runAll ? "Comprobando…" : "Comprobar todas"}</Button>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {controller.openId ? (
          <motion.div key="detail" exit={{ opacity: 0 }}><Detail controller={controller} backLabel="Volver al panel de salud" /></motion.div>
        ) : (
          <motion.div key="health" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex min-w-0 flex-col gap-5">
            <AppsBanners rules={rules} apps={apps} onRemind={controller.actions.onRemind} onCheck={controller.actions.onCheck} onUpgrade={controller.actions.onUpgrade} />
            <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
              {LIGHT_ORDER.map((light, index) => (
                <motion.button key={light} type="button" aria-pressed={filter === light} onClick={() => setFilter(filter === light ? "all" : light)}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: index * tokens.stagger }}
                  className={cn("flex min-w-0 flex-col gap-1 rounded-2xl border p-4 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md", filter === light ? "border-transparent" : "border-border")}
                  style={{ background: `linear-gradient(135deg, ${tint(LIGHT_COLOR[light], 18)}, transparent 70%)`, boxShadow: filter === light ? `0 0 0 2px ${LIGHT_COLOR[light]}` : undefined }}>
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Pulse color={LIGHT_COLOR[light]} active={counts[light] > 0 && (light === "bad" || light === "warn")} />{LIGHT_LABEL[light]}</span>
                  <span className="text-3xl font-semibold tabular-nums">{counts[light]}</span>
                </motion.button>
              ))}
            </div>

            {inUse.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center"><IconTile icon={Plug} color={ACCENT.lilac} /><p className="text-sm font-medium">Todavía no hay nada conectado</p><p className="max-w-sm text-sm text-muted-foreground">Cuando conectes una app, aquí verás si está sana, cuándo se comprobó por última vez y cómo ha ido el último mes.</p><Button onClick={() => setShowAvailable(true)}>Ver apps disponibles<ArrowRight className="h-4 w-4" /></Button></div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border" aria-label="Conexiones">
                <AnimatePresence initial={false}>
                  {rows.map((app, index) => {
                    const light = lightOf(app);
                    const bars = history(app, light);
                    return (
                      <motion.li key={app.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3">
                        <Pulse color={LIGHT_COLOR[light]} active={light === "bad" || light === "warn"} />
                        <AppLogo app={app} size="sm" />
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium"><span className="min-w-0 truncate" title={app.name}>{app.name}</span><Pill color={LIGHT_COLOR[light]}>{light === "ok" ? "Sana" : light === "warn" ? "Sin comprobar" : light === "wait" ? "Esperando aprobación" : "Necesita reconexión"}</Pill></p>
                          <p className="line-clamp-2 text-xs text-muted-foreground" title={app.attention ?? app.checkError ?? app.account ?? undefined}>{app.attention ?? app.checkError ?? (app.pending ? `Esperando a ${app.pending.approver} desde ${app.pending.since}.` : app.account)}</p>
                        </div>
                        <div className="hidden w-28 flex-col gap-1 sm:flex" aria-label="Últimos 30 días">
                          <span className="flex h-6 items-end gap-px" aria-hidden="true">{bars.map((bar, barIndex) => <span key={barIndex} className="flex-1 rounded-sm" style={{ height: `${bar.height}%`, background: tint(bar.color, 70) }} />)}</span>
                          <span className="text-xs text-muted-foreground">30 días</span>
                        </div>
                        <div className="w-24 text-xs text-muted-foreground"><p className="text-foreground">{running === app.id ? "Comprobando…" : app.lastCheck ?? "—"}</p><p>{app.usedBy} {app.usedBy === 1 ? "agente" : "agentes"}</p></div>
                        <div className="flex w-52 shrink-0 flex-wrap items-center justify-end gap-1.5">
                          {app.state !== "pending" ? <Button size="icon" variant="ghost" aria-label={`Comprobar ${app.name}`} disabled={running !== null} onClick={() => void checkOne(app)}><RefreshCw className={cn("h-4 w-4", running === app.id && "animate-spin")} /></Button> : null}
                          <AppPrimaryAction app={app} rules={rules} onOpen={() => controller.setOpenId(app.id)} onConnect={() => controller.setConnecting(app)} onRequest={() => controller.actions.onRequest(app)} onRemind={() => controller.actions.onRemind(app)} onUpgrade={controller.actions.onUpgrade} />
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
                {rows.length === 0 ? <li className="p-8 text-center text-sm text-muted-foreground">Ninguna conexión en este estado.</li> : null}
              </ul>
            )}

            <section className="flex min-w-0 flex-col gap-3">
              <button type="button" aria-expanded={showAvailable} onClick={() => setShowAvailable(!showAvailable)} className="flex items-center gap-2 self-start text-sm text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">
                <motion.span animate={{ rotate: showAvailable ? 0 : -90 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-4 w-4" /></motion.span>
                Apps disponibles para conectar ({available.length})
              </button>
              <AnimatePresence initial={false}>
                {showAvailable ? (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex flex-col gap-3 overflow-hidden">
                    <ul className="divide-y divide-border rounded-2xl border border-border">
                      {available.slice(0, availableLimit).map((app) => (
                        <li key={app.id} className="flex min-w-0 items-center gap-3 px-3 py-2"><AppLogo app={app} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium" title={app.name}>{app.name}</span><span className="block truncate text-xs text-muted-foreground">{app.tagline}</span></span>
                          <AppPrimaryAction app={app} rules={rules} onOpen={() => controller.setOpenId(app.id)} onConnect={() => controller.setConnecting(app)} onRequest={() => controller.actions.onRequest(app)} onRemind={() => controller.actions.onRemind(app)} onUpgrade={controller.actions.onUpgrade} /></li>
                      ))}
                    </ul>
                    {available.length > availableLimit ? <Button variant="outline" className="self-center" onClick={() => setAvailableLimit(availableLimit + 24)}>Mostrar {Math.min(24, available.length - availableLimit)} más · quedan {available.length - availableLimit}</Button> : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
      <ConnectDialog app={controller.connecting} onClose={() => controller.setConnecting(null)} onDone={controller.finishConnect} />
      <Toast controller={controller} />
    </div>
  );
}

