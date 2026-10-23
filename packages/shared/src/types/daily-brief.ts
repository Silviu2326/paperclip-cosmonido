/** Sprint 3 WP13: daily owner brief. */
export type DailyBriefChannel = "email" | "whatsapp" | "none";

export interface DailyBriefPreference {
  id: string;
  companyId: string;
  userId: string;
  enabled: boolean;
  channel: DailyBriefChannel;
  hourLocal: number;
  timezone: string;
  deliveryAgentId: string | null;
  pendingTaskId: string | null;
  lastSentOn: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface DailyBriefItem {
  title: string;
  detail: string | null;
  link: string | null;
}

export interface DailyBrief {
  companyId: string;
  date: string;
  timezone: string;
  done: DailyBriefItem[];
  incoming: DailyBriefItem[];
  needsDecision: Array<DailyBriefItem & { decisionId: string; remoteUrl: string | null }>;
  commitmentsDue: DailyBriefItem[];
  cost: { todayCents: number; monthCents: number; currency: string };
  markdown: string;
}
