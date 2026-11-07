import { lazy, Suspense, useEffect, useState } from "react";
import { useDialogState } from "../context/DialogContext";

const OnboardingWizard = lazy(() => import("./OnboardingWizard").then((module) => ({ default: module.OnboardingWizard })));

/** Load on first use, then keep the wizard mounted to preserve its draft state. */
export function OnboardingWizardVariant() {
  const { onboardingOpen } = useDialogState();
  const [activated, setActivated] = useState(onboardingOpen);
  useEffect(() => { if (onboardingOpen) setActivated(true); }, [onboardingOpen]);
  if (!onboardingOpen && !activated) return null;
  return <Suspense fallback={null}><OnboardingWizard /></Suspense>;
}
