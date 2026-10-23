import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { productNotificationsApi } from "../../../api/product-notifications";
import { useAccountIdentity } from "../../../api/companies-query";
import { useCompany } from "../../../context/CompanyContext";
import { useCompanyLiveEvent } from "../../../context/LiveUpdatesProvider";
import { showForegroundProductNotification, clearForegroundProductNotifications } from "./browser-notification";

/** Converts live company changes into generic foreground notifications after explicit per-company opt-in. */
export function ProductNotificationBridge() {
  const { selectedCompanyId } = useCompany();
  const { userId } = useAccountIdentity();
  const queryClient = useQueryClient();
  const previousKeys = useRef<Set<string> | null>(null);
  const scopeGeneration = useRef<object | null>(null);
  const query = useQuery({
    queryKey: ["product-notifications", userId, selectedCompanyId],
    queryFn: () => productNotificationsApi.snapshot(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && userId),
    staleTime: 15_000,
  });
  const onLiveEvent = useCallback((event: { type: string }) => {
    if (event.type === "activity.logged" || event.type === "heartbeat.run.status") {
      void queryClient.invalidateQueries({ queryKey: ["product-notifications", userId, selectedCompanyId] });
    }
  }, [queryClient, selectedCompanyId, userId]);
  useCompanyLiveEvent(onLiveEvent);

  useEffect(() => {
    previousKeys.current = null;
    const generation = {};
    scopeGeneration.current = generation;
    if (!userId || !selectedCompanyId) return () => { if (scopeGeneration.current === generation) scopeGeneration.current = null; };
    return () => {
      if (scopeGeneration.current === generation) scopeGeneration.current = null;
      previousKeys.current = null;
      queryClient.removeQueries({ queryKey: ["product-notifications", userId, selectedCompanyId], exact: true });
      void clearForegroundProductNotifications();
    };
  }, [queryClient, selectedCompanyId, userId]);

  useEffect(() => {
    if (!query.data) return;
    const current = new Set(query.data.items.map((item) => item.key));
    const previous = previousKeys.current;
    previousKeys.current = current;
    if (!previous || !query.data.preferences.browserEnabled) return;
    for (const item of query.data.items) {
      if (!previous.has(item.key)) {
        const generation = scopeGeneration.current;
        void showForegroundProductNotification(item.category, item.href, item.key, () => generation !== null && scopeGeneration.current === generation);
      }
    }
  }, [query.data]);
  return null;
}
