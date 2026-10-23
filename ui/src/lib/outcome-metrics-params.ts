import type { OnboardingPath } from "@paperclipai/shared/productization/onboarding-journey";

export const OUTCOME_PATHS: OnboardingPath[] = ["entrepreneur", "agency", "commercial"];
export const OUTCOME_PERIODS = [7, 30, 90] as const;

export function parseOutcomePath(value: string | null): OnboardingPath | null {
  return OUTCOME_PATHS.find(path => path === value) ?? null;
}

export function parseOutcomePeriod(value: string | null): (typeof OUTCOME_PERIODS)[number] | null {
  return OUTCOME_PERIODS.find(days => String(days) === value) ?? null;
}
