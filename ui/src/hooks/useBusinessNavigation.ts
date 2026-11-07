import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAccountIdentity } from "@/api/companies-query";
import { useCompany } from "@/context/CompanyContext";

export type BusinessNavigationPreferences = { business: boolean; agenda: boolean; office: boolean };
const defaults: BusinessNavigationPreferences = { business: true, agenda: false, office: false };
const changedEvent = "paperclip-business-navigation-changed";

export function businessNavigationKey(companyId: string, userId: string | null) {
  return `paperclip:business-navigation:v1:${encodeURIComponent(userId ?? "local-board")}:${companyId}`;
}

export function parseBusinessNavigation(raw: string | null): BusinessNavigationPreferences {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return defaults;
    const candidate = value as Partial<BusinessNavigationPreferences>;
    return {
      business: typeof candidate.business === "boolean" ? candidate.business : defaults.business,
      agenda: typeof candidate.agenda === "boolean" ? candidate.agenda : defaults.agenda,
      office: typeof candidate.office === "boolean" ? candidate.office : defaults.office,
    };
  } catch { return defaults; }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changedEvent, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(changedEvent, callback); };
}

export function useBusinessNavigation() {
  const { selectedCompanyId } = useCompany();
  const { userId, settled } = useAccountIdentity();
  const key = selectedCompanyId && settled ? businessNavigationKey(selectedCompanyId, userId) : null;
  const getSnapshot = useCallback(() => {
    try { return key ? window.localStorage.getItem(key) : null; } catch { return null; }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const preferences = useMemo(() => parseBusinessNavigation(raw), [raw]);
  const update = useCallback((patch: Partial<BusinessNavigationPreferences>) => {
    if (!key) return false;
    try {
      window.localStorage.setItem(key, JSON.stringify({ ...parseBusinessNavigation(window.localStorage.getItem(key)), ...patch }));
      window.dispatchEvent(new Event(changedEvent));
      return true;
    } catch { return false; }
  }, [key]);
  return { preferences, update, ready: Boolean(key) };
}
