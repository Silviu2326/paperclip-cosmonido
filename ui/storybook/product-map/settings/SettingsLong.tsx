import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NoPermission } from "../activity/states";
import { readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Panel, Pill } from "../parts";
import { LANGUAGES, NOTIFICATION_CATEGORIES, SCOPE_LABEL, type SettingsGroup, type SettingsScope } from "./demo-data";
import { MembersCard, Row, SCOPE_COLOR, SessionsCard, Toggle, validate, type Form } from "./sections";
import type { SettingsState } from "./state";
import { MoreList, TwoFactorWizard } from "./states";

/**
 * Variant B — one long page with a table of contents, a search that filters
 * every setting and inline editing that saves on the spot (with undo), so there
 * is no Save bar and no "which tab was it in?".
 */

const DENIED_WHAT: Partial<Record<SettingsScope, string>> = { company: "los ajustes de la empresa", account: "la cuenta comercial", instance: "la administración de la instalación" };

function Highlight({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  const index = text.toLowerCase().indexOf(needle);
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark className="rounded px-0.5 text-foreground" style={{ background: tint(ACCENT.yellow, 55) }}>{text.slice(index, index + needle.length)}</mark>{text.slice(index + needle.length)}</>;
}

/** A value that turns into an input when clicked and saves on Enter or blur. */
function InlineText({ value, onCommit, error, label, type = "text", width = "w-56" }: { value: string; onCommit: (value: string) => void; error?: string; label: string; type?: string; width?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const open = editing || Boolean(error);
  function commit() { onCommit(draft); setEditing(false); }
  return open ? (
    <Input
      aria-label={label}
      aria-invalid={Boolean(error)}
      autoFocus
      type={type}
      className={cn(width, "max-w-full", error && "border-destructive")}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") commit(); if (event.key === "Escape") { setDraft(value); setEditing(false); } }}
    />
  ) : (
    <button onClick={() => setEditing(true)} aria-label={`Editar ${label}`} className="group flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1 text-sm transition-colors duration-(--motion-duration-fast) hover:bg-accent/60">
      <span className="truncate" title={value}>{value || <span className="text-muted-foreground">Sin valor</span>}</span>
      <Icons.Pencil className="h-3 w-3 shrink-0 text-muted-foreground transition-opacity duration-(--motion-duration-fast) group-hover:text-foreground" />
    </button>
  );
}

function Expand({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  const tokens = useMotionTokens();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-2 py-1">
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><Icons.ChevronDown className="h-4 w-4" /></motion.span>
        {label}{count !== undefined ? ` · ${count}` : ""}
      </button>
      <AnimatePresence initial={false}>
        {open ? <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="overflow-hidden"><div className="flex min-w-0 flex-col gap-3">{children}</div></motion.div> : null}
      </AnimatePresence>
    </div>
  );
}

interface Entry { id: string; group: string; label: string; text?: string; keywords: string; locked?: boolean; error?: string; control: ReactNode; wide?: boolean }

export function SettingsLong({ state, groups, denied }: { state: SettingsState; groups: SettingsGroup[]; denied: boolean }) {
  const tokens = useMotionTokens();
  const { form, errors, ctx, autoSet } = state;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(groups[0]!.id);
  const [flash, setFlash] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ label: string; revert: () => void } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);
  const needle = query.trim().toLowerCase();
  const isDenied = (group: SettingsGroup) => denied && group.scope !== "user";
  const lock = (key: string) => ctx.locked.has(key);

  /** Saves one field now, flashes "Guardado" and offers to undo it. */
  function commit<K extends keyof Form>(key: K, value: Form[K], label: string) {
    const previous = form[key];
    autoSet(key, value);
    if (validate({ ...form, [key]: value })[key]) return;
    setFlash(key);
    setUndo({ label, revert: () => { autoSet(key, previous); setUndo(null); } });
    timers.current.push(window.setTimeout(() => setFlash((current) => (current === key ? null : current)), 1800));
    timers.current.push(window.setTimeout(() => setUndo(null), 5000));
  }

  const saved = (key: string) => (
    <AnimatePresence>{flash === key ? <motion.span initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-xs" style={{ color: readable(ACCENT.mint) }}><Icons.Check className="h-3 w-3" />Guardado</motion.span> : null}</AnimatePresence>
  );
  const toggle = (key: "business" | "agenda" | "office" | "browser" | "brief" | "approvals" | "retention", label: string) => (
    <>{saved(key)}<Toggle checked={form[key]} onChange={(value) => commit(key, value, `${label}: ${value ? "activado" : "desactivado"}`)} label={label} disabled={lock(key)} /></>
  );

  const entries: Entry[] = [
    { id: "name", group: "profile", label: "Nombre visible", text: "Así te ven los demás miembros y los clientes.", keywords: "perfil nombre", error: errors.name, control: <>{saved("name")}<InlineText label="Nombre visible" value={form.name} error={errors.name} onCommit={(value) => commit("name", value, "Nombre actualizado")} /></> },
    { id: "language", group: "profile", label: "Idioma de la interfaz", text: "Se guarda para tu usuario, no para la empresa.", keywords: "idioma lengua español english", locked: lock("language"), control: <>{saved("language")}<NativeSelect aria-label="Idioma" value={form.language} onChange={(event) => commit("language", event.target.value, `Idioma: ${event.target.value}`)}>{LANGUAGES.map((lang) => <option key={lang}>{lang}</option>)}</NativeSelect></> },
    { id: "business", group: "profile", label: "Clientes, ventas y conversaciones en la sidebar", keywords: "sidebar accesos navegación clientes", control: toggle("business", "Clientes, ventas y conversaciones") },
    { id: "agenda", group: "profile", label: "Fijar Agenda en la sidebar", keywords: "sidebar agenda reuniones", control: toggle("agenda", "Fijar Agenda") },
    { id: "office", group: "profile", label: "Fijar Oficina en la sidebar", keywords: "sidebar oficina equipo", locked: lock("office"), control: toggle("office", "Fijar Oficina") },
    ...NOTIFICATION_CATEGORIES.map((category): Entry => ({ id: `cat-${category.id}`, group: "notifications", label: category.label, text: category.text, keywords: "avisos notificaciones", control: <Toggle checked={form.categories.includes(category.id)} label={category.label} onChange={(value) => commit("categories", value ? [...form.categories, category.id] : form.categories.filter((id) => id !== category.id), `${category.label}: ${value ? "activado" : "desactivado"}`)} /> })),
    { id: "browser", group: "notifications", label: "Avisos del navegador", text: "Los avisos no incluyen texto de tareas ni de clientes.", keywords: "push navegador dispositivo", control: toggle("browser", "Avisos del navegador") },
    { id: "brief", group: "notifications", label: "Resumen diario", text: "Tareas hechas, decisiones pendientes y compromisos vencidos.", keywords: "resumen diario email", control: toggle("brief", "Resumen diario") },
    ...(form.brief ? [{ id: "briefHour", group: "notifications", label: "Hora del resumen", keywords: "resumen hora", control: <>{saved("briefHour")}<InlineText label="Hora del resumen" type="time" width="w-28" value={form.briefHour} onCommit={(value) => commit("briefHour", value, `Resumen a las ${value}`)} /></> } satisfies Entry] : []),
    { id: "twoFactor", group: "security", label: "Verificación en dos pasos", text: lock("twoFactor") ? "Tu administrador la exige para todos los miembros." : form.twoFactor ? "Activada." : "Añade una capa extra al iniciar sesión.", keywords: "2fa seguridad autenticación contraseña", locked: lock("twoFactor"), wide: ctx.wizard.open, control: ctx.wizard.open ? (
      <div className="w-full basis-full"><TwoFactorWizard startStep={ctx.wizard.startStep} onCancel={ctx.wizard.close} onDone={() => { commit("twoFactor", true, "Verificación en dos pasos activada"); ctx.wizard.close(); }} /></div>
    ) : <><Pill color={form.twoFactor ? ACCENT.mint : ACCENT.yellow} strong={!form.twoFactor}>{form.twoFactor ? "Activada" : "Sin activar"}</Pill><Button size="sm" variant={form.twoFactor ? "outline" : "default"} onClick={() => (form.twoFactor ? commit("twoFactor", false, "Verificación en dos pasos desactivada") : ctx.wizard.show())}>{form.twoFactor ? "Desactivar" : "Activar"}</Button></> },
    { id: "sessions", group: "security", label: "Sesiones abiertas", text: `${ctx.data.sessions.length} dispositivos`, keywords: "sesiones dispositivos cerrar", wide: true, control: <div className="w-full basis-full"><Expand label="Ver sesiones" count={ctx.data.sessions.length}><SessionsCard ctx={ctx} /></Expand></div> },
    { id: "companyName", group: "company", label: "Nombre de la empresa", keywords: "empresa general nombre", error: errors.companyName, control: <>{saved("companyName")}<InlineText label="Nombre de la empresa" value={form.companyName} error={errors.companyName} onCommit={(value) => commit("companyName", value, "Empresa renombrada")} /></> },
    { id: "approvals", group: "company", label: "Pedir aprobación al contratar agentes", text: "Las contrataciones esperan tu visto bueno.", keywords: "aprobación contratar agentes", control: toggle("approvals", "Pedir aprobación") },
    { id: "members", group: "company", label: "Miembros", text: `${ctx.data.members.length} personas`, keywords: "miembros invitar roles equipo", wide: true, control: <div className="w-full basis-full"><Expand label="Ver y invitar miembros" count={ctx.data.members.length}><MembersCard ctx={ctx} /></Expand></div> },
    { id: "secrets", group: "company", label: "Secretos y claves de API", text: `${ctx.data.secrets.length} ${ctx.data.secrets.length === 1 ? "secreto" : "secretos"} · ${ctx.data.apiKeys.length} ${ctx.data.apiKeys.length === 1 ? "clave" : "claves"}`, keywords: "secretos api claves webhooks tokens", wide: true, control: <div className="w-full basis-full"><Expand label="Ver secretos y claves"><div className="flex min-w-0 flex-col divide-y divide-border"><MoreList items={ctx.data.secrets} initial={4} step={10} noun="secretos" render={(secret) => <Row key={secret.id} title={secret.name} text={`${secret.used} · actualizado ${secret.updated}`}><code className="text-xs text-muted-foreground">••••••••</code></Row>} /><MoreList items={ctx.data.apiKeys} initial={3} step={10} noun="claves" render={(key) => <Row key={key.id} title={key.name} text={`Clave de API · creada ${key.created}`}><code className="text-xs text-muted-foreground">{key.prefix}</code><Button size="sm" variant="outline">Revocar</Button></Row>} /></div></Expand></div> },
    { id: "retention", group: "company", label: "Purgar conversaciones cerradas", text: "Se previsualiza cuántos registros afecta antes de aplicarse.", keywords: "retención datos purgar privacidad", locked: lock("retention"), control: toggle("retention", "Purgar conversaciones") },
    ...(form.retention ? [{ id: "retentionDays", group: "company", label: "Conservar durante (días)", keywords: "retención días", locked: lock("retention"), error: errors.retentionDays, control: <>{saved("retentionDays")}<InlineText label="Días" type="number" width="w-24" value={form.retentionDays} error={errors.retentionDays} onCommit={(value) => commit("retentionDays", value, `Conservar ${value} días`)} /></> } satisfies Entry] : []),
    { id: "export", group: "company", label: "Exportar o importar la empresa", keywords: "exportar importar portabilidad", control: <><Button size="sm" variant="outline">Exportar</Button><Button size="sm" variant="outline">Importar</Button></> },
    ...ctx.data.accounts.map((account): Entry => ({ id: `acc-${account.id}`, group: "account", label: account.name, text: `${account.companies.length} ${account.companies.length === 1 ? "empresa" : "empresas"} · ${account.members} ${account.members === 1 ? "miembro" : "miembros"}`, keywords: "cuenta comercial empresas", control: <Pill color={ACCENT.lilac}>{account.plan}</Pill> })),
    { id: "plan", group: "account", label: "Plan Agencia", text: "49,00 €/mes · próxima factura el 1 de noviembre", keywords: "plan facturación pago suscripción", control: <Button size="sm" variant="outline">Cambiar plan</Button> },
    { id: "invoices", group: "account", label: "Facturas", text: `${ctx.data.invoices.length} en el historial`, keywords: "facturas pagos historial", wide: true, control: <div className="w-full basis-full"><Expand label="Ver facturas" count={ctx.data.invoices.length}><div className="flex min-w-0 flex-col divide-y divide-border"><MoreList items={ctx.data.invoices} initial={4} step={8} noun="facturas" render={(invoice) => <Row key={invoice.id} title={invoice.date} text={invoice.amount}><Pill color={invoice.status === "Pagada" ? ACCENT.mint : ACCENT.yellow}>{invoice.status}</Pill></Row>} /></div></Expand></div> },
    { id: "delete", group: "account", label: `Eliminar la cuenta «${ctx.data.accounts[0]!.name}»`, text: "Solo afecta a esta cuenta comercial, no a tu usuario.", keywords: "eliminar borrar cuenta peligro cancelar", control: <Button size="sm" variant="destructive" onClick={() => ctx.onDanger("account")}>Eliminar cuenta</Button> },
    ...ctx.data.plugins.map((plugin): Entry => ({ id: `plg-${plugin.id}`, group: "instance", label: plugin.name, text: plugin.text, keywords: "plugins extensiones", control: <PluginToggle name={plugin.name} initial={plugin.enabled} /> })),
    ...ctx.data.experimental.map((flag): Entry => ({ id: `exp-${flag.id}`, group: "instance", label: flag.label, text: "Puede cambiar sin aviso.", keywords: "experimental opciones flags", control: <PluginToggle name={flag.label} initial={flag.on} /> })),
    { id: "environments", group: "instance", label: "Entornos y adaptadores", text: "Dónde corren los agentes y qué modelos usan.", keywords: "entornos adaptadores runtime", control: <Button size="sm" variant="outline">Abrir</Button> },
  ];

  const visibleGroups = groups.filter((group) => !isDenied(group) || !needle);
  const results = needle ? entries.filter((entry) => !isDenied(groups.find((group) => group.id === entry.group)!) && `${entry.label} ${entry.text ?? ""} ${entry.keywords} ${groups.find((group) => group.id === entry.group)?.label ?? ""}`.toLowerCase().includes(needle)) : [];
  const scopes: SettingsScope[] = ["user", "company", "account", "instance"];

  useEffect(() => {
    if (needle) return;
    const observer = new IntersectionObserver((records) => {
      const visible = records.filter((record) => record.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id.replace("sec-", ""));
    }, { rootMargin: "-10% 0px -70% 0px" });
    groups.forEach((group) => { const element = document.getElementById(`sec-${group.id}`); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [groups, needle]);

  function jump(id: string) { setActive(id); document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm focus-within:border-foreground/30">
        <Icons.Search className="h-4 w-4 text-muted-foreground" />
        <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" aria-label="Buscar en todos los ajustes" placeholder="Busca y edita al instante: idioma, 2FA, API, facturas…" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query ? <button aria-label="Borrar búsqueda" onClick={() => setQuery("")}><Icons.X className="h-4 w-4 text-muted-foreground" /></button> : <kbd className="rounded border border-border px-1 text-xs text-muted-foreground">/</kbd>}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">Todo se guarda al momento y puedes deshacerlo. No hay botón de guardar.</p>

      <div className="flex min-w-0 flex-col gap-6 md:flex-row">
        <nav aria-label="Índice de ajustes" className="flex min-w-0 gap-1 overflow-x-auto md:sticky md:top-4 md:w-52 md:shrink-0 md:flex-col md:self-start md:overflow-visible">
          {scopes.map((scope) => (
            <div key={scope} className="flex shrink-0 gap-1 md:flex-col">
              {groups.some((group) => group.scope === scope) ? <p className="hidden items-center gap-1.5 px-2 pb-0.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:flex"><span className="h-1.5 w-1.5 rounded-full" style={{ background: SCOPE_COLOR[scope] }} />{SCOPE_LABEL[scope]}</p> : null}
              {groups.filter((group) => group.scope === scope).map((group) => (
                <button key={group.id} onClick={() => jump(group.id)} aria-current={!needle && active === group.id ? "location" : undefined} className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border-l-2 px-2 py-1 text-left text-sm transition-colors duration-(--motion-duration-fast)", !needle && active === group.id ? "font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")} style={!needle && active === group.id ? { borderColor: SCOPE_COLOR[scope], background: tint(SCOPE_COLOR[scope], 14) } : undefined}>
                  {group.label}{isDenied(group) ? <Icons.Lock className="h-3 w-3" /> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {needle ? (
            <section aria-label="Resultados" className="flex min-w-0 flex-col gap-2">
              <p className="text-sm text-muted-foreground">{results.length} {results.length === 1 ? "resultado" : "resultados"} para «{query}»</p>
              <div className="flex min-w-0 flex-col divide-y divide-border rounded-2xl border border-border px-3">
                {results.map((entry) => {
                  const group = groups.find((candidate) => candidate.id === entry.group)!;
                  return (
                    <div key={entry.id} className="flex min-w-0 flex-col gap-0.5 py-1">
                      <p className="flex items-center gap-1.5 pt-1.5 text-xs text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full" style={{ background: SCOPE_COLOR[group.scope] }} />{group.label}</p>
                      <Row title={entry.label} text={entry.text} locked={entry.locked} error={entry.error}>{entry.control}</Row>
                    </div>
                  );
                })}
                {results.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Ningún ajuste coincide con «{query}». Prueba con «idioma», «facturas» o «2FA».</p> : null}
              </div>
            </section>
          ) : visibleGroups.map((group) => {
            const inGroup = entries.filter((entry) => entry.group === group.id);
            return (
              <section key={group.id} id={`sec-${group.id}`} className="flex min-w-0 scroll-mt-4 flex-col gap-2">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0"><h2 className="text-lg font-semibold">{group.label}</h2><p className="text-sm text-muted-foreground">{group.scopeNote}</p></div>
                  <Pill color={SCOPE_COLOR[group.scope]}>{SCOPE_LABEL[group.scope]}</Pill>
                </div>
                {isDenied(group) ? <NoPermission what={DENIED_WHAT[group.scope] ?? group.label} /> : (
                  <Panel>
                    <div className="flex min-w-0 flex-col divide-y divide-border">
                    {inGroup.map((entry) => entry.wide
                      ? <div key={entry.id} className="flex min-w-0 flex-col gap-1 py-2.5">{entry.id === "twoFactor" && ctx.wizard.open ? entry.control : <><p className="break-words text-sm font-medium">{entry.label}</p>{entry.text ? <p className="text-xs text-muted-foreground">{entry.text}</p> : null}{entry.control}</>}</div>
                      : <Row key={entry.id} title={entry.label} text={entry.text} locked={entry.locked} error={entry.error}>{entry.control}</Row>)}
                    </div>
                  </Panel>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {undo ? (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            <Icons.CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="min-w-0 flex-1 truncate">{undo.label}</span>
            <Button size="sm" variant="ghost" onClick={undo.revert}><Icons.Undo2 className="h-3.5 w-3.5" />Deshacer</Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PluginToggle({ name, initial }: { name: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return <Toggle checked={on} onChange={setOn} label={name} />;
}

