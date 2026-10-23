import { ArrowLeft, BookOpen, ShieldCheck, Users } from "lucide-react";
import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Destinations shared by the team and routines pages. Every path already has a
 * route in App.tsx; these helpers only connect them so the roster, routines and
 * template libraries stay reachable from each other without new sections.
 */
export const TEAM_WORKSPACE_PATHS = {
  agents: "/agents/all",
  // Creating a team reuses the real select -> review -> hire flow in /productization.
  // /business-builder only saves configuration drafts and must not be the CTA.
  createTeam: "/productization#team",
  preparation: "/productization",
  skills: "/skills",
  autonomy: "/autonomy",
  office: "/office",
  routines: "/routines",
  playbooks: "/playbooks",
  privateTemplates: "/portable-catalog",
  sharedTemplates: "/public-catalog",
  advancedEditor: "/business-builder",
} as const;

/** Autonomy filters its matrix by agent id through the `agent` query parameter. */
export const AUTONOMY_AGENT_PARAM = "agent";

export function autonomyHrefForAgent(agentId: string): string {
  return `${TEAM_WORKSPACE_PATHS.autonomy}?${AUTONOMY_AGENT_PARAM}=${encodeURIComponent(agentId)}`;
}

const subtleLinkClass =
  "text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

/** Header action for the roster: add a whole team from the existing templates. */
export function AddTeamButton() {
  const { t } = useTranslation();
  return (
    <Button asChild size="sm" variant="outline">
      <Link to={TEAM_WORKSPACE_PATHS.createTeam}>
        <Users className="h-3.5 w-3.5 mr-1.5" />
        {t("uxTeam.agents.addTeam", { defaultValue: "Añadir equipo" })}
      </Link>
    </Button>
  );
}

/** Optional team-adjacent views, kept as quiet links beside the roster count. */
export function TeamQuickLinks({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("uxTeam.agents.relatedLabel", { defaultValue: "Más sobre el equipo" })}
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}
    >
      <Link to={TEAM_WORKSPACE_PATHS.skills} className={subtleLinkClass}>
        {t("uxTeam.agents.skills", { defaultValue: "Habilidades" })}
      </Link>
      <Link to={TEAM_WORKSPACE_PATHS.autonomy} className={subtleLinkClass}>
        {t("uxTeam.agents.autonomy", { defaultValue: "Autonomía" })}
      </Link>
      <Link to={TEAM_WORKSPACE_PATHS.office} className={subtleLinkClass}>
        {t("uxTeam.agents.office", { defaultValue: "Oficina" })}
      </Link>
    </nav>
  );
}

/** Back link from the optional Office / Autonomy views to the roster. */
export function BackToTeamLink() {
  const { t } = useTranslation();
  return (
    <Button asChild size="sm" variant="ghost">
      <Link to={TEAM_WORKSPACE_PATHS.agents}>
        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
        {t("uxTeam.back.team", { defaultValue: "Equipo" })}
      </Link>
    </Button>
  );
}

/** Compact entry in an agent's permissions view; links to Autonomy filtered by that agent. */
export function AgentAutonomyLink({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-xl text-xs text-muted-foreground">
        {t("uxTeam.agentDetail.autonomyHint", {
          defaultValue:
            "La autonomía por tipo de acción (correo, mensaje, reserva…) se gana con pruebas y se puede revocar en cualquier momento desde Autonomía.",
        })}
      </p>
      <Button asChild size="sm" variant="outline">
        <Link to={autonomyHrefForAgent(agentId)}>
          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
          {t("uxTeam.agentDetail.autonomyLink", { defaultValue: "Ver autonomía de este agente" })}
        </Link>
      </Button>
    </div>
  );
}

/** Routines list action: reusable step-by-step procedures live in /playbooks. */
export function ProceduresLink() {
  const { t } = useTranslation();
  return (
    <Button asChild variant="outline">
      <Link
        to={TEAM_WORKSPACE_PATHS.playbooks}
        title={t("uxTeam.routines.proceduresHint", {
          defaultValue: "Secuencias reutilizables paso a paso. Cuándo se ejecuta cada rutina se sigue configurando aquí, en Rutinas.",
        })}
      >
        <BookOpen className="mr-2 h-4 w-4" />
        {t("uxTeam.routines.procedures", { defaultValue: "Procedimientos" })}
      </Link>
    </Button>
  );
}

/** Playbooks -> Routines, so procedures never become a dead end. */
export function BackToRoutinesLink() {
  const { t } = useTranslation();
  return (
    <Button asChild size="sm" variant="ghost">
      <Link to={TEAM_WORKSPACE_PATHS.routines}>
        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
        {t("uxTeam.back.routines", { defaultValue: "Rutinas" })}
      </Link>
    </Button>
  );
}

export type TemplateLibraryView = "create" | "private" | "shared" | "builder";

/**
 * One row that ties the team-creation surfaces together. The current view is
 * plain text; the others are links. It does not replace any page or add a tab.
 */
export function TemplateLibraryNav({ current }: { current: TemplateLibraryView }) {
  const { t } = useTranslation();
  const items: Array<{ view: TemplateLibraryView | "team"; to: string; label: string }> = [
    { view: "team", to: TEAM_WORKSPACE_PATHS.agents, label: t("uxTeam.nav.team", { defaultValue: "Equipo" }) },
    { view: "create", to: TEAM_WORKSPACE_PATHS.createTeam, label: t("uxTeam.nav.create", { defaultValue: "Crear equipo" }) },
    { view: "private", to: TEAM_WORKSPACE_PATHS.privateTemplates, label: t("uxTeam.nav.private", { defaultValue: "Plantillas privadas" }) },
    { view: "shared", to: TEAM_WORKSPACE_PATHS.sharedTemplates, label: t("uxTeam.nav.shared", { defaultValue: "Plantillas compartidas" }) },
    { view: "builder", to: TEAM_WORKSPACE_PATHS.advancedEditor, label: t("uxTeam.nav.builder", { defaultValue: "Editor de configuración avanzada" }) },
  ];
  return (
    <nav
      aria-label={t("uxTeam.nav.label", { defaultValue: "Crear y configurar equipo" })}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
    >
      {items.map((item) =>
        item.view === current ? (
          <span key={item.view} aria-current="page" className="font-medium text-foreground">
            {item.label}
          </span>
        ) : (
          <Link
            key={item.view}
            to={item.to}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
