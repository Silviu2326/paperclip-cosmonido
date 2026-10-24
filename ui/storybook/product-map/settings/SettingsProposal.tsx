import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadError, NoPermission } from "../activity/states";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, Pill } from "../parts";
import { SCOPE_LABEL, SETTINGS_GROUPS, type SettingsGroup, type SettingsScope } from "./demo-data";
import { ADMIN_LOCKED, type SettingsScenario, type SettingsVariant } from "./scenarios";
import { SettingsAssistant } from "./SettingsAssistant";
import { SettingsLong } from "./SettingsLong";
import { DangerDialog, FIELD_GROUP, GroupBody, SCOPE_COLOR, iconFor } from "./sections";
import { useSettingsState, type SettingsState } from "./state";
import { LeaveDialog, LockPill, SessionExpiredDialog, SettingsSkeleton } from "./states";

const DENIED_WHAT: Partial<Record<SettingsScope, string>> = { company: "los ajustes de la empresa", account: "la cuenta comercial", instance: "la administración de la instalación" };

/** Variant A — grouped navigation by who owns each setting, one explicit Save bar. */
function SettingsGrouped({ state, groups, startGroup, denied, onBack }: { state: SettingsState; groups: SettingsGroup[]; startGroup: string; denied: boolean; onBack: () => void }) {
  const tokens = useMotionTokens();
  const [groupId, setGroupId] = useState(startGroup);
  const [query, setQuery] = useState("");
  const { form, set, errors, dirty, justSaved, notice, ctx } = state;
  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => (needle ? groups.filter((group) => `${group.label} ${group.keywords}`.toLowerCase().includes(needle)) : groups), [needle, groups]);
  const group = groups.find((candidate) => candidate.id === groupId) ?? groups[0]!;
  const errorGroups = new Set(Object.keys(errors).map((key) => FIELD_GROUP[key as keyof typeof FIELD_GROUP]));
  const errorCount = Object.keys(errors).length;
  const scopes: SettingsScope[] = ["user", "company", "account", "instance"];
  const isDenied = (candidate: SettingsGroup) => denied && candidate.scope !== "user";

  function goToFirstError() {
    const first = Object.keys(errors)[0] as keyof typeof FIELD_GROUP | undefined;
    const target = first ? FIELD_GROUP[first] : undefined;
    if (target) setGroupId(target);
  }

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground" onClick={onBack}><Icons.ArrowLeft className="h-4 w-4" />Volver a Inicio</button>
        <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm focus-within:border-foreground/30">
          <Icons.Search className="h-4 w-4 text-muted-foreground" />
          <input className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" aria-label="Buscar un ajuste" placeholder="Buscar un ajuste: idioma, 2FA, API…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

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
                        {isDenied(item) ? <Icons.Lock className="relative h-3 w-3 text-muted-foreground" aria-label="Sin acceso" /> : null}
                        {errorGroups.has(item.id) ? <span aria-label="Tiene errores" className="relative h-2 w-2 rounded-full" style={{ background: ACCENT.risk }} /> : null}
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
              {isDenied(group) ? <NoPermission what={DENIED_WHAT[group.scope] ?? group.label} /> : <GroupBody group={group} form={form} set={set} ctx={ctx} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {dirty || justSaved || notice ? (
          <motion.div role="status" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            {notice ? <><Icons.CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="min-w-0 flex-1">{notice}</span></>
              : justSaved && !dirty ? <><Icons.CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="flex-1">Cambios guardados</span></>
                : errorCount ? <>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ACCENT.risk }} /><span className="min-w-0 flex-1 basis-40">No se pudo guardar: revisa {errorCount} {errorCount === 1 ? "campo" : "campos"}</span>
                  <Button size="sm" variant="ghost" onClick={goToFirstError}>Ir al primer error</Button>
                  <Button size="sm" onClick={state.save}>Guardar</Button>
                </> : <>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ACCENT.yellow }} /><span className="min-w-0 flex-1">Tienes cambios sin guardar</span>
                  <Button size="sm" variant="ghost" onClick={state.discard}>Descartar</Button>
                  <Button size="sm" onClick={() => state.save()} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>Guardar</Button>
                </>}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/**
 * Ajustes. `variant` picks one of three designs (a: grouped navigation,
 * b: one long page with search and inline editing, c: task assistant) and
 * `scenario` the situation it is shown in.
 */
export function SettingsProposal({ variant = "a", scenario = "normal", isAdmin = true, startGroup = "profile" }: { variant?: SettingsVariant; scenario?: SettingsScenario; isAdmin?: boolean; startGroup?: string }) {
  const [current, setCurrent] = useState(variant);
  useEffect(() => setCurrent(variant), [variant]);
  const state = useSettingsState(scenario);
  const groups = SETTINGS_GROUPS.filter((group) => isAdmin || !group.adminOnly);
  const denied = scenario === "no-permission";
  const lockedCount = state.locked.size;
  const { setNotice, setDanger, setLeaveOpen, leaveOpen, expired, setExpired, danger } = state;
  const start = scenario === "two-factor" ? "security" : scenario === "no-permission" ? "company" : startGroup;

  function onBack() {
    if (state.dirty) setLeaveOpen(true);
    else setNotice("Habrías vuelto a Inicio. No había cambios pendientes.");
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 overflow-x-hidden p-4 sm:p-6">
      <header className="flex min-w-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0"><h1 className="text-2xl font-semibold">Ajustes</h1><p className="text-sm text-muted-foreground">{current === "c" ? "Dinos qué quieres hacer y te llevamos directo." : "Cada ajuste indica a quién afecta: a ti, a la empresa, a la cuenta o a toda la instalación."}</p></div>
        {denied ? <Pill color={ACCENT.lilac}><Icons.Lock className="h-3 w-3" />Tu rol: Invitado</Pill> : null}
      </header>

      {lockedCount ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl p-3 text-sm" style={{ background: tint(ACCENT.yellow, 20) }}>
          <Icons.Lock className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.yellow) }} />
          <span className="min-w-0 flex-1 basis-56">El administrador de la instalación ha fijado <strong>{lockedCount} ajustes</strong> para todos los miembros: {ADMIN_LOCKED.map((key) => ({ language: "idioma", office: "Oficina fijada", retention: "retención de datos", twoFactor: "verificación en dos pasos" })[key]).join(", ")}.</span>
          <LockPill text="Solo lectura" />
        </div>
      ) : null}

      {scenario === "loading" ? <SettingsSkeleton /> : scenario === "error" ? <LoadError title="No hemos podido cargar tus ajustes" text="Tus cambios guardados están a salvo. Vuelve a intentarlo en unos segundos." detail="Error 503 · /api/settings no respondió a tiempo" /> : current === "a" ? (
        <SettingsGrouped state={state} groups={groups} startGroup={start} denied={denied} onBack={onBack} />
      ) : current === "b" ? (
        <SettingsLong state={state} groups={groups} denied={denied} />
      ) : (
        <SettingsAssistant state={state} groups={groups} denied={denied} onShowAll={() => setCurrent("a")} />
      )}

      <AnimatePresence>
        {current !== "a" && state.notice ? (
          <motion.div role="status" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-4 py-2.5 text-sm shadow-lg">
            <Icons.CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: readable(ACCENT.mint) }} /><span className="min-w-0 flex-1">{state.notice}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DangerDialog open={danger === "account"} onOpenChange={(open) => !open && setDanger(null)} title="Eliminar la cuenta comercial" description={`Se eliminará «${state.data.accounts[0]!.name}». Tienes un plazo para cancelar la solicitud antes de que se ejecute.`} phrase="DELETE COMMERCIAL ACCOUNT" action="Solicitar eliminación" onConfirm={() => setNotice("Eliminación solicitada. Puedes cancelarla durante el plazo.")} />
      <DangerDialog open={danger === "session"} onOpenChange={(open) => !open && setDanger(null)} title="Cerrar esta sesión" description="El dispositivo tendrá que volver a iniciar sesión." phrase="CERRAR" action="Cerrar sesión" onConfirm={() => setNotice("Sesión cerrada.")} />
      <LeaveDialog
        open={leaveOpen}
        count={state.changedKeys.length}
        groups={state.changedGroups}
        onStay={() => setLeaveOpen(false)}
        onDiscard={() => { state.discard(); setLeaveOpen(false); setNotice("Cambios descartados. Habrías vuelto a Inicio."); }}
        onSave={() => { if (state.save()) { setLeaveOpen(false); setNotice("Cambios guardados. Habrías vuelto a Inicio."); } else setLeaveOpen(false); }}
      />
      <SessionExpiredDialog open={expired} pendingChanges={state.dirty} onSignedIn={() => { setExpired(false); setNotice("Has vuelto a entrar. Tus cambios siguen ahí."); }} onSignOut={() => { setExpired(false); setNotice("Sesión cerrada."); }} />
    </div>
  );
}

