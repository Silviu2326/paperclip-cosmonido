import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import { accessApi } from "@/api/access";
import { useTranslation } from "@/i18n";
import { NativeSelect } from "@/components/ui/select";

export function useSalesOwners(companyId: string) {
  const agents = useQuery({ queryKey: ["sales-owners", companyId, "agents"], queryFn: () => agentsApi.list(companyId), enabled: !!companyId });
  const users = useQuery({ queryKey: ["sales-owners", companyId, "users"], queryFn: () => accessApi.listUserDirectory(companyId), enabled: !!companyId });
  const options = [
    ...(users.data?.users ?? []).map((entry) => ({ value: `user:${entry.principalId}`, label: entry.user?.name ?? entry.user?.email ?? entry.principalId })),
    ...(agents.data ?? []).filter((agent) => agent.status !== "terminated").map((agent) => ({ value: `agent:${agent.id}`, label: agent.name })),
  ];
  return { options, error: agents.error ?? users.error, isLoading: agents.isLoading || users.isLoading,
    name: (value: string) => options.find((option) => option.value === value)?.label };
}

export function SalesOwnerSelect({ companyId, value, onChange, id, all = false }: {
  companyId: string; value: string; onChange: (value: string) => void; id?: string; all?: boolean;
}) {
  const { t } = useTranslation();
  const owners = useSalesOwners(companyId);
  return <div className="flex flex-col gap-1">
    <NativeSelect id={id} aria-label={t("salesWorkspace.owner")} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t(all ? "salesWorkspace.everyone" : "salesWorkspace.unassigned")}</option>
      {all && <option value="unassigned">{t("salesWorkspace.unassigned")}</option>}
      {value && value !== "unassigned" && !owners.options.some((option) => option.value === value) && <option value={value}>{t("salesWorkspace.savedOwner")}</option>}
      {owners.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </NativeSelect>
    {owners.error && <p role="alert" className="text-xs text-destructive">{t("salesWorkspace.ownersError")}</p>}
  </div>;
}
