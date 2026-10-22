import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { applyOfficePatch, defaultOfficeLayout, officeLayoutSchema, type OfficeLayout, type OfficePatch } from "@paperclipai/shared";
import { officeApi, type OfficeLayoutSource } from "../api/office";
import type { OfficeCatalog } from "./catalog";

/** Saves are debounced: one PUT after the user stops editing for this long. */
export const OFFICE_SAVE_DEBOUNCE_MS = 1000;
const HISTORY_LIMIT = 30;

export interface OfficeAgentRef { id: string; name: string }

interface Working {
  companyId: string;
  layout: OfficeLayout;
  source: OfficeLayoutSource;
  history: OfficeLayout[];
}

export interface OfficeLayoutController {
  layout: OfficeLayout | null;
  source: OfficeLayoutSource | null;
  loading: boolean;
  loadError: boolean;
  saving: boolean;
  saveError: boolean;
  canUndo: boolean;
  /** Applies what fits of a patch (rejected ops are returned, never thrown). Records undo and schedules a save. */
  applyPatch: (patch: OfficePatch) => { changed: boolean; rejected: string[] };
  undo: () => void;
  /** DELETE the saved layout and return to the default office. */
  reset: () => Promise<boolean>;
}

/**
 * Editable office layout for one company and user (contract 3). The server copy is loaded once and
 * never refetched over the top of local edits; every change is applied with applyOfficePatch and
 * saved with a 1 s debounce.
 */
export function useOfficeLayout(companyId: string | null, catalog: OfficeCatalog | null, agents: readonly OfficeAgentRef[]): OfficeLayoutController {
  const query = useQuery({
    queryKey: ["office", companyId, "layout"] as const,
    queryFn: () => officeApi.getLayout(companyId!),
    enabled: Boolean(companyId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const [working, setWorking] = useState<Working | null>(null);
  const workingRef = useRef<Working | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const pendingRef = useRef<{ companyId: string; layout: OfficeLayout } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  const commit = useCallback((next: Working | null) => {
    workingRef.current = next;
    setWorking(next);
  }, []);

  // A fresh server copy starts a new editing session. Re-runs when the catalog arrives after the layout.
  const hasCatalog = Boolean(catalog);
  useEffect(() => {
    if (!companyId || !query.data || !catalogRef.current) return;
    const parsed = officeLayoutSchema.safeParse(query.data.layout);
    const layout = parsed.success ? parsed.data : defaultOfficeLayout(agentsRef.current, catalogRef.current);
    commit({ companyId, layout, source: query.data.source, history: [] });
  }, [companyId, query.data, hasCatalog, commit]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    officeApi.saveLayout(pending.companyId, pending.layout)
      .then(() => { setSaveError(false); })
      .catch(() => { setSaveError(true); })
      .finally(() => { if (!pendingRef.current) setSaving(false); });
  }, []);

  const schedule = useCallback((companyIdToSave: string, layout: OfficeLayout) => {
    pendingRef.current = { companyId: companyIdToSave, layout };
    setSaving(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, OFFICE_SAVE_DEBOUNCE_MS);
  }, [flush]);

  // Pending edits are sent when the page goes away, so nothing typed in the last second is lost.
  useEffect(() => flush, [flush]);

  const applyPatch = useCallback((patch: OfficePatch) => {
    const base = workingRef.current;
    const currentCatalog = catalogRef.current;
    if (!base || !currentCatalog || patch.length === 0) return { changed: false, rejected: [] as string[] };
    const { layout, rejected } = applyOfficePatch(base.layout, patch, currentCatalog);
    if (rejected.length >= patch.length) return { changed: false, rejected };
    commit({ ...base, layout, source: "saved", history: [...base.history, base.layout].slice(-HISTORY_LIMIT) });
    schedule(base.companyId, layout);
    return { changed: true, rejected };
  }, [commit, schedule]);

  const undo = useCallback(() => {
    const base = workingRef.current;
    if (!base || base.history.length === 0) return;
    const previous = base.history[base.history.length - 1];
    commit({ ...base, layout: previous, source: "saved", history: base.history.slice(0, -1) });
    schedule(base.companyId, previous);
  }, [commit, schedule]);

  const reset = useCallback(async () => {
    const base = workingRef.current;
    if (!base) return false;
    // A pending save of the old layout must not land after the reset.
    pendingRef.current = null;
    if (timerRef.current !== null) { clearTimeout(timerRef.current); timerRef.current = null; }
    try {
      const response = await officeApi.resetLayout(base.companyId);
      const parsed = officeLayoutSchema.safeParse(response.layout);
      const layout = parsed.success ? parsed.data : defaultOfficeLayout(agentsRef.current, catalogRef.current ?? { floors: {}, walls: {}, objects: {} });
      commit({ companyId: base.companyId, layout, source: response.source, history: [] });
      setSaving(false);
      setSaveError(false);
      return true;
    } catch {
      setSaveError(true);
      return false;
    }
  }, [commit]);

  return {
    layout: working?.layout ?? null,
    source: working?.source ?? null,
    loading: Boolean(companyId) && !working && !query.error,
    loadError: query.isError,
    saving,
    saveError,
    canUndo: (working?.history.length ?? 0) > 0,
    applyPatch,
    undo,
    reset,
  };
}
