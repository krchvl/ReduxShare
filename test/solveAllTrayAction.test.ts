import { describe, expect, it, vi } from "vitest";

vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/attempt.php"),
}));

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { loadQuestionFixture } from "./helpers/fixtures";
import { answerSlot, slottedAnswerData, slottedExactSuggestion } from "./helpers/sourceData";
import { setCurrentStoredState } from "../src/state";
import { syncLanguage, syncStealthMode } from "../src/logic/runtime";

const PANEL_HOST_ID = "reduxshare-attempt-status-panel";
const SOLVE_ALL_RESULT_VISIBLE_MS = 2500;

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

function getPanelShadow(): ShadowRoot {
  const host = document.getElementById(PANEL_HOST_ID);
  expect(host).toBeInstanceOf(HTMLDivElement);
  expect(host?.shadowRoot).toBeTruthy();
  return host!.shadowRoot!;
}

function getChoiceInput(id: string) {
  const input = document.getElementById(id);
  expect(input).toBeInstanceOf(HTMLInputElement);
  return input as HTMLInputElement;
}

function countDelayProgressBars() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
  ).filter((host) => host.shadowRoot?.querySelector(".delay-progress")).length;
}

function mountMultichoiceWithExactSlots(api: Awaited<ReturnType<typeof getQuizAttemptTestApi>>) {
  loadQuestionFixture("multichoice", "attempt");
  removeFixtureWidgetPlaceholders();

  api.setSourceAnswerData(
    "1385",
    "reduxshare",
    slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("false", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("false", 2)] }),
      answerSlot(3, { suggestions: [slottedExactSuggestion("false", 3)] }),
      answerSlot(4, { suggestions: [slottedExactSuggestion("true", 4)] }),
    ]),
  );

  api.mountAnswerWidgets("#5eead4");
}

describe("solve-all tray action", () => {
  it("applies every exact answer at once from the tray, cancels pending schedules and flashes the result", async () => {
    vi.useFakeTimers();
    try {
      window.history.pushState({}, "", "/mod/quiz/attempt.php?attempt=91&cmid=978");

      const api = await getQuizAttemptTestApi();
      api.reset();

      const state = baseStoredState(true);
      api.setStoredState(state);
      setCurrentStoredState(state);
      syncLanguage(state);
      syncStealthMode(state);

      mountMultichoiceWithExactSlots(api);

      const questionNode = document.querySelector(".que");
      expect(questionNode).toBeInstanceOf(Element);

      expect(api.scheduleAutoSelectAnswer("1385", questionNode as Element, state, false)).toBe(
        true,
      );
      expect(countDelayProgressBars()).toBeGreaterThan(0);
      expect(getChoiceInput("q125:1_choice3").checked).toBe(false);

      const shadow = getPanelShadow();
      shadow.querySelector<HTMLButtonElement>(".settings-ear")!.click();

      const action = shadow.querySelector<HTMLButtonElement>('[data-tray-action="solveAll"]')!;
      expect(action).toBeInstanceOf(HTMLButtonElement);
      expect(action.getAttribute("title")).toBe("Решить весь тест");
      expect(action.hasAttribute("data-result")).toBe(false);

      action.click();

      expect(getChoiceInput("q125:1_choice0").checked).toBe(false);
      expect(getChoiceInput("q125:1_choice1").checked).toBe(false);
      expect(getChoiceInput("q125:1_choice2").checked).toBe(false);
      expect(getChoiceInput("q125:1_choice3").checked).toBe(true);
      expect(countDelayProgressBars()).toBe(0);
      expect((questionNode as HTMLElement).dataset.reduxshareAutoSelected).toBe("true");

      expect(action.getAttribute("title")).toBe("Применено: 1 из 1");
      expect(action.getAttribute("aria-label")).toBe("Применено: 1 из 1");
      expect(action.hasAttribute("data-result")).toBe(true);

      await vi.advanceTimersByTimeAsync(SOLVE_ALL_RESULT_VISIBLE_MS + 100);

      expect(action.getAttribute("title")).toBe("Решить весь тест");
      expect(action.hasAttribute("data-result")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns applied/total counts, works with auto-select disabled and skips questions without exact data", async () => {
    const api = await getQuizAttemptTestApi();

    const state = {
      ...baseStoredState(true),
      settings: { ...baseStoredState(true).settings, autoSelect: false },
    };
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncLanguage(state);
    syncStealthMode(state);

    loadQuestionFixture("multichoice", "attempt");
    removeFixtureWidgetPlaceholders();

    expect(api.applyAllExactAnswersNow(state)).toEqual({ applied: 0, total: 0 });
    expect(getChoiceInput("q125:1_choice0").checked).toBe(false);

    mountMultichoiceWithExactSlots(api);

    const questionNode = document.querySelector(".que");
    expect(questionNode).toBeInstanceOf(Element);

    expect(api.applyAllExactAnswersNow(state)).toEqual({ applied: 1, total: 1 });
    expect(getChoiceInput("q125:1_choice3").checked).toBe(true);
    expect((questionNode as HTMLElement).dataset.reduxshareAutoSelected).toBe("true");
  });
});
