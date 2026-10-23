import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { companyFilesApi, type CompanyFile } from "@/api/company-files";
import { contextApi, type ContextRole } from "@/api/context";
import { projectsApi } from "@/api/projects";
import { queryKeys } from "@/lib/queryKeys";
import {
  applyContextFilter,
  authorizedContextProjectId,
  type ContextAudienceKind,
  type ContextFilter,
} from "./context-properties";

/** Properties applied to files uploaded while the context view is on. */
export interface ContextUploadDefaults {
  role: ContextRole;
  audienceKind: ContextAudienceKind;
  audienceId: string;
  /** `yyyy-mm-dd` or empty. */
  validUntil: string;
}

/**
 * Data for the Entrada context view: the whole Entrada listing narrowed client-side to files with a
 * context role (so nothing the agents may read is hidden by the agent-facing page limit), the
 * agent-facing `truncated` signal, and the properties new uploads receive. Nothing runs when the
 * view is off.
 */
export function useContextMode(companyId: string, filter: ContextFilter | null, q: string) {
  const active = filter !== null && companyId.length > 0;
  const files = useQuery({
    queryKey: queryKeys.companyFiles.list(companyId, null, q, null, null, "context"),
    queryFn: () => companyFilesApi.list(companyId, { scope: "all", q: q || undefined }),
    enabled: active,
  });
  const projects = useQuery({
    queryKey: ["context-projects", companyId],
    queryFn: () => projectsApi.list(companyId),
    enabled: active,
  });
  const role = filter && filter.role !== "any" ? filter.role : undefined;
  const includeExpired = filter ? filter.validity !== "active" : false;
  const agentView = useQuery({
    queryKey: ["context", companyId, "agent-view", role ?? "any", includeExpired],
    queryFn: () => contextApi.list(companyId, role, includeExpired),
    enabled: active,
  });

  const authorizedProjectId = authorizedContextProjectId(filter?.projectId ?? null, projects.data);
  const projectUnavailable = Boolean(filter?.projectId) && projects.isSuccess && authorizedProjectId === null;

  const [defaults, setDefaults] = useState<ContextUploadDefaults>({ role: "offer", audienceKind: "company", audienceId: "", validUntil: "" });
  // Follow the filter: browsing one role uploads into it; a linked project becomes the audience.
  const filterRole = filter?.role ?? "any";
  useEffect(() => {
    if (filterRole !== "any") setDefaults(current => ({ ...current, role: filterRole }));
  }, [filterRole]);
  useEffect(() => {
    if (authorizedProjectId) setDefaults(current => ({ ...current, audienceKind: "project", audienceId: authorizedProjectId }));
  }, [authorizedProjectId]);

  const uploadBlocker: "projectLoading" | "projectUnavailable" | "projectMissing" | null =
    !filter || defaults.audienceKind !== "project"
      ? null
      : projects.isLoading || projects.error
        ? "projectLoading"
        : !defaults.audienceId || !authorizedContextProjectId(defaults.audienceId, projects.data)
          ? (projectUnavailable ? "projectUnavailable" : "projectMissing")
          : null;

  const applyUploadDefaults = async (created: CompanyFile) => {
    if (!filter) return;
    await companyFilesApi.update(created.id, {
      contextRole: defaults.role,
      validUntil: defaults.validUntil ? new Date(defaults.validUntil) : null,
      audienceKind: defaults.audienceKind,
      audienceId: defaults.audienceKind === "project" ? defaults.audienceId : null,
    });
  };

  return {
    active,
    files,
    visibleFiles: filter && files.data ? applyContextFilter(files.data.files, filter, new Date()) : [],
    projects,
    projectUnavailable,
    truncated: Boolean(agentView.data?.truncated),
    defaults,
    setDefaults,
    uploadBlocker,
    applyUploadDefaults,
  };
}
