import i18n, { type BackendModule, type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, isSupportedLocale, loadLocaleMessages, supportedLocales } from "./locales";

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  partialBundledLanguages: true,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

const localeBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    if (!isSupportedLocale(language)) {
      callback(new Error("Unsupported locale: " + language), false);
      return;
    }
    void loadLocaleMessages(language).then(
      (messages) => callback(null, messages),
      (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), false),
    );
  },
};

void i18n.use(localeBackend).use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
