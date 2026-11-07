import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";

export type SettingsScope = "user" | "company" | "account" | "apps";
export type SettingsBackTarget = "settings" | "apps";
export interface SettingsContextLink { to: string; label: string }

/** Final destinations are mounted by the parent router; these paths are the agreed entry points. */
export const SETTINGS_BACK_PATHS: Record<SettingsBackTarget, string> = { settings: "/company/settings", apps: "/apps" };

/**
 * Names the scope a settings surface acts on (your user, the company, a commercial account or an App)
 * and links back to Settings or Apps. It adds context only: it never fetches data or changes any form.
 */
export function SettingsScopeHeader({ scope, scopeName, description, backTarget = "settings", links = [] }: {
  scope: SettingsScope;
  scopeName?: string | null;
  description: string;
  backTarget?: SettingsBackTarget;
  links?: SettingsContextLink[];
}) {
  const { t } = useTranslation();
  const scopeLabels: Record<SettingsScope, string> = {
    user: t("uxSettings.scope.user", { defaultValue: "Your user" }),
    company: t("uxSettings.scope.company", { defaultValue: "Company" }),
    account: t("uxSettings.scope.account", { defaultValue: "Commercial account" }),
    apps: t("uxSettings.scope.apps", { defaultValue: "Apps" }),
  };
  const backLabel = backTarget === "apps"
    ? t("uxSettings.back.apps", { defaultValue: "Back to Apps" })
    : t("uxSettings.back.settings", { defaultValue: "Back to Settings" });
  return <div className="flex flex-col gap-1 text-sm" data-settings-scope={scope}>
    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{scopeLabels[scope]}</Badge>{scopeName ? <span className="font-medium">{scopeName}</span> : null}</div>
    <p className="text-xs text-muted-foreground">{description}</p>
    <nav aria-label={t("uxSettings.navLabel", { defaultValue: "Related settings" })} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <Link className="inline-flex items-center gap-1 text-primary underline underline-offset-2" to={SETTINGS_BACK_PATHS[backTarget]}><ArrowLeft className="size-3.5" />{backLabel}</Link>
      {links.map((link) => <Link key={link.to} className="text-primary underline underline-offset-2" to={link.to}>{link.label}</Link>)}
    </nav>
  </div>;
}
