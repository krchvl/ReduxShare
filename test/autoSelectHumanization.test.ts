import { afterEach, describe, expect, it, vi } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { exactAnswerData } from "./helpers/sourceData";
import { setCurrentStoredState } from "../src/state";
import { syncLanguage, syncStealthMode } from "../src/logic/runtime";

const TEST_MODE_STUB = "__REDUXSHARE_TEST_MODE__";
const QUESTION_ID = "900";
const LONG_QUESTION_TEXT = "A".repeat(600);

function baseStoredState(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      extensionEnabled: true,
      stealthMode: true,
      language: "ru",
      autoSelect: true,
      autoSelectAvgSeconds: 4,
      humanTyping: false,
      humanPrecursors: false,
      humanReading: false,
      humanOrder: false,
      ...overrides,
    },
    authSession: null,
  };
}

function renderQuestion() {
  document.body.innerHTML = `
    <div id="question-900-1" class="que multichoice deferredfeedback" data-questionid="${QUESTION_ID}">
      <div class="content">
        <div class="formulation clearfix">
          <div class="qtext">${LONG_QUESTION_TEXT}</div>
          <fieldset class="ablock">
            <div class="answer">
              <div class="r0">
                <input
                  type="radio"
                  name="q900:1_choice0"
                  value="1"
                  id="q900:1_choice0"
                  aria-labelledby="q900:1_choice0_label"
                />
                <div id="q900:1_choice0_label" data-region="answer-label"><p>Correct option</p></div>
              </div>
              <div class="r1">
                <input
                  type="radio"
                  name="q900:1_choice1"
                  value="1"
                  id="q900:1_choice1"
                  aria-labelledby="q900:1_choice1_label"
                />
                <div id="q900:1_choice1_label" data-region="answer-label"><p>Wrong option</p></div>
              </div>
            </div>
          </fieldset>
        </div>
      </div>
    </div>`;

  return document.querySelector(".que") as Element;
}

function getCorrectInput() {
  return document.getElementById("q900:1_choice0") as HTMLInputElement | null;
}

async function dispatchStorageChange(value: unknown) {
  await chrome.storage.local.set({ reduxshare: value });
}

async function setupPage(state: unknown) {
  const api = await getQuizAttemptTestApi();
  renderQuestion();
  api.setStoredState(state);
  setCurrentStoredState(state);
  syncLanguage(state);
  syncStealthMode(state);
  api.setSourceAnswerData(QUESTION_ID, "external", exactAnswerData("Correct option"));
  vi.stubGlobal(TEST_MODE_STUB, false);
  api.watchStoredSettingsChanges();
  return api;
}

describe("humanized auto-select scheduling", () => {
  afterEach(() => {
    vi.stubGlobal(TEST_MODE_STUB, true);
    vi.useRealTimers();
  });

  it("fills the answer without a long blackout when reading time is enabled", async () => {
    vi.useFakeTimers();
    const state = baseStoredState({ humanReading: true });
    const api = await setupPage(state);

    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    await vi.advanceTimersByTimeAsync(30000);

    expect(getCorrectInput()?.checked).toBe(true);
  });

  it("re-plans the pending schedule when a humanization card is toggled", async () => {
    vi.useFakeTimers();
    const readingState = baseStoredState({ humanReading: true });
    const api = await setupPage(readingState);

    await dispatchStorageChange(readingState);
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(readingState);
    await vi.advanceTimersByTimeAsync(300);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(getCorrectInput()?.checked).toBe(false);

    const plainState = baseStoredState({ humanReading: false });
    await dispatchStorageChange(plainState);
    await vi.advanceTimersByTimeAsync(15000);

    expect(getCorrectInput()?.checked).toBe(true);
  });

  it("keeps the schedule alive when the extension applies the answer itself", async () => {
    vi.useFakeTimers();
    const state = baseStoredState({ humanReading: true });
    const api = await setupPage(state);

    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);

    await vi.advanceTimersByTimeAsync(30000);

    expect(getCorrectInput()?.checked).toBe(true);
    expect(api.countPendingAutoSelectSchedules()).toBe(0);
  });
});
