// The storage watcher is the production entry point for auto-select: on a real quiz page an
// exact answer must arrive after a human-like delay (with a progress bar on the question widget)
// instead of the moment the answer data lands.
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { answerSlot, slottedAnswerData, slottedExactSuggestion } from "./helpers/sourceData";

const TEST_MODE_STUB = "__REDUXSHARE_TEST_MODE__";

function baseStoredState() {
  return {
    settings: {
      extensionEnabled: true,
      stealthMode: true,
      language: "ru",
      autoSelect: true,
      autoSelectAvgSeconds: 4
    },
    authSession: null
  };
}

function dispatchStorageChange(state: unknown) {
  const onChanged = (chrome.storage.onChanged.addListener as unknown as { mock: { calls: unknown[][] } }).mock
    .calls[0][0] as (changes: Record<string, { newValue?: unknown }>, areaName: string) => void;
  onChanged({ reduxshare: { newValue: state } }, "local");
}

function getSubZeroSelect() {
  const select = document.getElementById("menuq126:12_sub0");
  expect(select).toBeInstanceOf(HTMLSelectElement);
  return select as HTMLSelectElement;
}

function countDelayProgressBars() {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]')).filter(
    (host) => host.shadowRoot?.querySelector(".delay-progress")
  ).length;
}

describe("paced auto-select on a live quiz page", () => {
  afterEach(() => {
    vi.stubGlobal(TEST_MODE_STUB, true);
    vi.useRealTimers();
  });

  it("waits out the delay before filling an exact answer", async () => {
    vi.useFakeTimers();
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    document.querySelectorAll('[data-reduxshare-answer-widget="true"]').forEach((node) => node.remove());
    api.setStoredState(baseStoredState());
    api.watchStoredSettingsChanges();
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        answerSlot(1, { anchors: ["сила"], suggestions: [slottedExactSuggestion("ньютон", 1)] }),
        answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
        answerSlot(3, { anchors: ["Напряжение"], suggestions: [slottedExactSuggestion("Вольт", 3)] })
      ])
    );
    api.mountAnswerWidgets("#5eead4");

    const select = getSubZeroSelect();
    vi.stubGlobal(TEST_MODE_STUB, false);

    // The first dispatch initializes the attempt context, the second one runs the live-update
    // path that schedules the answers.
    dispatchStorageChange(baseStoredState());
    await vi.advanceTimersByTimeAsync(300);
    dispatchStorageChange(baseStoredState());
    await vi.advanceTimersByTimeAsync(300);

    expect(select.value).toBe("0");
    expect(countDelayProgressBars()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(60000);

    expect(select.value).toBe("2");
    expect(countDelayProgressBars()).toBe(0);
  });
});
