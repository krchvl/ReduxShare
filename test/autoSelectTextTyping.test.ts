import { afterEach, describe, expect, it, vi } from "vitest";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { exactAnswerData } from "./helpers/sourceData";
import { setCurrentStoredState } from "../src/state";
import { syncLanguage, syncStealthMode } from "../src/logic/runtime";

const TEST_MODE_STUB = "__REDUXSHARE_TEST_MODE__";

function baseStoredState() {
  return {
    settings: {
      extensionEnabled: true,
      stealthMode: true,
      language: "ru",
      autoSelect: true,
      autoSelectAvgSeconds: 4,
      humanTyping: true,
      humanPrecursors: false,
      humanReading: false,
    },
    authSession: null,
  };
}

describe("auto-select humanized text typing", () => {
  afterEach(() => {
    vi.stubGlobal(TEST_MODE_STUB, true);
    vi.useRealTimers();
  });

  it("keeps the schedule alive while typing a multi-character answer", async () => {
    vi.useFakeTimers();
    const api = await getQuizAttemptTestApi();
    const state = baseStoredState();
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncLanguage(state);
    syncStealthMode(state);

    loadQuestionFixture("shortanswer", "attempt");
    document
      .querySelectorAll('[data-reduxshare-answer-widget="true"]')
      .forEach((node) => node.remove());

    api.setSourceAnswerData("2011", "external", exactAnswerData("1300"));

    const questionNode = document.querySelector(".que");
    expect(questionNode).toBeInstanceOf(Element);

    vi.stubGlobal(TEST_MODE_STUB, false);

    api.scheduleAutoSelectAnswer("2011", questionNode as Element, state, false);

    const input = document.querySelector<HTMLInputElement>('input[type="text"]');
    expect(input).toBeTruthy();

    let sawPartialValue = false;

    for (let tick = 0; tick < 600; tick += 1) {
      await vi.advanceTimersByTimeAsync(25);

      if (input.value !== "" && input.value !== "1300") {
        sawPartialValue = true;
        expect(api.countPendingAutoSelectSchedules()).toBe(1);
      }

      if (input.value === "1300") {
        break;
      }
    }

    expect(input.value).toBe("1300");
    expect(sawPartialValue).toBe(true);

    await vi.advanceTimersByTimeAsync(200);

    expect(api.countPendingAutoSelectSchedules()).toBe(0);
  });
});
