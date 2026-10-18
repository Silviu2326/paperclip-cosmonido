import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import { Bot, User, Cog, ChevronDown, ListFilter } from "lucide-react";
import type { CaseEvent, CaseEventKind } from "@/api/cases";
import { Button } from "@/components/ui/button";
import { StatusIcon } from "@/components/StatusIcon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, relativeTime } from "@/lib/utils";
import { t, useTranslation } from "@/i18n";

const EVENT_LABEL_KEY: Partial<Record<CaseEventKind, string>> = {
  created: "caseActivity.kindCreated",
  updated: "caseActivity.kindUpdated",
  fields_changed: "caseActivity.kindFieldsChanged",
  status_changed: "caseActivity.kindStatusChanged",
  issue_linked: "caseActivity.kindIssueLinked",
  issue_unlinked: "caseActivity.kindIssueUnlinked",
  document_revised: "caseActivity.kindDocumentRevised",
  child_linked: "caseActivity.kindChildLinked",
  attachment_added: "caseActivity.kindAttachmentAdded",
  label_added: "caseActivity.kindLabelAdded",
  label_removed: "caseActivity.kindLabelRemoved",
};

/** Localized event label; falls back to the raw kind for unknown kinds. */
function eventLabel(kind: CaseEventKind): string {
  const key = EVENT_LABEL_KEY[kind];
  return key ? t(key) : kind;
}

/** Human label for the actor, preferring the resolved agent name. */
function actorLabel(event: CaseEvent): string {
  if (event.actorType === "agent") return event.actorAgentName ?? t("caseActivity.actorAgent");
  if (event.actorType === "user") return t("caseActivity.actorUser");
  return t("caseActivity.actorSystem");
}

function ActorIcon({ event }: { event: CaseEvent }) {
  const Icon = event.actorType === "agent" ? Bot : event.actorType === "user" ? User : Cog;
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

function issueRelationLabel(event: CaseEvent): string {
  return event.kind === "issue_linked" || event.kind === "issue_unlinked" ? t("caseActivity.relationIssue") : t("caseActivity.relationVia");
}

/** One event with actor + run→issue attribution (P4 §1). */
export function CaseEventRow({ event, compact = false }: { event: CaseEvent; compact?: boolean }) {
  const detail =
    event.kind === "status_changed" && event.payload
      ? `${(event.payload.previousStatus as string) ?? "?"} → ${(event.payload.status as string) ?? "?"}`
      : "";
  return (
    <div className={cn("flex items-start gap-2 text-xs", compact ? "py-1.5" : "py-2")}>
      <span className="mt-1"><ActorIcon event={event} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-medium">{eventLabel(event.kind)}</span>
          {detail && <span className="text-muted-foreground">· {detail}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
          <span>{actorLabel(event)}</span>
          {event.issue && (
            <>
              <span aria-hidden>·</span>
              <span>{issueRelationLabel(event)}</span>
              <Link
                to={`/issues/${event.issue.identifier}`}
                className="inline-flex min-w-0 items-center gap-1 text-foreground/80 hover:underline"
                title={event.issue.title}
              >
                <StatusIcon status={event.issue.status} size="sm" />
                <span className="shrink-0 font-mono">{event.issue.identifier}</span>
                <span className="min-w-0 truncate">{event.issue.title}</span>
              </Link>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{relativeTime(event.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

/** The full activity feed with kind filters (detail-page Activity tab). */
export function CaseActivityFeed({ events }: { events: CaseEvent[] }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<Set<CaseEventKind>>(new Set());

  // Only offer filters for kinds actually present, in first-seen order.
  const presentKinds = useMemo(() => {
    const seen: CaseEventKind[] = [];
    for (const e of events) if (!seen.includes(e.kind)) seen.push(e.kind);
    return seen;
  }, [events]);

  const filtered = useMemo(
    () => (active.size === 0 ? events : events.filter((e) => active.has(e.kind))),
    [events, active],
  );

  function toggle(kind: CaseEventKind) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  const filterLabel = active.size === 0
    ? t("caseActivity.allActivity")
    : active.size === 1
      ? eventLabel([...active][0]!)
      : t("caseActivity.filterCount", { count: active.size });

  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("caseActivity.noActivity")}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("caseActivity.countOf", { shown: filtered.length, total: events.length })}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <ListFilter className="h-3.5 w-3.5" />
              {filterLabel}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{t("caseActivity.activityFilter")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setActive(new Set())}>
              {t("caseActivity.allActivity")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {presentKinds.map((kind) => (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={active.has(kind)}
                onCheckedChange={() => toggle(kind)}
              >
                {eventLabel(kind)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("caseActivity.noMatch")}</p>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((event) => (
            <CaseEventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
