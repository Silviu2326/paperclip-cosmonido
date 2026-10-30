import { motion } from "motion/react";
import { Plus, Upload, Users, type LucideIcon } from "lucide-react";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { useMotionTokens } from "@/hooks/useMotionTokens";
import { Button } from "@/components/ui/button";
import { accentInk, accentReadable, accentTint } from "@/lib/accent";
import { MINT, SKY } from "./CustomerListParts";

interface Step {
  icon: LucideIcon;
  title: string;
  text: string;
  color: string;
  /** Opens the create dialog when there is no route. */
  onClick?: () => void;
  to?: string;
}

/** First-run screen: what the page will hold and two ways to start. */
export function CustomersEmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  const tokens = useMotionTokens();
  const steps: Step[] = [
    { icon: Plus, title: t("uxCrm.list.emptyStepCreate", { defaultValue: "Crea tu primer cliente" }), text: t("uxCrm.list.emptyStepCreateText", { defaultValue: "Empresa o persona para la que trabajas." }), color: MINT, onClick: onCreate },
    { icon: Upload, title: t("uxCrm.list.emptyStepImport", { defaultValue: "Importa tus contactos" }), text: t("uxCrm.list.emptyStepImportText", { defaultValue: "Desde un CSV; detectamos duplicados." }), color: SKY, to: "/customers/contacts/import" },
  ];
  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-dashed border-border p-10 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: tokens.slow, ease: tokens.easeOut }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: `linear-gradient(135deg, ${MINT}, ${SKY})`, color: accentInk(SKY) }}
      >
        <Users className="h-7 w-7" />
      </motion.div>
      <div>
        <h2 className="text-lg font-semibold">{t("uxCrm.list.emptyTitle", { defaultValue: "Aquí vivirán tus clientes" })}</h2>
        <p className="text-sm text-muted-foreground">{t("uxCrm.list.emptyText", { defaultValue: "Con su gente, sus servicios y todo el trabajo que haces para ellos." })}</p>
      </div>
      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {steps.map((step, index) => {
          const body = (
            <>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: accentTint(step.color, 30), color: accentReadable(step.color) }}>
                <step.icon className="h-4 w-4" />
              </span>
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.text}</p>
            </>
          );
          const className = "flex flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition-shadow duration-(--motion-duration-fast) hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
          const style = { background: `linear-gradient(135deg, ${accentTint(step.color, 14)}, transparent 70%)` };
          return (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: tokens.base, ease: tokens.easeOut, delay: 0.1 + index * tokens.stagger * 2 }}
              className="flex"
            >
              {step.to ? (
                <Link to={step.to} className={`${className} w-full`} style={style}>{body}</Link>
              ) : (
                <button type="button" onClick={step.onClick} className={`${className} w-full`} style={style}>{body}</button>
              )}
            </motion.div>
          );
        })}
      </div>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4" />
        {t("crm.customers.newCustomer")}
      </Button>
    </div>
  );
}
