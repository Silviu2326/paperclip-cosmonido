import { api } from "@/api/client";
import type { PublicCatalogSelection } from "@paperclipai/shared/productization/public-catalog";
import type { PortablePackage } from "@paperclipai/shared/productization/portable-package";

export interface PublicCatalogEntry { id: string; packageKey: string; packageVersion: string; name: string; description: string; contentHash: string; package: PortablePackage; ratingCount: number; averageRating: number | null; installationCount: number; createdAt: string }
export const publicCatalogApi = {
  list: (signal?: AbortSignal) => api.get<{ items: PublicCatalogEntry[]; nextCursor: string | null }>("/catalog/public", { signal }),
  privatePackages: (companyId: string, signal?: AbortSignal) => api.get<Array<{ id: string; name: string; packageKey: string; packageVersion: string; status: string }>>(`/companies/${companyId}/productization/catalog/packages`, { signal }),
  privatePackage: (companyId: string, packageId: string, signal?: AbortSignal) => api.get<{ content: PortablePackage }>(`/companies/${companyId}/productization/catalog/packages/${packageId}`, { signal }),
  installations: (companyId: string, signal?: AbortSignal) => api.get<Array<{ id: string; packageKey: string; packageVersion: string; status: string }>>(`/companies/${companyId}/productization/catalog/installations`, { signal }),
  request: (companyId: string, packageId: string, selection: PublicCatalogSelection) => api.post(`/companies/${companyId}/productization/catalog/public-request`, { packageId, selection, attested: true }),
  importDraft: (companyId: string, listingId: string) => api.post(`/companies/${companyId}/productization/catalog/public-import`, { listingId }),
  rate: (companyId: string, listingId: string, installationId: string, rating: number) => api.post(`/companies/${companyId}/productization/catalog/public-ratings`, { listingId, installationId, rating }),
  reviewQueue: (signal?: AbortSignal) => api.get<Array<{ id: string; packageKey: string; packageVersion: string; name: string; description: string; contentHash: string; package: PortablePackage }>>("/productization/public-catalog/review-queue", { signal }),
  moderationQueue: (signal?: AbortSignal) => api.get<Array<{ id: string; listingId: string; packageName: string; rating: number; review: string | null; status: "visible" | "hidden"; createdAt: string }>>("/productization/public-catalog/ratings", { signal }),
  decide: (listingId: string, expectedContentHash: string, decision: "approve" | "reject") => api.post(`/productization/public-catalog/${listingId}/review`, { expectedContentHash, decision }),
  moderate: (ratingId: string, visible: boolean) => api.post(`/productization/public-catalog/ratings/${ratingId}/moderate`, { visible }),
};
