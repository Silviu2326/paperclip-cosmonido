import { api } from "./client";

export type ConversationDispatchSettings = { enabled: boolean; agentId: string; responsibleUserId: string };

export const conversationDispatchApi = {
  get: (companyId: string) => api.get<ConversationDispatchSettings | null>(`/companies/${companyId}/conversation-agent-dispatch`),
  save: (companyId: string, settings: ConversationDispatchSettings) => api.put<ConversationDispatchSettings>(`/companies/${companyId}/conversation-agent-dispatch`, settings),
};
