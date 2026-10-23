export const PRODUCT_NOTIFICATION_CATEGORIES = ["decisions", "reviews", "tasks"] as const;
export type ProductNotificationCategory = (typeof PRODUCT_NOTIFICATION_CATEGORIES)[number];

export interface ProductNotificationPreferences {
  companyId: string;
  categories: ProductNotificationCategory[];
  browserEnabled: boolean;
  remotePushEnabled: boolean;
  remotePushStatus: "disabled" | "enabled" | "blocked_configuration";
  whatsappStatus: "blocked_authorized_channel_required";
  updatedAt: string;
}

export interface ProductNotificationItem {
  key: string;
  category: ProductNotificationCategory;
  title: string;
  summary: string;
  href: string;
  createdAt: string;
  revision: string;
  sourceType: "decision" | "deliverable_review" | "issue";
  sourceId: string;
}

export interface ProductNotificationsSnapshot {
  preferences: ProductNotificationPreferences;
  items: ProductNotificationItem[];
  counts: Record<ProductNotificationCategory, number>;
}

export interface UpdateProductNotificationPreferencesInput {
  categories: ProductNotificationCategory[];
  browserEnabled: boolean;
}

export interface ProductPushPublicConfig {
  enabled: boolean;
  publicKey: string | null;
}

export interface ProductPushSubscriptionInput {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
}
