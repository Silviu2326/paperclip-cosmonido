import type {
  Conversation,
  ConversationMessage,
  CreateConversationMessage,
  CrmListQuery,
  SetConversationState,
} from "@paperclipai/shared";
import { api } from "./client";
import type { CrmPage } from "./crm";

function withQuery(path: string, query?: Partial<CrmListQuery>) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const conversationsApi = {
  list: (companyId: string, query?: Partial<CrmListQuery>) =>
    api.get<CrmPage<Conversation>>(withQuery(`/companies/${companyId}/conversations`, query)),
  get: (id: string) => api.get<Conversation & { messages: ConversationMessage[] }>(`/conversations/${id}`),
  sendMessage: (id: string, data: CreateConversationMessage) =>
    api.post<ConversationMessage>(`/conversations/${id}/messages`, data),
  setState: (id: string, data: SetConversationState) => api.patch<Conversation>(`/conversations/${id}/state`, data),
  assign: (id: string, data: { assignedUserId?: string | null; assignedAgentId?: string | null }) =>
    api.post<Conversation>(`/conversations/${id}/assign`, data),
};
