import { afterEach, describe, expect, it, vi } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { exactAnswerData } from "./helpers/sourceData";
import { setCurrentStoredState } from "../src/state";
import { syncLanguage, syncContentUi } from "../src/logic/runtime";

const TEST_MODE_STUB = "__REDUXSHARE_TEST_MODE__";
const QUESTION_ID = "900";
const TEXT_QUESTION_ID = "901";
const EMPTY_QUESTION_ID = "902";
const LONG_QUESTION_TEXT = "A".repeat(600);
const LONG_TEXT_ANSWER = "the quick brown fox jumps over the lazy dog";

function baseStoredState(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      extensionEnabled: true,
      language: "ru",
      autoSelect: true,
      autoSelectAvgSeconds: 4,
      humanTyping: false,
      humanPrecursors: false,
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

function renderTextQuestion() {
  document.body.innerHTML = `
    <div id="question-901-1" class="que shortanswer deferredfeedback" data-questionid="${TEXT_QUESTION_ID}">
      <div class="content">
        <div class="formulation clearfix">
          <div class="qtext">Name the animal</div>
          <fieldset class="ablock">
            <div class="answer">
              <input type="text" name="q901:1_response" id="q901:1_response" />
            </div>
          </fieldset>
        </div>
      </div>
    </div>`;

  return document.querySelector(".que") as Element;
}

function renderTwoQuestions() {
  document.body.innerHTML = `
    <div id="question-902-1" class="que multichoice deferredfeedback" data-questionid="${EMPTY_QUESTION_ID}">
      <div class="content">
        <div class="formulation clearfix">
          <div class="qtext">Pick one</div>
          <fieldset class="ablock">
            <div class="answer">
              <div class="r0">
                <input type="radio" name="q902:1_choice0" value="1" id="q902:1_choice0" aria-labelledby="q902:1_choice0_label" />
                <div id="q902:1_choice0_label" data-region="answer-label"><p>First option</p></div>
              </div>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
    <div id="question-900-1" class="que multichoice deferredfeedback" data-questionid="${QUESTION_ID}">
      <div class="content">
        <div class="formulation clearfix">
          <div class="qtext">Pick one</div>
          <fieldset class="ablock">
            <div class="answer">
              <div class="r0">
                <input type="radio" name="q900:1_choice0" value="1" id="q900:1_choice0" aria-labelledby="q900:1_choice0_label" />
                <div id="q900:1_choice0_label" data-region="answer-label"><p>Correct option</p></div>
              </div>
              <div class="r1">
                <input type="radio" name="q900:1_choice1" value="1" id="q900:1_choice1" aria-labelledby="q900:1_choice1_label" />
                <div id="q900:1_choice1_label" data-region="answer-label"><p>Wrong option</p></div>
              </div>
            </div>
          </fieldset>
        </div>
      </div>
    </div>`;

  return document.querySelectorAll(".que");
}

function getCorrectInput() {
  return document.getElementById("q900:1_choice0") as HTMLInputElement | null;
}

function getTextInput() {
  return document.getElementById("q901:1_response") as HTMLInputElement | null;
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
  syncContentUi();
  api.setSourceAnswerData(QUESTION_ID, "external", exactAnswerData("Correct option"));
  vi.stubGlobal(TEST_MODE_STUB, false);
  api.watchStoredSettingsChanges();
  return api;
}

async function setupTextPage(state: unknown) {
  const api = await getQuizAttemptTestApi();
  renderTextQuestion();
  api.setStoredState(state);
  setCurrentStoredState(state);
  syncLanguage(state);
  syncContentUi();
  api.setSourceAnswerData(TEXT_QUESTION_ID, "external", exactAnswerData(LONG_TEXT_ANSWER));
  vi.stubGlobal(TEST_MODE_STUB, false);
  api.watchStoredSettingsChanges();
  return api;
}

async function setupTwoQuestionPage(state: unknown) {
  const api = await getQuizAttemptTestApi();
  renderTwoQuestions();
  api.setStoredState(state);
  setCurrentStoredState(state);
  syncLanguage(state);
  syncContentUi();
  api.setSourceAnswerData(QUESTION_ID, "external", exactAnswerData("Correct option"));
  vi.stubGlobal(TEST_MODE_STUB, false);
  api.watchStoredSettingsChanges();
  return api;
}

describe("humanized auto-select scheduling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(TEST_MODE_STUB, true);
    vi.useRealTimers();
  });

  it("fills the answer without a long blackout", async () => {
    vi.useFakeTimers();
    const state = baseStoredState();
    const api = await setupPage(state);

    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    await vi.advanceTimersByTimeAsync(30000);

    expect(getCorrectInput()?.checked).toBe(true);
  });

  it("re-plans the pending schedule when a setting changes", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const readingState = baseStoredState();
    const api = await setupPage(readingState);

    await dispatchStorageChange(readingState);
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(readingState);
    await vi.advanceTimersByTimeAsync(300);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(getCorrectInput()?.checked).toBe(false);

    const originalDelay = api.getPendingAutoSelectScheduleDelays()[0]?.delayMs ?? 0;

    const plainState = baseStoredState({ autoSelectAvgSeconds: 1 });
    await dispatchStorageChange(plainState);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    const replannedDelay = api.getPendingAutoSelectScheduleDelays()[0]?.delayMs ?? 0;

    expect(replannedDelay).toBeGreaterThan(0);
    expect(replannedDelay).toBeLessThan(originalDelay);

    await vi.advanceTimersByTimeAsync(replannedDelay);

    expect(getCorrectInput()?.checked).toBe(true);
    expect(api.countPendingAutoSelectSchedules()).toBe(0);
  });

  it("keeps the replacement schedule alive when the cancelled task unwinds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = baseStoredState({ humanTyping: true });
    const api = await setupTextPage(state);

    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    while ((getTextInput()?.value.length ?? 0) === 0) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    const replacementState = baseStoredState({ humanTyping: true, autoSelectAvgSeconds: 8 });
    await dispatchStorageChange(replacementState);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    await vi.advanceTimersByTimeAsync(300);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);
  });

  it("does not retry an answer that is already selected", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = baseStoredState();
    const api = await setupPage(state);

    getCorrectInput()!.checked = true;

    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);

    expect(api.countPendingAutoSelectSchedules()).toBe(1);

    await vi.advanceTimersByTimeAsync(30000);

    expect(api.countPendingAutoSelectSchedules()).toBe(0);
    expect(getCorrectInput()?.checked).toBe(true);
  });

  it("does not stagger questions that have no answer data", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = baseStoredState();
    const api = await setupTwoQuestionPage(state);

    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(state);
    await vi.advanceTimersByTimeAsync(300);

    const delays = api.getPendingAutoSelectScheduleDelays();

    expect(delays).toHaveLength(1);
    expect(delays[0].questionId).toBe(QUESTION_ID);

    const readingSeconds = api.estimateQuestionReadingSeconds(
      document.querySelectorAll(".que")[1] as Element,
    );
    const withoutStagger = [false, true].map((firstInPage) =>
      api.computeAutoSelectDelayMs(4, () => 0.5, null, { readingSeconds, firstInPage }),
    );
    const withStagger = [false, true].map((firstInPage) =>
      api.computeAutoSelectDelayMs(4, () => 0.5, null, {
        readingSeconds,
        firstInPage,
        extraDelayMs: 2000,
      }),
    );

    expect(withoutStagger).toContain(delays[0].delayMs);
    expect(withStagger).not.toContain(delays[0].delayMs);
  });

  it("skips scroll and focus when the schedule was cancelled", async () => {
    const api = await getQuizAttemptTestApi();
    const node = document.createElement("div");
    node.tabIndex = -1;
    document.body.append(node);

    await api.runHumanPrecursors(
      node,
      () => 0.5,
      () => true,
    );

    expect(document.activeElement).not.toBe(node);

    node.remove();
  });

  it("always staggers the answers by a fixed gap", async () => {
    const api = await getQuizAttemptTestApi();

    expect(api.getHumanizedAnswerGapMs()).toBe(2000);
  });

  it("keeps staggered delays distinct instead of collapsing them at the cap", async () => {
    const api = await getQuizAttemptTestApi();
    const first = api.computeAutoSelectDelayMs(4, () => 0.9999, null, {
      readingSeconds: 12,
      extraDelayMs: 50000,
    });
    const second = api.computeAutoSelectDelayMs(4, () => 0.9999, null, {
      readingSeconds: 12,
      extraDelayMs: 55000,
    });

    expect(first).toBeGreaterThan(60000);
    expect(second).toBeGreaterThan(first);
  });

  it("counts the stagger offset against the remaining quiz time", async () => {
    const api = await getQuizAttemptTestApi();
    const withOffset = api.computeAutoSelectDelayMs(4, () => 0.9999, 60, {
      extraDelayMs: 4000,
    });

    expect(withOffset).toBeLessThanOrEqual(6000);
    expect(withOffset).toBeGreaterThanOrEqual(4000);
  });

  it("keeps the schedule alive when the extension applies the answer itself", async () => {
    vi.useFakeTimers();
    const state = baseStoredState();
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
