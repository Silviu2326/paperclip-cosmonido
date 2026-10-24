import { useCallback, useEffect, useMemo, useState } from "react";
import { INITIAL, validate, type Form, type FormErrors, type SetField, type SettingsCtx } from "./sections";
import { ADMIN_LOCKED, buildSettingsData, type SettingsScenario } from "./scenarios";
import { SETTINGS_GROUPS } from "./demo-data";

/** Which group each form field belongs to (for the "unsaved changes" message and error dots). */
export const KEY_GROUP: Record<keyof Form, string> = {
  name: "profile", language: "profile", business: "profile", agenda: "profile", office: "profile",
  categories: "notifications", browser: "notifications", brief: "notifications", briefHour: "notifications",
  twoFactor: "security",
  companyName: "company", approvals: "company", retention: "company", retentionDays: "company",
};

const LONG_NAME = "José Ángel Ñandú-Øvergård de la Cruz y Martínez de Todos los Santos ✨ (山田)";
const LONG_COMPANY = "Cosmonido Studio Sociedad Limitada Unipersonal — Agencia de marketing, vídeo y automatización para pequeños negocios";

function initialState(scenario: SettingsScenario): { form: Form; saved: Form; errors: FormErrors } {
  switch (scenario) {
    case "save-error": {
      const form = { ...INITIAL, name: "", companyName: "C", retention: true, retentionDays: "7" };
      return { form, saved: INITIAL, errors: validate(form) };
    }
    case "unsaved-leave":
      return { form: { ...INITIAL, name: "Silviu Hasta", language: "English", agenda: true }, saved: INITIAL, errors: {} };
    case "session-expired":
      return { form: { ...INITIAL, name: "Silviu H." }, saved: INITIAL, errors: {} };
    case "long-text": {
      const form = { ...INITIAL, name: LONG_NAME, companyName: LONG_COMPANY };
      return { form, saved: form, errors: {} };
    }
    case "locked-by-admin": {
      const form = { ...INITIAL, twoFactor: true, office: false };
      return { form, saved: form, errors: {} };
    }
    default:
      return { form: INITIAL, saved: INITIAL, errors: {} };
  }
}

/**
 * State shared by the three Ajustes variants: the form with its saved copy,
 * validation, a notice, the confirmations and the 2FA wizard. Variant A saves
 * explicitly, variant B saves each field as it changes (`autoSet`).
 */
export function useSettingsState(scenario: SettingsScenario) {
  const data = useMemo(() => buildSettingsData(scenario), [scenario]);
  const start = useMemo(() => initialState(scenario), [scenario]);
  const [form, setForm] = useState<Form>(start.form);
  const [saved, setSaved] = useState<Form>(start.saved);
  const [errors, setErrors] = useState<FormErrors>(start.errors);
  const [justSaved, setJustSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [danger, setDanger] = useState<"session" | "account" | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(scenario === "unsaved-leave");
  const [expired, setExpired] = useState(scenario === "session-expired");
  const [wizardOpen, setWizardOpen] = useState(scenario === "two-factor");
  const [wizardStart, setWizardStart] = useState(scenario === "two-factor" ? 1 : 0);
  const locked = useMemo<ReadonlySet<string>>(() => new Set(scenario === "locked-by-admin" ? ADMIN_LOCKED : []), [scenario]);

  const changedKeys = (Object.keys(form) as (keyof Form)[]).filter((key) => JSON.stringify(form[key]) !== JSON.stringify(saved[key]));
  const dirty = changedKeys.length > 0;
  const changedGroups = [...new Set(changedKeys.map((key) => SETTINGS_GROUPS.find((group) => group.id === KEY_GROUP[key])!.label))];

  useEffect(() => {
    if (!justSaved && !notice) return;
    const timer = window.setTimeout(() => { setJustSaved(false); setNotice(null); }, 3200);
    return () => window.clearTimeout(timer);
  }, [justSaved, notice]);

  const set: SetField = useCallback((key, value) => {
    setJustSaved(false);
    setErrors((current) => { if (!(key in current)) return current; const next = { ...current }; delete next[key]; return next; });
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  /** Variant B: validate the one field and save it on the spot. Returns false (and shows the error) if it is invalid. */
  const autoSet: SetField = useCallback((key, value) => {
    const next = { ...form, [key]: value } as Form;
    const problems = validate(next);
    setForm(next);
    if (problems[key]) { setErrors((current) => ({ ...current, [key]: problems[key] })); return; }
    setErrors((current) => { if (!(key in current)) return current; const copy = { ...current }; delete copy[key]; return copy; });
    setSaved((current) => ({ ...current, [key]: value }));
  }, [form]);

  function save(): boolean {
    const problems = validate(form);
    setErrors(problems);
    if (Object.keys(problems).length) { setJustSaved(false); return false; }
    setSaved(form);
    setJustSaved(true);
    return true;
  }
  function discard() { setForm(saved); setErrors({}); }

  const ctx: SettingsCtx = {
    data, errors, locked,
    wizard: { open: wizardOpen, startStep: wizardStart, show: () => { setWizardStart(0); setWizardOpen(true); }, close: () => setWizardOpen(false) },
    onDanger: setDanger,
  };

  return { data, form, saved, errors, set, autoSet, save, discard, dirty, changedKeys, changedGroups, justSaved, notice, setNotice, danger, setDanger, leaveOpen, setLeaveOpen, expired, setExpired, locked, ctx };
}

export type SettingsState = ReturnType<typeof useSettingsState>;
