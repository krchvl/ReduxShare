import { afterEach, describe, expect, it, vi } from "vitest";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import {
  answerSlot,
  exactAnswerData,
  slottedAnswerData,
  slottedExactSuggestion,
} from "./helpers/sourceData";
import { setCurrentStoredState } from "../src/state";
import { syncLanguage, syncContentUi } from "../src/logic/runtime";
import { syncPageOverlayOpacity, syncAnswerWidgetHotkey } from "../src/content/quizAttempt";

const TEST_MODE_STUB = "__REDUXSHARE_TEST_MODE__";

function baseStoredState() {
  return {
    settings: {
      extensionEnabled: true,
      language: "ru",
      autoSelect: true,
      autoSelectAvgSeconds: 4,
    },
    authSession: null,
  };
}

async function dispatchStorageChange(state: unknown) {
  await chrome.storage.local.set({ reduxshare: state });
}

function getSubZeroSelect() {
  const select = document.getElementById("menuq126:12_sub0");
  expect(select).toBeInstanceOf(HTMLSelectElement);
  return select as HTMLSelectElement;
}

function countDelayProgressBars() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
  ).filter((host) => host.shadowRoot?.querySelector(".delay-progress")).length;
}

function getFirstSecondsLabel() {
  const label = Array.from(
    document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
  )
    .map((host) => host.shadowRoot?.querySelector(".delay-progress__seconds")?.textContent)
    .find((text) => Boolean(text));

  return label ?? "";
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
    document
      .querySelectorAll('[data-reduxshare-answer-widget="true"]')
      .forEach((node) => node.remove());
    api.setStoredState(baseStoredState());

    const currentState = baseStoredState();
    setCurrentStoredState(currentState);
    syncLanguage(currentState);
    syncContentUi();
    syncAnswerWidgetHotkey(currentState);
    syncPageOverlayOpacity(currentState);
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        answerSlot(1, { anchors: ["сила"], suggestions: [slottedExactSuggestion("ньютон", 1)] }),
        answerSlot(2, {
          anchors: ["Масса"],
          suggestions: [slottedExactSuggestion("Килограмм", 2)],
        }),
        answerSlot(3, {
          anchors: ["Напряжение"],
          suggestions: [slottedExactSuggestion("Вольт", 3)],
        }),
      ]),
    );
    api.mountAnswerWidgets("#5eead4");

    const select = getSubZeroSelect();
    vi.stubGlobal(TEST_MODE_STUB, false);

    api.watchStoredSettingsChanges();

    await dispatchStorageChange(baseStoredState());
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(baseStoredState());
    await vi.advanceTimersByTimeAsync(300);

    expect(select.value).toBe("0");
    expect(countDelayProgressBars()).toBeGreaterThan(0);
    expect(getFirstSecondsLabel()).toMatch(/^\d+\.\ds$/);

    const secondsBefore = getFirstSecondsLabel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(getFirstSecondsLabel()).not.toBe(secondsBefore);

    await vi.advanceTimersByTimeAsync(60000);

    expect(select.value).toBe("2");
    expect(countDelayProgressBars()).toBe(0);
  });

  it("keeps the progress bar under an inline widget trigger", async () => {
    vi.useFakeTimers();
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    document
      .querySelectorAll('[data-reduxshare-answer-widget="true"]')
      .forEach((node) => node.remove());

    const currentState = baseStoredState();
    setCurrentStoredState(currentState);
    syncLanguage(currentState);
    syncContentUi();
    syncAnswerWidgetHotkey(currentState);
    syncPageOverlayOpacity(currentState);
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        answerSlot(1, { anchors: ["сила"], suggestions: [slottedExactSuggestion("ньютон", 1)] }),
      ]),
    );
    api.mountAnswerWidgets("#5eead4");

    vi.stubGlobal(TEST_MODE_STUB, false);
    api.watchStoredSettingsChanges();

    await dispatchStorageChange(baseStoredState());
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(baseStoredState());
    await vi.advanceTimersByTimeAsync(300);

    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
    ).filter((host) => host.shadowRoot?.querySelector(".delay-progress"));

    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host.shadowRoot?.querySelector(".widget > .delay-progress")).not.toBeNull();
      expect(host.shadowRoot?.querySelector(".delay-progress__seconds")).not.toBeNull();
    }
  });

  it("keeps the progress bar on a block widget host", async () => {
    vi.useFakeTimers();
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    document
      .querySelectorAll('[data-reduxshare-answer-widget="true"]')
      .forEach((node) => node.remove());

    const currentState = baseStoredState();
    setCurrentStoredState(currentState);
    syncLanguage(currentState);
    syncContentUi();
    syncAnswerWidgetHotkey(currentState);
    syncPageOverlayOpacity(currentState);
    api.setSourceAnswerData("1385", "external", exactAnswerData("63 percent of the time."));
    api.mountAnswerWidgets("#5eead4");

    vi.stubGlobal(TEST_MODE_STUB, false);
    api.watchStoredSettingsChanges();

    await dispatchStorageChange(baseStoredState());
    await vi.advanceTimersByTimeAsync(300);
    await dispatchStorageChange(baseStoredState());
    await vi.advanceTimersByTimeAsync(300);

    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
    ).filter((host) => host.shadowRoot?.querySelector(".delay-progress"));

    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host.shadowRoot?.querySelector(".widget > .delay-progress")).not.toBeNull();
      expect(host.shadowRoot?.querySelector(".delay-progress__seconds")).not.toBeNull();
    }

    for (const host of hosts) {
      host.removeAttribute("data-reduxshare-inline-widget");
    }

    await vi.advanceTimersByTimeAsync(200);

    const stylesheet = hosts[0].shadowRoot?.querySelector("style")?.textContent ?? "";

    expect(stylesheet).toMatch(/\.delay-progress \{[^}]*display: block/);
    expect(stylesheet).toMatch(/\.delay-progress__seconds \{[^}]*font-weight: 400/);
    expect(stylesheet).toMatch(
      /:host\(\[data-reduxshare-inline-widget="true"\]\) \.delay-progress \{/,
    );

    for (const host of hosts) {
      const progress = host.shadowRoot?.querySelector<HTMLElement>(".delay-progress");
      const seconds = host.shadowRoot?.querySelector<HTMLElement>(".delay-progress__seconds");

      expect(progress?.parentNode).toBe(host.shadowRoot);
      expect(seconds?.textContent).toMatch(/^\d+\.\ds$/);
    }
  });
});
