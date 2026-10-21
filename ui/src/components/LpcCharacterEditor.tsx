import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Dices, Wand2 } from "lucide-react";
import {
  LPC_FIELD_OPTIONS, LPC_SWATCHES, agentAvatarUrl, appearanceForLpc, isLpcAppearance, randomLpcCharacter, resolveAgentAppearance,
  type AgentAppearance, type AgentPaletteId, type CharacterState, type LpcCharacter, type LpcMaterial,
} from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentCharacter } from "./AgentCharacter";

export type LpcEditableAgent = { id: string; name: string; companyId: string; appearance?: AgentAppearance | null };

const PREVIEW_STATES: readonly CharacterState[] = ["idle", "working", "thinking", "success", "confused", "sleepy"];
export const LPC_CREDITS_URL = "/api/agent-avatars/lpc-v1/credits";
type ChoiceField = "bodyType" | "hair" | "torso" | "legs" | "feet";
type ColorField = "skin" | "eyes" | "hairColor" | "torsoColor" | "legsColor" | "feetColor";
const COLOR_MATERIAL: Record<ColorField, LpcMaterial> = { skin: "body", eyes: "eye", hairColor: "hair", torsoColor: "cloth", legsColor: "cloth", feetColor: "cloth" };

/**
 * Neutral base for option thumbnails: a thumbnail only follows the draft in
 * the fields that affect the option's own look, so recolouring a shirt never
 * re-renders every hair style and the server's preset cache stays warm.
 */
const THUMB_BASE: LpcCharacter = { bodyType: "male", skin: "light", eyes: "brown", hair: "plain", hairColor: "dark_brown", torso: "tshirt", torsoColor: "gray", legs: "pants", legsColor: "slate", feet: "shoes", feetColor: "charcoal" };
const THUMB_FOLLOWS: Record<ChoiceField, readonly (keyof LpcCharacter)[]> = {
  bodyType: ["skin", "eyes", "hair", "hairColor", "torso", "torsoColor", "legs", "legsColor", "feet", "feetColor"],
  hair: ["bodyType", "skin", "eyes", "hairColor"],
  torso: ["bodyType", "skin", "torsoColor"],
  legs: ["bodyType", "skin", "legsColor"],
  feet: ["bodyType", "skin", "feetColor"],
};
/** Hair and face read best as a bust; clothes need the whole figure. */
const THUMB_SIZE: Record<ChoiceField, 48 | 64> = { bodyType: 64, hair: 48, torso: 64, legs: 64, feet: 64 };

export function initialLpcCharacter(appearance: AgentAppearance): LpcCharacter {
  return isLpcAppearance(appearance) ? appearance.lpc : randomLpcCharacter();
}
export function thumbnailCharacter(draft: LpcCharacter, field: ChoiceField, option: string): LpcCharacter {
  const character = { ...THUMB_BASE };
  for (const key of THUMB_FOLLOWS[field]) (character as Record<string, string>)[key] = draft[key];
  (character as Record<string, string>)[field] = option;
  return character;
}

function OptionTiles<K extends ChoiceField>({ field, draft, paletteId, onChange, label, disabled }: {
  field: K; draft: LpcCharacter; paletteId: AgentPaletteId; onChange: (value: LpcCharacter[K]) => void; label: (id: string) => string; disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t(`lpcCharacterEditor.fields.${field}`)} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {LPC_FIELD_OPTIONS[field].map(option => {
        const selected = draft[field] === option;
        const src = agentAvatarUrl(appearanceForLpc(thumbnailCharacter(draft, field, option), paletteId), THUMB_SIZE[field], 2, "rest");
        return (
          <button key={option} type="button" role="radio" aria-checked={selected} disabled={disabled}
            onClick={() => onChange(option as LpcCharacter[K])}
            className={cn("group flex flex-col items-center gap-1 rounded-lg border border-border bg-background p-2 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "border-primary bg-accent ring-2 ring-primary")}>
            <span className="relative flex size-16 items-center justify-center overflow-hidden rounded-md bg-muted/60">
              <img src={src} alt="" width={64} height={64} loading="lazy" decoding="async" className="pixel-art size-16 object-contain" />
              {selected && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span>}
            </span>
            <span className={cn("line-clamp-1 w-full text-center text-muted-foreground group-hover:text-foreground", selected && "font-medium text-foreground")}>{label(option)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Swatches({ field, value, onChange, disabled }: { field: ColorField; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const material = COLOR_MATERIAL[field];
  const name = (id: string) => id.replace(/_/g, " ");
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{t(`lpcCharacterEditor.fields.${field}`)}</span>
        <span className="text-xs capitalize text-muted-foreground">{name(value)}</span>
      </div>
      <div role="radiogroup" aria-label={t(`lpcCharacterEditor.fields.${field}`)} className="flex flex-wrap gap-2">
        {LPC_FIELD_OPTIONS[field].map(option => {
          const selected = value === option;
          return (
            <button key={option} type="button" role="radio" aria-checked={selected} aria-label={name(option)} title={name(option)} disabled={disabled}
              onClick={() => onChange(option)}
              className={cn("flex size-8 items-center justify-center rounded-full border border-border shadow-xs transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                selected && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
              style={{ backgroundColor: LPC_SWATCHES[material][option] }}>
              {selected && <Check className="size-4 text-background mix-blend-difference" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3"><h3 className="text-sm font-semibold">{title}</h3>{children}</section>;
}

/** Composes an agent's lpc-v1 character; saving replaces the persisted appearance through the standard agent update. */
export function LpcCharacterEditorDialog({ agent, open, onOpenChange }: { agent: LpcEditableAgent; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const current = useMemo(() => resolveAgentAppearance(agent.appearance, agent.id), [agent.appearance, agent.id]);
  const [draft, setDraft] = useState<LpcCharacter>(() => initialLpcCharacter(current));
  const [previewState, setPreviewState] = useState<CharacterState>("idle");
  useEffect(() => { if (open) setDraft(initialLpcCharacter(current)); }, [open, current]);
  const preview = useMemo(() => appearanceForLpc(draft, current.paletteId), [draft, current.paletteId]);
  const save = useMutation({
    mutationFn: () => agentsApi.update(agent.id, { appearance: preview }, agent.companyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents.detail(agent.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(agent.companyId) });
      onOpenChange(false);
    },
  });
  const busy = save.isPending;
  const update = <K extends keyof LpcCharacter>(field: K, value: LpcCharacter[K]) => setDraft(previous => ({ ...previous, [field]: value }));
  const optionLabel = (id: string) => t(`lpcCharacterEditor.options.${id}`, { defaultValue: id.replace(/_/g, " ") });
  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="flex max-h-(--sz-85vh) flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6 text-left">
          <DialogTitle>{t("lpcCharacterEditor.title")}</DialogTitle>
          <DialogDescription>{t("lpcCharacterEditor.description", { name: agent.name })}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 sm:grid-cols-5">
          <aside className="flex flex-col items-center gap-4 border-b border-border bg-muted/30 p-6 sm:col-span-2 sm:border-b-0 sm:border-r">
            <div className="flex size-64 items-center justify-center rounded-xl border border-border bg-background shadow-xs">
              <AgentCharacter appearance={preview} state={previewState} size={256} label={t("lpcCharacterEditor.preview")} />
            </div>
            <div role="radiogroup" aria-label={t("lpcCharacterEditor.previewState")} className="flex flex-wrap justify-center gap-1.5">
              {PREVIEW_STATES.map(state => (
                <button key={state} type="button" role="radio" aria-checked={previewState === state} onClick={() => setPreviewState(state)}
                  className={cn("rounded-full border border-border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    previewState === state ? "border-primary bg-primary text-primary-foreground hover:bg-primary" : "bg-background text-muted-foreground")}>
                  {t(`lpcCharacterEditor.states.${state}`)}
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => setDraft(randomLpcCharacter())} disabled={busy}>
              <Dices className="size-4" />{t("lpcCharacterEditor.randomize")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t("lpcCharacterEditor.hint")}</p>
          </aside>
          <Tabs defaultValue="body" className="min-h-0 sm:col-span-3">
            <div className="border-b border-border px-6 pt-4">
              <TabsList className="w-full">
                <TabsTrigger value="body">{t("lpcCharacterEditor.tabs.body")}</TabsTrigger>
                <TabsTrigger value="hair">{t("lpcCharacterEditor.tabs.hair")}</TabsTrigger>
                <TabsTrigger value="clothes">{t("lpcCharacterEditor.tabs.clothes")}</TabsTrigger>
              </TabsList>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <TabsContent value="body" className="space-y-6">
                <Section title={t("lpcCharacterEditor.fields.bodyType")}>
                  <OptionTiles field="bodyType" draft={draft} paletteId={current.paletteId} onChange={value => update("bodyType", value)} label={optionLabel} disabled={busy} />
                </Section>
                <Swatches field="skin" value={draft.skin} onChange={value => update("skin", value as LpcCharacter["skin"])} disabled={busy} />
                <Swatches field="eyes" value={draft.eyes} onChange={value => update("eyes", value as LpcCharacter["eyes"])} disabled={busy} />
              </TabsContent>
              <TabsContent value="hair" className="space-y-6">
                <Swatches field="hairColor" value={draft.hairColor} onChange={value => update("hairColor", value as LpcCharacter["hairColor"])} disabled={busy} />
                <Section title={t("lpcCharacterEditor.fields.hair")}>
                  <OptionTiles field="hair" draft={draft} paletteId={current.paletteId} onChange={value => update("hair", value)} label={optionLabel} disabled={busy} />
                </Section>
              </TabsContent>
              <TabsContent value="clothes" className="space-y-8">
                <Section title={t("lpcCharacterEditor.fields.torso")}>
                  <Swatches field="torsoColor" value={draft.torsoColor} onChange={value => update("torsoColor", value as LpcCharacter["torsoColor"])} disabled={busy} />
                  <OptionTiles field="torso" draft={draft} paletteId={current.paletteId} onChange={value => update("torso", value)} label={optionLabel} disabled={busy} />
                </Section>
                <Section title={t("lpcCharacterEditor.fields.legs")}>
                  <Swatches field="legsColor" value={draft.legsColor} onChange={value => update("legsColor", value as LpcCharacter["legsColor"])} disabled={busy} />
                  <OptionTiles field="legs" draft={draft} paletteId={current.paletteId} onChange={value => update("legs", value)} label={optionLabel} disabled={busy} />
                </Section>
                <Section title={t("lpcCharacterEditor.fields.feet")}>
                  <Swatches field="feetColor" value={draft.feetColor} onChange={value => update("feetColor", value as LpcCharacter["feetColor"])} disabled={busy} />
                  <OptionTiles field="feet" draft={draft} paletteId={current.paletteId} onChange={value => update("feet", value)} label={optionLabel} disabled={busy} />
                </Section>
              </TabsContent>
            </div>
          </Tabs>
        </div>
        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border px-6 py-4 sm:justify-between">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {t("lpcCharacterEditor.credits")}{" "}
            <a href={LPC_CREDITS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">{t("lpcCharacterEditor.creditsLink")}</a>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {save.isError && <span role="alert" className="text-sm text-destructive">{t("lpcCharacterEditor.saveFailed")}</span>}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{t("lpcCharacterEditor.cancel")}</Button>
            <Button type="button" onClick={() => save.mutate()} disabled={busy}>{t("lpcCharacterEditor.save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Opens the editor; agents still on the ClipLab character start from a random pixel-art draft. */
export function LpcCharacterEditorButton({ agent, className }: { agent: LpcEditableAgent; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className={className} onClick={() => setOpen(true)}>
        <Wand2 className="size-4" />{t("agentDetail.editCharacter")}
      </Button>
      {open && <LpcCharacterEditorDialog agent={agent} open={open} onOpenChange={setOpen} />}
    </>
  );
}
