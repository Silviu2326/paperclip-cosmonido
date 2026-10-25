import { useState } from "react";
import { ClipboardList, Users } from "lucide-react";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";
import type { AgentHireResponse } from "@/api/agents";
import { EmptyState } from "@/components/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/i18n";
import { PortablePackagePreviewPanel } from "./catalog/PortablePackagePreviewPanel";
import { ProfileHirePanel } from "./hiring";
import {
  ProductOnboardingPanel,
  type ProductOnboardingPanelProps,
} from "./onboarding/ProductOnboardingPanel";

type ProfileSelection = {
  portablePackage: PortablePackage;
  profile: PortablePackage["teams"][number]["members"][number];
  teamId: string;
};

export interface ProductizationWorkbenchProps {
  companyId: string;
  /** Real, scoped journey and persistence callbacks supplied by its owner. */
  onboarding: ProductOnboardingPanelProps | null;
  onHireCompleted?: (result: AgentHireResponse) => void;
}

/**
 * Composes the three S4 slices without registering a route or making up an
 * account/journey. Its host must mount the preview router and supply actual
 * onboarding persistence. Changing company remounts all draft UI state.
 */
export function ProductizationWorkbench(props: ProductizationWorkbenchProps) {
  return <CompanyWorkbench key={props.companyId} {...props} />;
}

function CompanyWorkbench({ companyId, onboarding, onHireCompleted }: ProductizationWorkbenchProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("catalog");
  const [selection, setSelection] = useState<ProfileSelection | null>(null);
  const scopedOnboarding = onboarding?.journey.companyId === companyId ? onboarding : null;

  function selectProfile(next: ProfileSelection) {
    setSelection(next);
    setTab("hiring");
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {t("productization.workbench.title", { defaultValue: "Prepara tu equipo y primer encargo" })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("productization.workbench.description", {
            defaultValue: "Revisa un paquete, elige los perfiles que necesitas y confirma el contexto del negocio.",
          })}
        </p>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap" aria-label={t("productization.workbench.navigation", { defaultValue: "Configuración inicial" })}>
          <TabsTrigger value="catalog">{t("productization.workbench.catalog", { defaultValue: "Paquetes" })}</TabsTrigger>
          <TabsTrigger value="hiring">{t("productization.workbench.hiring", { defaultValue: "Contratación" })}</TabsTrigger>
          <TabsTrigger value="onboarding">{t("productization.workbench.onboarding", { defaultValue: "Primer encargo" })}</TabsTrigger>
        </TabsList>
        <TabsContent value="catalog" forceMount hidden={tab !== "catalog"}>
          <PortablePackagePreviewPanel companyId={companyId} onSelectProfile={selectProfile} />
        </TabsContent>
        <TabsContent value="hiring" forceMount hidden={tab !== "hiring"}>
          {selection ? (
            <ProfileHirePanel
              key={`${selection.portablePackage.packageKey}:${selection.portablePackage.packageVersion}:${selection.teamId}:${selection.profile.id}`}
              companyId={companyId}
              portablePackage={selection.portablePackage}
              teamId={selection.teamId}
              profile={selection.profile}
              onCompleted={(result) => onHireCompleted?.(result)}
              onCancel={() => setTab("catalog")}
            />
          ) : (
            <EmptyState
              icon={Users}
              message={t("productization.workbench.chooseProfile", { defaultValue: "Elige primero un perfil de un paquete revisado." })}
              action={t("productization.workbench.browsePackages", { defaultValue: "Revisar paquetes" })}
              onAction={() => setTab("catalog")}
              hideActionIcon
            />
          )}
        </TabsContent>
        <TabsContent value="onboarding" forceMount hidden={tab !== "onboarding"}>
          {scopedOnboarding ? (
            <ProductOnboardingPanel {...scopedOnboarding} />
          ) : (
            <EmptyState
              icon={ClipboardList}
              message={t("productization.workbench.journeyUnavailable", {
                defaultValue: "El recorrido inicial de esta empresa aún no está disponible.",
              })}
              description={t("productization.workbench.journeyUnavailableDescription", {
                defaultValue: "Puedes revisar paquetes y perfiles mientras se completa la configuración de la cuenta.",
              })}
              action={t("productization.workbench.browsePackages", { defaultValue: "Revisar paquetes" })}
              onAction={() => setTab("catalog")}
              hideActionIcon
            />
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
