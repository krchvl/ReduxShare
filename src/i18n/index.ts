import type { LanguageSetting } from "../types";
import {
  createTranslator,
  resolveLanguage,
  translateKey,
  type I18nParams,
  type ResolvedLanguage,
  type Translator
} from "../shared/i18nCore";
import en from "./locales/en.json";
import ru from "./locales/ru.json";

export type { I18nParams, ResolvedLanguage };
export { resolveLanguage };

export type TranslationKey = keyof typeof ru;
export type TranslateFn = Translator<TranslationKey>;

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

export function translate(language: ResolvedLanguage, key: TranslationKey, params?: I18nParams) {
  return translateKey(TRANSLATIONS, language, key, params);
}

export function getTranslator(language: LanguageSetting | undefined): TranslateFn {
  return createTranslator(TRANSLATIONS, language);
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

export function getRequestErrorMessage(
  error: unknown,
  language: LanguageSetting | undefined,
  fallbackKey: TranslationKey = "errors.externalRequest"
) {
  return getLocalizedErrorMessage(error, getTranslator(language), fallbackKey);
}
