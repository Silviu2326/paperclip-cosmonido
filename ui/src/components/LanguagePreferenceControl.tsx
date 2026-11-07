import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { useTranslation } from "@/i18n";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  readStoredLocalePreference,
  writeStoredLocalePreference,
  type SupportedLocale,
} from "@/i18n/locales";

// Native names stay untranslated so each language can be found in its own script.
const LANGUAGE_OPTIONS: Array<{ value: SupportedLocale; label: string }> = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
];

type LanguageMessageKey = "saved" | "noSession" | "saveError" | "applyError";
const languageMessageKeys: Record<LanguageMessageKey, `languageSettings.${LanguageMessageKey}`> = {
  saved: "languageSettings.saved",
  noSession: "languageSettings.noSession",
  saveError: "languageSettings.saveError",
  applyError: "languageSettings.applyError",
};

/**
 * Applies the signed-in user's saved language, or the default when nobody is
 * signed in. Mount it where the session is known, so a previous account's
 * language never survives an account switch. Company selection is not an input.
 */
export function useLanguagePreferenceSync(userId: string | null | undefined) {
  const { i18n } = useTranslation();
  useEffect(() => {
    if (userId === undefined) return;
    const locale = (userId ? readStoredLocalePreference(userId) : null) ?? DEFAULT_LOCALE;
    if (i18n.language === locale) return;
    let cancelled = false;
    // Load first without changing global language. An account switch can cancel
    // this effect while its dictionary is still downloading.
    void i18n.loadLanguages(locale).then(() => {
      if (!cancelled) return i18n.changeLanguage(locale);
    }).catch((error: unknown) => {
      if (!cancelled) console.error("Failed to apply the saved language", error);
    });
    return () => { cancelled = true; };
  }, [i18n, userId]);
}

/**
 * Language selector for the signed-in user. The session owner is passed in so
 * the host page keeps a single session query; `null` means nobody is signed in
 * and the choice only applies to this tab.
 */
export function LanguagePreferenceControl({ userId }: { userId: string | null }) {
  const { t, i18n } = useTranslation();
  const currentUserId = useRef(userId);
  currentUserId.current = userId;
  const [pending, setPending] = useState(false);
  // Stored as a key, not text, so the message re-renders in the new language.
  const [message, setMessage] = useState<{ tone: "status" | "alert"; key: LanguageMessageKey } | null>(null);
  const current = isSupportedLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;

  async function selectLanguage(locale: SupportedLocale) {
    if (pending || locale === current) return;
    setPending(true);
    setMessage(null);
    try {
      await i18n.loadLanguages(locale);
      if (currentUserId.current !== userId) { setPending(false); return; }
      await i18n.changeLanguage(locale);
      if (currentUserId.current !== userId) { setPending(false); return; }
    } catch {
      setPending(false);
      setMessage({ tone: "alert", key: "applyError" });
      return;
    }
    if (!userId) {
      setMessage({ tone: "status", key: "noSession" });
    } else {
      try {
        writeStoredLocalePreference(userId, locale);
        setMessage({ tone: "status", key: "saved" });
      } catch {
        setMessage({ tone: "alert", key: "saveError" });
      }
    }
    setPending(false);
  }

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <Label htmlFor="language-settings-locale">{t("languageSettings.label")}</Label>
      <NativeSelect
        id="language-settings-locale"
        value={current}
        disabled={pending}
        onChange={(event) => {
          const locale = event.target.value;
          if (isSupportedLocale(locale)) void selectLanguage(locale);
        }}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </NativeSelect>
      <p className="text-xs text-muted-foreground">{t("languageSettings.scopeNote")} {t("languageSettings.partialNote")}</p>
      {message ? (
        <p
          role={message.tone === "alert" ? "alert" : "status"}
          className={message.tone === "alert" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {t(languageMessageKeys[message.key])}
        </p>
      ) : null}
    </div>
  );
}
