import type {
  CustomerPortalCreateInput, CustomerPortalCreated, CustomerPortalFeedbackInput, CustomerPortalFeedbackRecord, CustomerPortalFileRecord, CustomerPortalGrant,
  CustomerPortalResourceKind, CustomerPortalUploadReceipt, PublicCustomerPortalData,
} from "@paperclipai/shared/productization/customer-portal";
import { api, requestResponse } from "./client";
import { readApiJson } from "./response";

export const customerPortalApi = {
  create: (companyId: string, input: CustomerPortalCreateInput) =>
    api.post<CustomerPortalCreated>(`/companies/${companyId}/customer-portals`, input),
  list: (companyId: string, customerId: string) =>
    api.get<CustomerPortalGrant[]>(`/companies/${companyId}/customers/${customerId}/customer-portals`),
  revoke: (companyId: string, portalId: string) =>
    api.post<CustomerPortalGrant>(`/companies/${companyId}/customer-portals/${portalId}/revoke`, {}),
  feedback: (companyId: string, portalId: string) => api.get<CustomerPortalFeedbackRecord[]>(`/companies/${companyId}/customer-portals/${portalId}/feedback`),
  files: (companyId: string, customerId: string) =>
    api.get<CustomerPortalFileRecord[]>(`/companies/${companyId}/customers/${customerId}/customer-portal-files`),
  shareFile: (companyId: string, customerId: string, file: File, contactId?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    if (contactId) form.append("contactId", contactId);
    return api.postForm<CustomerPortalFileRecord>(`/companies/${companyId}/customers/${customerId}/customer-portal-files`, form);
  },
  setFileVisibility: (companyId: string, fileId: string, visible: boolean) =>
    api.post<CustomerPortalFileRecord>(`/companies/${companyId}/customer-portal-files/${fileId}/visibility`, { visible }),
  async downloadFile(companyId: string, fileId: string) {
    const response = await requestResponse(`/companies/${companyId}/customer-portal-files/${fileId}/content`);
    return response.blob();
  },
  /** The same idempotency key must be reused when retrying one selected file, so a retry never duplicates it. */
  async publicUploadFile(portalId: string, token: string, file: File, idempotencyKey: string) {
    const form = new FormData();
    form.append("file", file);
    const response = await requestResponse(`/public/customer-portals/${portalId}/files`, {
      method: "POST", headers: { "X-Paperclip-Customer-Portal": token, "Idempotency-Key": idempotencyKey }, body: form,
    });
    return readApiJson<CustomerPortalUploadReceipt>(response);
  },
  async publicDownloadFile(portalId: string, token: string, reference: string) {
    const response = await requestResponse(`/public/customer-portals/${portalId}/files/${encodeURIComponent(reference)}/content`, {
      headers: { "X-Paperclip-Customer-Portal": token }, cache: "no-store",
    });
    return response.blob();
  },
  async publicGet(portalId: string, token: string) {
    const response = await requestResponse(`/public/customer-portals/${portalId}`, {
      headers: { "X-Paperclip-Customer-Portal": token }, cache: "no-store",
    });
    return readApiJson<PublicCustomerPortalData>(response);
  },
  async publicComment(portalId: string, token: string, conversationRef: string, body: string) {
    const response = await requestResponse(`/public/customer-portals/${portalId}/comments`, {
      method: "POST", headers: { "X-Paperclip-Customer-Portal": token, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationRef, body }),
    });
    return readApiJson<{ accepted: boolean }>(response);
  },
  async acceptProposal(portalId: string, token: string, input: { proposalReference: string; revision: number; name: string; email: string }) {
    const response = await requestResponse(`/public/customer-portals/${portalId}/proposal-acceptances`, {
      method: "POST", headers: { "X-Paperclip-Customer-Portal": token, "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
    return readApiJson<{ accepted: boolean; title: string; revision: number; status: string }>(response);
  },
  async publicDeliverableFeedback(portalId: string, token: string, input: CustomerPortalFeedbackInput) {
    const response = await requestResponse(`/public/customer-portals/${portalId}/deliverable-feedback`, {
      method: "POST", headers: { "X-Paperclip-Customer-Portal": token, "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
    return readApiJson<{ accepted: boolean; feedback: CustomerPortalFeedbackRecord }>(response);
  },
};

export const customerPortalKinds: CustomerPortalResourceKind[] = ["deliverables", "proposals", "meetings", "conversations", "commitments", "files"];
