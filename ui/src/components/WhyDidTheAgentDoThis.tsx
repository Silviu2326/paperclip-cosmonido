import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AgentActionKind, AgentExplainTimelineEntry } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { agentExplainApi } from "@/api/agent-explain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";

interface WhyDidTheAgentDoThisProps {
  companyId: string;
  kind: AgentActionKind;
  actionId: string;
}

type LinkTarget = AgentExplainTimelineEntry["link"];

/** Maps a timeline or result link to an existing board path. Runs have no page of their own, so they are not linked. */
function linkHref(link: LinkTarget): string | null {
  if (!link) return null;
  switch (link.type) {
    case "issue":
      return `/issues/${link.id}`;
    case "decision":
      return "/decisions";
    case "document":
    case "company_file":
      return "/context";
    case "proposal":
      return `/proposals/${link.id}`;
    case "playbook_run":
      return "/playbooks";
    default:
      return null;
  }
}

function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function SectionTitle({ children }: { children: string }) {
  return <h4 className="text-xs font-medium uppercase text-muted-foreground">{children}</h4>;
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

/** Collapsed-by-default "Por qué hizo esto" card. The explanation is fetched only when the card opens. */
export function WhyDidTheAgentDoThis({ companyId, kind, actionId }: WhyDidTheAgentDoThisProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["agent-explain", companyId, kind, actionId],
    queryFn: () => agentExplainApi.explain(companyId, kind, actionId),
    enabled: open && !!companyId && !!actionId,
  });
  const title = t("agentExplain.title", { defaultValue: "Por qué hizo esto" });
  const data = query.data;

  return (
    <Card>
      <CardHeader>
        <Button
          type="button"
          variant="ghost"
          className="flex w-full items-center justify-between gap-2 px-0"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <CardTitle className="text-sm">{title}</CardTitle>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-6">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("agentExplain.loading", { defaultValue: "Cargando explicación…" })}
            </p>
          ) : null}
          {query.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {t("agentExplain.error", { defaultValue: "No se pudo cargar la explicación." })}
              {query.error instanceof Error ? ` ${query.error.message}` : ""}
            </p>
          ) : null}
          {data ? (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium">{data.action.title}</p>
                <p className="text-xs text-muted-foreground">
                  {data.agent
                    ? t("agentExplain.byAgent", { defaultValue: "Agente: {{name}}", name: data.agent.name })
                    : t("agentExplain.noAgent", { defaultValue: "Sin agente asociado" })}
                  {data.action.at ? ` · ${formatWhen(data.action.at)}` : ""}
                </p>
                {data.missing.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("agentExplain.missing", { defaultValue: "Sin datos para: {{items}}", items: data.missing.join(", ") })}
                  </p>
                ) : null}
              </div>

              <section className="space-y-2">
                <SectionTitle>{t("agentExplain.sections.context", { defaultValue: "Contexto usado" })}</SectionTitle>
                {data.contextUsed.length === 0 ? (
                  <Empty text={t("agentExplain.empty.context", { defaultValue: "No se leyó ningún documento de contexto." })} />
                ) : (
                  <ul className="space-y-1">
                    {data.contextUsed.map((row) => (
                      <li key={`${row.fileId}-${row.readAt}`} className="flex items-center justify-between gap-2 text-sm">
                        <Link to="/context" className="underline">{row.name}</Link>
                        {row.contextRole ? <Badge>{row.contextRole}</Badge> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>{t("agentExplain.sections.tools", { defaultValue: "Herramientas llamadas" })}</SectionTitle>
                {data.toolsCalled.length === 0 ? (
                  <Empty text={t("agentExplain.empty.tools", { defaultValue: "No hubo llamadas a herramientas." })} />
                ) : (
                  <ul className="space-y-1">
                    {data.toolsCalled.map((call, index) => (
                      <li key={`${call.source}-${call.at}-${index}`} className="flex items-center justify-between gap-2 text-sm">
                        <span>{call.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {call.status ? `${call.status} · ` : ""}
                          {formatWhen(call.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>{t("agentExplain.sections.gate", { defaultValue: "Gate y autonomía" })}</SectionTitle>
                {data.gate ? (
                  <div className="space-y-1 text-sm">
                    <p>
                      {data.gate.applied
                        ? t("agentExplain.gate.applied", { defaultValue: "Gate aplicado" })
                        : t("agentExplain.gate.notApplied", { defaultValue: "Sin gate aplicado a esta acción" })}
                      {data.gate.actionType ? ` · ${data.gate.actionType}` : ""}
                    </p>
                    <p className="text-muted-foreground">
                      {data.gate.levelAtTheTime
                        ? t("agentExplain.gate.level", { defaultValue: "Nivel de autonomía vigente: {{level}}", level: data.gate.levelAtTheTime })
                        : t("agentExplain.gate.noLevel", { defaultValue: "Sin nivel de autonomía registrado" })}
                    </p>
                  </div>
                ) : (
                  <Empty text={t("agentExplain.empty.gate", { defaultValue: "Sin información de gate." })} />
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>{t("agentExplain.sections.decision", { defaultValue: "Decisión humana" })}</SectionTitle>
                {data.humanDecision ? (
                  <div className="space-y-1 text-sm">
                    <p>
                      <Link to="/decisions" className="underline">{data.humanDecision.status}</Link>
                      {data.humanDecision.chosenOptionId ? ` · ${data.humanDecision.chosenOptionId}` : ""}
                    </p>
                    {data.humanDecision.decidedAt ? (
                      <p className="text-xs text-muted-foreground">{formatWhen(data.humanDecision.decidedAt)}</p>
                    ) : null}
                  </div>
                ) : (
                  <Empty text={t("agentExplain.empty.decision", { defaultValue: "Ninguna persona decidió sobre esta acción." })} />
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>{t("agentExplain.sections.result", { defaultValue: "Resultado" })}</SectionTitle>
                {data.result ? (
                  <p className="text-sm">{data.result.summary}</p>
                ) : (
                  <Empty text={t("agentExplain.empty.result", { defaultValue: "Sin resultado registrado." })} />
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>{t("agentExplain.sections.timeline", { defaultValue: "Cronología" })}</SectionTitle>
                {data.timeline.length === 0 ? (
                  <Empty text={t("agentExplain.empty.timeline", { defaultValue: "Sin eventos." })} />
                ) : (
                  <ol className="space-y-3 border-l border-border pl-4">
                    {data.timeline.map((entry, index) => {
                      const href = linkHref(entry.link);
                      return (
                        <li key={`${entry.kind}-${entry.at}-${index}`} className="relative space-y-0.5">
                          <span className="text-xs text-muted-foreground">{formatWhen(entry.at)}</span>
                          <p className="text-sm">
                            {href ? <Link to={href} className="underline">{entry.title}</Link> : entry.title}
                          </p>
                          {entry.detail ? <p className="text-xs text-muted-foreground">{entry.detail}</p> : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
