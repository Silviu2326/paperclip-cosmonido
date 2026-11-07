import { useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { AlertTriangle, Building2, ChevronDown, Mail, MessageCircle, Phone, Plus, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { BRAND, ink, readable, tint, useMotionTokens } from "../motion";
import type { DemoContact, DemoCustomer } from "./demo-data";

const MINT = BRAND(8);
const SKY = BRAND(7);
const YELLOW = BRAND(10);
const OWNERS = ["Tú", "Marta (agente de cuentas)", "Diego (agente comercial)"];
const CHANNELS: { id: DemoContact["channel"]; label: string; icon: typeof Mail }[] = [
  { id: "email", label: "Email", icon: Mail },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "phone", label: "Teléfono", icon: Phone },
];

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function gradientFor(name: string) {
  const index = ([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 10) + 1;
  return `linear-gradient(135deg, ${BRAND(index, "a")}, ${BRAND(index, "b")})`;
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");

/**
 * "Nuevo cliente" as a popup. Fields mirror createCustomerSchema (kind, name,
 * domain, tags, owner, health, notes) plus the primary contact the real dialog
 * already asks for; duplicate detection mirrors the server's duplicate notice.
 */
export function NewCustomerDialog({ open, onOpenChange, existing, onCreate, onOpenExisting }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: DemoCustomer[];
  onCreate: (customer: DemoCustomer) => void;
  onOpenExisting: (id: string) => void;
}) {
  const tokens = useMotionTokens();
  const [kind, setKind] = useState<DemoCustomer["kind"]>("organization");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactValue, setContactValue] = useState("");
  const [channel, setChannel] = useState<DemoContact["channel"]>("email");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [owner, setOwner] = useState(OWNERS[0]!);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [health, setHealth] = useState<DemoCustomer["health"]>("good");

  const suggestedTags = useMemo(() => [...new Set(existing.flatMap((customer) => customer.tags))].filter((tag) => !tags.includes(tag)).slice(0, 6), [existing, tags]);
  const duplicate = useMemo(() => {
    const byName = normalize(name);
    const byDomain = normalize(domain);
    if (byName.length < 3 && byDomain.length < 3) return null;
    return existing.find((customer) =>
      (byName.length >= 3 && normalize(customer.name).includes(byName))
      || (byDomain.length >= 3 && customer.domain && normalize(customer.domain) === byDomain)) ?? null;
  }, [existing, name, domain]);

  function reset() {
    setKind("organization"); setName(""); setDomain(""); setContactName(""); setContactValue("");
    setChannel("email"); setTags([]); setTagDraft(""); setOwner(OWNERS[0]!); setMoreOpen(false); setNotes(""); setHealth("good");
  }

  function addTag(value: string) {
    const tag = value.trim();
    if (tag && !tags.includes(tag)) setTags([...tags, tag]);
    setTagDraft("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const id = `new-${Date.now()}`;
    const personName = contactName.trim() || (kind === "person" ? name.trim() : "");
    onCreate({
      id, name: name.trim(), kind, domain: kind === "organization" ? normalize(domain) || null : null, tags, health, owner,
      contacts: personName || contactValue.trim() ? [{
        id: `${id}-p`, name: personName || contactValue.trim(), title: null,
        email: channel === "email" ? contactValue.trim() || null : null,
        phone: channel !== "email" ? contactValue.trim() || null : null,
        primary: true, channel,
      }] : [],
      services: [], openProposals: [], activeTasks: 0, pendingReviews: 0, unreadConversations: 0,
      lastActivity: new Date().toISOString(), lastActivityLabel: "Cliente creado ahora",
      nextAction: notes.trim() ? notes.trim().split("\n")[0]! : "Preparar la primera propuesta",
      createdAt: new Date().toISOString().slice(0, 10),
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-h-screen max-w-lg overflow-y-auto">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <motion.span
                aria-hidden="true"
                key={initials(name)}
                initial={{ scale: 0.85, opacity: 0.6 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: tokens.fast, ease: tokens.easeOut }}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-semibold"
                style={{ background: name.trim() ? gradientFor(name) : tint(SKY, 25), color: name.trim() ? "white" : readable(SKY) }}
              >
                {name.trim() ? initials(name) : <Plus className="h-5 w-5" />}
              </motion.span>
              <div className="min-w-0">
                <DialogTitle>{name.trim() || "Nuevo cliente"}</DialogTitle>
                <DialogDescription>Una empresa o persona para la que trabajas. Lo demás se puede completar después.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <LayoutGroup id="new-customer-kind">
            <div role="radiogroup" aria-label="Tipo de cliente" className="grid grid-cols-2 gap-2">
              {([["organization", "Empresa", Building2], ["person", "Persona", User]] as const).map(([id, label, Icon]) => {
                const active = kind === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setKind(id)}
                    className={cn("relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors duration-(--motion-duration-fast)", active ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    {active ? (
                      <motion.span layoutId="new-customer-kind-pill" className="absolute inset-0 rounded-xl" style={{ background: tint(MINT, 22), boxShadow: `inset 0 0 0 1.5px ${MINT}` }} transition={{ duration: tokens.base, ease: tokens.easeOut }} />
                    ) : null}
                    <Icon className="relative h-4 w-4" />
                    <span className="relative">{label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={cn("flex flex-col gap-1.5", kind === "person" && "sm:col-span-2")}>
              <Label htmlFor="new-customer-name">{kind === "person" ? "Nombre y apellidos" : "Nombre de la empresa"}</Label>
              <Input id="new-customer-name" autoFocus required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "person" ? "Lucía Martín" : "Clínica Dental Sonrisa"} />
            </div>
            {kind === "organization" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-customer-domain">Web</Label>
                <Input id="new-customer-domain" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="clinicasonrisa.es" />
              </div>
            ) : null}
          </div>

          <AnimatePresence>
            {duplicate ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: tokens.base, ease: tokens.easeOut }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 rounded-xl p-3 text-sm" style={{ background: tint(YELLOW, 22) }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: readable(YELLOW) }} />
                  <span className="flex-1">Parece que ya existe <strong>{duplicate.name}</strong>.</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => { onOpenExisting(duplicate.id); reset(); onOpenChange(false); }}>Abrir</Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Contacto principal</legend>
            {kind === "organization" ? (
              <Input aria-label="Nombre del contacto" value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Nombre de la persona (opcional)" />
            ) : null}
            <div className="flex gap-1.5">
              {CHANNELS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={channel === option.id}
                  onClick={() => setChannel(option.id)}
                  className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-(--motion-duration-fast)", channel === option.id ? "border-transparent font-medium" : "border-border text-muted-foreground hover:text-foreground")}
                  style={channel === option.id ? { background: tint(SKY, 28), color: readable(SKY) } : undefined}
                >
                  <option.icon className="h-3.5 w-3.5" />{option.label}
                </button>
              ))}
            </div>
            <Input
              aria-label={channel === "email" ? "Email" : "Teléfono"}
              type={channel === "email" ? "email" : "tel"}
              value={contactValue}
              onChange={(event) => setContactValue(event.target.value)}
              placeholder={channel === "email" ? "laura@clinicasonrisa.es" : "+34 600 00 00 00"}
            />
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-customer-tags">Etiquetas</Label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
              <AnimatePresence>
                {tags.map((tag) => (
                  <motion.span key={tag} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: tokens.fast, ease: tokens.easeOut }}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: tint(MINT, 24), color: readable(MINT) }}>
                    {tag}
                    <button type="button" aria-label={`Quitar ${tag}`} onClick={() => setTags(tags.filter((item) => item !== tag))}><X className="h-3 w-3" /></button>
                  </motion.span>
                ))}
              </AnimatePresence>
              <input
                id="new-customer-tags"
                className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(tagDraft); } }}
                placeholder={tags.length ? "" : "Escribe y pulsa Enter"}
              />
            </div>
            {suggestedTags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {suggestedTags.map((tag) => (
                  <button key={tag} type="button" onClick={() => addTag(tag)} className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">+ {tag}</button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-customer-owner">Responsable</Label>
            <NativeSelect id="new-customer-owner" value={owner} onChange={(event) => setOwner(event.target.value)}>
              {OWNERS.map((option) => <option key={option} value={option}>{option}</option>)}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-2">
            <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors duration-(--motion-duration-fast) hover:text-foreground">
              <motion.span animate={{ rotate: moreOpen ? 0 : -90 }} transition={{ duration: tokens.fast, ease: tokens.standard }} className="flex"><ChevronDown className="h-4 w-4" /></motion.span>
              Más detalles
            </button>
            <AnimatePresence initial={false}>
              {moreOpen ? (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: tokens.base, ease: tokens.easeOut }} className="flex flex-col gap-3 overflow-hidden">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-customer-health">Estado de la relación</Label>
                    <NativeSelect id="new-customer-health" value={health} onChange={(event) => setHealth(event.target.value as DemoCustomer["health"])}>
                      <option value="good">Bien</option><option value="watch">Vigilar</option><option value="risk">En riesgo</option>
                    </NativeSelect>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-customer-notes">Notas</Label>
                    <Textarea id="new-customer-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Qué necesita, cómo llegó, próximos pasos…" />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>Cancelar</Button>
            <Button type="submit" disabled={!name.trim()} style={name.trim() ? { background: `linear-gradient(135deg, ${MINT}, ${SKY})`, color: ink(SKY) } : undefined}>
              <Plus className="h-4 w-4" />Crear cliente
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
