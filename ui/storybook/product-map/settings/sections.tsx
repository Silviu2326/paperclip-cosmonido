import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Avatar, IconTile, Panel, Pill, SectionTitle } from "../parts";
import { LANGUAGES, NOTIFICATION_CATEGORIES, type SettingsGroup, type SettingsScope } from "./demo-data";
import type { SettingsData } from "./scenarios";
import { FieldError, LockPill, MoreList, TwoFactorWizard } from "./states";

/** Building blocks of the Ajustes proposal, shared by the three design variants. */

export const SCOPE_COLOR: Record<SettingsScope, string> = {
  user: ACCENT.sky, company: ACCENT.mint, account: ACCENT.lilac, instance: ACCENT.yellow,
};

export function iconFor(name: string): LucideIcon {
  return (Icons as unknown as Record<string, LucideIcon | undefined>)[name] ?? Icons.Circle;
}

export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  const tokens = useMotionTokens();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-10 shrink-0 rounded-full transition-colors duration-(--motion-duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      style={{ background: checked ? ACCENT.turquoise : tint(ACCENT.muted, 35) }}
    >
      <motion.span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow ring-1 ring-black/15" animate={{ x: checked ? 16 : 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} />
    </button>
  );
}

/** One setting: what it is, what it does, and its control. `locked` dims the control and says who fixed it. */
export function Row({ title, text, children, locked = false, error }: { title: string; text?: string; children: ReactNode; locked?: boolean; error?: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1 basis-48">
        <p className="break-words text-sm font-medium">{title}</p>
        {text ? <p className="break-words text-xs text-muted-foreground">{text}</p> : null}
        <FieldError>{error}</FieldError>
      </div>
      <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
        {locked ? <LockPill /> : null}
        {locked ? <div inert className="flex items-center gap-2 opacity-50">{children}</div> : children}
      </div>
    </div>
  );
}

export function Card({ title, icon, color, children }: { title: string; icon: LucideIcon; color: string; children: ReactNode }) {
  return <Panel><SectionTitle color={color} icon={icon}>{title}</SectionTitle><div className="flex min-w-0 flex-col divide-y divide-border">{children}</div></Panel>;
}

/** Danger confirmation: the target is named and must be typed back. */
export function DangerDialog({ open, onOpenChange, title, description, phrase, action, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; phrase: string; action: string; onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setTyped(""); onOpenChange(next); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconTile icon={Icons.TriangleAlert} color={ACCENT.risk} />
            <div className="min-w-0"><DialogTitle>{title}</DialogTitle><DialogDescription className="break-words">{description}</DialogDescription></div>
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

export interface Form { name: string; language: string; business: boolean; agenda: boolean; office: boolean; categories: string[]; browser: boolean; brief: boolean; briefHour: string; twoFactor: boolean; companyName: string; approvals: boolean; retention: boolean; retentionDays: string }
export const INITIAL: Form = { name: "Silviu", language: "Español", business: true, agenda: false, office: false, categories: ["decisions", "reviews", "tasks"], browser: true, brief: true, briefHour: "08:30", twoFactor: false, companyName: "Cosmonido", approvals: true, retention: false, retentionDays: "365" };

export type FormErrors = Partial<Record<keyof Form, string>>;

/** The rules the server would apply. Shared so every variant rejects the same values. */
export function validate(form: Form): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "Escribe cómo quieres que te vean los demás.";
  if (form.companyName.trim().length < 3) errors.companyName = "El nombre de la empresa necesita al menos 3 caracteres.";
  if (form.retention && !(Number(form.retentionDays) >= 30)) errors.retentionDays = "El mínimo son 30 días.";
  return errors;
}

/** Which group each validated field lives in, to send the user to the first error. */
export const FIELD_GROUP: Partial<Record<keyof Form, string>> = { name: "profile", companyName: "company", retentionDays: "company" };

export interface SettingsCtx {
  data: SettingsData;
  errors: FormErrors;
  locked: ReadonlySet<string>;
  wizard: { open: boolean; startStep: number; show: () => void; close: () => void };
  onDanger: (kind: "session" | "account") => void;
}

export type SetField = <K extends keyof Form>(key: K, value: Form[K]) => void;

export function PluginRow({ plugin }: { plugin: { id: string; name: string; enabled: boolean; text: string } }) {
  const [on, setOn] = useState(plugin.enabled);
  return <Row title={plugin.name} text={plugin.text}><Toggle checked={on} onChange={setOn} label={plugin.name} /></Row>;
}

export function MembersCard({ ctx }: { ctx: SettingsCtx }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const members = ctx.data.members.filter((member) => !needle || `${member.name} ${member.email}`.toLowerCase().includes(needle));
  return (
    <Card title={`Miembros · ${ctx.data.members.length}`} icon={Icons.UsersRound} color={ACCENT.sky}>
      {ctx.data.members.length > 8 ? (
        <div className="py-2.5"><div className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm focus-within:border-foreground/30"><Icons.Search className="h-4 w-4 text-muted-foreground" /><input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" aria-label="Buscar miembros" placeholder="Buscar por nombre o email" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
      ) : null}
      <MoreList items={members} initial={6} step={12} noun="miembros" render={(member) => <Row key={member.id} title={member.name} text={member.email}><Avatar name={member.name} size="sm" /><Pill color={member.role === "Propietario" ? ACCENT.mint : ACCENT.lilac}>{member.role.length > 28 ? `${member.role.slice(0, 28)}…` : member.role}</Pill></Row>} />
      {members.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Nadie coincide con «{query}».</p> : null}
      <Row title="Invitar a alguien"><Button size="sm" variant="outline"><Icons.Plus className="h-3.5 w-3.5" />Invitar</Button></Row>
    </Card>
  );
}

export function SessionsCard({ ctx }: { ctx: SettingsCtx }) {
  return (
    <Card title={`Sesiones abiertas · ${ctx.data.sessions.length}`} icon={Icons.MonitorSmartphone} color={ACCENT.sky}>
      <MoreList items={ctx.data.sessions} initial={5} step={10} noun="sesiones" render={(session) => (
        <Row key={session.id} title={session.device} text={`${session.place} · ${session.last}`}>
          {session.current ? <Pill color={ACCENT.mint}>Esta sesión</Pill> : <Button size="sm" variant="outline" onClick={() => ctx.onDanger("session")}>Cerrar</Button>}
        </Row>
      )} />
      {ctx.data.sessions.length > 6 ? <Row title="Cerrar todas las demás sesiones" text="Tendrás que volver a entrar en cada dispositivo."><Button size="sm" variant="outline" onClick={() => ctx.onDanger("session")}>Cerrar {ctx.data.sessions.length - 1}</Button></Row> : null}
    </Card>
  );
}

export function GroupBody({ group, form, set, ctx }: { group: SettingsGroup; form: Form; set: SetField; ctx: SettingsCtx }) {
  const { errors, locked, data } = ctx;
  const lock = (key: string) => locked.has(key);
  if (group.id === "profile") return <>
    <Panel>
      <div className="flex min-w-0 items-center gap-4">
        <Avatar name={form.name || "S"} size="lg" />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold" title={form.name}>{form.name || "Sin nombre"}</p><p className="truncate text-xs text-muted-foreground">hastasilviu@gmail.com</p></div>
        <Button variant="outline" size="sm" className="shrink-0"><Icons.Camera className="h-3.5 w-3.5" />Cambiar foto</Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="st-name">Nombre visible</Label>
        <Input id="st-name" value={form.name} maxLength={120} aria-invalid={Boolean(errors.name)} className={cn(errors.name && "border-destructive")} onChange={(event) => set("name", event.target.value)} />
        <FieldError>{errors.name}</FieldError>
      </div>
    </Panel>
    <Card title="Idioma" icon={Icons.Languages} color={ACCENT.sky}>
      <Row title="Idioma de la interfaz" text="Se guarda para tu usuario, no para la empresa." locked={lock("language")}><NativeSelect aria-label="Idioma" value={form.language} onChange={(event) => set("language", event.target.value)}>{LANGUAGES.map((lang) => <option key={lang}>{lang}</option>)}</NativeSelect></Row>
    </Card>
    <Card title="Accesos de la sidebar para Cosmonido" icon={Icons.PanelLeft} color={ACCENT.turquoise}>
      <Row title="Clientes, ventas y conversaciones" text="Accesos para trabajar con clientes y atender oportunidades."><Toggle checked={form.business} onChange={(value) => set("business", value)} label="Clientes, ventas y conversaciones" /></Row>
      <Row title="Fijar Agenda" text="Abre tus reuniones desde la sidebar."><Toggle checked={form.agenda} onChange={(value) => set("agenda", value)} label="Fijar Agenda" /></Row>
      <Row title="Fijar Oficina" text="Acceso directo a la vista visual de tu equipo." locked={lock("office")}><Toggle checked={form.office} onChange={(value) => set("office", value)} label="Fijar Oficina" /></Row>
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
    {ctx.wizard.open ? (
      <TwoFactorWizard startStep={ctx.wizard.startStep} onCancel={ctx.wizard.close} onDone={() => { set("twoFactor", true); ctx.wizard.close(); }} />
    ) : (
      <Card title="Verificación en dos pasos" icon={Icons.ShieldCheck} color={ACCENT.mint}>
        <Row title="App de autenticación" text={lock("twoFactor") ? "Tu administrador la exige para todos los miembros." : form.twoFactor ? "Activada. Guarda tus códigos de recuperación." : "Añade una capa extra al iniciar sesión."} locked={lock("twoFactor")}>
          <Pill color={form.twoFactor ? ACCENT.mint : ACCENT.yellow} strong={!form.twoFactor}>{form.twoFactor ? "Activada" : "Sin activar"}</Pill>
          <Button size="sm" variant={form.twoFactor ? "outline" : "default"} onClick={() => (form.twoFactor ? set("twoFactor", false) : ctx.wizard.show())}>{form.twoFactor ? "Desactivar" : "Activar"}</Button>
        </Row>
      </Card>
    )}
    <SessionsCard ctx={ctx} />
  </>;
  if (group.id === "company") return <>
    <Card title="General" icon={Icons.Building2} color={ACCENT.mint}>
      <Row title="Nombre de la empresa" error={errors.companyName}><Input aria-label="Nombre de la empresa" aria-invalid={Boolean(errors.companyName)} className={cn("w-56 max-w-full", errors.companyName && "border-destructive")} value={form.companyName} onChange={(event) => set("companyName", event.target.value)} /></Row>
      <Row title="Pedir aprobación al contratar agentes" text="Las contrataciones esperan tu visto bueno."><Toggle checked={form.approvals} onChange={(value) => set("approvals", value)} label="Pedir aprobación" /></Row>
    </Card>
    <MembersCard ctx={ctx} />
    <Card title={`Secretos y API · ${data.secrets.length + data.apiKeys.length}`} icon={Icons.Lock} color={ACCENT.lilac}>
      <MoreList items={data.secrets} initial={5} step={10} noun="secretos" render={(secret) => <Row key={secret.id} title={secret.name} text={`${secret.used} · actualizado ${secret.updated}`}><code className="text-xs text-muted-foreground">••••••••</code></Row>} />
      <MoreList items={data.apiKeys} initial={3} step={10} noun="claves" render={(key) => <Row key={key.id} title={key.name} text={`Clave de API · creada ${key.created}`}><code className="text-xs text-muted-foreground">{key.prefix}</code><Button size="sm" variant="outline">Revocar</Button></Row>} />
    </Card>
    <Card title="Datos y retención" icon={Icons.Archive} color={ACCENT.yellow}>
      <Row title="Purgar conversaciones cerradas" text="Se previsualiza cuántos registros afecta antes de guardar." locked={lock("retention")}><Toggle checked={form.retention} onChange={(value) => set("retention", value)} label="Purgar conversaciones" /></Row>
      {form.retention ? <Row title="Conservar durante (días)" error={errors.retentionDays} locked={lock("retention")}><Input aria-label="Días" aria-invalid={Boolean(errors.retentionDays)} className={cn("w-24", errors.retentionDays && "border-destructive")} type="number" min={30} value={form.retentionDays} onChange={(event) => set("retentionDays", event.target.value)} /></Row> : null}
      <Row title="Exportar o importar la empresa"><Button size="sm" variant="outline">Exportar</Button><Button size="sm" variant="outline">Importar</Button></Row>
    </Card>
  </>;
  if (group.id === "account") return <>
    <Card title="Cuentas" icon={Icons.Building} color={ACCENT.lilac}>
      {data.accounts.map((account) => <Row key={account.id} title={account.name} text={`${account.companies.length} ${account.companies.length === 1 ? "empresa vinculada" : "empresas vinculadas"} · ${account.members} ${account.members === 1 ? "miembro" : "miembros"}`}><Pill color={ACCENT.lilac}>{account.plan}</Pill></Row>)}
    </Card>
    <Card title={`Facturación · ${data.invoices.length} ${data.invoices.length === 1 ? "factura" : "facturas"}`} icon={Icons.CreditCard} color={ACCENT.sky}>
      <Row title="Plan Agencia" text="49,00 €/mes · próxima factura el 1 de noviembre"><Button size="sm" variant="outline">Cambiar plan</Button></Row>
      <MoreList items={data.invoices} initial={4} step={8} noun="facturas" render={(invoice) => <Row key={invoice.id} title={invoice.date} text={invoice.amount}><Pill color={invoice.status === "Pagada" ? ACCENT.mint : ACCENT.yellow}>{invoice.status}</Pill></Row>} />
      {data.invoices.length > 8 ? <Row title="Historial completo" text="Todas las facturas en un solo archivo."><Button size="sm" variant="outline"><Icons.Download className="h-3.5 w-3.5" />Descargar todas</Button></Row> : null}
    </Card>
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: tint(ACCENT.risk, 60), background: tint(ACCENT.risk, 6) }}>
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Icons.TriangleAlert className="h-4 w-4" style={{ color: readable(ACCENT.risk) }} />Zona de peligro</h2>
      <Row title={`Eliminar la cuenta «${data.accounts[0]!.name}»`} text="Solo afecta a esta cuenta comercial, no a tu usuario. Hay un plazo para cancelar la solicitud."><Button variant="destructive" size="sm" onClick={() => ctx.onDanger("account")}>Eliminar cuenta</Button></Row>
    </div>
  </>;
  return <>
    <Card title="Plugins" icon={Icons.Puzzle} color={ACCENT.lilac}>
      {data.plugins.map((plugin) => <PluginRow key={plugin.id} plugin={plugin} />)}
    </Card>
    <Card title="Opciones experimentales" icon={Icons.FlaskConical} color={ACCENT.yellow}>
      {data.experimental.map((flag) => <PluginRow key={flag.id} plugin={{ id: flag.id, name: flag.label, enabled: flag.on, text: "Puede cambiar sin aviso." }} />)}
    </Card>
    <Card title="Entornos y adaptadores" icon={Icons.Cpu} color={ACCENT.sky}>
      <Row title="Entornos de ejecución" text="Dónde corren los agentes."><Button size="sm" variant="outline">Abrir</Button></Row>
      <Row title="Adaptadores" text="Operación técnica de modelos y herramientas."><Button size="sm" variant="outline">Abrir</Button></Row>
    </Card>
  </>;
}
