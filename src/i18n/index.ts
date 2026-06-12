import type { LanguageSetting } from "../types";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

export type ResolvedLanguage = "ru" | "en";
export type I18nParams = Record<string, string | number | boolean | null | undefined>;
export type TranslationKey = keyof typeof ru;
export type TranslateFn = (key: TranslationKey, params?: I18nParams) => string;

const TRANSLATIONS: Record<ResolvedLanguage, Record<TranslationKey, string>> = {
  ru,
  en
};

export const LANGUAGE_OPTIONS = [
  { value: "auto", labelKey: "language.auto" },
  { value: "ru", labelKey: "language.ru" },
  { value: "en", labelKey: "language.en" }
] as const satisfies ReadonlyArray<{ value: LanguageSetting; labelKey: TranslationKey }>;

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === "auto" || value === "ru" || value === "en";
}

export function getBrowserLanguage() {
  if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }

  if (typeof navigator !== "undefined") {
    return navigator.language;
  }

  return undefined;
}

export function resolveLanguage(language: LanguageSetting | undefined, browserLanguage = getBrowserLanguage()) {
  if (language === "ru" || language === "en") {
    return language;
  }

  const normalizedBrowserLanguage = browserLanguage?.toLowerCase() ?? "";

  if (normalizedBrowserLanguage.startsWith("en")) {
    return "en";
  }

  return "ru";
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

export function translate(language: ResolvedLanguage, key: TranslationKey, params?: I18nParams) {
  const template = TRANSLATIONS[language][key] ?? TRANSLATIONS.ru[key] ?? key;
  return interpolate(template, params);
}

export function getTranslator(language: LanguageSetting | undefined): TranslateFn {
  const resolvedLanguage = resolveLanguage(language);
  return (key, params) => translate(resolvedLanguage, key, params);
}

export class I18nError extends Error {
  readonly i18nKey: TranslationKey;
  readonly i18nParams?: I18nParams;

  constructor(i18nKey: TranslationKey, i18nParams?: I18nParams) {
    super(i18nKey);
    this.name = "I18nError";
    this.i18nKey = i18nKey;
    this.i18nParams = i18nParams;
  }
}

export function isI18nError(error: unknown): error is I18nError {
  return error instanceof I18nError || (typeof error === "object" && error !== null && "i18nKey" in error);
}

export function getLocalizedErrorMessage(
  error: unknown,
  t: TranslateFn,
  fallbackKey: TranslationKey = "errors.generic"
) {
  if (isI18nError(error)) {
    const candidate = error as { i18nKey: TranslationKey; i18nParams?: I18nParams };
    return t(candidate.i18nKey, candidate.i18nParams);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return t(fallbackKey);
}
