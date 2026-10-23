import { useState } from "react";
import { useBusinessNavigation, type BusinessNavigationPreferences } from "@/hooks/useBusinessNavigation";
import { useCompany } from "@/context/CompanyContext";
import { useTranslation } from "@/i18n";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Three shortcuts for the selected company, kept closed until asked for. The
 * storage key is user + company + browser, so changing one company never
 * touches another.
 */
export function NavigationAccessPreferences() {
  const { t } = useTranslation();
  const { selectedCompany } = useCompany();
  const { preferences, update, ready } = useBusinessNavigation();
  const [failed, setFailed] = useState(false);
  const options: Array<{ key: keyof BusinessNavigationPreferences; label: string; description: string }> = [
    { key: "business", label: t("uxNav.businessFeatures", { defaultValue: "Clientes, ventas y conversaciones" }), description: t("uxNav.businessHelp", { defaultValue: "Accesos para trabajar con clientes y atender oportunidades." }) },
    { key: "agenda", label: t("uxNav.pinAgenda", { defaultValue: "Fijar Agenda" }), description: t("uxNav.agendaHelp", { defaultValue: "Abrir tus reuniones directamente desde la navegación." }) },
    { key: "office", label: t("uxNav.pinOffice", { defaultValue: "Fijar Oficina" }), description: t("uxNav.officeHelp", { defaultValue: "Acceso directo a la vista visual de tu equipo." }) },
  ];
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t("uxNav.companyShortcuts", { defaultValue: "Accesos para esta empresa" })}
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t("uxNav.scope", { defaultValue: "Tus accesos para {{company}} en este navegador. Puedes cambiarlos cuando lo necesites.", company: selectedCompany?.name ?? "Paperclip" })}
        </p>
        {options.map((option) => (
          <div key={option.key} className="flex items-start gap-3">
            <Checkbox
              id={`nav-${option.key}`}
              checked={preferences[option.key]}
              disabled={!ready}
              onCheckedChange={(checked) => setFailed(!update({ [option.key]: checked === true }))}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor={`nav-${option.key}`}>{option.label}</Label>
              <p className="text-sm text-muted-foreground">{option.description}</p>
            </div>
          </div>
        ))}
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("uxNav.saveError", { defaultValue: "No se pudo guardar. Permite el almacenamiento del navegador y vuelve a intentarlo." })}
          </p>
        )}
      </div>
    </details>
  );
}
