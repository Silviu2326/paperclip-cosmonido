// token-extraction: allowlisted — intentional one-off decoration (DECISION-SHEET.md B1
// user ruling). The bg-[...gradient...] / shadow-[...] literals in this demo/UX-lab page
// are deliberate one-off decoration, reverted from --gradient-extract-*/--shadow-extract-*
// tokens; the file is on the check-token-gates allowlist in ui/src/index.css.
import type { ReactNode } from "react";
import { t, useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  Clock3,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Link2,
  Loader2,
  MailPlus,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

const inviteRoleOptions = [
  {
    value: "viewer",
    label: t("inviteUxLab.roleViewer"),
    description: t("inviteUxLab.roleViewerDesc"),
    gets: t("inviteUxLab.roleViewerGets"),
  },
  {
    value: "operator",
    label: t("inviteUxLab.roleOperator"),
    description: t("inviteUxLab.roleOperatorDesc"),
    gets: t("inviteUxLab.roleOperatorGets"),
  },
  {
    value: "admin",
    label: t("inviteUxLab.roleAdmin"),
    description: t("inviteUxLab.roleAdminDesc"),
    gets: t("inviteUxLab.roleAdminGets"),
  },
  {
    value: "owner",
    label: t("inviteUxLab.roleOwner"),
    description: t("inviteUxLab.roleOwnerDesc"),
    gets: t("inviteUxLab.roleOwnerGets"),
  },
] as const;

const inviteHistory = [
  {
    id: "invite-active",
    state: "Active",
    humanRole: "operator",
    invitedBy: "Board User 25",
    email: "board25@paperclip.local",
    createdAt: "Apr 25, 2026, 9:00 AM",
    action: "Revoke",
    relatedLabel: "Review request",
  },
  {
    id: "invite-accepted",
    state: "Accepted",
    humanRole: "viewer",
    invitedBy: "Board User 24",
    email: "board24@paperclip.local",
    createdAt: "Apr 24, 2026, 8:15 AM",
    action: "Inactive",
    relatedLabel: "—",
  },
  {
    id: "invite-revoked",
    state: "Revoked",
    humanRole: "admin",
    invitedBy: "Board User 20",
    email: "board20@paperclip.local",
    createdAt: "Apr 20, 2026, 2:45 PM",
    action: "Inactive",
    relatedLabel: "—",
  },
  {
    id: "invite-expired",
    state: "Expired",
    humanRole: "owner",
    invitedBy: "Board User 19",
    email: "board19@paperclip.local",
    createdAt: "Apr 19, 2026, 7:10 PM",
    action: "Inactive",
    relatedLabel: "—",
  },
] as const;

const fieldClassName =
  "w-full border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-border";
const panelClassName = "border border-border bg-card/95 p-6";

function roleLabel(role: string) {
  return inviteRoleOptions.find((option) => option.value === role)?.label ?? role;
}

function stateLabel(state: string) {
  return t(`inviteUxLab.state${state}`);
}

function LabSection({
  eyebrow,
  title,
  description,
  accentClassName,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  accentClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-(--rad-28) border border-border/70 bg-background/80 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-5",
        accentClassName,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
            {eyebrow}
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function StatusCard({
  icon,
  title,
  body,
  tone = "default",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  tone?: "default" | "warn" | "success" | "error";
}) {
  const toneClassName = {
    default: "border-border/70 bg-background/85",
    warn: "border-amber-400/40 bg-muted/[0.08]",
    success: "border-emerald-400/40 bg-accent/[0.08]",
    error: "border-destructive/40 bg-destructive/[0.08]",
  }[tone];

  return (
    <Card className={cn("rounded-(--rad-24) shadow-none", toneClassName)}>
      <CardHeader className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-current/10 bg-background/70 text-muted-foreground">
          {icon}
        </div>
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="mt-2 text-sm leading-6">{body}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}

function InviteLandingShell({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-(--rad-28) border border-border bg-card shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
      <div className="grid gap-px bg-card lg:grid-cols-(--gtc-37)">
        <section className={cn(panelClassName, "space-y-6 bg-card")}>{left}</section>
        <section className={cn(panelClassName, "h-full bg-card")}>{right}</section>
      </div>
    </div>
  );
}

function InviteSummaryPanel({
  title,
  description,
  inviteMessage,
  requestedAccess,
  signedInLabel,
}: {
  title: string;
  description: string;
  inviteMessage?: string;
  requestedAccess: string;
  signedInLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-start gap-4">
        <CompanyPatternIcon
          companyName="Acme Robotics"
          logoUrl="/api/invites/pcp_invite_test/logo"
          className="h-16 w-16 rounded-none border border-border"
        />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-(--tracking-caps) text-muted-foreground">{t("inviteUxLab.invitedToJoin")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">{title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground">{description}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetaCard label={t("inviteUxLab.organization")} value="Acme Robotics" />
        <MetaCard label={t("inviteUxLab.invitedBy")} value={t("inviteUxLab.boardUser")} />
        <MetaCard label={t("inviteUxLab.requestedAccess")} value={requestedAccess} />
        <MetaCard label={t("inviteUxLab.inviteExpires")} value="Mar 7, 2027" />
      </div>

      {inviteMessage ? (
        <div className="border border-amber-500/40 bg-muted/10 p-4">
          <div className="text-xs uppercase tracking-(--tracking-caps) text-amber-200/80">{t("inviteUxLab.messageFromInviter")}</div>
          <p className="mt-2 text-sm leading-6 text-amber-50">{inviteMessage}</p>
        </div>
      ) : null}

      {signedInLabel ? (
        <div className="border border-emerald-500/40 bg-accent/10 p-4 text-sm text-emerald-50">
          {t("inviteUxLab.signedInAs")} <span className="font-medium">{signedInLabel}</span>.
        </div>
      ) : null}
    </>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border p-3">
      <div className="text-xs uppercase tracking-(--tracking-caps) text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

function InlineAuthPreview({
  mode,
  feedback,
  working,
}: {
  mode: "sign_up" | "sign_in";
  feedback?: { tone: "info" | "error"; text: string };
  working?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          {mode === "sign_up" ? t("inviteUxLab.createYourAccount") : t("inviteUxLab.signInToContinue")}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "sign_up"
            ? t("inviteUxLab.signUpIntro")
            : t("inviteUxLab.signInIntro")}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className={cn(
            "flex-1 border px-3 py-2 text-sm transition-colors",
            mode === "sign_up"
              ? "border-border bg-muted text-foreground"
              : "border-border text-foreground hover:border-border",
          )}
        >
          {t("inviteUxLab.createAccount")}
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 border px-3 py-2 text-sm transition-colors",
            mode === "sign_in"
              ? "border-border bg-muted text-foreground"
              : "border-border text-foreground hover:border-border",
          )}
        >
          {t("inviteUxLab.haveAccount")}
        </button>
      </div>

      <form className="space-y-4">
        {mode === "sign_up" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{t("inviteUxLab.name")}</span>
            <input name="name" className={fieldClassName} defaultValue="Jane Example" readOnly />
          </label>
        ) : null}
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">{t("inviteUxLab.email")}</span>
          <input name="email" type="email" className={fieldClassName} defaultValue="jane@example.com" readOnly />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">{t("inviteUxLab.password")}</span>
          <input name="password" type="password" className={fieldClassName} defaultValue="supersecret" readOnly />
        </label>
        {feedback ? (
          <p className={cn("text-xs", feedback.tone === "info" ? "text-amber-300" : "text-destructive")}>
            {feedback.text}
          </p>
        ) : null}
        <Button type="button" className="w-full rounded-none" disabled={working}>
          {working ? t("inviteUxLab.working") : mode === "sign_in" ? t("inviteUxLab.signInAndContinue") : t("inviteUxLab.createAndContinue")}
        </Button>
      </form>

      <p className="text-xs leading-5 text-muted-foreground">
        {mode === "sign_up"
          ? t("inviteUxLab.alreadySignedUpHint")
          : t("inviteUxLab.noAccountHint")}
      </p>
    </div>
  );
}

function AgentRequestPreview() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t("inviteUxLab.submitAgentDetails")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("inviteUxLab.agentApprovalHint")}
        </p>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">{t("inviteUxLab.agentName")}</span>
        <input className={fieldClassName} defaultValue="Acme Ops Agent" readOnly />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">{t("inviteUxLab.adapterType")}</span>
        <select className={fieldClassName} defaultValue="codex_local" disabled>
          <option value="codex_local">Codex</option>
          <option value="claude_local">Claude Code</option>
          <option value="cursor">Cursor</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">{t("inviteUxLab.capabilities")}</span>
        <textarea
          className={fieldClassName}
          rows={4}
          defaultValue={t("inviteUxLab.capabilitiesValue")}
          readOnly
        />
      </label>
      <Button type="button" className="w-full rounded-none">
        {t("inviteUxLab.submitRequest")}
      </Button>
    </div>
  );
}

function AcceptInvitePreview({
  autoAccept,
  isCurrentMember,
  error,
}: {
  autoAccept?: boolean;
  isCurrentMember?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{t("inviteUxLab.acceptOrgInvite")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {autoAccept
            ? t("inviteUxLab.grantingAccess")
            : isCurrentMember
              ? t("inviteUxLab.alreadyBelongsTo")
              : t("inviteUxLab.grantAccess")}
        </p>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {autoAccept ? (
        <div className="text-sm text-muted-foreground">{t("inviteUxLab.submittingRequest")}</div>
      ) : (
        <Button type="button" className="w-full rounded-none" disabled={isCurrentMember}>
          {t("inviteUxLab.acceptInvite")}
        </Button>
      )}
    </div>
  );
}

function InviteResultPreview({
  title,
  description,
  claimSecret,
  onboardingTextUrl,
  joinedNow = false,
}: {
  title: string;
  description: string;
  claimSecret?: string;
  onboardingTextUrl?: string;
  joinedNow?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md border border-border bg-card p-6 text-foreground">
      <div className="flex items-center gap-3">
        <CompanyPatternIcon
          companyName="Acme Robotics"
          logoUrl="/api/invites/pcp_invite_test/logo"
          className="h-12 w-12 rounded-none border border-border"
        />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        {joinedNow ? (
          <Button type="button" className="w-full rounded-none">
            {t("inviteUxLab.openBoard")}
          </Button>
        ) : (
          <>
            <div className="border border-border p-3">
              <p className="mb-1 text-xs text-muted-foreground">{t("inviteUxLab.approvalPage")}</p>
              <a className="text-sm text-foreground underline underline-offset-2" href="/company/settings/members">
                {t("inviteUxLab.settingsMembers")}
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("inviteUxLab.refreshHint")}
            </p>
          </>
        )}
        {claimSecret ? (
          <div className="space-y-1 border border-border p-3 text-xs text-muted-foreground">
            <div className="text-foreground">{t("inviteUxLab.claimSecret")}</div>
            <div className="font-mono break-all">{claimSecret}</div>
            <div className="font-mono break-all">POST /api/agents/claim-api-key</div>
          </div>
        ) : null}
        {onboardingTextUrl ? (
          <div className="text-xs text-muted-foreground">
            {t("inviteUxLab.onboardingLabel")}: <span className="font-mono break-all">{onboardingTextUrl}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AuthScreenPreview({ mode, error }: { mode: "sign_in" | "sign_up"; error?: string }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-(--rad-28) border border-border/70 bg-background shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <div className="grid gap-px bg-border/60 md:grid-cols-2">
        <div className="flex min-h-(--sz-420px) flex-col justify-center bg-background px-8 py-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Paperclip</span>
            </div>
            <h3 className="text-xl font-semibold">
              {mode === "sign_in" ? t("inviteUxLab.authSignInTitle") : t("inviteUxLab.authSignUpTitle")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "sign_in"
                ? t("inviteUxLab.authSignInHint")
                : t("inviteUxLab.authSignUpHint")}
            </p>
            <div className="mt-6 space-y-4">
              {mode === "sign_up" ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{t("inviteUxLab.name")}</span>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                    defaultValue="Jane Example"
                    readOnly
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t("inviteUxLab.email")}</span>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  defaultValue="jane@example.com"
                  readOnly
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">{t("inviteUxLab.password")}</span>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
                  defaultValue="supersecret"
                  readOnly
                />
              </label>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <Button type="button" className="w-full">
                {mode === "sign_in" ? t("inviteUxLab.signInButton") : t("inviteUxLab.createAccountButton")}
              </Button>
            </div>
            <div className="mt-5 text-sm text-muted-foreground">
              {mode === "sign_in" ? t("inviteUxLab.needAccount") : t("inviteUxLab.alreadyHaveAccount")}{" "}
              <span className="font-medium text-foreground underline underline-offset-2">
                {mode === "sign_in" ? t("inviteUxLab.createOne") : t("inviteUxLab.signInLink")}
              </span>
            </div>
          </div>
        </div>
        <div className="hidden min-h-(--sz-420px) items-center justify-center bg-[radial-gradient(circle_at_top,rgba(8,145,178,0.18),transparent_48%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,1))] px-8 py-10 md:flex">
          <div className="max-w-sm space-y-4 text-foreground">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-secondary/[0.08] px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps) text-cyan-200">
              {t("inviteUxLab.authPreviewBadge")}
            </div>
            <div className="text-2xl font-semibold">{t("inviteUxLab.authPreviewTitle")}</div>
            <p className="text-sm leading-6 text-muted-foreground">
              {t("inviteUxLab.authPreviewDesc")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompanyInvitesPreview() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-5 xl:grid-cols-(--gtc-38)">
      <Card className="rounded-(--rad-28) shadow-none">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MailPlus className="h-4 w-4" />
            {t("inviteUxLab.orgInvites")}
          </div>
          <div>
            <CardTitle>{t("inviteUxLab.createInvite")}</CardTitle>
            <CardDescription className="mt-2">
              {t("inviteUxLab.createInviteDesc")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{t("inviteUxLab.chooseRole")}</legend>
            <div className="rounded-2xl border border-border">
              {inviteRoleOptions.map((option, index) => (
                <label
                  key={option.value}
                  className={cn("flex cursor-default gap-3 px-4 py-4", index > 0 && "border-t border-border")}
                >
                  <input
                    type="radio"
                    readOnly
                    checked={option.value === "operator"}
                    className="mt-1 h-4 w-4 border-border text-foreground"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{option.label}</span>
                      {option.value === "operator" ? (
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          {t("inviteUxLab.default")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="block max-w-2xl text-sm text-muted-foreground">{option.description}</span>
                    <span className="block text-sm text-foreground">{option.gets}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
            {t("inviteUxLab.singleUseHint")}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button">{t("inviteUxLab.createInvite")}</Button>
            <span className="text-sm text-muted-foreground">{t("inviteUxLab.historyHint")}</span>
          </div>

          <div className="space-y-3 rounded-2xl border border-border px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t("inviteUxLab.latestLink")}</div>
                <div className="text-sm text-muted-foreground">
                  {t("inviteUxLab.latestLinkDesc")}
                </div>
              </div>
              <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                <Check className="h-3.5 w-3.5" />
                {t("inviteUxLab.copied")}
              </div>
            </div>
            <button
              type="button"
              className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-left text-sm break-all"
            >
              https://paperclip.local/invite/new-token
            </button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline">
                <ExternalLink className="h-4 w-4" />
                {t("inviteUxLab.openInvite")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-(--rad-28) shadow-none">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{t("inviteUxLab.inviteHistory")}</CardTitle>
              <CardDescription className="mt-2">
                {t("inviteUxLab.inviteHistoryDesc")}
              </CardDescription>
            </div>
            <a href="/inbox/requests" className="text-sm underline underline-offset-4">
              {t("inviteUxLab.openJoinQueue")}
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("inviteUxLab.colState")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("inviteUxLab.colRole")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("inviteUxLab.invitedBy")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("inviteUxLab.colCreated")}</th>
                  <th className="px-5 py-3 font-medium text-muted-foreground">{t("inviteUxLab.colJoinRequest")}</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">{t("inviteUxLab.colAction")}</th>
                </tr>
              </thead>
              <tbody>
                {inviteHistory.map((invite) => (
                  <tr key={invite.id} className="border-b border-border last:border-b-0">
                    <td className="px-5 py-3 align-top">
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {stateLabel(invite.state)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 align-top">{roleLabel(invite.humanRole)}</td>
                    <td className="px-5 py-3 align-top">
                      <div>{invite.invitedBy}</div>
                      <div className="text-xs text-muted-foreground">{invite.email}</div>
                    </td>
                    <td className="px-5 py-3 align-top text-muted-foreground">{invite.createdAt}</td>
                    <td className="px-5 py-3 align-top">
                      {invite.relatedLabel === "Review request" ? (
                        <a href="/inbox/requests" className="underline underline-offset-4">
                          {t("inviteUxLab.reviewRequest")}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{invite.relatedLabel}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right align-top">
                      {invite.action === "Revoke" ? (
                        <Button type="button" size="sm" variant="outline">
                          {t("inviteUxLab.revoke")}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("inviteUxLab.inactive")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border p-4">
              <div className="text-sm font-medium">{t("inviteUxLab.emptyHistoryTitle")}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {t("inviteUxLab.emptyHistoryDesc")}
              </div>
            </div>
            <div className="rounded-2xl border border-destructive/40 bg-destructive/[0.07] p-4">
              <div className="text-sm font-medium text-foreground">{t("inviteUxLab.permissionErrorTitle")}</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {t("inviteUxLab.permissionErrorDesc")}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function InviteUxLab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-(--rad-32) border border-border/70 bg-[linear-gradient(135deg,rgba(8,145,178,0.10),transparent_28%),linear-gradient(180deg,rgba(245,158,11,0.10),transparent_44%),var(--background)] shadow-[0_30px_80px_rgba(15,23,42,0.10)]">
        <div className="grid gap-6 lg:grid-cols-(--gtc-39)">
          <div className="p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-secondary/[0.08] px-3 py-1 text-(length:--text-nano) font-semibold uppercase tracking-(--tracking-caps) text-cyan-700 dark:text-cyan-300">
              <FlaskConical className="h-3.5 w-3.5" />
              {t("inviteUxLab.badge")}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">{t("inviteUxLab.heading")}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("inviteUxLab.intro")}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps)">
                /tests/ux/invites
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps)">
                signup + invite states
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-(length:--text-nano) uppercase tracking-(--tracking-caps)">
                fixture-backed preview
              </Badge>
            </div>
          </div>

          <aside className="border-t border-border/60 bg-background/70 p-6 lg:border-l lg:border-t-0">
            <div className="mb-4 text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
              {t("inviteUxLab.coveredStates")}
            </div>
            <div className="space-y-3">
              {[
                t("inviteUxLab.covered1"),
                t("inviteUxLab.covered2"),
                t("inviteUxLab.covered3"),
                t("inviteUxLab.covered4"),
                t("inviteUxLab.covered5"),
              ].map((highlight) => (
                <div
                  key={highlight}
                  className="rounded-2xl border border-border/70 bg-background/85 px-4 py-3 text-sm text-muted-foreground"
                >
                  {highlight}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      <LabSection
        eyebrow={t("inviteUxLab.topStatesEyebrow")}
        title={t("inviteUxLab.topStatesTitle")}
        description={t("inviteUxLab.topStatesDesc")}
        accentClassName="bg-[linear-gradient(180deg,rgba(59,130,246,0.05),transparent_30%),var(--background)]"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard
            icon={<Loader2 className="h-4 w-4 animate-spin" />}
            title={t("inviteUxLab.loadingInviteTitle")}
            body={t("inviteUxLab.loadingInviteBody")}
          />
          <StatusCard
            icon={<Clock3 className="h-4 w-4" />}
            title={t("inviteUxLab.checkingAccessTitle")}
            body={t("inviteUxLab.checkingAccessBody")}
          />
          <StatusCard
            icon={<KeyRound className="h-4 w-4" />}
            title={t("inviteUxLab.invalidTokenTitle")}
            body={t("inviteUxLab.invalidTokenBody")}
            tone="error"
          />
          <StatusCard
            icon={<Link2 className="h-4 w-4" />}
            title={t("inviteUxLab.notAvailableTitle")}
            body={t("inviteUxLab.notAvailableBody")}
            tone="warn"
          />
          <StatusCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title={t("inviteUxLab.bootstrapTitle")}
            body={t("inviteUxLab.bootstrapBody")}
            tone="success"
          />
          <StatusCard
            icon={<ArrowRight className="h-4 w-4" />}
            title={t("inviteUxLab.autoAcceptTitle")}
            body={t("inviteUxLab.autoAcceptBody")}
          />
          <StatusCard
            icon={<Users className="h-4 w-4" />}
            title={t("inviteUxLab.alreadyMemberTitle")}
            body={t("inviteUxLab.alreadyMemberBody")}
          />
          <StatusCard
            icon={<UserPlus className="h-4 w-4" />}
            title={t("inviteUxLab.resultSurfacesTitle")}
            body={t("inviteUxLab.resultSurfacesBody")}
            tone="success"
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow={t("inviteUxLab.landingEyebrow")}
        title={t("inviteUxLab.landingTitle")}
        description={t("inviteUxLab.landingDesc")}
        accentClassName="bg-[linear-gradient(180deg,rgba(234,179,8,0.06),transparent_28%),var(--background)]"
      >
        <div className="space-y-5">
          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("inviteUxLab.joinAcme")}
                description={t("inviteUxLab.createAccountFirst")}
                inviteMessage={t("inviteUxLab.welcomeAboard")}
                requestedAccess={t("inviteUxLab.roleOperator")}
              />
            }
            right={<InlineAuthPreview mode="sign_up" />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("inviteUxLab.joinAcme")}
                description={t("inviteUxLab.createAccountFirst")}
                inviteMessage={t("inviteUxLab.welcomeAboard")}
                requestedAccess={t("inviteUxLab.roleOperator")}
              />
            }
            right={
              <InlineAuthPreview
                mode="sign_in"
                feedback={{
                  tone: "info",
                  text: t("inviteUxLab.accountExistsFeedback"),
                }}
              />
            }
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("inviteUxLab.joinAcme")}
                description={t("inviteUxLab.accountReadyIntro")}
                inviteMessage={t("inviteUxLab.welcomeAboard")}
                requestedAccess={t("inviteUxLab.roleOperator")}
                signedInLabel="Jane Example"
              />
            }
            right={<AcceptInvitePreview autoAccept />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("inviteUxLab.joinAcme")}
                description={t("inviteUxLab.reviewAgentIntro")}
                requestedAccess={t("inviteUxLab.agentJoinRequest")}
              />
            }
            right={<AgentRequestPreview />}
          />

          <InviteLandingShell
            left={
              <InviteSummaryPanel
                title={t("inviteUxLab.joinAcme")}
                description={t("inviteUxLab.accountReadyIntro")}
                requestedAccess={t("inviteUxLab.roleOperator")}
                signedInLabel="Jane Example"
              />
            }
            right={<AcceptInvitePreview error={t("inviteUxLab.alreadyBelongsFeedback")} isCurrentMember />}
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow={t("inviteUxLab.resultEyebrow")}
        title={t("inviteUxLab.resultTitle")}
        description={t("inviteUxLab.resultDesc")}
        accentClassName="bg-[linear-gradient(180deg,rgba(16,185,129,0.06),transparent_30%),var(--background)]"
      >
        <div className="grid gap-5 xl:grid-cols-3">
          <InviteResultPreview
            title={t("inviteUxLab.requestToJoinAcme")}
            description={t("inviteUxLab.boardMustApprove")}
            claimSecret="pcp_claim_secret_demo"
            onboardingTextUrl="/api/invites/pcp_invite_test/onboarding.txt"
          />
          <InviteResultPreview
            title={t("inviteUxLab.joinedOrgTitle")}
            description={t("inviteUxLab.joinedOrgDesc")}
            joinedNow
          />
          <InviteResultPreview
            title={t("inviteUxLab.requestToJoinAcme")}
            description={t("inviteUxLab.askVisitMembers")}
          />
        </div>
      </LabSection>

      <LabSection
        eyebrow={t("inviteUxLab.authEyebrow")}
        title={t("inviteUxLab.authTitle")}
        description={t("inviteUxLab.authDesc")}
        accentClassName="bg-[linear-gradient(180deg,rgba(168,85,247,0.06),transparent_28%),var(--background)]"
      >
        <div className="space-y-5">
          <AuthScreenPreview mode="sign_in" error={t("inviteUxLab.invalidCredentialsError")} />
          <AuthScreenPreview mode="sign_up" />
        </div>
      </LabSection>

      <LabSection
        eyebrow={t("inviteUxLab.settingsEyebrow")}
        title={t("inviteUxLab.settingsTitle")}
        description={t("inviteUxLab.settingsDesc")}
        accentClassName="bg-[linear-gradient(180deg,rgba(244,114,182,0.06),transparent_28%),var(--background)]"
      >
        <CompanyInvitesPreview />
      </LabSection>
    </div>
  );
}
