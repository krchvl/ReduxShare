import { describe, expect, it, vi } from "vitest";

vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/attempt.php"),
}));

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { loadQuestionFixture } from "./helpers/fixtures";
import {
  answerSlot,
  emptyAnswerData,
  exactSuggestion,
  slottedAnswerData,
  slottedExactSuggestion,
  unknownSubmission,
} from "./helpers/sourceData";
import { setCurrentStoredState } from "../src/state";
import { syncLanguage, syncStealthMode } from "../src/logic/runtime";

function baseStoredState(authenticated: boolean) {
  return {
    settings: {
      extensionEnabled: true,
      stealthMode: false,
      language: "ru",
      autoSelect: true,
      autoSelectAvgSeconds: 4,
    },
    authSession: authenticated ? { user: { id: "u1" } } : null,
  };
}

function removeFixtureWidgetPlaceholders() {
  document.querySelectorAll('[data-reduxshare-answer-widget="true"]').forEach((node) => {
    if (!(node as HTMLElement).shadowRoot) {
      node.remove();
    }
  });
}

function getChoiceInput(id: string) {
  const input = document.getElementById(id);
  expect(input).toBeInstanceOf(HTMLInputElement);
  return input as HTMLInputElement;
}

function externalExactAnswers() {
  return slottedAnswerData([
    answerSlot(1, { suggestions: [slottedExactSuggestion("false", 1)] }),
    answerSlot(2, { suggestions: [exactSuggestion("false", 2)] }),
    answerSlot(3, { suggestions: [exactSuggestion("false", 3)] }),
    answerSlot(4, { suggestions: [exactSuggestion("true", 4)] }),
  ]);
}

function internalExactAnswers() {
  return slottedAnswerData([
    answerSlot(1, { suggestions: [slottedExactSuggestion("false", 1)] }),
    answerSlot(2, { suggestions: [exactSuggestion("false", 2)] }),
    answerSlot(3, { suggestions: [exactSuggestion("false", 3)] }),
    answerSlot(4, { suggestions: [exactSuggestion("false", 4)] }),
  ]);
}

describe("auto-select source priority", () => {
  it("falls back to exact external answers when internal has only submissions", async () => {
    const api = await getQuizAttemptTestApi();
    const state = baseStoredState(true);
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncLanguage(state);
    syncStealthMode(state);

    loadQuestionFixture("multichoice", "attempt");
    removeFixtureWidgetPlaceholders();

    api.setSourceAnswerData(
      "1385",
      "reduxshare",
      slottedAnswerData([
        answerSlot(1, { submissions: [unknownSubmission("63 percent of the time.")] }),
        answerSlot(2, { submissions: [unknownSubmission("23 percent of the time.")] }),
      ]),
    );
    api.setSourceAnswerData("1385", "external", externalExactAnswers());

    const result = api.applyAllExactAnswersNow(state);

    expect(result).toEqual({ applied: 1, total: 1 });
    expect(getChoiceInput("q125:1_choice3").checked).toBe(true);
  });

  it("prefers internal exact answers over external ones", async () => {
    const api = await getQuizAttemptTestApi();
    const state = baseStoredState(true);
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncLanguage(state);
    syncStealthMode(state);

    loadQuestionFixture("multichoice", "attempt");
    removeFixtureWidgetPlaceholders();

    api.setSourceAnswerData("1385", "reduxshare", internalExactAnswers());
    api.setSourceAnswerData(
      "1385",
      "external",
      slottedAnswerData([
        answerSlot(1, { suggestions: [slottedExactSuggestion("false", 1)] }),
        answerSlot(2, { suggestions: [exactSuggestion("false", 2)] }),
        answerSlot(3, { suggestions: [exactSuggestion("false", 3)] }),
        answerSlot(4, { suggestions: [exactSuggestion("false", 4)] }),
      ]),
    );

    const result = api.applyAllExactAnswersNow(state);

    expect(result).toEqual({ applied: 0, total: 1 });
    expect(getChoiceInput("q125:1_choice3").checked).toBe(false);
  });

  it("applies external exact answers for logged-out users", async () => {
    const api = await getQuizAttemptTestApi();
    const state = baseStoredState(false);
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncLanguage(state);
    syncStealthMode(state);

    loadQuestionFixture("multichoice", "attempt");
    removeFixtureWidgetPlaceholders();

    api.setSourceAnswerData("1385", "reduxshare", emptyAnswerData());
    api.setSourceAnswerData("1385", "external", externalExactAnswers());

    const result = api.applyAllExactAnswersNow(state);

    expect(result).toEqual({ applied: 1, total: 1 });
    expect(getChoiceInput("q125:1_choice3").checked).toBe(true);
  });
});
