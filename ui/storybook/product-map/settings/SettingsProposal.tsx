import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, SectionTitle } from "../parts";
import {
  DEMO_ACCOUNTS,
  DEMO_API_KEYS,
  DEMO_EXPERIMENTAL,
  DEMO_INVOICES,
  DEMO_MEMBERS,
  DEMO_PLUGINS,
  DEMO_SECRETS,
  DEMO_SESSIONS,
  LANGUAGES,
  NOTIFICATION_CATEGORIES,
  SCOPE_LABEL,
  SETTINGS_GROUPS,
  type SettingsGroup,
  type SettingsScope,
} from "./demo-data";

const SCOPE_COLOR: Record<SettingsScope, string> = {
  user: ACCENT.sky, company: ACCENT.mint, account: ACCENT.lilac, instance: ACCENT.yellow,
};

function iconFor(name: string): LucideIcon {
  return (Icons as unknown as Record<string, LucideIcon | undefined>)[name] ?? Icons.Circle;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  const tokens = useMotionTokens();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors duration-(--motion-duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ background: checked ? ACCENT.turquoise : tint(ACCENT.muted, 35) }}
    >
      <motion.span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow ring-1 ring-black/15" animate={{ x: checked ? 16 : 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} />
    </button>
  );
}

function Row({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1 basis-48"><p className="text-sm font-medium">{title}</p>{text ? <p className="text-xs text-muted-foreground">{text}</p> : null}</div>
      <div className="flex min-w-0 shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

function Card({ title, icon, color, children }: { title: string; icon: LucideIcon; color: string; children: ReactNode }) {
  return <Panel><SectionTitle color={color} icon={icon}>{title}</SectionTitle><div className="flex min-w-0 flex-col divide-y divide-border">{children}</div></Panel>;
}

/** Danger confirmation: the target is named and must be typed back. */
function DangerDialog({ open, onOpenChange, title, description, phrase, action, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; phrase: string; action: string; onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setTyped(""); onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconTile icon={Icons.TriangleAlert} color={ACCENT.risk} />
            <div className="min-w-0"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div>
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="danger-confirm">Escribe <code className="rounded bg-muted px-1">{phrase}</code> para confirmar</Label>
          <Input id="danger-confirm" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </div>
        <div className="flex justify-between gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => { setTyped(""); onOpenChange(false); }}>Cancelar</Button>
          <Button variant="destructive" disabled={typed !== phrase} onClick={() => { setTyped(""); onConfirm(); onOpenChange(false); }}>{action}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Form { name: string; language: string; business: boolean; agenda: boolean; office: boolean; categories: string[]; browser: boolean; brief: boolean; briefHour: string; twoFactor: boolean; companyName: string; approvals: boolean; retention: boolean; retentionDays: string }
const INITIAL: Form = { name: "Silviu", language: "Español", business: true, agenda: false, office: false, categories: ["decisions", "reviews", "tasks"], browser: true, brief: true, briefHour: "08:30", twoFactor: false, companyName: "Cosmonido", approvals: true, retention: false, retentionDays: "365" };

function GroupBody({ group, form, set, onDanger }: { group: SettingsGroup; form: Form; set: <K extends keyof Form>(key: K, value: Form[K]) => void; onDanger: (kind: "session" | "account") => void }) {
  if (group.id === "profile") return <>
    <Panel>
      <div className="flex items-center gap-4">
        <Avatar name={form.name || "S"} size="lg" />
        <div className="min-w-0 flex-1"><p className="font-semibold">{form.name || "Sin nombre"}</p><p className="text-xs text-muted-foreground">hastasilviu@gmail.com</p></div>
        <Button variant="outline" size="sm"><Icons.Camera className="h-3.5 w-3.5" />Cambiar foto</Button>
      </div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="st-name">Nombre visible</Label><Input id="st-name" value={form.name} maxLength={120} onChange={(event) => set("name", event.target.value)} /></div>
    </Panel>
    <Card title="Idioma" icon={Icons.Languages} color={ACCENT.sky}>
      <Row title="Idioma de la interfaz" text="Se guarda para tu usuario, no para la empresa."><NativeSelect aria-label="Idioma" value={form.language} onChange={(event) => set("language", event.target.value)}>{LANGUAGES.map((lang) => <option key={lang}>{lang}</option>)}</NativeSelect></Row>
    </Card>
    <Card title="Accesos de la sidebar para Cosmonido" icon={Icons.PanelLeft} color={ACCENT.turquoise}>
      <Row title="Clientes, ventas y conversaciones" text="Accesos para trabajar con clientes y atender oportunidades."><Toggle checked={form.business} onChange={(value) => set("business", value)} label="Clientes, ventas y conversaciones" /></Row>
      <Row title="Fijar Agenda" text="Abre tus reuniones desde la sidebar."><Toggle checked={form.agenda} onChange={(value) => set("agenda", value)} label="Fijar Agenda" /></Row>
      <Row title="Fijar Oficina" text="Acceso directo a la vista visual de tu equipo."><Toggle checked={form.office} onChange={(value) => set("office", value)} label="Fijar Oficina" /></Row>
    </Card>
  </>;
  if (group.id === "notifications") return <>
    <Card title="Qué avisos recibir" icon={Icons.Bell} color={ACCENT.sky}>
      {NOTIFICATION_CATEGORIES.map((category) => (
        <Row key={category.id} title={category.label} text={category.text}><Toggle checked={form.categories.includes(category.id)} onChange={(value) => set("categories", value ? [...form.categories, category.id] : form.categories.filter((id) => id !== category.id))} label={category.label} /></Row>
      ))}
    </Card>
    <Card title="Este dispositivo" icon={Icons.Smartphone} color={ACCENT.turquoise}>
      <Row title="Avisos del navegador" text="Permiso del navegador: permitido. Los avisos no incluyen texto de tareas ni de clientes."><Toggle checked={form.browser} onChange={(value) => set("browser", value)} label="Avisos del navegador" /></Row>
    </Card>
    <Card title="Resumen diario" icon={Icons.Newspaper} color={ACCENT.yellow}>
      <Row title="Recibir el resumen cada día" text="Tareas hechas, decisiones pendientes y compromisos vencidos."><Toggle checked={form.brief} onChange={(value) => set("brief", value)} label="Resumen diario" /></Row>
      {form.brief ? <Row title="Hora de envío"><Input aria-label="Hora" type="time" className="w-28" value={form.briefHour} onChange={(event) => set("briefHour", event.target.value)} /></Row> : null}
    </Card>
  </>;
  if (group.id === "security") return <>
    <Card title="Verificación en dos pasos" icon={Icons.ShieldCheck} color={ACCENT.mint}>
      <Row title="App de autenticación" text={form.twoFactor ? "Activada. Guarda tus códigos de recuperación." : "Añade una capa extra al iniciar sesión."}>
        <Pill color={form.twoFactor ? ACCENT.mint : ACCENT.yellow} strong={!form.twoFactor}>{form.twoFactor ? "Activada" : "Sin activar"}</Pill>
        <Button size="sm" variant={form.twoFactor ? "outline" : "default"} onClick={() => set("twoFactor", !form.twoFactor)}>{form.twoFactor ? "Desactivar" : "Activar"}</Button>
      </Row>
    </Card>
    <Card title="Sesiones abiertas" icon={Icons.MonitorSmartphone} color={ACCENT.sky}>
      {DEMO_SESSIONS.map((session) => (
        <Row key={session.id} title={session.device} text={`${session.place} · ${session.last}`}>
          {session.current ? <Pill color={ACCENT.mint}>Esta sesión</Pill> : <Button size="sm" variant="outline" onClick={() => onDanger("session")}>Cerrar</Button>}
        </Row>
      ))}
    </Card>
  </>;
  if (group.id === "company") return <>
    <Card title="General" icon={Icons.Building2} color={ACCENT.mint}>
      <Row title="Nombre de la empresa"><Input aria-label="Nombre de la empresa" className="w-56" value={form.companyName} onChange={(event) => set("companyName", event.target.value)} /></Row>
      <Row title="Pedir aprobación al contratar agentes" text="Las contrataciones esperan tu visto bueno."><Toggle checked={form.approvals} onChange={(value) => set("approvals", value)} label="Pedir aprobación" /></Row>
    </Card>
    <Card title="Miembros" icon={Icons.UsersRound} color={ACCENT.sky}>
      {DEMO_MEMBERS.map((member) => <Row key={member.id} title={member.name} text={member.email}><Avatar name={member.name} size="sm" /><Pill color={member.role === "Propietario" ? ACCENT.mint : ACCENT.lilac}>{member.role}</Pill></Row>)}
      <Row title="Invitar a alguien"><Button size="sm" variant="outline"><Icons.Plus className="h-3.5 w-3.5" />Invitar</Button></Row>
    </Card>
    <Card title="Secretos y API" icon={Icons.Lock} color={ACCENT.lilac}>
      {DEMO_SECRETS.map((secret) => <Row key={secret.id} title={secret.name} text={`${secret.used} · actualizado ${secret.updated}`}><code className="text-xs text-muted-foreground">••••••••</code></Row>)}
      {DEMO_API_KEYS.map((key) => <Row key={key.id} title={key.name} text={`Clave de API · creada ${key.created}`}><code className="text-xs text-muted-foreground">{key.prefix}</code><Button size="sm" variant="outline">Revocar</Button></Row>)}
    </Card>
    <Card title="Datos y retención" icon={Icons.Archive} color={ACCENT.yellow}>
      <Row title="Purgar conversaciones cerradas" text="Se previsualiza cuántos registros afecta antes de guardar."><Toggle checked={form.retention} onChange={(value) => set("retention", value)} label="Purgar conversaciones" /></Row>
      {form.retention ? <Row title="Conservar durante (días)"><Input aria-label="Días" type="number" min={30} className="w-24" value={form.retentionDays} onChange={(event) => set("retentionDays", event.target.value)} /></Row> : null}
      <Row title="Exportar o importar la empresa"><Button size="sm" variant="outline">Exportar</Button><Button size="sm" variant="outline">Importar</Button></Row>
    </Card>
  </>;
  if (group.id === "account") return <>
    <Card title="Cuentas" icon={Icons.Building} color={ACCENT.lilac}>
      {DEMO_ACCOUNTS.map((account) => <Row key={account.id} title={account.name} text={`${account.companies.length} ${account.companies.length === 1 ? "empresa vinculada" : "empresas vinculadas"} · ${account.members} ${account.members === 1 ? "miembro" : "miembros"}`}><Pill color={ACCENT.lilac}>{account.plan}</Pill></Row>)}
    </Card>
    <Card title="Facturación" icon={Icons.CreditCard} color={ACCENT.sky}>
      <Row title="Plan Agencia" text="49,00 €/mes · próxima factura el 1 de noviembre"><Button size="sm" variant="outline">Cambiar plan</Button></Row>
      {DEMO_INVOICES.map((invoice) => <Row key={invoice.id} title={invoice.date} text={invoice.amount}><Pill color={ACCENT.mint}>{invoice.status}</Pill></Row>)}
    </Card>
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: tint(ACCENT.risk, 60), background: tint(ACCENT.risk, 6) }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Icons.TriangleAlert className="h-4 w-4" style={{ color: readable(ACCENT.risk) }} />Zona de peligro</h2>
      <Row title="Eliminar la cuenta «Cosmonido Studio»" text="Solo afecta a esta cuenta comercial, no a tu usuario. Hay un plazo para cancelar la solicitud."><Button variant="destructive" size="sm" onClick={() => onDanger("account")}>Eliminar cuenta</Button></Row>
    </div>
  </>;
  return <>
    <Card title="Plugins" icon={Icons.Puzzle} color={ACCENT.lilac}>
      {DEMO_PLUGINS.map((plugin) => <PluginRow key={plugin.id} plugin={plugin} />)}
    </Card>
    <Card title="Opciones experimentales" icon={Icons.FlaskConical} color={ACCENT.yellow}>
      {DEMO_EXPERIMENTAL.map((flag) => <PluginRow key={flag.id} plugin={{ id: flag.id, name: flag.label, enabled: flag.on, text: "Puede cambiar sin aviso." }} />)}
    </Card>
    <Card title="Entornos y adaptadores" icon={Icons.Cpu} color={ACCENT.sky}>
      <Row title="Entornos de ejecución" text="Dónde corren los agentes."><Button size="sm" variant="outline">Abrir</Button></Row>
      <Row title="Adaptadores" text="Operación técnica de modelos y herramientas."><Button size="sm" variant="outline">Abrir</Button></Row>
    </Card>
  </>;
}

function PluginRow({ plugin }: { plugin: { id: string; name: string; enabled: boolean; text: string } }) {
  const [on, setOn] = useState(plugin.enabled);
  return <Row title={plugin.name} text={plugin.text}><Toggle checked={on} onChange={setOn} label={plugin.name} /></Row>;
}

/** Ajustes: one page, grouped by who owns each setting, with search, visible saving and confirmed danger actions. */
export function SettingsProposal({ isAdmin = true, startGroup = "profile" }: { isAdmin?: boolean; startGroup?: string }) {
  const tokens = useMotionTokens();
  const groups = SETTINGS_GROUPS.filter((group) => isAdmin || !group.adminOnly);
  const [groupId, setGroupId] = useState(startGroup);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<Form>(INITIAL);
  const [saved, setSaved] = useState<Form>(INITIAL);
  const [justSaved, setJustSaved] = useState(false);
  const [danger, setDanger] = useState<"session" | "account" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => { setJustSaved(false); setForm((current) => ({ ...current, [key]: value })); };
  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => needle ? groups.filter((group) => `${group.label} ${group.keywords}`.toLowerCase().includes(needle)) : groups, [needle, groups]);
  const group = groups.find((candidate) => candidate.id === groupId) ?? groups[0]!;

  useEffect(() => {
    if (!justSaved && !notice) return;
    const timer = window.setTimeout(() => { setJustSaved(false); setNotice(null); }, 3000);
    return () => window.clearTimeout(timer);
  }, [justSaved, notice]);

  function save() { setSaved(form); setJustSaved(true); }
  function discard() { setForm(saved); }

  const scopes: SettingsScope[] = ["user", "company", "account", "instance"];
  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">Ajustes</h1><p className="text-sm text-muted-foreground">Cada ajuste indica a quién afecta: a ti, a la empresa, a la cuenta o a toda la instalación.</p></div>
        <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30">
          <Icons.Search className="h-4 w-4 text-muted-foreground" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Buscar un ajuste: idioma, 2FA, API…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </header>

      <div className="flex min-w-0 flex-col gap-6 md:flex-row">
        <nav aria-label="Grupos de ajustes" className="flex min-w-0 gap-1 overflow-x-auto md:w-56 md:shrink-0 md:flex-col md:overflow-visible">
          <LayoutGroup id="settings-nav">
            {scopes.map((scope) => {
              const items = matches.filter((candidate) => candidate.scope === scope);
              if (!items.length) return null;
              return (
                <div key={scope} className="flex shrink-0 gap-1 md:flex-col">
                  <p className="hidden items-center gap-1.5 px-2 pb-0.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full" style={{ background: SCOPE_COLOR[scope] }} />{SCOPE_LABEL[scope]}</p>
                  {items.map((item) => {
                    const Icon = iconFor(item.icon);
                    const active = item.id === group.id;
                    return (
                      <button key={item.id} onClick={() => setGroupId(item.id)} aria-current={active ? "page" : undefined} className={cn("relative flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--motion-duration-fast)", active ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                        {active ? <motion.span layoutId="settings-nav-pill" className="absolute inset-0 rounded-lg" style={{ background: `linear-gradient(90deg, ${tint(SCOPE_COLOR[scope], 24)}, ${tint(SCOPE_COLOR[scope], 6)})` }} transition={{ duration: tokens.base, ease: tokens.easeOut }}><span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full" style={{ background: SCOPE_COLOR[scope] }} /></motion.span> : null}
                        <span className="relative flex h-6 w-6 items-center justify-center rounded-md" style={{ background: tint(SCOPE_COLOR[scope], active ? 35 : 16), color: readable(SCOPE_COLOR[scope]) }}><Icon className="h-3.5 w-3.5" /></span>
                        <span className="relative whitespace-nowrap">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </LayoutGroup>
          {matches.length === 0 ? <p className="p-2 text-sm text-muted-foreground">Ningún ajuste coincide con «{query}».</p> : null}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <AnimatePresence mode="wait">
            <motion.div key={group.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><h2 className="text-lg font-semibold">{group.label}</h2><p className="text-sm text-muted-foreground">{group.scopeNote}</p></div>
                <Pill color={SCOPE_COLOR[group.scope]}>{SCOPE_LABEL[group.scope]}</Pill>
              </div>
              <GroupBody group={group} form={form} set={set} onDanger={setDanger} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {dirty || justSaved || notice ? (
          <motion.div role="status" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            {notice ? <><Icons.CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="min-w-0 flex-1">{notice}</span></> : justSaved && !dirty ? <><Icons.CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="flex-1">Cambios guardados</span></> : <>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ACCENT.yellow }} /><span className="min-w-0 flex-1">Tienes cambios sin guardar</span>
              <Button size="sm" variant="ghost" onClick={discard}>Descartar</Button>
              <Button size="sm" onClick={save} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>Guardar</Button>
            </>}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DangerDialog
        open={danger === "account"}
        onOpenChange={(open) => !open && setDanger(null)}
        title="Eliminar la cuenta comercial"
        description="Se eliminará «Cosmonido Studio». Tienes un plazo para cancelar la solicitud antes de que se ejecute."
        phrase="DELETE COMMERCIAL ACCOUNT"
        action="Solicitar eliminación"
        onConfirm={() => setNotice("Eliminación solicitada. Puedes cancelarla durante el plazo.")}
      />
      <DangerDialog
        open={danger === "session"}
        onOpenChange={(open) => !open && setDanger(null)}
        title="Cerrar esta sesión"
        description="El dispositivo tendrá que volver a iniciar sesión."
        phrase="CERRAR"
        action="Cerrar sesión"
        onConfirm={() => setNotice("Sesión cerrada.")}
      />
    </div>
  );
}
