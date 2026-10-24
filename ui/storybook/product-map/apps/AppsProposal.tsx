import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Eye,
  KeyRound,
  Link2,
  MessageSquare,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  Webhook,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, SectionTitle } from "../parts";
import {
  ACCESS_LABEL,
  CATEGORIES,
  CONTEXTUAL_ENTRIES,
  type Access,
  type AppState,
  type DemoApp,
  type DemoPermission,
} from "./demo-data";

const STATE: Record<AppState, { label: string; color: string }> = {
  connected: { label: "Conectada", color: ACCENT.mint },
  attention: { label: "Necesita atención", color: ACCENT.yellow },
  available: { label: "Disponible", color: ACCENT.muted },
};

const ACCESS_COLOR: Record<Access, string> = { none: ACCENT.muted, read: ACCENT.sky, ask: ACCENT.yellow, write: ACCENT.mint };
const ACCESS_ORDER: Access[] = ["none", "read", "ask", "write"];

/** Brand logo tile: third-party brand colour, same in light and dark. */
function AppLogo({ app, size = "md" }: { app: Pick<DemoApp, "brand" | "letter" | "name">; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-xl font-bold", size === "sm" && "h-8 w-8 text-sm", size === "md" && "h-11 w-11 text-lg", size === "lg" && "h-14 w-14 text-2xl")}
      style={{ background: `linear-gradient(135deg, ${app.brand}, color-mix(in oklab, ${app.brand} 70%, black))`, color: "white", boxShadow: `0 6px 16px -6px ${app.brand}` }}
    >
      {app.letter}
    </span>
  );
}

function AppCard({ app, index, selected, onOpen, onConnect }: { app: DemoApp; index: number; selected: boolean; onOpen: () => void; onConnect: () => void }) {
  const tokens = useMotionTokens();
  const state = STATE[app.state];
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
      className={cn("group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md", selected ? "border-transparent" : "border-border")}
      style={{ boxShadow: selected ? `0 0 0 2px ${app.brand}` : undefined }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(circle at 100% 0%, ${tint(app.brand, 18)}, transparent 55%)` }} />
      <div className="relative flex items-start gap-3">
        <AppLogo app={app} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{app.name}</h3>
          <p className="line-clamp-2 text-xs text-muted-foreground">{app.tagline}</p>
        </div>
      </div>
      <div className="relative flex flex-wrap items-center gap-1.5">
        <Pill color={state.color}>{app.state === "connected" ? <Check className="h-3 w-3" /> : app.state === "attention" ? <CircleAlert className="h-3 w-3" /> : null}{state.label}</Pill>
        {app.usedBy ? <span className="text-xs text-muted-foreground">{app.usedBy} {app.usedBy === 1 ? "agente" : "agentes"}</span> : null}
      </div>
      {app.attention ? <p className="relative rounded-lg px-2.5 py-1.5 text-xs" style={{ background: tint(ACCENT.yellow, 20) }}>{app.attention}</p> : null}
      <div className="relative mt-auto flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-muted-foreground">{app.account ?? app.category}</span>
        {app.state === "available" ? (
          <Button size="sm" onClick={onConnect} style={{ background: app.brand, color: ink(app.brand) }}><Plug className="h-3.5 w-3.5" />Conectar</Button>
        ) : app.state === "attention" ? (
          <Button size="sm" onClick={onConnect} style={{ background: ACCENT.yellow, color: ink(ACCENT.yellow) }}><RefreshCw className="h-3.5 w-3.5" />Reconectar</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onOpen}>Gestionar<ArrowRight className="h-3.5 w-3.5" /></Button>
        )}
      </div>
    </motion.article>
  );
}

function ConnectDialog({ app, onClose, onDone }: { app: DemoApp | null; onClose: () => void; onDone: (app: DemoApp, account: string) => void }) {
  const tokens = useMotionTokens();
  const [step, setStep] = useState(0);
  const [key, setKey] = useState("");
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const steps = ["Cuenta", "Permisos", "Listo"];
  const reset = () => { setStep(0); setKey(""); setAllowed({}); setBusy(false); };
  const close = () => { reset(); onClose(); };
  if (!app) return null;
  const account = app.account ?? (app.authKind === "oauth" ? "hola@cosmonido.com" : "Cuenta de Cosmonido");
  const granted = app.groups.filter((group) => allowed[group.id] !== false);

  function next() {
    if (step === 0 && app!.authKind === "oauth") {
      setBusy(true);
      window.setTimeout(() => { setBusy(false); setStep(1); }, tokens.base > 0 ? 900 : 0);
      return;
    }
    if (step === 1) {
      setBusy(true);
      window.setTimeout(() => { setBusy(false); setStep(2); }, tokens.base > 0 ? 900 : 0);
      return;
    }
    setStep(step + 1);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <AppLogo app={app} />
            <div className="min-w-0">
              <DialogTitle>{app.state === "attention" ? `Reconectar ${app.name}` : `Conectar ${app.name}`}</DialogTitle>
              <DialogDescription>{app.tagline}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ol className="flex items-center gap-2" aria-label="Pasos">
          {steps.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <motion.span animate={{ scale: index === step ? 1.08 : 1 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={index < step ? { background: ACCENT.mint, color: ink(ACCENT.mint) } : index === step ? { background: app.brand, color: ink(app.brand) } : { background: tint(ACCENT.muted, 25) }}>
                {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </motion.span>
              <span className={cn("text-xs", index === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
              {index < steps.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-4">
            {step === 0 ? (
              app.authKind === "oauth" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3 rounded-xl p-3 text-sm" style={{ background: tint(ACCENT.sky, 14) }}>
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: readable(ACCENT.sky) }} />
                    <p>Te llevaremos a {app.name} para que inicies sesión. <strong>Nunca vemos ni guardamos tu contraseña</strong>; puedes quitar el acceso cuando quieras.</p>
                  </div>
                  <Button disabled={busy} onClick={next} style={{ background: app.brand, color: ink(app.brand) }}>
                    {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}{busy ? `Abriendo ${app.name}…` : `Continuar con ${app.name}`}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="apps-connect-key">Clave de API de {app.name}</Label>
                    <div className="flex items-center gap-2 rounded-md border border-input px-3 py-1.5 focus-within:ring-2 focus-within:ring-ring">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <Input id="apps-connect-key" autoFocus type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Pega aquí tu clave" className="h-7 border-0 p-0 shadow-none focus-visible:ring-0" />
                    </div>
                    <p className="text-xs text-muted-foreground">Se guarda cifrada y solo la usan los agentes que tú autorices. La encuentras en los ajustes de desarrollador de {app.name}.</p>
                  </div>
                  <Button disabled={key.trim().length < 6 || busy} onClick={next}>Guardar y continuar<ArrowRight className="h-4 w-4" /></Button>
                </div>
              )
            ) : null}

            {step === 1 ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">Esto es lo que tus agentes podrán hacer con {app.name}. Quita lo que no quieras darles.</p>
                {app.groups.map((group) => {
                  const on = allowed[group.id] !== false;
                  return (
                    <button key={group.id} type="button" role="switch" aria-checked={on} onClick={() => setAllowed((current) => ({ ...current, [group.id]: !on }))}
                      className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-(--motion-duration-fast)", on ? "border-transparent" : "border-border opacity-70")}
                      style={on ? { background: tint(ACCENT.mint, 14), boxShadow: `inset 0 0 0 1.5px ${tint(ACCENT.mint, 60)}` } : undefined}>
                      <IconTile icon={group.needs === "write" ? Workflow : Eye} color={group.needs === "write" ? ACCENT.yellow : ACCENT.sky} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">{group.title}{group.needs === "write" ? <Pill color={ACCENT.yellow}>Actúa por ti</Pill> : <Pill color={ACCENT.sky}>Solo lectura</Pill>}</span>
                        <span className="block text-xs text-muted-foreground">{group.text}</span>
                      </span>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border" style={on ? { background: ACCENT.mint, borderColor: ACCENT.mint, color: ink(ACCENT.mint) } : undefined}>{on ? <Check className="h-3.5 w-3.5" /> : null}</span>
                    </button>
                  );
                })}
                <p className="text-xs text-muted-foreground">Las acciones que cambian cosas piden tu aprobación hasta que decidas lo contrario en «Permisos por agente».</p>
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" />Atrás</Button>
                  <Button disabled={busy} onClick={next} style={{ background: app.brand, color: ink(app.brand) }}>{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}{busy ? "Comprobando…" : "Permitir y conectar"}</Button>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>
                  <CheckCircle2 className="h-7 w-7" />
                </motion.span>
                <h3 className="text-lg font-semibold">{app.name} está conectada</h3>
                <p className="text-sm text-muted-foreground">{account} · {granted.length} {granted.length === 1 ? "permiso concedido" : "permisos concedidos"}. Comprobada ahora mismo.</p>
                <Button onClick={() => { onDone(app, account); reset(); }}>Ver conexión<ArrowRight className="h-4 w-4" /></Button>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function AccessPicker({ value, onChange, label }: { value: Access; onChange: (value: Access) => void; label: string }) {
  const tokens = useMotionTokens();
  return (
    <LayoutGroup id={`access-${label}`}>
      <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
        {ACCESS_ORDER.map((level) => (
          <button key={level} type="button" role="radio" aria-checked={value === level} onClick={() => onChange(level)} className={cn("relative rounded-md px-2 py-1 text-xs transition-colors duration-(--motion-duration-fast)", value === level ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {value === level ? <motion.span layoutId={`access-pill-${label}`} className="absolute inset-0 rounded-md" style={{ background: tint(ACCESS_COLOR[level], 34) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
            <span className="relative">{ACCESS_LABEL[level]}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

function AppDetail({ app, onBack, onUpdate, onDisconnect, onReconnect }: { app: DemoApp; onBack: () => void; onUpdate: (patch: Partial<DemoApp>) => void; onDisconnect: () => void; onReconnect: () => void }) {
  const tokens = useMotionTokens();
  const state = STATE[app.state];
  const [checking, setChecking] = useState(false);
  const setAccess = (agent: string, access: Access) => onUpdate({ permissions: app.permissions.map((permission: DemoPermission) => permission.agent === agent ? { ...permission, access } : permission), usedBy: app.permissions.filter((permission) => (permission.agent === agent ? access : permission.access) !== "none").length });
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-4">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack}><ArrowLeft className="h-4 w-4" />Todas las apps</Button>
      <div className="relative overflow-hidden rounded-2xl border border-border p-5" style={{ background: `linear-gradient(135deg, ${tint(app.brand, 22)}, transparent 65%)` }}>
        <div className="flex flex-wrap items-center gap-4">
          <AppLogo app={app} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{app.name}</h2>
            <p className="text-sm text-muted-foreground">{app.account} · {app.authKind === "oauth" ? "Inicio de sesión seguro" : "Clave de API"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><Pill color={state.color} strong={app.state === "attention"}>{state.label}</Pill><span className="text-xs text-muted-foreground">Última comprobación: {app.lastCheck}</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={checking} onClick={() => { setChecking(true); window.setTimeout(() => { setChecking(false); onUpdate({ lastCheck: "ahora mismo" }); }, 900); }}>
              <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />{checking ? "Comprobando…" : "Comprobar ahora"}
            </Button>
            {app.state === "attention" ? <Button size="sm" onClick={onReconnect} style={{ background: ACCENT.yellow, color: ink(ACCENT.yellow) }}>Reconectar</Button> : null}
          </div>
        </div>
        {app.attention ? <p className="mt-4 flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: tint(ACCENT.yellow, 24) }}><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{app.attention}</p> : null}
      </div>

      <Panel>
        <SectionTitle color={ACCENT.turquoise} icon={ShieldCheck}>Permisos por agente</SectionTitle>
        <p className="text-xs text-muted-foreground">Cada agente tiene su propio nivel. «Pide permiso» deja una decisión en tu bandeja antes de actuar.</p>
        <div className="flex flex-col divide-y divide-border">
          {app.permissions.map((permission) => (
            <div key={permission.agent} className="flex flex-wrap items-center gap-3 py-2.5">
              <Avatar name={permission.agent} size="sm" />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{permission.agent}</p><p className="truncate text-xs text-muted-foreground">{permission.role}</p></div>
              <AccessPicker label={`${app.id}-${permission.agent}`} value={permission.access} onChange={(access) => setAccess(permission.agent, access)} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <Panel>
          <SectionTitle color={ACCENT.sky} icon={Eye}>Qué puede hacerse</SectionTitle>
          {app.groups.map((group) => (
            <div key={group.id} className="flex items-start gap-2.5 text-sm">
              <IconTile icon={group.needs === "write" ? Workflow : Eye} color={group.needs === "write" ? ACCENT.yellow : ACCENT.sky} size="sm" />
              <div className="min-w-0"><p className="font-medium">{group.title}</p><p className="text-xs text-muted-foreground">{group.text}</p></div>
            </div>
          ))}
        </Panel>
        <Panel>
          <SectionTitle color={ACCENT.lilac} icon={Webhook}>Relacionado</SectionTitle>
          {(app.related ?? []).length ? app.related!.map((entry) => (
            <button key={entry.label} type="button" className="group flex items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-accent/50">
              <IconTile icon={MessageSquare} color={ACCENT.lilac} size="sm" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{entry.label}</span><span className="block text-xs text-muted-foreground">{entry.text}</span></span>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" />
            </button>
          )) : <p className="text-sm text-muted-foreground">Nada más ligado a esta app.</p>}
          <div className="mt-auto border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={onDisconnect} style={{ color: readable(ACCENT.risk) }}><Unplug className="h-3.5 w-3.5" />Desconectar {app.name}</Button>
          </div>
        </Panel>
      </div>
    </motion.div>
  );
}

function EmptyApps({ onBrowse }: { onBrowse: () => void }) {
  const tokens = useMotionTokens();
  const ideas = [
    { name: "Gmail", text: "Que tu equipo lea y prepare correos.", brand: "#EA4335", letter: "G" },
    { name: "Google Calendar", text: "Reuniones y reservas con clientes.", brand: "#4285F4", letter: "C" },
    { name: "Instagram", text: "Programar y publicar contenido.", brand: "#C13584", letter: "I" },
  ];
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.span initial={{ scale: 0.8, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: tokens.slow, ease: tokens.easeOut }} className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${ACCENT.lilac}, ${ACCENT.sky})`, color: ink(ACCENT.sky) }}>
        <Plug className="h-7 w-7" />
      </motion.span>
      <div><h2 className="text-lg font-semibold">Conecta las herramientas que ya usas</h2><p className="text-sm text-muted-foreground">Tu equipo trabajará dentro de ellas, con los permisos que tú decidas.</p></div>
      <div className="grid w-full max-w-2xl min-w-0 gap-3 sm:grid-cols-3">
        {ideas.map((idea, index) => (
          <motion.div key={idea.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + index * tokens.stagger * 2 }} className="flex min-w-0 flex-col items-start gap-2 rounded-xl border border-border p-4 text-left">
            <AppLogo app={idea} size="sm" />
            <p className="text-sm font-medium">{idea.name}</p>
            <p className="text-xs text-muted-foreground">{idea.text}</p>
          </motion.div>
        ))}
      </div>
      <Button onClick={onBrowse}>Ver el catálogo<ArrowRight className="h-4 w-4" /></Button>
    </div>
  );
}

/** Apps: connection catalog with states, a stepped connect dialog and a connection detail with per-agent permissions. */
export function AppsProposal({ apps: initialApps, hasConnections = true }: { apps: DemoApp[]; hasConnections?: boolean }) {
  const tokens = useMotionTokens();
  const [apps, setApps] = useState(initialApps);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Todas");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<DemoApp | null>(null);
  const [browsing, setBrowsing] = useState(hasConnections);
  const [toast, setToast] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => apps.filter((app) => (category === "Todas" || app.category === category) && (!needle || `${app.name} ${app.tagline}`.toLowerCase().includes(needle))), [apps, category, needle]);
  const attention = apps.filter((app) => app.state === "attention");
  const connected = filtered.filter((app) => app.state !== "available");
  const available = filtered.filter((app) => app.state === "available");
  const open = apps.find((app) => app.id === openId) ?? null;
  const update = (id: string, patch: Partial<DemoApp>) => setApps((current) => current.map((app) => app.id === id ? { ...app, ...patch } : app));

  function finishConnect(app: DemoApp, account: string) {
    update(app.id, { state: "connected", account, attention: null, lastCheck: "ahora mismo", usedBy: app.usedBy || 1, permissions: app.permissions.map((permission, index) => index === 0 ? { ...permission, access: permission.access === "none" ? "ask" : permission.access } : permission) });
    setConnecting(null);
    setBrowsing(true);
    setOpenId(app.id);
    setToast(`${app.name} conectada. Marta puede usarla pidiéndote permiso antes de actuar.`);
    window.setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Apps</h1>
          <p className="text-sm text-muted-foreground">{hasConnections || apps.some((app) => app.state !== "available") ? `${apps.filter((app) => app.state !== "available").length} conectadas · ${attention.length ? `${attention.length} necesita atención` : "todo en orden"}` : "Aún no hay nada conectado"}</p>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <AppDetail key={open.id} app={open} onBack={() => setOpenId(null)} onUpdate={(patch) => update(open.id, patch)} onReconnect={() => setConnecting(open)}
            onDisconnect={() => { update(open.id, { state: "available", account: null, lastCheck: null, attention: null, usedBy: 0 }); setOpenId(null); setToast(`${open.name} desconectada.`); window.setTimeout(() => setToast(null), 3500); }} />
        ) : !browsing ? (
          <motion.div key="empty" exit={{ opacity: 0 }}><EmptyApps onBrowse={() => setBrowsing(true)} /></motion.div>
        ) : (
          <motion.div key="catalog" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex min-w-0 flex-col gap-5">
            <AnimatePresence>
              {attention.length ? (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden">
                  {attention.map((app) => (
                    <div key={app.id} className="flex flex-wrap items-center gap-3 rounded-2xl p-3" style={{ background: `linear-gradient(90deg, ${tint(ACCENT.yellow, 26)}, ${tint(ACCENT.yellow, 8)})` }}>
                      <AppLogo app={app} size="sm" />
                      <p className="min-w-0 flex-1 text-sm"><strong>{app.name}</strong> necesita que vuelvas a conectarla. {app.attention}</p>
                      <Button size="sm" onClick={() => setConnecting(app)} style={{ background: ACCENT.yellow, color: ink(ACCENT.yellow) }}><RefreshCw className="h-3.5 w-3.5" />Reconectar</Button>
                    </div>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar una app" aria-label="Buscar una app" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
            <LayoutGroup id="apps-categories">
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((item) => (
                  <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={cn("relative rounded-full border px-3 py-1 text-xs transition-colors duration-(--motion-duration-fast)", category === item ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}>
                    {category === item ? <motion.span layoutId="apps-category-pill" className="absolute inset-0 rounded-full" style={{ background: tint(ACCENT.lilac, 30) }} transition={{ duration: tokens.base, ease: tokens.easeOut }} /> : null}
                    <span className="relative">{item}</span>
                  </button>
                ))}
              </div>
            </LayoutGroup>

            {connected.length ? (
              <section className="flex min-w-0 flex-col gap-3">
                <SectionTitle color={ACCENT.mint} icon={CheckCircle2}>Tus apps</SectionTitle>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <AnimatePresence mode="popLayout">{connected.map((app, index) => <AppCard key={app.id} app={app} index={index} selected={false} onOpen={() => setOpenId(app.id)} onConnect={() => setConnecting(app)} />)}</AnimatePresence>
                </div>
              </section>
            ) : null}
            {available.length ? (
              <section className="flex min-w-0 flex-col gap-3">
                <SectionTitle color={ACCENT.muted} icon={Plug}>Disponibles para conectar</SectionTitle>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <AnimatePresence mode="popLayout">{available.map((app, index) => <AppCard key={app.id} app={app} index={index} selected={false} onOpen={() => setOpenId(app.id)} onConnect={() => setConnecting(app)} />)}</AnimatePresence>
                </div>
              </section>
            ) : null}
            {!connected.length && !available.length ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Ninguna app coincide con la búsqueda.</p> : null}

            <section className="flex min-w-0 flex-col gap-3">
              <SectionTitle color={ACCENT.lilac} icon={Webhook}>Canales y sincronización</SectionTitle>
              <div className="grid min-w-0 gap-3 md:grid-cols-3">
                {CONTEXTUAL_ENTRIES.map((entry) => (
                  <button key={entry.id} type="button" className="group flex min-w-0 items-start gap-3 rounded-2xl border border-border p-3 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md">
                    <IconTile icon={entry.id === "crm" ? RefreshCw : MessageSquare} color={ACCENT.lilac} />
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-medium">{entry.title}<Pill color={ACCENT.muted}>{entry.status}</Pill></span><span className="block text-xs text-muted-foreground">{entry.text}</span></span>
                  </button>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      <ConnectDialog app={connecting} onClose={() => setConnecting(null)} onDone={finishConnect} />

      <AnimatePresence>
        {toast ? (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span>{toast}</span>
            <button type="button" aria-label="Cerrar aviso" onClick={() => setToast(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
