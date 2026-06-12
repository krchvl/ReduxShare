import type { LanguageSetting } from "./model";

type ContentResolvedLanguage = "ru" | "en";
type ContentI18nParams = Record<string, string | number | boolean | null | undefined>;

const CONTENT_TRANSLATIONS = {
  ru: {
    "quiz.menu.internalSources": "Внутренние источники",
    "quiz.menu.externalSources": "Внешние источники",
    "quiz.menu.aiTools": "Инструменты ИИ",
    "quiz.menu.exactAnswer": "Точный ответ",
    "quiz.menu.statistics": "Статистика",
    "quiz.menu.sendAiRequest": "Отправить запрос",
    "quiz.menu.aiAnswer": "Полученный ответ",
    "quiz.menu.aiSettingsMissing": "Настройки ИИ не сохранены",
    "quiz.menu.aiLoading": "Идёт запрос...",
    "quiz.menu.aiQuestionMissing": "Не удалось прочитать вопрос",
    "quiz.menu.empty": "Нет ответов",
    "quiz.ordering.position": "Позиция {position}"
  },
  en: {
    "quiz.menu.internalSources": "Internal sources",
    "quiz.menu.externalSources": "External sources",
    "quiz.menu.aiTools": "AI tools",
    "quiz.menu.exactAnswer": "Exact answer",
    "quiz.menu.statistics": "Statistics",
    "quiz.menu.sendAiRequest": "Send request",
    "quiz.menu.aiAnswer": "Received answer",
    "quiz.menu.aiSettingsMissing": "AI settings are not saved",
    "quiz.menu.aiLoading": "Request in progress...",
    "quiz.menu.aiQuestionMissing": "Could not read the question",
    "quiz.menu.empty": "No answers",
    "quiz.ordering.position": "Position {position}"
  }
} as const;

export type ContentTranslationKey = keyof typeof CONTENT_TRANSLATIONS.ru;
export type TranslateFn = (key: ContentTranslationKey, params?: ContentI18nParams) => string;

function getContentBrowserLanguage() {
  if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }

  if (typeof navigator !== "undefined") {
    return navigator.language;
  }

  return undefined;
}

function resolveContentLanguage(
  language: LanguageSetting | undefined,
  browserLanguage = getContentBrowserLanguage()
): ContentResolvedLanguage {
  if (language === "ru" || language === "en") {
    return language;
  }

  return (browserLanguage?.toLowerCase() ?? "").startsWith("en") ? "en" : "ru";
}

function interpolateContentTranslation(template: string, params: ContentI18nParams | undefined) {
  if (!params) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === null || value === undefined ? match : String(value);
  });
}

export function getContentTranslator(language: LanguageSetting | undefined): TranslateFn {
  const resolvedLanguage = resolveContentLanguage(language);

  return (key, params) => {
    const template = CONTENT_TRANSLATIONS[resolvedLanguage][key] ?? CONTENT_TRANSLATIONS.ru[key] ?? key;
    return interpolateContentTranslation(template, params);
  };
}
