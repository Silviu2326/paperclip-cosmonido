/** Canonicalize BCP-47 tags, accepting underscores from provider APIs. */
export function normalizeLanguageTag(tag: string): string {
  const value = tag.trim().replace(/_/g, "-");
  if (!value) return "";
  try { return Intl.getCanonicalLocales(value)[0]; }
  catch { return value.toLowerCase(); }
}

/** Return the primary language subtag. */
export function primaryLanguage(tag: string): string {
  return normalizeLanguageTag(tag).split("-")[0];
}

/** Compare languages independent of region and script. */
export function languageMatches(a: string, b: string): boolean {
  return Boolean(primaryLanguage(a)) && primaryLanguage(a) === primaryLanguage(b);
}

/** Common synthesis languages, with English and native display names. */
export const LANGUAGES: Array<{ tag: string; name: string; nativeName: string }> = [
  ["es-ES", "Spanish (Spain)", "Español (España)"],
  ["es-MX", "Spanish (Mexico)", "Español (México)"],
  ["es-419", "Spanish (Latin America)", "Español (Latinoamérica)"],
  ["en-US", "English (US)", "English (US)"],
  ["en-GB", "English (UK)", "English (UK)"],
  ["en-AU", "English (Australia)", "English (Australia)"],
  ["en-IN", "English (India)", "English (India)"],
  ["pt-BR", "Portuguese (Brazil)", "Português (Brasil)"],
  ["pt-PT", "Portuguese (Portugal)", "Português (Portugal)"],
  ["fr-FR", "French (France)", "Français (France)"],
  ["fr-CA", "French (Canada)", "Français (Canada)"],
  ["de-DE", "German", "Deutsch"], ["it-IT", "Italian", "Italiano"],
  ["nl-NL", "Dutch", "Nederlands"], ["pl-PL", "Polish", "Polski"],
  ["ru-RU", "Russian", "Русский"], ["uk-UA", "Ukrainian", "Українська"],
  ["tr-TR", "Turkish", "Türkçe"], ["ar-SA", "Arabic", "العربية"],
  ["he-IL", "Hebrew", "עברית"], ["hi-IN", "Hindi", "हिन्दी"],
  ["bn-IN", "Bengali", "বাংলা"], ["ta-IN", "Tamil", "தமிழ்"],
  ["te-IN", "Telugu", "తెలుగు"], ["mr-IN", "Marathi", "मराठी"],
  ["ur-PK", "Urdu", "اردو"], ["id-ID", "Indonesian", "Bahasa Indonesia"],
  ["ms-MY", "Malay", "Bahasa Melayu"], ["vi-VN", "Vietnamese", "Tiếng Việt"],
  ["th-TH", "Thai", "ไทย"], ["ja-JP", "Japanese", "日本語"],
  ["ko-KR", "Korean", "한국어"], ["zh-CN", "Chinese (Simplified)", "简体中文"],
  ["zh-TW", "Chinese (Traditional)", "繁體中文"], ["yue-HK", "Cantonese", "粵語"],
  ["fil-PH", "Filipino", "Filipino"], ["sv-SE", "Swedish", "Svenska"],
  ["da-DK", "Danish", "Dansk"], ["nb-NO", "Norwegian Bokmål", "Norsk bokmål"],
  ["fi-FI", "Finnish", "Suomi"], ["cs-CZ", "Czech", "Čeština"],
  ["sk-SK", "Slovak", "Slovenčina"], ["hu-HU", "Hungarian", "Magyar"],
  ["ro-RO", "Romanian", "Română"], ["bg-BG", "Bulgarian", "Български"],
  ["el-GR", "Greek", "Ελληνικά"], ["hr-HR", "Croatian", "Hrvatski"],
  ["ca-ES", "Catalan", "Català"], ["eu-ES", "Basque", "Euskara"],
  ["gl-ES", "Galician", "Galego"], ["sw-KE", "Swahili", "Kiswahili"],
].map(([tag, name, nativeName]) => ({ tag, name, nativeName }));

/** Resolve an English display name, falling back to the canonical tag. */
export function languageName(tag: string): string {
  const canonical = normalizeLanguageTag(tag);
  const known = LANGUAGES.find((language) => language.tag === canonical);
  if (known) return known.name;
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(canonical) ?? canonical; }
  catch { return canonical; }
}
