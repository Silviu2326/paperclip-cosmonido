import type { MediaOperation } from "../types/media-studio.js";

export const MEDIA_TEMPLATE_KINDS = ["clip", "demo", "testimonial", "tutorial", "advert"] as const;
export type MediaTemplateKind = (typeof MEDIA_TEMPLATE_KINDS)[number];

export interface MediaPresetBrandReferences {
  logoAssetId?: string | null;
  voiceAssetId?: string | null;
  voiceProviderReference?: string | null;
  musicAssetId?: string | null;
  musicLicenseReferenceUrl?: string | null;
}

export interface MediaPresetInputCriteria {
  acceptedContentTypes: string[];
  transcriptRequired: boolean;
  notes: string[];
}

export interface MediaPreset {
  id: string;
  companyId: string;
  presetKey: string;
  version: number;
  kind: MediaTemplateKind;
  outputAspect: "9:16" | "16:9";
  name: string;
  description: string | null;
  inputCriteria: MediaPresetInputCriteria;
  operations: MediaOperation[];
  brandReferences: MediaPresetBrandReferences;
  createdAt: string;
}

export interface CreateMediaPresetInput {
  presetKey: string;
  kind: MediaTemplateKind;
  outputAspect: "9:16" | "16:9";
  name: string;
  description?: string | null;
  inputCriteria: MediaPresetInputCriteria;
  operations: MediaOperation[];
  brandReferences?: MediaPresetBrandReferences;
}

export interface MediaProductionMetrics {
  periodDays: 7 | 30 | 90;
  completedJobs: number;
  jobsWithCostEvidence: number;
  jobsWithDurationEvidence: number;
  pricedCostCents: number;
  pricedMinutes: number;
  centsPerMinute: number | null;
  costCoveragePercent: number;
  durationCoveragePercent: number;
  basis: string;
}

const standardCriteria: MediaPresetInputCriteria = {
  acceptedContentTypes: ["video/*"],
  transcriptRequired: false,
  notes: ["Use a company file containing video the operator is authorized to process."],
};

export const BUILT_IN_MEDIA_TEMPLATES: Array<Omit<MediaPreset, "id" | "companyId" | "version" | "createdAt">> = [
  { presetKey: "clip", kind: "clip", outputAspect: "9:16", name: "Social clip", description: "Vertical short clip with pauses removed.", inputCriteria: standardCriteria, operations: [{ type: "remove_silences", thresholdDb: -35, minDurationMs: 700 }], brandReferences: {} },
  { presetKey: "demo", kind: "demo", outputAspect: "16:9", name: "Product demo", description: "Landscape product walkthrough.", inputCriteria: standardCriteria, operations: [{ type: "remove_silences", thresholdDb: -35, minDurationMs: 900 }], brandReferences: {} },
  { presetKey: "testimonial", kind: "testimonial", outputAspect: "9:16", name: "Customer testimonial", description: "Portrait testimonial with readable subtitles.", inputCriteria: { ...standardCriteria, transcriptRequired: true, notes: ["Transcribe this source in Media Studio before rendering subtitles."] }, operations: [{ type: "burn_subtitles", style: { font: "Inter", size: 42, color: "#FFFFFF", highlightColor: "#E7ECE2", position: "bottom" } }], brandReferences: {} },
  { presetKey: "tutorial", kind: "tutorial", outputAspect: "16:9", name: "Tutorial", description: "Landscape tutorial with subtitles.", inputCriteria: { ...standardCriteria, transcriptRequired: true, notes: ["Transcribe this source in Media Studio before rendering subtitles."] }, operations: [{ type: "burn_subtitles", style: { font: "Inter", size: 36, color: "#FFFFFF", highlightColor: "#E7ECE2", position: "bottom" } }], brandReferences: {} },
  { presetKey: "ad", kind: "advert", outputAspect: "9:16", name: "Short advert", description: "Vertical ad cut prepared for a short-form channel.", inputCriteria: standardCriteria, operations: [{ type: "remove_silences", thresholdDb: -35, minDurationMs: 500 }], brandReferences: {} },
];
