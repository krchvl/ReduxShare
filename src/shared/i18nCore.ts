import type { LanguageSetting } from "../types";

export type ResolvedLanguage = "ru" | "en";
export type I18nParams = Record<string, string | number | boolean | null | undefined>;
export type TranslationTable<TKey extends string> = Record<ResolvedLanguage, Record<TKey, string>>;
export type Translator<TKey extends string> = (key: TKey, params?: I18nParams) => string;

export function getBrowserLanguage() {
  if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }

  if (typeof navigator !== "undefined") {
    return navigator.language;
  }

  return undefined;
}

export function resolveLanguage(
  language: LanguageSetting | undefined,
  browserLanguage = getBrowserLanguage()
): ResolvedLanguage {
  if (language === "ru" || language === "en") {
    return language;
  }

  return (browserLanguage?.toLowerCase() ?? "").startsWith("en") ? "en" : "ru";
}

function interpolate(template: string, params: I18nParams | undefined) {
  if (!params) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? match : String(value);
  });
}

export function translateKey<TKey extends string>(
  table: TranslationTable<TKey>,
  language: ResolvedLanguage,
  key: TKey,
  params?: I18nParams
) {
  const template = table[language][key] ?? table.ru[key] ?? key;
  return interpolate(template, params);
}

export function createTranslator<TKey extends string>(
  table: TranslationTable<TKey>,
  language: LanguageSetting | undefined
): Translator<TKey> {
  const resolvedLanguage = resolveLanguage(language);
  return (key, params) => translateKey(table, resolvedLanguage, key, params);
}
