import type {
  Conversation,
  ConversationMessage,
  CreateConversationMessage,
  SetConversationState,
} from "@paperclipai/shared";
import { api } from "./client";
import type { CrmPage } from "./crm";

export interface ConversationFilters {
  status?: string;
  channel?: string;
  /** "none" for unassigned; otherwise an assigned user or agent id. */
  assigned?: string;
  overdue?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ConversationDetail extends Conversation {
  messages: ConversationMessage[];
}

export interface SendOutcome {
  message: ConversationMessage;
  action: { id: string; status: string; mode: string } | null;
  mode: "draft" | "approval" | "direct" | null;
}

function withQuery(path: string, query?: ConversationFilters) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "" && value !== false) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const conversationsApi = {
  list: (companyId: string, query?: ConversationFilters) =>
    api.get<CrmPage<Conversation>>(withQuery(`/companies/${companyId}/conversations`, query)),
  get: (id: string) => api.get<ConversationDetail>(`/conversations/${id}`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Conversation>(`/companies/${companyId}/conversations`, data),
  draft: (conversationId: string, data: CreateConversationMessage) =>
    api.post<ConversationMessage>(`/conversations/${conversationId}/messages`, data),
  send: (messageId: string) => api.post<SendOutcome>(`/messages/${messageId}/send`, {}),
  reconcile: (
    messageId: string,
    data?: { outcome?: "sent" | "failed"; providerMessageId?: string | null },
  ) => api.post<ConversationMessage>(`/messages/${messageId}/reconcile`, data ?? {}),
  setState: (id: string, data: SetConversationState) => api.patch<Conversation>(`/conversations/${id}/state`, data),
  assign: (id: string, data: { assignedUserId?: string | null; assignedAgentId?: string | null }) =>
    api.post<Conversation>(`/conversations/${id}/assign`, data),
  link: (id: string, data: { customerId?: string | null; opportunityId?: string | null; leadId?: string | null }) =>
    api.post<Conversation>(`/conversations/${id}/link`, data),
};
