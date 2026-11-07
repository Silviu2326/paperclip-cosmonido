import { useCompany } from "@/context/CompanyContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortableCatalogPanel } from "@/features/productization/catalog/PortableCatalogPanel";
import { PortablePackagePreviewPanel } from "@/features/productization/catalog/PortablePackagePreviewPanel";
import { useTranslation } from "@/i18n";
import { TemplateLibraryNav } from "@/components/team-workspace/TeamWorkspaceLinks";

/**
 * Company-private portable package catalog. Mount at e.g. `/portable-catalog`;
 * the parent integrator owns route and sidebar wiring.
 */
export function PortableCatalog() {
  const { selectedCompanyId, loading } = useCompany();
  const { t } = useTranslation();

  if (loading) {
    return <p role="status" className="text-sm text-muted-foreground">{t("productization.loadingCompany", { defaultValue: "Cargando empresa…" })}</p>;
  }
  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">{t("productization.chooseCompany", { defaultValue: "Selecciona una empresa para continuar." })}</p>;
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <TemplateLibraryNav current="private" />
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("uxTeam.catalog.privateTitle", { defaultValue: "Plantillas privadas del equipo" })}</h1>
        <p className="text-sm text-muted-foreground">
          {t("uxTeam.catalog.privateDescription", { defaultValue: "Guarda equipos y configuraciones de esta empresa como plantillas versionadas. Describen contenido: no traen permisos, credenciales ni conexiones, y toda contratación sigue las aprobaciones de la empresa. Para usarlas, elige una plantilla desde Crear equipo." })}
        </p>
      </header>
      <Tabs defaultValue="library">
        <TabsList>
          <TabsTrigger value="library">{t("productization.catalog.tabLibrary", { defaultValue: "Biblioteca" })}</TabsTrigger>
          <TabsTrigger value="preview">{t("productization.catalog.tabPreview", { defaultValue: "Vista previa" })}</TabsTrigger>
        </TabsList>
        <TabsContent value="library">
          <PortableCatalogPanel companyId={selectedCompanyId} />
        </TabsContent>
        <TabsContent value="preview">
          <PortablePackagePreviewPanel companyId={selectedCompanyId} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
