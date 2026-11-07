import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, KeyRound, Lock, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SkeletonRows, Skeleton } from "../activity/states";
import { ink, readable, tint, useMotionTokens } from "../motion";
import { ACCENT, IconTile, Panel, Pill } from "../parts";

/** Pieces of the Ajustes proposal that are about situations rather than settings. */

export function SettingsSkeleton() {
  return (
    <div role="status" aria-label="Cargando los ajustes" className="flex min-w-0 flex-col gap-6 md:flex-row">
      <div className="flex shrink-0 flex-col gap-2 md:w-56">
        {[0, 1, 2, 3, 4, 5].map((index) => <div key={index} className="flex items-center gap-2 px-2 py-1.5"><Skeleton className="h-6 w-6 rounded-md" /><Skeleton className="h-3.5" style={{ width: `${60 + (index % 3) * 12}%` }} /></div>)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-2"><Skeleton className="h-5 w-40" /><Skeleton className="h-3.5 w-72 max-w-full" /></div>
        {[0, 1].map((card) => (
          <div key={card} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <Skeleton className="h-4 w-36" />
            <SkeletonRows count={card === 0 ? 3 : 2} avatar={false} />
          </div>
        ))}
        <p className="text-center text-xs text-muted-foreground">Cargando tus ajustes…</p>
      </div>
    </div>
  );
}

/** A setting the instance administrator fixed. */
export function LockPill({ text = "Lo gestiona el administrador" }: { text?: string }) {
  return <Pill color={ACCENT.yellow}><Lock className="h-3 w-3" />{text}</Pill>;
}

export function FieldError({ children }: { children?: string }) {
  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-1.5 overflow-hidden text-xs" style={{ color: readable(ACCENT.risk) }}>
          <TriangleAlert className="h-3 w-3 shrink-0" />{children}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

/** Shows the first `initial` items and a button for more, so 120 members stay manageable. */
export function MoreList<T>({ items, initial = 6, step = 10, noun = "más", render }: { items: T[]; initial?: number; step?: number; noun?: string; render: (item: T) => ReactNode }) {
  const [shown, setShown] = useState(initial);
  return (
    <>
      {items.slice(0, shown).map(render)}
      {items.length > shown ? (
        <div className="flex justify-center py-2.5">
          <Button size="sm" variant="ghost" onClick={() => setShown(shown + step)}>Mostrar {Math.min(step, items.length - shown)} {noun} · quedan {items.length - shown}</Button>
        </div>
      ) : null}
    </>
  );
}

/** A 21×21 pattern that looks like a QR code. It encodes nothing. */
function FakeQr() {
  const cells = useMemo(() => {
    let seed = 42;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const size = 21;
    const finder = (x: number, y: number) => (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (finder(x, y)) {
          const lx = x > 13 ? x - 14 : x; const ly = y > 13 ? y - 14 : y;
          const ring = lx === 0 || lx === 6 || ly === 0 || ly === 6; const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
          if (ring || core) out.push({ x, y });
        } else if (random() > 0.52) out.push({ x, y });
      }
    }
    return out;
  }, []);
  return (
    <svg viewBox="-1 -1 23 23" role="img" aria-label="Código QR de ejemplo" className="h-40 w-40 rounded-xl bg-white p-1">
      {cells.map((cell) => <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width="1" height="1" fill="#111" />)}
    </svg>
  );
}

const RECOVERY_CODES = ["7K2M-9QXA", "B4TD-1HPE", "Z8RW-3NCV", "X5LJ-6YUG", "D9FS-2KMB", "Q3AH-7WTE", "N6VC-4RZP", "J1GX-8DLY"];
const STEPS = ["Contraseña", "Escanear", "Código", "Recuperación"];

/** Turning on two-step verification: confirm password, scan, enter a code, keep recovery codes. */
export function TwoFactorWizard({ startStep = 0, onDone, onCancel }: { startStep?: number; onDone: () => void; onCancel: () => void }) {
  const tokens = useMotionTokens();
  const [step, setStep] = useState(startStep);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function verify() {
    if (code.replace(/\s/g, "") === "123456") { setWrong(false); setStep(3); } else setWrong(true);
  }
  const canNext = step === 0 ? password.length >= 1 : step === 1 ? true : step === 2 ? code.length >= 6 : saved;

  return (
    <Panel>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" style={{ color: readable(ACCENT.mint) }} />Activar la verificación en dos pasos</h3>
        <button className="text-xs text-muted-foreground underline" onClick={onCancel}>Cancelar</button>
      </div>
      <ol className="flex items-center gap-2" aria-label="Pasos">
        {STEPS.map((label, index) => (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={index === step ? "step" : undefined}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={index < step ? { background: ACCENT.mint, color: ink(ACCENT.mint) } : index === step ? { background: ACCENT.turquoise, color: ink(ACCENT.turquoise) } : { background: tint(ACCENT.muted, 22) }}>
              {index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={cn("hidden truncate text-xs sm:block", index === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {index < STEPS.length - 1 ? <span aria-hidden="true" className="h-px min-w-2 flex-1 bg-border" /> : null}
          </li>
        ))}
      </ol>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }} className="flex min-w-0 flex-col gap-3">
          {step === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">Por seguridad, confirma tu contraseña antes de cambiar cómo inicias sesión.</p>
              <div className="flex max-w-sm flex-col gap-1.5"><Label htmlFor="tf-password">Contraseña actual</Label><Input id="tf-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            </>
          ) : step === 1 ? (
            <div className="flex min-w-0 flex-wrap items-center gap-5">
              <FakeQr />
              <div className="min-w-0 flex-1 basis-56 text-sm"><p className="font-medium">Escanea el código con tu app de autenticación</p><p className="text-muted-foreground">Google Authenticator, 1Password, Authy… ¿No puedes escanear? Escribe esta clave a mano:</p><code className="mt-2 block break-all rounded-lg bg-muted px-2 py-1.5 text-xs">JBSW Y3DP EHPK 3PXP</code></div>
            </div>
          ) : step === 2 ? (
            <>
              <p className="text-sm text-muted-foreground">Escribe el código de 6 dígitos que muestra la app. <span className="text-xs">(En esta demo, el código es 123456.)</span></p>
              <motion.div animate={wrong ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }} transition={{ duration: 0.35 }} className="flex max-w-xs flex-col gap-1.5">
                <Label htmlFor="tf-code">Código de verificación</Label>
                <Input id="tf-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} aria-invalid={wrong} className={cn("text-center font-mono text-lg tracking-widest", wrong && "border-destructive")} value={code} onChange={(event) => { setCode(event.target.value); setWrong(false); }} onKeyDown={(event) => { if (event.key === "Enter") verify(); }} />
                <FieldError>{wrong ? "Ese código no es correcto. Comprueba la hora de tu móvil e inténtalo de nuevo." : undefined}</FieldError>
              </motion.div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Guarda estos códigos: cada uno sirve <strong>una vez</strong> si pierdes tu móvil. No volverán a mostrarse.</p>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 font-mono text-sm sm:grid-cols-4">{RECOVERY_CODES.map((item) => <span key={item}>{item}</span>)}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setCopied(true)}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copiados" : "Copiar"}</Button>
                <Button size="sm" variant="outline"><Download className="h-3.5 w-3.5" />Descargar .txt</Button>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />Los he guardado en un lugar seguro</label>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button size="sm" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft className="h-4 w-4" />Atrás</Button>
        {step === 2 ? <Button size="sm" disabled={!canNext} onClick={verify}>Verificar<ChevronRight className="h-4 w-4" /></Button>
          : step === 3 ? <Button size="sm" disabled={!canNext} onClick={onDone} style={canNext ? { background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) } : undefined}><CheckCircle2 className="h-4 w-4" />Activar</Button>
            : <Button size="sm" disabled={!canNext} onClick={() => setStep(step + 1)}>Siguiente<ChevronRight className="h-4 w-4" /></Button>}
      </div>
    </Panel>
  );
}

/** The session expired. It cannot be dismissed; unsaved changes are kept and restored after signing in. */
export function SessionExpiredDialog({ open, onSignedIn, onSignOut, pendingChanges }: { open: boolean; onSignedIn: () => void; onSignOut: () => void; pendingChanges: boolean }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => { setBusy(false); setPassword(""); onSignedIn(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [busy, onSignedIn]);
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="max-w-md" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
        <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (password) setBusy(true); }}>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <IconTile icon={KeyRound} color={ACCENT.yellow} />
              <div className="min-w-0"><DialogTitle>Tu sesión ha caducado</DialogTitle><DialogDescription>Por seguridad cerramos la sesión tras 12 horas sin actividad. Vuelve a entrar para seguir en Ajustes.</DialogDescription></div>
            </div>
          </DialogHeader>
          {pendingChanges ? <p className="rounded-xl p-3 text-sm" style={{ background: tint(ACCENT.mint, 16) }}>Tus cambios sin guardar se han conservado y se restaurarán al entrar.</p> : null}
          <div className="flex flex-col gap-1.5"><Label htmlFor="expired-email">Cuenta</Label><Input id="expired-email" readOnly value="hastasilviu@gmail.com" /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="expired-password">Contraseña</Label><Input id="expired-password" type="password" autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onSignOut}>Cerrar sesión</Button>
            <Button type="submit" disabled={!password || busy}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}{busy ? "Entrando…" : "Volver a entrar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Leaving Ajustes with unsaved changes: keep editing, discard or save and leave. */
export function LeaveDialog({ open, count, groups, onStay, onDiscard, onSave }: { open: boolean; count: number; groups: string[]; onStay: () => void; onDiscard: () => void; onSave: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onStay(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <IconTile icon={TriangleAlert} color={ACCENT.yellow} />
            <div className="min-w-0"><DialogTitle>¿Salir sin guardar?</DialogTitle><DialogDescription>Tienes {count} {count === 1 ? "cambio" : "cambios"} sin guardar{groups.length ? ` en ${groups.join(", ")}` : ""}.</DialogDescription></div>
          </div>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onStay}>Seguir editando</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onDiscard}>Descartar y salir</Button>
            <Button onClick={onSave} style={{ background: `linear-gradient(135deg, ${ACCENT.mint}, ${ACCENT.turquoise})`, color: ink(ACCENT.turquoise) }}>Guardar y salir</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
