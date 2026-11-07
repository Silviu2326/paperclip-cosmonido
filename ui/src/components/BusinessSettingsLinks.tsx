import { NavLink } from "@/lib/router";
import { useTranslation } from "@/i18n";

/** Shared contextual entry points; these links never change authorization. */
export function BusinessSettingsLinks() {
  const { t } = useTranslation();
  const groups = [
    { title: t("uxNav.personal", { defaultValue: "Tus preferencias" }), items: [
      ["/company/settings/instance/profile", t("uxNav.profile", { defaultValue: "Mi perfil" })],
      ["/company/settings/notifications", t("uxNav.notificationPreferences", { defaultValue: "Notificaciones" })],
      ["/company/settings/security", t("uxNav.accessSessions", { defaultValue: "Acceso y sesiones" })],
    ] },
    { title: t("uxNav.company", { defaultValue: "Empresa" }), items: [
      ["/productization", t("nav.productization")],
      ["/company/settings/retention", t("uxNav.retention", { defaultValue: "Datos y retención" })],
      ["/company/settings/developer", t("uxNav.developer", { defaultValue: "API y desarrolladores" })],
    ] },
    { title: t("uxNav.account", { defaultValue: "Cuenta comercial" }), items: [
      ["/company/settings/accounts", t("nav.productAccounts")],
      ["/company/settings/billing", t("nav.productBilling")],
      ["/company/settings/installations", t("uxNav.installations", { defaultValue: "Instalaciones gestionadas" })],
    ] },
  ];
  return <div className="flex flex-col gap-4">{groups.map(group => <section key={group.title} className="flex flex-col gap-1"><h3 className="px-2 text-xs font-medium text-muted-foreground">{group.title}</h3>{group.items.map(([href, label]) => <NavLink key={href} to={href!} end className={({ isActive }) => `rounded-md px-2 py-1 text-sm hover:bg-accent hover:text-foreground ${isActive ? "bg-accent text-foreground" : "text-muted-foreground"}`}>{label}</NavLink>)}</section>)}</div>;
}
