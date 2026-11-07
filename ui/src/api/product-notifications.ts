import type {
  ProductNotificationPreferences, ProductNotificationsSnapshot, ProductPushPublicConfig, ProductPushSubscriptionInput, UpdateProductNotificationPreferencesInput,
} from "@paperclipai/shared/productization/notifications";
import { api, requestResponse } from "./client";
import { readApiJson } from "./response";

export const productNotificationsApi = {
  async snapshot(companyId: string) {
    const response = await requestResponse(`/companies/${companyId}/product-notifications`, { cache: "no-store" });
    return readApiJson<ProductNotificationsSnapshot>(response);
  },
  updatePreferences: (companyId: string, input: UpdateProductNotificationPreferencesInput) => api.put<ProductNotificationPreferences>(`/companies/${companyId}/product-notifications/preferences`, input),
  pushConfig: async (companyId: string) => {
    const response = await requestResponse(`/companies/${companyId}/product-notifications/push/config`, { cache: "no-store" });
    return readApiJson<ProductPushPublicConfig>(response);
  },
  pushSubscriptions: async (companyId: string) => {
    const response = await requestResponse(`/companies/${companyId}/product-notifications/push/subscriptions`, { cache: "no-store" });
    return readApiJson<Array<{ id: string; createdAt: string; lastUsedAt: string | null }>>(response);
  },
  subscribePush: (companyId: string, input: ProductPushSubscriptionInput) => api.post<{ id: string; enabled: boolean }>(`/companies/${companyId}/product-notifications/push/subscriptions`, input),
  revokePushSubscription: (companyId: string, subscriptionId: string) => api.delete<{ revoked: boolean }>(`/companies/${companyId}/product-notifications/push/subscriptions/${encodeURIComponent(subscriptionId)}`),
  revokeAllPushSubscriptions: (companyId: string) => api.delete<{ revoked: boolean }>(`/companies/${companyId}/product-notifications/push/subscriptions`),
};
