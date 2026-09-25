import { describe, expect, it } from "vitest";
import { getQuestionTypeLabel, MOODLE_QUESTION_TYPE_LABELS } from "../src/shared/questionTypes";
import { shouldCacheQuizPreviewResponse } from "../src/content/quizPreview";
import type { QuizPreviewQuestion, QuizPreviewResponse } from "../src/model";

describe("getQuestionTypeLabel", () => {
  it("maps raw Moodle qtype names to localized labels", () => {
    expect(getQuestionTypeLabel("multichoice", "ru")).toBe("Множественный выбор");
    expect(getQuestionTypeLabel("truefalse", "ru")).toBe("Верно / Неверно");
    expect(getQuestionTypeLabel("ddmarker", "ru")).toBe("Перетаскивание маркеров");
    expect(getQuestionTypeLabel("multichoice", "en")).toBe("Multiple choice");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(getQuestionTypeLabel(" MultiChoice ", "ru")).toBe("Множественный выбор");
  });

  it("falls back to the raw type for unknown types and to a dash for empty ones", () => {
    expect(getQuestionTypeLabel("customqtype", "ru")).toBe("customqtype");
    expect(getQuestionTypeLabel(null, "ru")).toBe("—");
    expect(getQuestionTypeLabel("  ", "en")).toBe("—");
  });

  it("covers the quiz types shipped by the extension", () => {
    for (const knownType of ["multichoice", "ddimageortext", "ddwtos", "ddmarker", "ordering"]) {
      expect(MOODLE_QUESTION_TYPE_LABELS[knownType]).toBeDefined();
    }
  });
});

describe("shouldCacheQuizPreviewResponse", () => {
  const question: QuizPreviewQuestion = {
    questionId: "1",
    questionType: "multichoice",
    questionHash: "h",
    questionText: "text",
    reduxshare: { anchors: [], suggestions: [], submissions: [], slots: [] },
    external: { anchors: [], suggestions: [], submissions: [], slots: [] },
  };

  it("caches successful non-empty responses", () => {
    const response: QuizPreviewResponse = { ok: true, questions: [question], authRequired: false };
    expect(shouldCacheQuizPreviewResponse(response)).toBe(true);
  });

  it("does not cache auth-required, empty or failed responses", () => {
    expect(
      shouldCacheQuizPreviewResponse({ ok: true, questions: [question], authRequired: true }),
    ).toBe(false);
    expect(shouldCacheQuizPreviewResponse({ ok: true, questions: [], authRequired: false })).toBe(
      false,
    );
    expect(shouldCacheQuizPreviewResponse({ ok: false, error: "boom" })).toBe(false);
  });
});
