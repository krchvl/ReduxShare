import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { LanguageSetting } from "../types";
import { getTranslator, resolveLanguage, type ResolvedLanguage, type TranslateFn } from "./index";

interface I18nContextValue {
  language: LanguageSetting;
  resolvedLanguage: ResolvedLanguage;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  language: LanguageSetting;
  children: ReactNode;
}

export function I18nProvider({ language, children }: I18nProviderProps) {
  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      resolvedLanguage: resolveLanguage(language),
      t: getTranslator(language)
    }),
    [language]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("I18nProvider is missing.");
  }

  return value;
}
