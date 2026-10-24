import { useId } from "react";
import {
  AGENT_SPECIALTIES,
  AGENT_SPECIALTY_PRESETS,
  ALL_AGENT_CAPABILITIES_ENABLED,
  type AgentCapabilities,
  type AgentSpecialty,
} from "@paperclipai/shared";
import type { AgentHireCapabilityFields } from "@/api/agents";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { accentReadable, accentTint, brandAccent } from "@/lib/accent";
import { cn } from "@/lib/utils";
import { ToggleSwitch } from "../ui/toggle-switch";
import { TEAM_WORKSPACE_PATHS } from "../team-workspace/TeamWorkspaceLinks";

/** What the user declared for the agent. `specialty: null` means the user has not chosen anything yet. */
export interface AgentPurposeValue {
  specialty: AgentSpecialty | null;
  capabilities: AgentCapabilities;
}

/** Untouched value: no specialty and every capability on, which is what the server keeps when nothing is sent. */
export const EMPTY_AGENT_PURPOSE: AgentPurposeValue = {
  specialty: null,
  capabilities: ALL_AGENT_CAPABILITIES_ENABLED,
};

/**
 * Body fields for `agentsApi.hire`. Nothing is sent unless the user chose a specialty
 * (changing a switch is only possible after that), so an untouched section keeps today's behaviour.
 */
export function agentPurposeHireFields(value: AgentPurposeValue): AgentHireCapabilityFields {
  if (!value.specialty) return {};
  return {
    capabilities: value.capabilities,
    profile: { specialty: value.specialty, sectors: [] },
  };
}

const SPECIALTY_ACCENT: Record<AgentSpecialty, number> = {
  customer_care: 8,
  sales: 2,
  video_content: 10,
  software: 7,
  operations: 1,
  custom: 4,
};

/** Specialty cards, in the order of AGENT_SPECIALTIES. Labels are built inside the component so `t` is never called at module level. */
export function AgentSpecialtyCards({
  value,
  onSelect,
  disabled,
}: {
  value: AgentSpecialty | null;
  onSelect: (specialty: AgentSpecialty) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const cards: Record<AgentSpecialty, { label: string; description: string }> = {
    customer_care: {
      label: t("agentCaps.customerCareLabel", { defaultValue: "Atención al cliente" }),
      description: t("agentCaps.customerCareDescription", { defaultValue: "Responde a personas y clientes por email, WhatsApp o chat." }),
    },
    sales: {
      label: t("agentCaps.salesLabel", { defaultValue: "Ventas" }),
      description: t("agentCaps.salesDescription", { defaultValue: "Atiende oportunidades, hace seguimiento y puede llamar." }),
    },
    video_content: {
      label: t("agentCaps.videoContentLabel", { defaultValue: "Vídeo y contenido" }),
      description: t("agentCaps.videoContentDescription", { defaultValue: "Crea y edita vídeo y otros medios." }),
    },
    software: {
      label: t("agentCaps.softwareLabel", { defaultValue: "Código y desarrollo" }),
      description: t("agentCaps.softwareDescription", { defaultValue: "Trabaja con código y repositorios." }),
    },
    operations: {
      label: t("agentCaps.operationsLabel", { defaultValue: "Operaciones" }),
      description: t("agentCaps.operationsDescription", { defaultValue: "Tareas internas, sin hablar con clientes." }),
    },
    custom: {
      label: t("agentCaps.customLabel", { defaultValue: "Personalizado" }),
      description: t("agentCaps.customDescription", { defaultValue: "Tú decides cada permiso." }),
    },
  };
  return (
    <div
      role="radiogroup"
      aria-label={t("agentCaps.purposeTitle", { defaultValue: "¿Para qué sirve este agente?" })}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {AGENT_SPECIALTIES.map((specialty) => {
        const selected = value === specialty;
        const color = brandAccent(SPECIALTY_ACCENT[specialty]);
        const copy = cards[specialty];
        return (
          <button
            key={specialty}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-testid={`agent-purpose-card-${specialty}`}
            onClick={() => onSelect(specialty)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-4 text-start transition-[box-shadow,background] duration-(--motion-duration-fast) hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              selected ? "border-transparent ring-2 ring-ring" : "border-border",
            )}
            style={selected ? { background: accentTint(color, 13) } : undefined}
          >
            <span className="text-sm font-semibold" style={{ color: accentReadable(color) }}>
              {copy.label}
            </span>
            <span className="text-xs text-muted-foreground">{copy.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The four capability switches. The approval level is not editable here; see the autonomy note. */
export function AgentCapabilitySwitches({
  value,
  onChange,
  disabled,
  autonomyNote = true,
}: {
  value: AgentCapabilities;
  onChange: (next: AgentCapabilities) => void;
  disabled?: boolean;
  /** Shows the calm note and link to Autonomía under the messaging and calls switches. */
  autonomyNote?: boolean;
}) {
  const { t } = useTranslation();
  const idBase = useId();
  const rows: Array<{ key: keyof AgentCapabilities; title: string; hint: string }> = [
    {
      key: "messages",
      title: t("agentCaps.messagesTitle", { defaultValue: "Mensajes" }),
      hint: t("agentCaps.messagesHint", { defaultValue: "Puede escribir a personas y clientes (email, WhatsApp, chat)" }),
    },
    {
      key: "calls",
      title: t("agentCaps.callsTitle", { defaultValue: "Llamadas" }),
      hint: t("agentCaps.callsHint", { defaultValue: "Puede llamar por teléfono" }),
    },
    {
      key: "video",
      title: t("agentCaps.videoTitle", { defaultValue: "Vídeo y medios" }),
      hint: t("agentCaps.videoHint", { defaultValue: "Puede generar y editar vídeo" }),
    },
    {
      key: "code",
      title: t("agentCaps.codeTitle", { defaultValue: "Código y repositorios" }),
      hint: t("agentCaps.codeHint", { defaultValue: "Trabaja con código y repositorios" }),
    },
  ];
  return (
    <div className="divide-y divide-border rounded-xl border border-border">
      {rows.map((row) => {
        const labelId = `${idBase}-${row.key}`;
        return (
          <div key={row.key}>
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 space-y-0.5">
                <p id={labelId} className="text-sm font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">{row.hint}</p>
              </div>
              <ToggleSwitch
                aria-labelledby={labelId}
                data-testid={`agent-capability-${row.key}`}
                checked={value[row.key]}
                disabled={disabled}
                onCheckedChange={(checked) => onChange({ ...value, [row.key]: checked })}
              />
            </div>
            {autonomyNote && row.key === "calls" && (
              <div className="space-y-2 px-4 pb-4">
                <p className="text-xs text-muted-foreground">
                  {t("agentCaps.autonomyNote", { defaultValue: "Al principio solo prepara borradores. Para que envíe con aprobación o directo, súbelo en Autonomía." })}
                </p>
                <Link to={TEAM_WORKSPACE_PATHS.autonomy} className="text-xs font-medium text-foreground underline-offset-4 hover:underline">
                  {t("agentCaps.openAutonomy", { defaultValue: "Abrir Autonomía" })}
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Creation step: pick what the agent is for, then adjust the switches.
 * Switches only appear after a specialty is chosen (progressive disclosure).
 */
export function AgentPurposeSection({
  value,
  onChange,
  disabled,
}: {
  value: AgentPurposeValue;
  onChange: (next: AgentPurposeValue) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-5" aria-label={t("agentCaps.purposeTitle", { defaultValue: "¿Para qué sirve este agente?" })}>
      <h3 className="text-sm font-semibold">
        {t("agentCaps.purposeTitle", { defaultValue: "¿Para qué sirve este agente?" })}
      </h3>
      <AgentSpecialtyCards
        value={value.specialty}
        disabled={disabled}
        onSelect={(specialty) =>
          onChange({ specialty, capabilities: { ...AGENT_SPECIALTY_PRESETS[specialty].capabilities } })
        }
      />
      {value.specialty && (
        <AgentCapabilitySwitches
          value={value.capabilities}
          disabled={disabled}
          onChange={(capabilities) => onChange({ ...value, capabilities })}
        />
      )}
    </section>
  );
}
