import { AgentWorkPermissionsSection } from "../agent-capabilities/AgentWorkPermissions";
import { useId } from "react";
import { Check, Code2, Headphones, Settings2, ShieldCheck, Sparkles, TrendingUp, Workflow } from "lucide-react";
import {
  defaultAgentWorkPermissions,
  type AgentWorkPermissions,
  AGENT_SPECIALTIES,
  AGENT_SPECIALTY_CAPABILITIES,
  capabilitiesForSpecialty,
  AGENT_MESSAGE_CHANNELS,
  AGENT_SPECIALTY_MESSAGE_CHANNEL_PRESETS,
  AGENT_SPECIALTY_PRESETS,
  ALL_AGENT_CAPABILITIES_ENABLED,
  type AgentCapabilities,
  type AgentMessageChannel,
  type AgentSpecialty,
} from "@paperclipai/shared";
import type { AgentHireCapabilityFields } from "@/api/agents";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { accentReadable, accentTint, brandAccent } from "@/lib/accent";
import { cn } from "@/lib/utils";
import { Checkbox } from "../ui/checkbox";
import { ToggleSwitch } from "../ui/toggle-switch";
import { TEAM_WORKSPACE_PATHS } from "../team-workspace/TeamWorkspaceLinks";

/** What the user declared for the agent. `specialty: null` means the user has not chosen anything yet. */
export interface AgentPurposeValue {
  specialty: AgentSpecialty | null;
  capabilities: AgentCapabilities;
  messageChannels: AgentMessageChannel[];
  workPermissions?: AgentWorkPermissions;
  codeAdapterAccess?: "read_only" | "workspace_write" | null;
}

/** Untouched value: no specialty and every capability on, which is what the server keeps when nothing is sent. */
export const EMPTY_AGENT_PURPOSE: AgentPurposeValue = {
  specialty: null,
  capabilities: ALL_AGENT_CAPABILITIES_ENABLED,
  messageChannels: [],
};

export function agentPurposeForSpecialty(specialty: AgentSpecialty): AgentPurposeValue {
  return {
    specialty,
    workPermissions: defaultAgentWorkPermissions(specialty),
    capabilities: { ...AGENT_SPECIALTY_PRESETS[specialty].capabilities },
    messageChannels: [...AGENT_SPECIALTY_MESSAGE_CHANNEL_PRESETS[specialty]],
  };
}

/**
 * Body fields for `agentsApi.hire`. Nothing is sent unless the user chose a specialty
 * (changing a switch is only possible after that), so an untouched section keeps today's behaviour.
 */
export function agentPurposeHireFields(value: AgentPurposeValue): AgentHireCapabilityFields {
  if (!value.specialty) return {};
  return {
    capabilities: capabilitiesForSpecialty(value.capabilities, value.specialty),
    profile: {
      specialty: value.specialty,
      ...(value.codeAdapterAccess !== undefined ? { codeAdapterAccess: value.codeAdapterAccess } : {}),
      ...(value.workPermissions ? { workPermissions: value.workPermissions } : {}),
      sectors: [],
      messageChannels: value.messageChannels,
    },
  };
}

const SPECIALTY_ICONS = { customer_care: Headphones, sales: TrendingUp, video_content: Sparkles, software: Code2, operations: Workflow, custom: Settings2 };

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
        const Icon = SPECIALTY_ICONS[specialty];
        return (
          <button
            key={specialty}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            data-testid={`agent-purpose-card-${specialty}`}
            onClick={() => { if (!selected) onSelect(specialty); }}
            className={cn(
              "relative flex flex-col items-start gap-2 rounded-xl border p-3 text-start transition-[box-shadow,background] duration-(--motion-duration-fast) hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              selected ? "border-transparent ring-2 ring-ring" : "border-border",
            )}
            style={selected ? { background: accentTint(color, 13) } : undefined}
          >
            <span className="flex w-full items-center gap-2 text-sm font-semibold" style={{ color: accentReadable(color) }}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{copy.label}</span>
              {selected && <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" />}
            </span>
            <span className="text-xs text-muted-foreground">{copy.description}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Shared permission section for onboarding, hiring and editing. */
export function AgentCapabilitySwitches({
  value, onChange, disabled, specialty = "custom", autonomyNote = true,
  messageChannels, onMessageChannelsChange, workPermissions, onWorkPermissionsChange, workPermissionSupport, codeAdapterAccess, onCodeAdapterAccessChange,
}: {
  value: AgentCapabilities;
  workPermissions?: AgentWorkPermissions;
  workPermissionSupport?: { workspace: boolean; commands: boolean; codexFilesystem?: boolean };
  codeAdapterAccess?: "read_only" | "workspace_write" | null;
  onCodeAdapterAccessChange?: (next: "read_only" | "workspace_write" | null) => void;
  onWorkPermissionsChange?: (next: AgentWorkPermissions) => void;
  onChange: (next: AgentCapabilities) => void;
  disabled?: boolean;
  specialty?: AgentSpecialty;
  autonomyNote?: boolean;
  messageChannels?: AgentMessageChannel[];
  onMessageChannelsChange?: (next: AgentMessageChannel[]) => void;
}) {
  const { t } = useTranslation();
  const idBase = useId();
  const allowed = AGENT_SPECIALTY_CAPABILITIES[specialty];
  const normalized = capabilitiesForSpecialty(value, specialty);
  const hasLegacyPermissions = Object.keys(normalized).some((key) => value[key as keyof AgentCapabilities] && !normalized[key as keyof AgentCapabilities]);
  const enabledCount = allowed.filter((key) => key !== "code" && value[key]).length;
  const workOptions = ["software", "operations", "custom"].includes(specialty);
  const communication = allowed.includes("messages");
  const rows = [
    ["messages", "messagesTitle", "messagesHint", "Mensajes", "Puede escribir por los canales seleccionados."],
    ["calls", "callsTitle", "callsHint", "Llamadas", "Puede hacer llamadas telefónicas."],
    ["code", "codeTitle", "codeHint", "Código y repositorios", "Trabaja con código y repositorios."],
    ["mediaAnalyze", "mediaAnalyzeTitle", "mediaAnalyzeHint", "Analizar medios", "Transcribir audio o vídeo y detectar silencios y muletillas."],
    ["mediaEdit", "mediaEditTitle", "mediaEditHint", "Editar medios", "Editar y exportar contenido existente."],
    ["mediaCreateVideo", "mediaCreateVideoTitle", "mediaCreateVideoHint", "Crear vídeos", "Crear vídeos con los recursos disponibles."],
  ] as const;
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby={`${idBase}-title`}>
      <header className="flex items-start gap-3">
        <span className="rounded-lg bg-accent p-2 text-accent-foreground"><ShieldCheck className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 id={`${idBase}-title`} className="text-base font-semibold">{t("agentCaps.permissionsTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("agentCaps.permissionsHint")}</p>
        </div>
        {!workOptions && allowed.length > 0 && <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium" aria-label={t("agentCaps.enabledCount", { count: enabledCount })}>{enabledCount}/{allowed.length}</span>}
      </header>
      {hasLegacyPermissions && <p role="note" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("agentCaps.legacyPermissionsNote")}</p>}
      {allowed.length === 0 && !workOptions ? (
        <div className="space-y-2 rounded-lg bg-muted p-4">
          <p className="text-sm font-medium">{t("agentCaps.operationsScopeTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("agentCaps.operationsScopeHint")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {rows.filter(([key]) => key !== "code" && allowed.includes(key)).map(([key, title, hint, defaultTitle, defaultHint]) => (
            <div key={key} className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0 space-y-1">
                <label htmlFor={`${idBase}-${key}`} className="block text-sm font-medium">{t(`agentCaps.${title}`, { defaultValue: defaultTitle })}</label>
                <p className="text-sm text-muted-foreground">{t(`agentCaps.${hint}`, { defaultValue: defaultHint })}</p>
              </div>
              <ToggleSwitch id={`${idBase}-${key}`} data-testid={`agent-capability-${key}`} checked={value[key]} disabled={disabled} className="shrink-0"
                onCheckedChange={(checked) => onChange(capabilitiesForSpecialty({ ...value, [key]: checked }, specialty))} />
            </div>
          ))}
        </div>
      )}
      {communication && value.messages && messageChannels && onMessageChannelsChange && <AgentMessageChannelOptions value={messageChannels} onChange={onMessageChannelsChange} disabled={disabled} />}
      {workOptions && onWorkPermissionsChange && <AgentWorkPermissionsSection specialty={specialty} support={workPermissionSupport} codeAdapterAccess={codeAdapterAccess} onCodeAdapterAccessChange={onCodeAdapterAccessChange} value={workPermissions} onChange={onWorkPermissionsChange} disabled={disabled} />}
      {autonomyNote && communication && (value.messages || value.calls) && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">{t("agentCaps.autonomyNote", { defaultValue: "Al principio solo prepara borradores. Para que envíe con aprobación o directo, súbelo en Autonomía." })}</p>
          <Link to={TEAM_WORKSPACE_PATHS.autonomy} className="text-sm font-medium text-foreground underline underline-offset-4">{t("agentCaps.openAutonomy", { defaultValue: "Abrir Autonomía" })}</Link>
        </div>
      )}
    </section>
  );
}

/** Channel allowlist for agents that can send messages. */
export function AgentMessageChannelOptions({
  value,
  onChange,
  disabled,
}: {
  value: AgentMessageChannel[];
  onChange: (next: AgentMessageChannel[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const idBase = useId();
  const channelLabels: Record<AgentMessageChannel, string> = {
    email: t("agentMessageChannels.email", { defaultValue: "Correo" }),
    whatsapp: "WhatsApp",
    messenger: "Messenger",
    instagram: "Instagram",
    telegram: "Telegram",
    webchat: t("agentMessageChannels.webchat", { defaultValue: "Chat web" }),
    sms: "SMS",
  };
  const selected = new Set(value);

  function toggle(channel: AgentMessageChannel, checked: boolean | "indeterminate") {
    const next = new Set(value);
    if (checked === true) next.add(channel);
    else next.delete(channel);
    onChange(AGENT_MESSAGE_CHANNELS.filter((candidate) => next.has(candidate)));
  }

  return (
    <fieldset className="space-y-3 border-t border-border pt-4" disabled={disabled}>
      <legend className="text-sm font-medium">
        {t("agentMessageChannels.title", { defaultValue: "Canales de mensajería" })}
      </legend>
      <p className="text-xs text-muted-foreground">
        {t("agentMessageChannels.hint", { defaultValue: "Solo podrá enviar mensajes por los canales seleccionados. También necesitas configurar la conexión del canal." })}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {AGENT_MESSAGE_CHANNELS.map((channel) => {
          const id = `${idBase}-${channel}`;
          return (
            <div key={channel} className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <Checkbox
                id={id}
                checked={selected.has(channel)}
                disabled={disabled}
                onCheckedChange={(checked) => toggle(channel, checked)}
              />
              <label htmlFor={id} className="text-sm">
                {channelLabels[channel]}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Creation step: pick what the agent is for, then adjust the switches.
 * Switches only appear after a specialty is chosen (progressive disclosure).
 */
export function AgentPurposeSection({
  workPermissionSupport,
  value,
  onChange,
  disabled,
}: {
  workPermissionSupport?: { workspace: boolean; commands: boolean; codexFilesystem?: boolean };
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
      {!value.specialty && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("agentCaps.specialtyRequired", { defaultValue: "Elige una categoría para continuar." })}
        </p>
      )}
      <AgentSpecialtyCards
        value={value.specialty}
        disabled={disabled}
        onSelect={(specialty) => onChange(agentPurposeForSpecialty(specialty))}
      />
      {value.specialty && (
        <AgentCapabilitySwitches
          value={value.capabilities}
          specialty={value.specialty}
          workPermissionSupport={workPermissionSupport}
          codeAdapterAccess={value.codeAdapterAccess}
          onCodeAdapterAccessChange={(codeAdapterAccess) => onChange({ ...value, codeAdapterAccess })}
          workPermissions={value.workPermissions}
          onWorkPermissionsChange={(workPermissions) => onChange({ ...value, workPermissions })}
          disabled={disabled}
          messageChannels={value.messageChannels}
          onMessageChannelsChange={(messageChannels) => onChange({ ...value, messageChannels })}
          onChange={(capabilities) => onChange({ ...value, capabilities })}
        />
      )}
    </section>
  );
}
