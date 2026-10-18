import { Database, Gauge, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { t, useTranslation } from "@/i18n";

function getSurfaces() {
  return [
  {
    title: t("accountingModelCard.inferenceTitle"),
    description: t("accountingModelCard.inferenceDescription"),
    icon: Database,
    points: [t("accountingModelCard.inferencePoint1"), t("accountingModelCard.inferencePoint2"), t("accountingModelCard.inferencePoint3")],
    tone: "from-sky-500/12 via-sky-500/6 to-transparent",
  },
  {
    title: t("accountingModelCard.financeTitle"),
    description: t("accountingModelCard.financeDescription"),
    icon: ReceiptText,
    points: [t("accountingModelCard.financePoint1"), t("accountingModelCard.financePoint2"), t("accountingModelCard.financePoint3")],
    tone: "from-amber-500/14 via-amber-500/6 to-transparent",
  },
  {
    title: t("accountingModelCard.quotasTitle"),
    description: t("accountingModelCard.quotasDescription"),
    icon: Gauge,
    points: [t("accountingModelCard.quotasPoint1"), t("accountingModelCard.quotasPoint2"), t("accountingModelCard.quotasPoint3")],
    tone: "from-emerald-500/14 via-emerald-500/6 to-transparent",
  },
  ];
}

export function AccountingModelCard() {
  const { t } = useTranslation();
  const SURFACES = getSurfaces();
  return (
    <Card className="relative overflow-hidden border-border/70">
      <div className="absolute inset-0 bg-(image:--gradient-extract-3)" />
      <CardHeader className="relative px-5 pt-5 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
          {t("accountingModelCard.title")}
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6">
          {t("accountingModelCard.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative grid gap-3 px-5 pb-5 md:grid-cols-3">
        {SURFACES.map((surface) => {
          const Icon = surface.icon;
          return (
            <div
              key={surface.title}
              className={`rounded-2xl border border-border/70 bg-gradient-to-br ${surface.tone} p-4 shadow-sm`}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{surface.title}</div>
                  <div className="text-xs text-muted-foreground">{surface.description}</div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {surface.points.map((point) => (
                  <div key={point}>{point}</div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
