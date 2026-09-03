import type { LanguageSetting } from "./model";

type ContentResolvedLanguage = "ru" | "en";
type ContentI18nParams = Record<string, string | number | boolean | null | undefined>;

const CONTENT_TRANSLATIONS = {
  ru: {
    "quiz.panel.user": "Пользователь",
    "quiz.panel.time": "До окончания теста",
    "quiz.panel.total": "Всего заданий",
    "quiz.panel.parsed": "Успешно спарсено",
    "quiz.panel.withAnswers": "С ответами",
    "quiz.panel.failed": "Без ответов",
    "quiz.panel.guest": "Гость",
    "quiz.panel.unlimited": "Не ограничено",
    "quiz.panel.subtitle": "Обзор попытки",
    "quiz.panel.collapse": "Свернуть панель",
    "quiz.panel.expand": "Развернуть панель",
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
    "quiz.menu.addedBy": "Добавил {user}",
    "quiz.menu.addedAt": "Добавлено {date}",
    "quiz.menu.updatedAt": "Обновлено {date}",
    "quiz.ordering.position": "Позиция {position}"
  },
  en: {
    "quiz.panel.user": "User",
    "quiz.panel.time": "Time left",
    "quiz.panel.total": "Total tasks",
    "quiz.panel.parsed": "Parsed successfully",
    "quiz.panel.withAnswers": "With answers",
    "quiz.panel.failed": "No answers",
    "quiz.panel.guest": "Guest",
    "quiz.panel.unlimited": "Unlimited",
    "quiz.panel.subtitle": "Attempt overview",
    "quiz.panel.collapse": "Collapse panel",
    "quiz.panel.expand": "Expand panel",
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
    "quiz.menu.addedBy": "Added by {user}",
    "quiz.menu.addedAt": "Added {date}",
    "quiz.menu.updatedAt": "Updated {date}",
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
