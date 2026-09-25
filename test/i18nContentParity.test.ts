import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import ru from "../src/i18n/locales/ru.json";
import { CONTENT_TRANSLATIONS, getContentTranslator } from "../src/i18n/contentI18n";

const POPUP_LOCALES = { ru, en } as const;

describe("content translations shared with the popup locales", () => {
  const sharedKeys = (Object.keys(POPUP_LOCALES.ru) as Array<keyof typeof POPUP_LOCALES.ru>).filter(
    (key) => key in CONTENT_TRANSLATIONS.ru,
  );

  it("covers the quiz menu keys declared in both tables", () => {
    expect(sharedKeys.length).toBeGreaterThan(0);
  });

  it.each(["ru", "en"] as const)("keeps %s wording in sync with the popup locales", (language) => {
    for (const key of sharedKeys) {
      expect(CONTENT_TRANSLATIONS[language][key as keyof typeof CONTENT_TRANSLATIONS.ru]).toBe(
        POPUP_LOCALES[language][key],
      );
    }
  });
});

describe("content translator", () => {
  it("resolves the language from the browser when no setting is stored", () => {
    const t = getContentTranslator(undefined);

    expect(t("quiz.panel.subtitle")).toBe(CONTENT_TRANSLATIONS.ru["quiz.panel.subtitle"]);
  });

  it("falls back to Russian for a language the content table does not cover", () => {
    expect(getContentTranslator("xx" as never)("quiz.panel.guest")).toBe(
      CONTENT_TRANSLATIONS.ru["quiz.panel.guest"],
    );
  });

  it("interpolates parameters", () => {
    expect(getContentTranslator("ru")("quiz.menu.addedBy", { user: "Аня" })).toBe("Добавил Аня");
    expect(getContentTranslator("en")("quiz.ordering.position", { position: 3 })).toBe(
      "Position 3",
    );
  });

  it("keeps unknown placeholders untouched", () => {
    expect(getContentTranslator("ru")("quiz.menu.addedBy")).toBe("Добавил {user}");
  });
});
