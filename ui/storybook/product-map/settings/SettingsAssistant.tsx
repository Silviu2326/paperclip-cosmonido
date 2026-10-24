import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NoPermission } from "../activity/states";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Pill } from "../parts";
import { LANGUAGES, SCOPE_LABEL, type SettingsGroup, type SettingsScope } from "./demo-data";
import { SCOPE_COLOR, Toggle, validate } from "./sections";
import type { SettingsState } from "./state";
import { FieldError, LockPill, TwoFactorWizard } from "./states";

/**
 * Variant C — task assistant. Instead of a map of settings, a question: "what
 * do you want to do?". Each answer opens a small form that does it directly,
 * so nobody has to know which group a setting lives in.
 */

const DENIED_WHAT: Partial<Record<SettingsScope, string>> = { company: "los ajustes de la empresa", account: "la cuenta comercial", instance: "la administración de la instalación" };

interface Intent {
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
  scope: SettingsScope;
  group: string;
  keywords: string;
  /** A form key the administrator may have locked. */
  lockKey?: string;
  danger?: boolean;
  body: (close: (message?: string) => void) => ReactNode;
}

function PrimaryButton({ children, disabled, onClick, type = "button" }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return <Button type={type} disabled={disabled} onClick={onClick} style={disabled ? undefined : { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>{children}</Button>;
}

function Field({ id, label, children, error }: { id: string; label: string; children: ReactNode; error?: string }) {
  return <div className="flex flex-col gap-1.5"><Label htmlFor={id}>{label}</Label>{children}<FieldError>{error}</FieldError></div>;
}

function InviteForm({ close }: { close: (message?: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Miembro");
  const valid = /.+@.+\..+/.test(email);
  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (valid) close(`Invitación enviada a ${email} como ${role.toLowerCase()}.`); }}>
      <Field id="as-email" label="Email de la persona" error={email && !valid ? "Escribe un email válido, como nombre@empresa.com." : undefined}><Input id="as-email" type="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@empresa.com" /></Field>
      <Field id="as-role" label="Qué puede hacer"><NativeSelect id="as-role" value={role} onChange={(event) => setRole(event.target.value)}><option>Administrador/a</option><option>Miembro</option><option>Invitado/a</option></NativeSelect></Field>
      <p className="text-xs text-muted-foreground">Recibirá un enlace que caduca en 7 días. Puedes cambiar su rol cuando quieras.</p>
      <div className="flex justify-end"><PrimaryButton type="submit" disabled={!valid}><Icons.Send className="h-4 w-4" />Enviar invitación</PrimaryButton></div>
    </form>
  );
}

function ApiKeyForm({ close }: { close: (message?: string) => void }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  return created ? (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Copia la clave ahora: <strong>no volverá a mostrarse</strong>.</p>
      <code className="break-all rounded-xl bg-muted p-3 text-xs">pk_live_8f2c91d04a7b6e53a1f0c9d2e48b7a60</code>
      <div className="flex flex-wrap justify-between gap-2"><Button variant="outline" onClick={() => setCopied(true)}>{copied ? <Icons.Check className="h-4 w-4" /> : <Icons.Copy className="h-4 w-4" />}{copied ? "Copiada" : "Copiar clave"}</Button><PrimaryButton disabled={!copied} onClick={() => close("Clave de API creada.")}>Ya la he guardado</PrimaryButton></div>
    </div>
  ) : (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (name.trim()) setCreated(true); }}>
      <Field id="as-key" label="Para qué la vas a usar"><Input id="as-key" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Zapier · formularios web" /></Field>
      <div className="flex justify-end"><PrimaryButton type="submit" disabled={!name.trim()}><Icons.KeyRound className="h-4 w-4" />Crear clave</PrimaryButton></div>
    </form>
  );
}

function PlanForm({ close }: { close: (message?: string) => void }) {
  const plans = [{ id: "Gratis", price: "0 €", text: "1 empresa · 1 miembro" }, { id: "Agencia", price: "49 €/mes", text: "Hasta 5 empresas · 10 miembros" }, { id: "Estudio", price: "129 €/mes", text: "Empresas y miembros ilimitados" }];
  const [plan, setPlan] = useState("Agencia");
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Plan" className="grid gap-2 sm:grid-cols-3">
        {plans.map((item) => (
          <button key={item.id} role="radio" aria-checked={plan === item.id} onClick={() => setPlan(item.id)} className={cn("flex flex-col gap-0.5 rounded-xl border p-3 text-left text-sm transition-colors duration-(--motion-duration-fast)", plan === item.id ? "border-transparent" : "border-border hover:bg-accent/40")} style={plan === item.id ? { background: tint(ACCENT.lilac, 22), boxShadow: `inset 0 0 0 1.5px ${ACCENT.lilac}` } : undefined}>
            <span className="font-semibold">{item.id}</span><span className="tabular-nums">{item.price}</span><span className="text-xs text-muted-foreground">{item.text}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">El cambio se aplica en la próxima factura (1 de noviembre). Sin penalización.</p>
      <div className="flex justify-end"><PrimaryButton disabled={plan === "Agencia"} onClick={() => close(`Plan cambiado a ${plan} desde el 1 de noviembre.`)}>{plan === "Agencia" ? "Este es tu plan" : `Cambiar a ${plan}`}</PrimaryButton></div>
    </div>
  );
}

function SessionsForm({ state, close }: { state: SettingsState; close: (message?: string) => void }) {
  const others = state.data.sessions.filter((session) => !session.current);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Estos dispositivos tienen tu sesión abierta ahora mismo.</p>
      <ul className="flex max-h-56 flex-col divide-y divide-border overflow-auto rounded-xl border border-border">
        {others.slice(0, 8).map((session) => <li key={session.id} className="flex min-w-0 items-center gap-2 p-2.5 text-sm"><Icons.MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate" title={session.device}>{session.device}</span><span className="shrink-0 text-xs text-muted-foreground">{session.last}</span></li>)}
      </ul>
      <div className="flex justify-end"><PrimaryButton onClick={() => close(`Se cerraron ${others.length} sesiones. Esta sigue abierta.`)}>Cerrar las {others.length} otras sesiones</PrimaryButton></div>
    </div>
  );
}

function NameForm({ state, close }: { state: SettingsState; close: (message?: string) => void }) {
  const [name, setName] = useState(state.form.name);
  const error = validate({ ...state.form, name }).name;
  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (!error) { state.autoSet("name", name); close("Nombre actualizado."); } }}>
      <Field id="as-name" label="Nombre visible" error={error}><Input id="as-name" autoFocus value={name} maxLength={120} aria-invalid={Boolean(error)} className={cn(error && "border-destructive")} onChange={(event) => setName(event.target.value)} /></Field>
      <div className="flex justify-end"><PrimaryButton type="submit" disabled={Boolean(error)}>Guardar nombre</PrimaryButton></div>
    </form>
  );
}

function ExportForm({ close }: { close: (message?: string) => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    if (progress === null || progress >= 100) return;
    const timer = window.setTimeout(() => setProgress(Math.min(100, progress + 14)), 350);
    return () => window.clearTimeout(timer);
  }, [progress]);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Descarga todo lo de tu empresa (clientes, tareas, archivos) en un solo archivo.</p>
      {progress !== null ? <div className="flex flex-col gap-1.5"><div className="h-2 overflow-hidden rounded-full" style={{ background: tint(ACCENT.sky, 18) }}><motion.div className="h-full rounded-full" style={{ background: ACCENT.sky }} animate={{ width: `${progress}%` }} /></div><p className="text-xs text-muted-foreground">{progress >= 100 ? "Listo: cosmonido-2026-10-24.zip (38 MB)" : `Preparando el archivo… ${progress} %`}</p></div> : null}
      <div className="flex justify-end">{progress === null ? <PrimaryButton onClick={() => setProgress(8)}><Icons.Download className="h-4 w-4" />Preparar exportación</PrimaryButton> : <PrimaryButton disabled={progress < 100} onClick={() => close("Exportación descargada.")}>Descargar</PrimaryButton>}</div>
    </div>
  );
}

export function SettingsAssistant({ state, groups, denied, onShowAll }: { state: SettingsState; groups: SettingsGroup[]; denied: boolean; onShowAll: () => void }) {
  const tokens = useMotionTokens();
  const { form, ctx } = state;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const needle = query.trim().toLowerCase();
  const lock = (key?: string) => Boolean(key && ctx.locked.has(key));
  const isDenied = (scope: SettingsScope) => denied && scope !== "user";
  const groupLabel = (id: string) => groups.find((group) => group.id === id)?.label ?? id;

  const intents: Intent[] = useMemo(() => [
    { id: "name", title: "Cambiar mi nombre o foto", hint: "Cómo te ven los demás", icon: Icons.UserRound, scope: "user", group: "profile", keywords: "nombre foto avatar perfil", body: (close) => <NameForm state={state} close={close} /> },
    { id: "language", title: "Cambiar mi idioma", hint: `Ahora: ${form.language}`, icon: Icons.Languages, scope: "user", group: "profile", lockKey: "language", keywords: "idioma lengua español english", body: (close) => <LanguageForm state={state} close={close} /> },
    { id: "2fa", title: form.twoFactor ? "Gestionar la verificación en dos pasos" : "Activar la verificación en dos pasos", hint: form.twoFactor ? "Activada" : "Recomendado: protege tu cuenta", icon: Icons.ShieldCheck, scope: "user", group: "security", lockKey: "twoFactor", keywords: "2fa seguridad autenticación dos pasos contraseña", body: (close) => form.twoFactor ? (
      <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">La verificación en dos pasos está activada.</p><div className="flex justify-end"><Button variant="outline" onClick={() => { state.autoSet("twoFactor", false); close("Verificación en dos pasos desactivada."); }}>Desactivar</Button></div></div>
    ) : <TwoFactorWizard startStep={ctx.wizard.startStep} onCancel={() => close()} onDone={() => { state.autoSet("twoFactor", true); close("Verificación en dos pasos activada."); }} /> },
    { id: "sessions", title: "Cerrar sesión en otros dispositivos", hint: `${ctx.data.sessions.length} sesiones abiertas`, icon: Icons.MonitorSmartphone, scope: "user", group: "security", keywords: "sesiones dispositivos cerrar", body: (close) => <SessionsForm state={state} close={close} /> },
    { id: "brief", title: "Recibir el resumen diario", hint: form.brief ? `Activado · ${form.briefHour}` : "Desactivado", icon: Icons.Newspaper, scope: "user", group: "notifications", keywords: "resumen diario email hora", body: (close) => <BriefForm state={state} close={close} /> },
    { id: "agenda", title: "Fijar Agenda u Oficina en la sidebar", hint: "Accesos directos", icon: Icons.PanelLeft, scope: "user", group: "profile", lockKey: "office", keywords: "sidebar agenda oficina accesos", body: () => <SidebarForm state={state} /> },
    { id: "invite", title: "Invitar a alguien", hint: `${ctx.data.members.length} ${ctx.data.members.length === 1 ? "miembro" : "miembros"}`, icon: Icons.UserPlus, scope: "company", group: "company", keywords: "invitar miembro equipo persona", body: (close) => <InviteForm close={close} /> },
    { id: "api", title: "Crear una clave de API", hint: `${ctx.data.apiKeys.length} ${ctx.data.apiKeys.length === 1 ? "clave activa" : "claves activas"}`, icon: Icons.KeyRound, scope: "company", group: "company", keywords: "api clave webhook integración zapier", body: (close) => <ApiKeyForm close={close} /> },
    { id: "export", title: "Exportar los datos de mi empresa", hint: "Un archivo con todo", icon: Icons.Download, scope: "company", group: "company", keywords: "exportar descargar datos copia portabilidad", body: (close) => <ExportForm close={close} /> },
    { id: "plan", title: "Cambiar mi plan", hint: "Plan Agencia · 49 €/mes", icon: Icons.CreditCard, scope: "account", group: "account", keywords: "plan facturación pago suscripción precio", body: (close) => <PlanForm close={close} /> },
    { id: "delete", title: "Eliminar mi cuenta comercial", hint: "Acción con confirmación", icon: Icons.Trash2, scope: "account", group: "account", danger: true, keywords: "eliminar borrar cuenta cancelar baja", body: (close) => (
      <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Solo afecta a «{ctx.data.accounts[0]!.name}», no a tu usuario. Tienes un plazo para cancelar la solicitud.</p><div className="flex justify-end"><Button variant="destructive" onClick={() => { close(); ctx.onDanger("account"); }}>Continuar a la confirmación</Button></div></div>
    ) },
  ], [state, form, ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = needle ? intents.filter((intent) => `${intent.title} ${intent.hint} ${intent.keywords}`.toLowerCase().includes(needle)) : intents;
  const recommended = !form.twoFactor && !ctx.locked.has("twoFactor") ? intents.find((intent) => intent.id === "2fa") : undefined;
  const current = intents.find((intent) => intent.id === open) ?? null;
  const SUGGESTIONS = ["idioma", "invitar", "2FA", "factura", "API"];

  function close(message?: string) { setOpen(null); if (message) state.setNotice(message); }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border p-5" style={{ background: `linear-gradient(135deg, ${tint(ACCENT.turquoise, 14)}, transparent 65%)` }}>
        <h2 className="text-lg font-semibold">¿Qué quieres hacer?</h2>
        <div className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus-within:border-foreground/30">
          <Icons.Sparkles className="h-4 w-4" style={{ color: readable(ACCENT.turquoise) }} />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" aria-label="Qué quieres hacer" placeholder="Escribe: cambiar idioma, invitar a alguien, activar 2FA…" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query ? <button aria-label="Borrar" onClick={() => setQuery("")}><Icons.X className="h-4 w-4 text-muted-foreground" /></button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-muted-foreground">Prueba con:</span>{SUGGESTIONS.map((item) => <button key={item} onClick={() => setQuery(item)} className="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">{item}</button>)}</div>
      </div>

      {recommended && !needle ? (
        <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} onClick={() => setOpen("2fa")} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border p-4 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md" style={{ background: tint(ACCENT.yellow, 18) }}>
          <IconTile icon={Icons.ShieldAlert} color={ACCENT.yellow} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Te recomendamos activar la verificación en dos pasos</span><span className="block text-xs text-muted-foreground">Tu cuenta gestiona clientes y pagos: añade una capa extra en 2 minutos.</span></span>
          <Icons.ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </motion.button>
      ) : null}

      <section aria-label="Acciones" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence initial={false}>
          {filtered.map((intent, index) => {
            const color = intent.danger ? ACCENT.risk : SCOPE_COLOR[intent.scope];
            const blocked = isDenied(intent.scope);
            return (
              <motion.button
                layout
                key={intent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: tokens.base, ease: tokens.easeOut, delay: Math.min(index, 8) * tokens.stagger }}
                onClick={() => setOpen(intent.id)}
                className="group flex min-w-0 items-start gap-3 rounded-2xl border border-border p-4 text-left transition-[transform,box-shadow] duration-(--motion-duration-fast) hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <IconTile icon={intent.icon} color={color} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{intent.title}</span>
                  <span className="mt-0.5 block break-words text-xs text-muted-foreground">{intent.hint}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5"><Pill color={color}>{SCOPE_LABEL[intent.scope]}</Pill>{blocked || lock(intent.lockKey) ? <Icons.Lock className="h-3 w-3 text-muted-foreground" aria-label="Bloqueado" /> : null}</span>
                </span>
                <Icons.ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--motion-duration-fast) group-hover:opacity-100" />
              </motion.button>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 ? <p className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No encontramos nada para «{query}». <button className="underline" onClick={onShowAll}>Mira todos los ajustes agrupados</button>.</p> : null}
      </section>

      <p className="text-center text-sm text-muted-foreground">¿Prefieres ver todos los ajustes? <button className="font-medium text-foreground underline" onClick={onShowAll}>Ver los ajustes agrupados</button></p>

      <Dialog open={current !== null} onOpenChange={(next) => { if (!next) setOpen(null); }}>
        <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
          {current ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <IconTile icon={current.icon} color={current.danger ? ACCENT.risk : SCOPE_COLOR[current.scope]} />
                  <div className="min-w-0"><DialogTitle>{current.title}</DialogTitle><DialogDescription>{SCOPE_LABEL[current.scope]} · {groupLabel(current.group)}</DialogDescription></div>
                </div>
              </DialogHeader>
              {isDenied(current.scope) ? <NoPermission what={DENIED_WHAT[current.scope] ?? "esta acción"} /> : lock(current.lockKey) ? (
                <div className="flex flex-col items-center gap-3 rounded-xl p-6 text-center" style={{ background: tint(ACCENT.yellow, 16) }}><LockPill /><p className="text-sm">El administrador de la instalación ha fijado este ajuste para todos los miembros. Pídele que lo cambie si lo necesitas.</p><Button variant="outline" onClick={() => setOpen(null)}>Entendido</Button></div>
              ) : current.body(close)}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

    </div>
  );
}

function LanguageForm({ state, close }: { state: SettingsState; close: (message?: string) => void }) {
  const [language, setLanguage] = useState(state.form.language);
  return (
    <div className="flex flex-col gap-4">
      <Field id="as-lang" label="Idioma de la interfaz"><NativeSelect id="as-lang" value={language} onChange={(event) => setLanguage(event.target.value)}>{LANGUAGES.map((item) => <option key={item}>{item}</option>)}</NativeSelect></Field>
      <p className="text-xs text-muted-foreground">Se guarda para tu usuario en todas las empresas.</p>
      <div className="flex justify-end"><PrimaryButton disabled={language === state.form.language} onClick={() => { state.autoSet("language", language); close(`Idioma cambiado a ${language}.`); }}>Cambiar idioma</PrimaryButton></div>
    </div>
  );
}

function BriefForm({ state, close }: { state: SettingsState; close: (message?: string) => void }) {
  const [on, setOn] = useState(state.form.brief);
  const [hour, setHour] = useState(state.form.briefHour);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Recibir el resumen cada día</p><p className="text-xs text-muted-foreground">Tareas hechas, decisiones pendientes y compromisos vencidos.</p></div><Toggle checked={on} onChange={setOn} label="Resumen diario" /></div>
      {on ? <Field id="as-hour" label="Hora de envío"><Input id="as-hour" type="time" className="w-32" value={hour} onChange={(event) => setHour(event.target.value)} /></Field> : null}
      <div className="flex justify-end"><PrimaryButton onClick={() => { state.autoSet("brief", on); state.autoSet("briefHour", hour); close(on ? `Resumen diario a las ${hour}.` : "Resumen diario desactivado."); }}>Guardar</PrimaryButton></div>
    </div>
  );
}

function SidebarForm({ state }: { state: SettingsState }) {
  const { form, locked, autoSet } = state;
  return (
    <div className="flex flex-col divide-y divide-border">
      {([["agenda", "Fijar Agenda", "Abre tus reuniones desde la sidebar."], ["office", "Fijar Oficina", "Acceso directo a la vista visual de tu equipo."]] as const).map(([key, label, text]) => (
        <div key={key} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{text}</p>{locked.has(key) ? <div className="mt-1"><LockPill /></div> : null}</div><Toggle checked={form[key]} onChange={(value) => autoSet(key, value)} label={label} disabled={locked.has(key)} /></div>
      ))}
    </div>
  );
}
