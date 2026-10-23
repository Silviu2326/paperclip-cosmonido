import type { Resource } from "i18next";

import en from "./locales/en.json";
import es from "./locales/es.json";
import { assertValidLocaleMessages } from "./locale-validation";
import {
  productizationMessagesEn,
  productizationMessagesEs,
  productizationMessagesPt,
} from "./productization-messages";

export const DEFAULT_LOCALE = "es" as const;

// Spanish is the default; English is the validation reference. Other locale
// dictionaries stay in separate chunks until i18next requests that language.
const localeModules = import.meta.glob("./locales/*.json", {
  import: "default",
}) as Record<string, () => Promise<unknown>>;

export const localeMessages: Record<string, unknown> = { en, es };

if (!(DEFAULT_LOCALE in localeMessages)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

type MessageTree = Record<string, unknown>;

function isPlainObject(value: unknown): value is MessageTree {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Pure additive merge: keeps every existing message and adds only keys that
 * are missing. Objects merge recursively, so `nav`, `common` and `agent` keep
 * their existing entries. Neither input is mutated.
 */
function mergeMissingMessages(existing: MessageTree, additions: MessageTree): MessageTree {
  const merged: MessageTree = { ...existing };
  for (const [key, addition] of Object.entries(additions)) {
    const current = merged[key];
    if (current === undefined) {
      merged[key] = addition;
    } else if (isPlainObject(current) && isPlainObject(addition)) {
      merged[key] = mergeMissingMessages(current, addition);
    }
  }
  return merged;
}

// English reference after the S4 merge: every merged locale must match its key set.
const englishMessages = mergeMissingMessages(en, productizationMessagesEn);

// Locales without their own S4 dictionary receive the English text as fallback.
const productizationByLocale: Record<string, MessageTree> = {
  es: productizationMessagesEs,
  en: productizationMessagesEn,
  "pt-BR": productizationMessagesPt,
  "pt-PT": productizationMessagesPt,
};

const mergedLocaleMessages: Record<string, MessageTree> = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => {
    const merged = mergeMissingMessages(
      messages as MessageTree,
      productizationByLocale[locale] ?? productizationMessagesEn,
    );
    try {
      assertValidLocaleMessages(merged, englishMessages);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid ${locale} locale messages after S4 merge: ${message}`);
    }
    return [locale, merged];
  }),
) as Record<string, MessageTree>;

export const supportedLocales = [
  "ar", "bn", "cs", "da", "de", "el", "en", "es", "fa", "fi", "fil", "fr", "he", "hi", "hu", "id", "it", "ja", "ko", "mr", "ms", "nb", "nl", "pa", "pl", "pt-BR", "pt-PT", "ro", "ru", "sv", "sw", "ta", "te", "th", "tr", "uk", "ur", "vi", "zh-CN", "zh-TW",
] as const;

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(mergedLocaleMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

export type SupportedLocale = (typeof supportedLocales)[number];

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && supportedLocales.includes(value as SupportedLocale);
}

const pendingLocaleMessages = new Map<SupportedLocale, Promise<MessageTree>>();

/** Load and validate a dictionary only when the user requests its language. */
export async function loadLocaleMessages(locale: SupportedLocale): Promise<MessageTree> {
  if (!isSupportedLocale(locale)) throw new Error("Unsupported locale: " + locale);
  const existing = mergedLocaleMessages[locale];
  if (existing) return existing;
  const pending = pendingLocaleMessages.get(locale);
  if (pending) return pending;
  const loader = localeModules["./locales/" + locale + ".json"];
  if (!loader) throw new Error("Missing locale messages for " + locale);
  const loading = loader().then((messages) => {
    assertValidLocaleMessages(messages);
    const merged = mergeMissingMessages(
      messages as MessageTree,
      productizationByLocale[locale] ?? productizationMessagesEn,
    );
    assertValidLocaleMessages(merged, englishMessages);
    localeMessages[locale] = messages;
    mergedLocaleMessages[locale] = merged;
    return merged;
  }).catch((error: unknown) => {
    pendingLocaleMessages.delete(locale);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error("Invalid " + locale + " locale messages: " + message);
  });
  pendingLocaleMessages.set(locale, loading);
  return loading;
}

const LOCALE_PREFERENCE_KEY_PREFIX = "paperclip.locale";

function localePreferenceKey(userId: string) {
  return `${LOCALE_PREFERENCE_KEY_PREFIX}.${userId}`;
}

/**
 * The locale this browser saved for one user. Keyed by user id, so another
 * account on the same browser never receives it. Unreadable storage yields
 * null (the default locale), matching ThemeContext.
 */
export function readStoredLocalePreference(userId: string): SupportedLocale | null {
  try {
    const stored = window.localStorage.getItem(localePreferenceKey(userId));
    return isSupportedLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Throws when storage is unavailable so the caller can report it. */
export function writeStoredLocalePreference(userId: string, locale: SupportedLocale) {
  window.localStorage.setItem(localePreferenceKey(userId), locale);
}
