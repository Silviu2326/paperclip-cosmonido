import type { ReactNode } from "react";
import { ResponsibleUserDenialNotice } from "@/components/ResponsibleUserDenialNotice";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/i18n";

/**
 * UX lab for PAP-12462 (P7): run "on behalf of {user}" surfacing + responsible-user
 * denial copy. Renders before/after of both surfaces with real design tokens so the
 * states can be captured for UX review. Route: /ux-lab/responsible-user-denial
 */

function LabSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-background/85 p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function BeforeAfter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
        {label}
      </div>
      <Card className="block border-border/60 p-3">{children}</Card>
    </div>
  );
}

/** A faithful copy of a run ledger row header (see IssueRunLedger.tsx). */
function RunLedgerRow({
  onBehalfOf,
  denial,
}: {
  onBehalfOf?: string | null;
  denial?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <article className="space-y-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-foreground">{t("responsibleUserDenialUxLab.runLabel")}</span>
        <span className="min-w-0 max-w-full truncate font-mono text-foreground">a1b2c3d4</span>
        <span>{t("responsibleUserDenialUxLab.byAgent", { agent: "CodexCoder" })}</span>
        {onBehalfOf ? (
          <span className="min-w-0 max-w-full truncate text-muted-foreground">
            {t("responsibleUserDenialUxLab.onBehalfOf")} <span className="text-foreground">{onBehalfOf}</span>
          </span>
        ) : null}
        <span className="rounded-md border border-border px-1.5 py-0.5 text-(length:--text-micro) capitalize text-muted-foreground">
          {denial ? t("responsibleUserDenialUxLab.statusFailed") : t("responsibleUserDenialUxLab.statusSucceeded")}
        </span>
        <span className="ml-auto shrink-0">{t("responsibleUserDenialUxLab.ago")}</span>
      </div>
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div className="min-w-0">
          <span className="text-foreground">{t("responsibleUserDenialUxLab.elapsed")}</span> 1m 4s
        </div>
        <div className="min-w-0">
          <span className="text-foreground">{t("responsibleUserDenialUxLab.lastUsefulAction")}</span> {t("responsibleUserDenialUxLab.ago")}
        </div>
        <div className="min-w-0">
          <span className="text-foreground">{t("responsibleUserDenialUxLab.stop")}</span> {denial ? t("responsibleUserDenialUxLab.stopDenied") : t("responsibleUserDenialUxLab.stopCompleted")}
        </div>
      </div>
      {denial}
    </article>
  );
}

/** A faithful copy of the run-detail header identity block (see AgentDetail.tsx RunDetail). */
function RunDetailHeader({ onBehalfOf, denial }: { onBehalfOf?: string | null; denial?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-foreground">{t("responsibleUserDenialUxLab.runTitle", { id: "a1b2c3d4" })}</span>
        <span className="rounded-md border border-border px-1.5 py-0.5 text-(length:--text-micro) capitalize text-muted-foreground">
          {denial ? t("responsibleUserDenialUxLab.statusFailed") : t("responsibleUserDenialUxLab.statusSucceeded")}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-(length:--text-micro) text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 text-(length:--text-nano) font-medium uppercase tracking-wide">
          codex local
        </span>
        <span>anthropic/claude-opus-4-8</span>
      </div>
      {onBehalfOf ? (
        <div className="text-xs text-muted-foreground">
          {t("responsibleUserDenialUxLab.onBehalfOfCap")} <span className="text-foreground">{onBehalfOf}</span>
        </div>
      ) : null}
      {denial}
    </div>
  );
}

export function ResponsibleUserDenialUxLab() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-muted/20 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
            PAP-12462 · P7
          </div>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            {t("responsibleUserDenialUxLab.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("responsibleUserDenialUxLab.intro")}
          </p>
        </header>

        <LabSection
          title={t("responsibleUserDenialUxLab.s1Title")}
          description={t("responsibleUserDenialUxLab.s1Desc")}
        >
          <BeforeAfter label={t("responsibleUserDenialUxLab.beforeLedger")}>
            <RunLedgerRow />
          </BeforeAfter>
          <BeforeAfter label={t("responsibleUserDenialUxLab.afterLedger")}>
            <RunLedgerRow onBehalfOf="Ada Lovelace" />
          </BeforeAfter>
          <BeforeAfter label={t("responsibleUserDenialUxLab.beforeDetail")}>
            <RunDetailHeader />
          </BeforeAfter>
          <BeforeAfter label={t("responsibleUserDenialUxLab.afterDetail")}>
            <RunDetailHeader onBehalfOf="Ada Lovelace" />
          </BeforeAfter>
        </LabSection>

        <LabSection
          title={t("responsibleUserDenialUxLab.s2Title")}
          description={t("responsibleUserDenialUxLab.s2Desc")}
        >
          <BeforeAfter label={t("responsibleUserDenialUxLab.beforeGeneric")}>
            <div className="text-xs">
              <span className="text-destructive">
                {t("responsibleUserDenialUxLab.forbiddenUnauthorized")}
              </span>
              <span className="ml-1 text-muted-foreground">(RESPONSIBLE_USER_UNAUTHORIZED)</span>
            </div>
          </BeforeAfter>
          <BeforeAfter label={t("responsibleUserDenialUxLab.afterActionable")}>
            <ResponsibleUserDenialNotice
              code="RESPONSIBLE_USER_UNAUTHORIZED"
              userName="Ada Lovelace"
            />
          </BeforeAfter>
        </LabSection>

        <LabSection
          title={t("responsibleUserDenialUxLab.s3Title")}
          description={t("responsibleUserDenialUxLab.s3Desc")}
        >
          <BeforeAfter label={t("responsibleUserDenialUxLab.agentPermissionFailure")}>
            <div className="text-xs">
              <span className="text-destructive">
                {t("responsibleUserDenialUxLab.forbiddenAgent")}
              </span>
              <span className="ml-1 text-muted-foreground">(deny_missing_membership)</span>
            </div>
          </BeforeAfter>
          <BeforeAfter label={t("responsibleUserDenialUxLab.noNoticeRendered")}>
            <div className="text-xs text-muted-foreground">
              {t("responsibleUserDenialUxLab.noNoticeBody")}
            </div>
          </BeforeAfter>
        </LabSection>

        <LabSection
          title={t("responsibleUserDenialUxLab.s4Title")}
          description={t("responsibleUserDenialUxLab.s4Desc")}
        >
          <BeforeAfter label={t("responsibleUserDenialUxLab.beforeGeneric")}>
            <div className="text-xs">
              <span className="text-destructive">
                {t("responsibleUserDenialUxLab.forbiddenUnavailable")}
              </span>
              <span className="ml-1 text-muted-foreground">(RESPONSIBLE_USER_UNAVAILABLE)</span>
            </div>
          </BeforeAfter>
          <BeforeAfter label={t("responsibleUserDenialUxLab.afterActionable")}>
            <ResponsibleUserDenialNotice
              code="RESPONSIBLE_USER_UNAVAILABLE"
              userName="Grace Hopper"
            />
          </BeforeAfter>
        </LabSection>

        <LabSection
          title={t("responsibleUserDenialUxLab.s5Title")}
          description={t("responsibleUserDenialUxLab.s5Desc")}
        >
          <BeforeAfter label={t("responsibleUserDenialUxLab.labelUnauthorized")}>
            <RunLedgerRow
              onBehalfOf="Ada Lovelace"
              denial={
                <ResponsibleUserDenialNotice
                  code="RESPONSIBLE_USER_UNAUTHORIZED"
                  userName="Ada Lovelace"
                />
              }
            />
          </BeforeAfter>
          <BeforeAfter label={t("responsibleUserDenialUxLab.labelUnavailable")}>
            <RunLedgerRow
              onBehalfOf="Grace Hopper"
              denial={
                <ResponsibleUserDenialNotice
                  code="RESPONSIBLE_USER_UNAVAILABLE"
                  userName="Grace Hopper"
                />
              }
            />
          </BeforeAfter>
        </LabSection>

        <p className={cn("text-center text-(length:--text-micro) text-muted-foreground")}>
          {t("responsibleUserDenialUxLab.sourcePrefix")} <code>describeResponsibleUserDenial</code> {t("responsibleUserDenialUxLab.sourceSuffix")}
        </p>
      </div>
    </div>
  );
}
