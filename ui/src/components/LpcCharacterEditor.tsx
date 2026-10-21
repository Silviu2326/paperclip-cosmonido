import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dices, Wand2 } from "lucide-react";
import {
  CHARACTER_STATES, LPC_FIELD_OPTIONS, LPC_SWATCHES, appearanceForLpc, isLpcAppearance, randomLpcCharacter, resolveAgentAppearance,
  type AgentAppearance, type CharacterState, type LpcCharacter, type LpcMaterial,
} from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { AgentCharacter } from "./AgentCharacter";

export type LpcEditableAgent = { id: string; name: string; companyId: string; appearance?: AgentAppearance | null };

const CHOICE_FIELDS = ["bodyType", "hair", "torso", "legs", "feet"] as const satisfies readonly (keyof LpcCharacter)[];
const COLOR_FIELDS: readonly { field: keyof LpcCharacter; material: LpcMaterial }[] = [
  { field: "skin", material: "body" }, { field: "eyes", material: "eye" }, { field: "hairColor", material: "hair" },
  { field: "torsoColor", material: "cloth" }, { field: "legsColor", material: "cloth" }, { field: "feetColor", material: "cloth" },
];
const PREVIEW_STATES: readonly CharacterState[] = ["idle", "working", "thinking", "success", "confused", "sleepy"];
export const LPC_CREDITS_URL = "/api/agent-avatars/lpc-v1/credits";

export function initialLpcCharacter(appearance: AgentAppearance): LpcCharacter {
  return isLpcAppearance(appearance) ? appearance.lpc : randomLpcCharacter();
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
  const update = <K extends keyof LpcCharacter>(field: K, value: LpcCharacter[K]) => setDraft(previous => ({ ...previous, [field]: value }));
  const optionLabel = (id: string) => t(`lpcCharacterEditor.options.${id}`, { defaultValue: id.replace(/_/g, " ") });
  return (
    <Dialog open={open} onOpenChange={next => { if (!save.isPending) onOpenChange(next); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("lpcCharacterEditor.title")}</DialogTitle>
          <DialogDescription>{t("lpcCharacterEditor.description", { name: agent.name })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="flex shrink-0 flex-col items-center gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <AgentCharacter appearance={preview} state={previewState} size={128} label={t("lpcCharacterEditor.preview")} />
            </div>
            <NativeSelect aria-label={t("lpcCharacterEditor.previewState")} value={previewState} onChange={event => setPreviewState(event.target.value as CharacterState)} className="w-36">
              {PREVIEW_STATES.map(state => <option key={state} value={state}>{t(`lpcCharacterEditor.states.${state}`)}</option>)}
            </NativeSelect>
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(randomLpcCharacter())} disabled={save.isPending}>
              <Dices className="size-4" />{t("lpcCharacterEditor.randomize")}
            </Button>
          </div>
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            {CHOICE_FIELDS.map(field => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={`lpc-${field}`}>{t(`lpcCharacterEditor.fields.${field}`)}</Label>
                <NativeSelect id={`lpc-${field}`} value={draft[field]} onChange={event => update(field, event.target.value as LpcCharacter[typeof field])} disabled={save.isPending}>
                  {LPC_FIELD_OPTIONS[field].map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}
                </NativeSelect>
              </div>
            ))}
            {COLOR_FIELDS.map(({ field, material }) => (
              <fieldset key={field} className="space-y-1.5">
                <legend className="text-sm font-medium">{t(`lpcCharacterEditor.fields.${field}`)}</legend>
                <div role="radiogroup" aria-label={t(`lpcCharacterEditor.fields.${field}`)} className="flex flex-wrap gap-1.5">
                  {LPC_FIELD_OPTIONS[field].map(option => {
                    const selected = draft[field] === option;
                    return (
                      <button key={option} type="button" role="radio" aria-checked={selected} aria-label={option.replace(/_/g, " ")} title={option.replace(/_/g, " ")}
                        disabled={save.isPending} onClick={() => update(field, option as LpcCharacter[typeof field])}
                        className={cn("size-6 rounded-full border border-border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
                        style={{ backgroundColor: LPC_SWATCHES[material][option] }} />
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("lpcCharacterEditor.credits")}{" "}
          <a href={LPC_CREDITS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">{t("lpcCharacterEditor.creditsLink")}</a>
        </p>
        {save.isError && <p role="alert" className="text-sm text-destructive">{t("lpcCharacterEditor.saveFailed")}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>{t("lpcCharacterEditor.cancel")}</Button>
          <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>{t("lpcCharacterEditor.save")}</Button>
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
