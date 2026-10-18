import type { ReactNode } from "react";
import { useTranslation } from "@/i18n";
import { ISSUE_WRITE_DENIAL_CODES } from "@paperclipai/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { CommentAttributionChip } from "@/components/CommentAttributionChip";
import { IssueFieldChangeReceipt } from "@/components/IssueFieldChangeReceipt";
import { IssueWriteDenialNotice } from "@/components/IssueWriteDenialNotice";
import { Identity } from "@/components/Identity";
import { cn } from "@/lib/utils";

/**
 * UX lab for the three surfaces that make open
 * cross-issue collaboration legible — the "for {user}" attribution chip, the
 * field-edit audit receipt in the activity stream, and actionable denial copy.
 *
 * Route: /ux-lab/cross-issue-collaboration. Public (no session) so the states
 * can be captured for UX review without seeding a live thread.
 */

function LabSection({
  index,
  title,
  description,
  children,
  columns = 2,
}: {
  index: string;
  title: string;
  description: string;
  children: ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-background/85 p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
          {index}
        </div>
        <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className={cn("grid gap-4", columns === 2 && "lg:grid-cols-2")}>{children}</div>
    </section>
  );
}

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
        {label}
      </div>
      <Card className="block border-border/60 p-3">{children}</Card>
    </div>
  );
}

/** A faithful copy of an agent comment bubble header + body (IssueChatThread.tsx). */
function AgentCommentBubble({
  authorName,
  onBehalfOf,
  body,
}: {
  authorName: string;
  onBehalfOf?: string | null;
  body: string;
}) {
  return (
    <div className="flex flex-col items-start py-1.5">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
          <Avatar size="sm" className="size-5">
            <AvatarFallback className="text-(length:--text-nano)">
              {authorName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </span>
        <span className="text-sm font-medium text-foreground">{authorName}</span>
        {onBehalfOf ? (
          <CommentAttributionChip agentName={authorName} userName={onBehalfOf} />
        ) : null}
      </div>
      <div className="min-w-0 max-w-(--pct-85) break-words border border-border bg-card px-3 py-2 text-sm text-foreground [border-radius:14px_14px_14px_4px]">
        {body}
      </div>
    </div>
  );
}

/** A faithful copy of an activity row in the issue run ledger (IssueDetail.tsx). */
function ActivityRow({
  actorName,
  verb,
  children,
}: {
  actorName: string;
  verb: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Identity name={actorName} size="sm" />
        <span>{verb}</span>
        <span className="ml-auto shrink-0">{t("crossIssueCollaborationUxLab.twoMinAgo")}</span>
      </div>
      {children}
    </div>
  );
}

const AGENT_NAMES = new Map([
  ["3108ef8e-5ed0-41d9-b561-6b41c41b8545", "ClaudeCoder"],
  ["6670e11b-91d3-4429-82e0-436b88b51808", "UXDesigner"],
]);

export function CrossIssueCollaborationUxLab() {
  const { t } = useTranslation();
  const resolveAgentLabel = (id: string) => AGENT_NAMES.get(id) ?? null;
  const resolveUserLabel = (id: string) => (id === "user-dotta" ? "Dotta" : null);

  return (
    <div className="min-h-screen bg-muted/20 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <div className="text-(length:--text-micro) font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
            {t("crossIssueCollaborationUxLab.eyebrow")}
          </div>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            {t("crossIssueCollaborationUxLab.heading")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("crossIssueCollaborationUxLab.intro")}
          </p>
        </header>

        <LabSection
          index={t("crossIssueCollaborationUxLab.s1Index")}
          title={t("crossIssueCollaborationUxLab.s1Title")}
          description={t("crossIssueCollaborationUxLab.s1Description")}
        >
          <Frame label={t("crossIssueCollaborationUxLab.s1OwnLabel")}>
            <AgentCommentBubble
              authorName="CodexCoder"
              body={t("crossIssueCollaborationUxLab.s1OwnBody")}
            />
          </Frame>
          <Frame label={t("crossIssueCollaborationUxLab.s1CrossLabel")}>
            <AgentCommentBubble
              authorName="Fable"
              onBehalfOf="Dotta"
              body={t("crossIssueCollaborationUxLab.s1CrossBody")}
            />
          </Frame>
          <Frame label={t("crossIssueCollaborationUxLab.s1MissingLabel")}>
            <AgentCommentBubble
              authorName="Fable"
              onBehalfOf={t("crossIssueCollaborationUxLab.responsibleUser")}
              body={t("crossIssueCollaborationUxLab.s1MissingBody")}
            />
          </Frame>
          <Frame label={t("crossIssueCollaborationUxLab.s1LongLabel")}>
            <AgentCommentBubble
              authorName="Fable"
              onBehalfOf="Alexandra Konstantinopoulos-Whitfield"
              body={t("crossIssueCollaborationUxLab.s1LongBody")}
            />
          </Frame>
        </LabSection>

        <LabSection
          index={t("crossIssueCollaborationUxLab.s2Index")}
          title={t("crossIssueCollaborationUxLab.s2Title")}
          description={t("crossIssueCollaborationUxLab.s2Description")}
        >
          <Frame label={t("crossIssueCollaborationUxLab.s2AgentLabel")}>
            <ActivityRow actorName="Fable" verb={t("crossIssueCollaborationUxLab.s2AgentVerb")}>
              <IssueFieldChangeReceipt
                event={{
                  action: "issue.updated",
                  responsibleUserId: "user-dotta",
                  details: {
                    authorizationReason: "allow_visible_issue_write",
                    changes: {
                      status: { from: "todo", to: "in_progress" },
                      priority: { from: "medium", to: "high" },
                    },
                  },
                }}
                resolveAgentLabel={resolveAgentLabel}
                resolveUserLabel={resolveUserLabel}
              />
            </ActivityRow>
          </Frame>
          <Frame label={t("crossIssueCollaborationUxLab.s2BoardLabel")}>
            <ActivityRow actorName="Dotta" verb={t("crossIssueCollaborationUxLab.s2BoardVerb")}>
              <IssueFieldChangeReceipt
                event={{
                  action: "issue.updated",
                  responsibleUserId: "user-dotta",
                  details: {
                    authorizationReason: "allow_board_actor",
                    changes: {
                      assigneeAgentId: {
                        from: "3108ef8e-5ed0-41d9-b561-6b41c41b8545",
                        to: "6670e11b-91d3-4429-82e0-436b88b51808",
                      },
                      description: { from: "Old brief…", to: "New brief…", updated: true },
                    },
                  },
                }}
                resolveAgentLabel={resolveAgentLabel}
                resolveUserLabel={resolveUserLabel}
              />
            </ActivityRow>
          </Frame>
          <Frame label={t("crossIssueCollaborationUxLab.s2MultiLabel")}>
            <ActivityRow actorName="CTO" verb={t("crossIssueCollaborationUxLab.s2BoardVerb")}>
              <IssueFieldChangeReceipt
                event={{
                  action: "issue.updated",
                  responsibleUserId: "user-dotta",
                  details: {
                    authorizationReason: "allow_visible_issue_write",
                    changes: {
                      blockedByIssueIds: { from: [], to: ["TASK-491", "TASK-492"] },
                      workMode: { from: "planning", to: "standard" },
                      assigneeAgentId: {
                        from: null,
                        to: "3108ef8e-5ed0-41d9-b561-6b41c41b8545",
                      },
                    },
                  },
                }}
                resolveAgentLabel={resolveAgentLabel}
                resolveUserLabel={resolveUserLabel}
              />
            </ActivityRow>
          </Frame>
          <Frame label={t("crossIssueCollaborationUxLab.s2OlderLabel")}>
            <ActivityRow actorName="CodexCoder" verb={t("crossIssueCollaborationUxLab.s2OlderVerb")} />
          </Frame>
        </LabSection>

        <LabSection
          index={t("crossIssueCollaborationUxLab.s3Index")}
          title={t("crossIssueCollaborationUxLab.s3Title")}
          description={t("crossIssueCollaborationUxLab.s3Description")}
          columns={1}
        >
          <Frame label={t("crossIssueCollaborationUxLab.s3BeforeLabel")}>
            <div className="text-xs">
              <span className="text-destructive">
                {t("crossIssueCollaborationUxLab.s3BeforeError")}
              </span>
              <p className="mt-1 text-muted-foreground">
                {t("crossIssueCollaborationUxLab.s3BeforeText")}
              </p>
            </div>
          </Frame>
          {ISSUE_WRITE_DENIAL_CODES.map((code) => (
            <Frame key={code} label={t("crossIssueCollaborationUxLab.s3AfterLabel", { code })}>
              <IssueWriteDenialNotice
                code={code}
                context={{
                  actorLabel: "Fable",
                  assigneeLabel: "CodexCoder",
                  responsibleUserName: "Dotta",
                  issueIdentifier: "TASK-482",
                  cap: 20,
                  count: 21,
                }}
              />
            </Frame>
          ))}
        </LabSection>
      </div>
    </div>
  );
}

export default CrossIssueCollaborationUxLab;
