import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { useTranslation } from "@/i18n";
import { useCompany } from "@/context/CompanyContext";
import { commercialDecisionsApi } from "@/api/commercial-decisions";
import { CommercialDecisionCard } from "@/components/CommercialDecisionCard";
import { EmptyState } from "@/components/EmptyState";

/** Open commercial decisions for the selected company. Mount it in Inicio and in detail pages. */
export function CommercialDecisionsSection() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const query = useQuery({
    queryKey: ["commercial-decisions", selectedCompanyId],
    queryFn: () => commercialDecisionsApi.listOpen(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) return null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="commercial-decisions-heading">
      <h2 id="commercial-decisions-heading" className="text-base font-semibold">
        {t("commercialDecisions.heading", { defaultValue: "Necesita tu decisión (comercial)" })}
      </h2>
      {query.error && (
        <p role="alert" className="text-sm text-destructive">{query.error.message}</p>
      )}
      {query.isPending ? null : !query.data?.length ? (
        <EmptyState
          icon={Inbox}
          message={t("commercialDecisions.empty", { defaultValue: "No hay decisiones comerciales pendientes." })}
        />
      ) : (
        query.data.map((decision) => <CommercialDecisionCard key={decision.id} decision={decision} />)
      )}
    </section>
  );
}
