import { useId } from "react";
import { ALL_AGENT_WORK_PERMISSIONS, type AgentSpecialty, type AgentWorkPermission, type AgentWorkPermissions } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { NativeSelect } from "../ui/select";
import { ToggleSwitch } from "../ui/toggle-switch";

export function AgentWorkPermissionsSection({ specialty, value, onChange, disabled, support, codeAdapterAccess, onCodeAdapterAccessChange }: {
  specialty: AgentSpecialty;
  support?: { workspace: boolean; commands: boolean; codexFilesystem?: boolean };
  codeAdapterAccess?: "read_only" | "workspace_write" | null;
  onCodeAdapterAccessChange?: (next: "read_only" | "workspace_write" | null) => void;
  value?: AgentWorkPermissions;
  onChange: (next: AgentWorkPermissions) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const current = value ?? ALL_AGENT_WORK_PERMISSIONS;
  const groups: { title: string; keys: AgentWorkPermission[] }[] = [
    ...(specialty === "software" || specialty === "custom" ? [{ title: "code", keys: ["workspaceRead", "workspaceWrite", "workspaceExecute"] as AgentWorkPermission[] }] : []),
    { title: "tasks", keys: ["tasksRead", "tasksCreate", "tasksUpdate", "tasksAssign"] },
    { title: "projects", keys: ["projectsRead", "projectsManage"] },
    { title: "documents", keys: ["documentsRead", "documentsWrite"] },
  ];
  function change(key: AgentWorkPermission, checked: boolean) {
    const next = { ...current, [key]: checked };
    if (!next.workspaceRead) { next.workspaceWrite = false; next.workspaceExecute = false; }
    if (!next.workspaceWrite) next.workspaceExecute = false;
    onChange(next);
  }
  return <div className="space-y-5">
    {!value && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("agentWorkPermissions.legacy")}</p>}
    {groups.map(group => <fieldset key={group.title} className="space-y-2 border-t border-border pt-4" disabled={disabled}>
      <legend className="text-sm font-semibold">{t(`agentWorkPermissions.groups.${group.title}`)}</legend>
      {group.title === "code" && <p className="text-sm text-muted-foreground">{t("agentWorkPermissions.codeScope")}</p>}
      {group.title === "code" && !support?.workspace && <p role="note" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{t("agentWorkPermissions.unsupportedAdapter")}</p>}
      {group.title === "code" && onCodeAdapterAccessChange && (support?.codexFilesystem || codeAdapterAccess != null) && <div className="space-y-2 py-3">
        <label htmlFor={`${id}-codex-access`} className="text-sm font-medium">{t("agentWorkPermissions.codexAccess")}</label>
        <NativeSelect id={`${id}-codex-access`} value={codeAdapterAccess ?? "adapter_default"} disabled={disabled} onChange={event => onCodeAdapterAccessChange(event.target.value === "adapter_default" ? null : event.target.value as "read_only" | "workspace_write")}>
          <option value="adapter_default">{t("agentWorkPermissions.adapterDefault")}</option>
          <option value="read_only" disabled={!support?.codexFilesystem}>{t("agentWorkPermissions.readOnly")}</option>
          <option value="workspace_write" disabled={!support?.codexFilesystem}>{t("agentWorkPermissions.workspaceWrite")}</option>
        </NativeSelect>
        <p className="text-xs text-muted-foreground">{t("agentWorkPermissions.codexScope")}</p>
      </div>}
      <div className="divide-y divide-border">{group.keys.map(key => <div key={key} className="flex items-start justify-between gap-4 py-3">
        <div className="space-y-1"><label htmlFor={`${id}-${key}`} className="block text-sm font-medium">{t(`agentWorkPermissions.options.${key}.title`)}</label><p className="text-xs text-muted-foreground">{t(`agentWorkPermissions.options.${key}.hint`)}</p></div>
        <ToggleSwitch id={`${id}-${key}`} data-testid={`agent-work-permission-${key}`} checked={current[key]} disabled={disabled || (key.startsWith("workspace") && !support?.workspace) || (key === "workspaceExecute" && !support?.commands) || (key === "workspaceExecute" && (!current.workspaceRead || !current.workspaceWrite))} onCheckedChange={checked => change(key, checked)} />
      </div>)}</div>
      {group.title === "code" && support?.workspace && !support.commands && <p className="text-xs text-muted-foreground">{t("agentWorkPermissions.commandsUnavailable")}</p>}
    </fieldset>)}
    <p className="text-xs text-muted-foreground">{t("agentWorkPermissions.additionalChecks")}</p>
  </div>;
}
