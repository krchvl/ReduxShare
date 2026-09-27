import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnswerSlotData, SourceAnswerData } from "../src/model";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { setCurrentStoredState } from "../src/state";
import { syncLanguage, syncStealthMode } from "../src/logic/runtime";
import { syncPageOverlayOpacity, syncAnswerWidgetHotkey } from "../src/content/quizAttempt";
import {
  answerSlot,
  exactAnswerData,
  exactSuggestion,
  sourceAnswerData,
  slottedAnswerData,
  slottedExactSuggestion,
  votedSubmission,
} from "./helpers/sourceData";

function opaqueHashSlot(index: number, hash: string, suggestionLabel: string): AnswerSlotData {
  return {
    index,
    hasExplicitIndex: false,
    anchors: [hash],
    suggestions: [slottedExactSuggestion(suggestionLabel, index)],
    submissions: [],
  };
}

function getInput(id: string) {
  const input = document.getElementById(id);
  expect(input).toBeInstanceOf(HTMLInputElement);
  return input as HTMLInputElement;
}

function getPortalRoot() {
  const portal = document.querySelector('[data-reduxshare-answer-menu-portal="true"]');
  expect(portal).toBeInstanceOf(HTMLElement);
  expect(portal?.shadowRoot).toBeTruthy();
  return portal!.shadowRoot!;
}

function getInlineWidgetHostForSelect(select: HTMLSelectElement) {
  const hosts = Array.from(
    select.parentElement?.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]') ??
      [],
  );
  const hostWithShadow = hosts.find((candidate) => candidate.shadowRoot);
  expect(hostWithShadow).toBeInstanceOf(HTMLElement);
  return hostWithShadow as HTMLElement;
}

function removeFixtureWidgetPlaceholders() {
  document.querySelectorAll('[data-reduxshare-answer-widget="true"]').forEach((node) => {
    if (!(node as HTMLElement).shadowRoot) {
      node.remove();
    }
  });
}

function mountChoiceWidget(
  api: Awaited<ReturnType<typeof getQuizAttemptTestApi>>,
  inputId: string,
  answerData: SourceAnswerData,
) {
  const input = getInput(inputId);
  const label = document.getElementById(`${inputId}_label`);
  expect(label).toBeInstanceOf(HTMLElement);

  const host = api.createAnswerWidgetHost(
    "#ff6b6f",
    "1385",
    api.createEmptyVariantCounts(),
    answerData,
    null,
    true,
  );
  host.setAttribute("data-reduxshare-choice-input-id", inputId);
  label!.append(host);

  const trigger = host.shadowRoot?.querySelector<HTMLButtonElement>(".trigger");
  expect(trigger).toBeInstanceOf(HTMLButtonElement);
  trigger!.click();

  return {
    input,
    host,
    trigger: trigger!,
  };
}

describe("R-menu widget interactions", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("propagates accent color changes from storage to widgets", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
    api.setStoredState({
      settings: {
        extensionEnabled: true,
        stealthMode: true,
        language: "ru",
        accentColor: "#9cb9f6",
      },
      authSession: null,
    });

    const currentState = api.getStoredState();
    setCurrentStoredState(currentState);
    syncLanguage(currentState);
    syncStealthMode(currentState);
    syncAnswerWidgetHotkey(currentState);
    syncPageOverlayOpacity(currentState);
    api.mountAnswerWidgets("#9cb9f6");

    api.watchStoredSettingsChanges();

    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
    );
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host.style.getPropertyValue("--reduxshare-accent")).toBe("#9cb9f6");
    }

    const storedState = {
      settings: {
        extensionEnabled: true,
        stealthMode: true,
        language: "ru",
        accentColor: "#9cb9f6",
      },
      authSession: null,
    };

    await chrome.storage.local.set({ reduxshare: storedState });
    await new Promise((resolve) => setTimeout(resolve, 300));

    await chrome.storage.local.set({
      reduxshare: {
        settings: {
          extensionEnabled: true,
          stealthMode: true,
          language: "ru",
          accentColor: "#ff0000",
        },
        authSession: null,
      },
    });

    for (const host of Array.from(
      document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
    )) {
      expect(host.style.getPropertyValue("--reduxshare-accent")).toBe("#ff0000");
    }
  });

  it("tags widget hosts with the effective content color scheme", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    removeFixtureWidgetPlaceholders();
    api.setStoredState({
      settings: {
        extensionEnabled: true,
        stealthMode: true,
        language: "ru",
        colorScheme: "light",
      },
      authSession: null,
    });
    api.mountAnswerWidgets("#5eead4");

    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
    );
    expect(hosts.length).toBeGreaterThan(0);

    for (const host of hosts) {
      expect(host.dataset.theme).toBe("light");
    }
  });

  it("opens for unauthenticated users with external sources only", async () => {
    const api = await getQuizAttemptTestApi();
    api.setStoredState({
      settings: {
        extensionEnabled: true,
        stealthMode: true,
        language: "ru",
      },
      authSession: null,
    });
    loadQuestionFixture("multichoice", "attempt");
    mountChoiceWidget(
      api,
      "q125:1_choice1",
      sourceAnswerData({
        reduxshare: {
          anchors: [],
          suggestions: [exactSuggestion("false")],
          submissions: [],
          slots: [],
        },
        external: {
          anchors: [],
          suggestions: [exactSuggestion("true")],
          submissions: [],
          slots: [],
        },
      }),
    );

    const root = getPortalRoot();
    expect(root.querySelector('[data-menu-tab="internal"]')).toBeNull();
    expect(root.querySelector('[data-menu-tab="ai"]')).toBeNull();
    expect(root.querySelector('[data-menu-tab="external"]')).toBeInstanceOf(HTMLButtonElement);
    expect(
      root.querySelector('[data-answer-menu="external-exact"] [data-answer-label="true"]'),
    ).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector('[data-answer-menu="reduxshare-exact"] [data-answer-label="false"]'),
    ).toBeNull();
  });

  it("opens from the R trigger, switches to external sources, and applies true to that specific checkbox", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    const { input } = mountChoiceWidget(
      api,
      "q125:1_choice1",
      sourceAnswerData({
        reduxshare: {
          anchors: [],
          suggestions: [exactSuggestion("false")],
          submissions: [],
          slots: [],
        },
        external: {
          anchors: [],
          suggestions: [exactSuggestion("true")],
          submissions: [],
          slots: [],
        },
      }),
    );

    const root = getPortalRoot();
    const externalTab = root.querySelector<HTMLButtonElement>('[data-menu-tab="external"]');
    expect(externalTab).toBeInstanceOf(HTMLButtonElement);

    externalTab!.click();

    expect(externalTab!.dataset.active).toBe("true");
    expect(root.querySelector<HTMLElement>('[data-menu-panel="external"]')?.dataset.active).toBe(
      "true",
    );

    const trueOption = root.querySelector<HTMLElement>(
      '[data-answer-menu="external-exact"] [data-answer-label="true"]',
    );
    expect(trueOption).toBeInstanceOf(HTMLElement);

    trueOption!.click();

    expect(input.checked).toBe(true);
    expect(getInput("q125:1_choice0").checked).toBe(false);
    expect(getInput("q125:1_choice2").checked).toBe(false);
    expect(getInput("q125:1_choice3").checked).toBe(false);
  });

  it("applies false from a scoped R menu without searching by visible label text", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    const targetInput = getInput("q125:1_choice3");
    targetInput.checked = true;

    const { input } = mountChoiceWidget(
      api,
      "q125:1_choice3",
      sourceAnswerData({
        external: {
          anchors: [],
          suggestions: [exactSuggestion("false")],
          submissions: [],
          slots: [],
        },
      }),
    );

    const root = getPortalRoot();
    const falseOption = root.querySelector<HTMLElement>(
      '[data-answer-menu="external-exact"] [data-answer-label="false"]',
    );
    expect(falseOption).toBeInstanceOf(HTMLElement);

    falseOption!.click();

    expect(input.checked).toBe(false);
  });

  it("auto-selects checkbox multichoice from per-option true/false exact slots", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("multichoice", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("false", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("false", 2)] }),
      answerSlot(3, { suggestions: [slottedExactSuggestion("false", 3)] }),
      answerSlot(4, { suggestions: [slottedExactSuggestion("true", 4)] }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect(getInput("q125:1_choice0").checked).toBe(false);
    expect(getInput("q125:1_choice1").checked).toBe(false);
    expect(getInput("q125:1_choice2").checked).toBe(false);
    expect(getInput("q125:1_choice3").checked).toBe(true);
  });

  it("prefers the dominant boolean exact value for ReduxShare checkbox slots and keeps the conflict in statistics", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    const { input } = mountChoiceWidget(
      api,
      "q125:1_choice2",
      sourceAnswerData({
        reduxshare: slottedAnswerData([
          answerSlot(3, {
            anchors: ["between 10 and 20 percent of the time."],
            suggestions: [
              { ...slottedExactSuggestion("false", 3, 0.75, 3) },
              { ...slottedExactSuggestion("true", 3, 0.25, 1) },
            ],
          }),
        ]),
      }),
    );

    const root = getPortalRoot();
    const exactOptions = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[data-answer-menu="reduxshare-exact"] .flyout-option[data-answer-label]',
      ),
    );

    expect(exactOptions.map((option) => option.dataset.answerLabel)).toEqual(["false"]);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="reduxshare-stats"] [data-answer-label="false"]',
      ),
    ).toBeTruthy();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="reduxshare-stats"] [data-answer-label="true"]',
      ),
    ).toBeTruthy();

    exactOptions[0].click();

    expect(input.checked).toBe(false);
  });

  it("matches ReduxShare multichoice checkbox slots by option label even when the visible order is shuffled", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    const answerContainer = document.querySelector(".answer");
    expect(answerContainer).toBeInstanceOf(HTMLElement);

    const rows = Array.from(answerContainer!.children);
    expect(rows).toHaveLength(4);
    answerContainer!.append(rows[0], rows[2], rows[3], rows[1]);

    api.setSourceAnswerData(
      "1385",
      "reduxshare",
      slottedAnswerData([
        answerSlot(1, {
          anchors: ["63 percent of the time."],
          suggestions: [slottedExactSuggestion("true", 1)],
        }),
        answerSlot(2, {
          anchors: ["23 percent of the time."],
          suggestions: [slottedExactSuggestion("false", 2)],
        }),
        answerSlot(3, {
          anchors: ["between 10 and 20 percent of the time."],
          suggestions: [slottedExactSuggestion("false", 3)],
        }),
        answerSlot(4, {
          anchors: ["47 percent of the time."],
          suggestions: [slottedExactSuggestion("false", 4)],
        }),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const host = document.querySelector<HTMLElement>(
      '[data-reduxshare-choice-input-id="q125:1_choice0"]',
    );
    expect(host).toBeInstanceOf(HTMLElement);
    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    const exactOption = root.querySelector<HTMLElement>(
      '[data-answer-menu="reduxshare-exact"] [data-answer-label="true"]',
    );
    expect(exactOption).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="reduxshare-exact"] [data-answer-label="false"]',
      ),
    ).toBeFalsy();
  });

  it("does not bind polluted legacy positional multichoice boolean rows to a shuffled option", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");

    api.setSourceAnswerData(
      "1385",
      "reduxshare",
      slottedAnswerData([
        answerSlot(2, {
          anchors: ["slot:2"],
          suggestions: [
            { ...slottedExactSuggestion("false", 2, 0.5, 2) },
            { ...slottedExactSuggestion("true", 2, 0.5, 2) },
          ],
        }),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const host = document.querySelector<HTMLElement>(
      '[data-reduxshare-choice-input-id="q125:1_choice1"]',
    );
    expect(host).toBeInstanceOf(HTMLElement);
    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-menu-tab="internal"]')).toBeFalsy();
  });

  it("auto-selects match answers by prompt anchor instead of row order", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("match", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, { anchors: ["сила"], suggestions: [slottedExactSuggestion("ньютон", 1)] }),
      answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
      answerSlot(3, { anchors: ["Напряжение"], suggestions: [slottedExactSuggestion("Вольт", 3)] }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuq126:12_sub1") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("menuq126:12_sub2") as HTMLSelectElement).value).toBe("3");
  });

  it("scopes match R-menu suggestions by prompt anchor instead of slot index", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
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

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Вольт"]',
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="ньютон"]',
      ),
    ).toBeNull();
  });

  it("does not fall back to positional match R-menu suggestions when prompt anchors disagree", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        answerSlot(1, {
          anchors: ["unmatched force"],
          suggestions: [slottedExactSuggestion("ньютон", 1)],
        }),
        answerSlot(2, {
          anchors: ["unmatched mass"],
          suggestions: [slottedExactSuggestion("Килограмм", 2)],
        }),
        answerSlot(3, {
          anchors: ["unmatched voltage"],
          suggestions: [slottedExactSuggestion("Вольт", 3)],
        }),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-label="ньютон"]')).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-answer-label="Килограмм"]')).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-answer-label="Вольт"]')).toBeNull();
  });

  it("does not auto-select match answers from positional slots when prompt anchors disagree", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("match", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, {
        anchors: ["unmatched force"],
        suggestions: [slottedExactSuggestion("ньютон", 1)],
      }),
      answerSlot(2, {
        anchors: ["unmatched mass"],
        suggestions: [slottedExactSuggestion("Килограмм", 2)],
      }),
      answerSlot(3, {
        anchors: ["unmatched voltage"],
        suggestions: [slottedExactSuggestion("Вольт", 3)],
      }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(false);

    expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("0");
    expect((document.getElementById("menuq126:12_sub1") as HTMLSelectElement).value).toBe("0");
    expect((document.getElementById("menuq126:12_sub2") as HTMLSelectElement).value).toBe("0");
  });

  it("scopes match R-menu suggestions by opaque hash anchor when the hash matches the prompt", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();

    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        opaqueHashSlot(1, "-1192169056", "ньютон"),
        opaqueHashSlot(2, "123456789", "Килограмм"),
        opaqueHashSlot(3, "987654321", "Вольт"),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="ньютон"]',
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Килограмм"]',
      ),
    ).toBeNull();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Вольт"]',
      ),
    ).toBeNull();
  });

  it("auto-selects match answers by opaque hash anchor when the hash matches the prompt", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("match", "attempt");
    const answerData = slottedAnswerData([
      opaqueHashSlot(1, "-1192169056", "ньютон"),
      opaqueHashSlot(2, "123456789", "Килограмм"),
      opaqueHashSlot(3, "987654321", "Вольт"),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    const sub0 = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(sub0.options[sub0.selectedIndex]?.textContent).toContain("ньютон");
  });

  it("scopes match R-menu suggestions positionally for opaque anchors without a prompt match", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();

    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        opaqueHashSlot(1, "111111111", "ньютон"),
        opaqueHashSlot(2, "222222222", "Килограмм"),
        opaqueHashSlot(3, "333333333", "Вольт"),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="ньютон"]',
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Килограмм"]',
      ),
    ).toBeNull();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Вольт"]',
      ),
    ).toBeNull();
  });

  it("shows unbound statistics but no exact answers for opaque hashes without a prompt match", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        {
          index: 1,
          hasExplicitIndex: false,
          anchors: ["111111111"],
          suggestions: [slottedExactSuggestion("ньютон", 1)],
          submissions: [{ correctness: 2, count: 1, label: "ньютон" }],
        },
        {
          index: 2,
          hasExplicitIndex: false,
          anchors: ["222222222"],
          suggestions: [slottedExactSuggestion("Килограмм", 2)],
          submissions: [
            { correctness: -1, count: 1, label: "Вольт" },
            { correctness: 2, count: 1, label: "Килограмм" },
          ],
        },
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector('[data-answer-menu="external-exact"]')?.textContent).toContain(
      "Нет ответов",
    );
    expect(
      root.querySelector('[data-answer-menu="external-exact"] [data-answer-label]'),
    ).toBeNull();

    const statsLabels = (label: string) =>
      Array.from(root.querySelectorAll('[data-answer-menu="external-stats"] .flyout-label')).find(
        (node) => node.textContent?.trim() === label,
      );
    expect(statsLabels("ньютон")).toBeInstanceOf(HTMLElement);
    expect(statsLabels("Килограмм")).toBeInstanceOf(HTMLElement);
    expect(statsLabels("Вольт")?.className).toContain("flyout-label--wrong");
  });

  it("scopes match R-menu suggestions by near-miss anchor text", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        answerSlot(1, {
          anchors: ["Напряжении"],
          suggestions: [slottedExactSuggestion("Вольт", 1)],
        }),
        answerSlot(2, {
          anchors: ["Масса"],
          suggestions: [slottedExactSuggestion("Килограмм", 2)],
        }),
        answerSlot(3, { anchors: ["сила"], suggestions: [slottedExactSuggestion("ньютон", 3)] }),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Вольт"]',
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="ньютон"]',
      ),
    ).toBeNull();
  });

  it("auto-selects match answers through near-miss option labels", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("match", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, {
        anchors: ["Напряжение"],
        suggestions: [slottedExactSuggestion("Вольтт", 1)],
      }),
      answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
      answerSlot(3, { anchors: ["сила"], suggestions: [slottedExactSuggestion("ньютон", 3)] }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);
    expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("2");
  });

  it("auto-selects image match answers by image prompt identity", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("match", "attemptwithimage");
    const answerData = slottedAnswerData([
      answerSlot(1, {
        anchors: ["image:qtype_match/subquestion/96/icon5.png"],
        suggestions: [slottedExactSuggestion("Snapchat", 1)],
      }),
      answerSlot(2, {
        anchors: ["image:qtype_match/subquestion/95/icon3.png"],
        suggestions: [slottedExactSuggestion("Instagram", 2)],
      }),
      answerSlot(3, {
        anchors: ["image:qtype_match/subquestion/97/icon66.png"],
        suggestions: [slottedExactSuggestion("Yelp", 3)],
      }),
      answerSlot(4, {
        anchors: ["image:qtype_match/subquestion/99/icon1.png"],
        suggestions: [slottedExactSuggestion("Twitter", 4)],
      }),
      answerSlot(5, {
        anchors: ["image:qtype_match/subquestion/98/icon22.png"],
        suggestions: [slottedExactSuggestion("LinkedIn", 5)],
      }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect((document.getElementById("menuq130:4_sub0") as HTMLSelectElement).value).toBe("6");
    expect((document.getElementById("menuq130:4_sub1") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuq130:4_sub2") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("menuq130:4_sub3") as HTMLSelectElement).value).toBe("3");
    expect((document.getElementById("menuq130:4_sub4") as HTMLSelectElement).value).toBe("5");
  });

  it("auto-selects image match answers by provider image hash anchor", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("match", "attemptwithimage");

    const answerData = slottedAnswerData([
      opaqueHashSlot(1, "1414805592", "Snapchat"),
      opaqueHashSlot(2, "-1859093350", "Yelp"),
      opaqueHashSlot(3, "1860956741", "Instagram"),
      opaqueHashSlot(4, "-838024996", "Twitter"),
      opaqueHashSlot(5, "-1510145339", "LinkedIn"),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect((document.getElementById("menuq130:4_sub0") as HTMLSelectElement).value).toBe("6");
    expect((document.getElementById("menuq130:4_sub1") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("menuq130:4_sub2") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuq130:4_sub3") as HTMLSelectElement).value).toBe("3");
    expect((document.getElementById("menuq130:4_sub4") as HTMLSelectElement).value).toBe("5");
  });

  it("scopes image match R-menu suggestions by provider image hash anchor", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attemptwithimage");
    removeFixtureWidgetPlaceholders();
    api.setSourceAnswerData(
      "1349",
      "external",
      slottedAnswerData([
        opaqueHashSlot(1, "1414805592", "Snapchat"),
        opaqueHashSlot(2, "-1859093350", "Yelp"),
        opaqueHashSlot(3, "1860956741", "Instagram"),
        opaqueHashSlot(4, "-838024996", "Twitter"),
        opaqueHashSlot(5, "-1510145339", "LinkedIn"),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq130:4_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Snapchat"]',
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Yelp"]',
      ),
    ).toBeNull();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="LinkedIn"]',
      ),
    ).toBeNull();
  });

  it("scopes image match R-menu suggestions by image prompt identity", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attemptwithimage");
    removeFixtureWidgetPlaceholders();
    api.setSourceAnswerData(
      "1349",
      "external",
      slottedAnswerData([
        answerSlot(1, {
          anchors: ["image:qtype_match/subquestion/96/icon5.png"],
          suggestions: [slottedExactSuggestion("Snapchat", 1)],
        }),
        answerSlot(2, {
          anchors: ["image:qtype_match/subquestion/95/icon3.png"],
          suggestions: [slottedExactSuggestion("Instagram", 2)],
        }),
        answerSlot(3, {
          anchors: ["image:qtype_match/subquestion/97/icon66.png"],
          suggestions: [slottedExactSuggestion("Yelp", 3)],
        }),
        answerSlot(4, {
          anchors: ["image:qtype_match/subquestion/99/icon1.png"],
          suggestions: [slottedExactSuggestion("Twitter", 4)],
        }),
        answerSlot(5, {
          anchors: ["image:qtype_match/subquestion/98/icon22.png"],
          suggestions: [slottedExactSuggestion("LinkedIn", 5)],
        }),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const firstSelect = document.getElementById("menuq130:4_sub0") as HTMLSelectElement;
    expect(firstSelect).toBeInstanceOf(HTMLSelectElement);
    const firstHost = getInlineWidgetHostForSelect(firstSelect);

    firstHost.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    let root = getPortalRoot();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Snapchat"]',
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Instagram"]',
      ),
    ).toBeNull();

    firstHost.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const secondSelect = document.getElementById("menuq130:4_sub1") as HTMLSelectElement;
    expect(secondSelect).toBeInstanceOf(HTMLSelectElement);
    const secondHost = getInlineWidgetHostForSelect(secondSelect);

    secondHost.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    root = getPortalRoot();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Instagram"]',
      ),
    ).toBeInstanceOf(HTMLElement);
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Snapchat"]',
      ),
    ).toBeNull();
  });

  it("matches legacy full-path image match anchors by filename", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attemptwithimage");
    removeFixtureWidgetPlaceholders();
    api.setSourceAnswerData(
      "1349",
      "external",
      slottedAnswerData([
        answerSlot(1, {
          anchors: ["image:/pluginfile.php/2354/qtype_match/subquestion/130/4/96/icon5.png"],
          suggestions: [slottedExactSuggestion("Snapchat", 1)],
        }),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const firstSelect = document.getElementById("menuq130:4_sub0") as HTMLSelectElement;
    expect(firstSelect).toBeInstanceOf(HTMLSelectElement);
    const firstHost = getInlineWidgetHostForSelect(firstSelect);

    firstHost.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(
      root.querySelector<HTMLElement>(
        '[data-answer-menu="external-exact"] [data-answer-label="Snapchat"]',
      ),
    ).toBeInstanceOf(HTMLElement);
  });

  it("auto-selects randomsamatch answers by prompt anchor", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("randomsamatch", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, {
        anchors: ["Как называется внутренняя жидкая среда клетки?"],
        suggestions: [slottedExactSuggestion("цитоплазма", 1)],
      }),
      answerSlot(2, {
        anchors: ["Какой органоид хранит наследственную информацию?"],
        suggestions: [slottedExactSuggestion("ядро", 2)],
      }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect((document.getElementById("menuq123:11_sub0") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuq123:11_sub1") as HTMLSelectElement).value).toBe("1");
  });

  it("auto-selects truefalse from a question-level exact label answer", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("truefalse", "attempt");

    expect(api.autoSelectQuestionAnswers(questionNode, exactAnswerData("False"))).toBe(true);

    expect((document.getElementById("q134:8_answertrue") as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById("q134:8_answerfalse") as HTMLInputElement).checked).toBe(true);
  });

  it("auto-selects truefalse from slotted internal-source exact data", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("truefalse", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, {
        anchors: ["question"],
        suggestions: [slottedExactSuggestion("False", 1)],
      }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect((document.getElementById("q134:8_answertrue") as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById("q134:8_answerfalse") as HTMLInputElement).checked).toBe(true);
  });

  it("applies a full ddmarker External coordinate set without visible home-marker copies", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("ddmarker", "attempt");
    questionNode
      .querySelectorAll('[data-reduxshare-answer-widget="true"]')
      .forEach((node) => node.remove());
    const targetNode = questionNode.querySelector<HTMLElement>(
      ".draghomes .marker.choice2:not(.dragplaceholder)",
    );
    expect(targetNode).toBeInstanceOf(HTMLElement);
    const fullAnswerData = slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("250,250", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("350,350", 2)] }),
      answerSlot(3, { suggestions: [slottedExactSuggestion("450,450", 3)] }),
      answerSlot(4, { suggestions: [slottedExactSuggestion("550,550", 4)] }),
    ]);
    api.setSourceAnswerData("3700", "external", fullAnswerData);

    const host = api.createAnswerWidgetHost(
      "#5eead4",
      "3700",
      api.createEmptyVariantCounts(),
      sourceAnswerData({
        external: {
          anchors: [],
          suggestions: [exactSuggestion("350,350")],
          submissions: [],
          slots: [],
        },
      }),
      2,
      true,
    );
    host.setAttribute("data-reduxshare-ddmarker-choice", "2");
    targetNode!.after(host);

    host.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();
    const root = getPortalRoot();
    const exactOption = root.querySelector<HTMLElement>(
      '[data-answer-menu="external-exact"] [data-answer-label="350,350"]',
    );
    expect(exactOption).toBeInstanceOf(HTMLElement);

    exactOption!.click();

    expect((document.getElementById("q128_12_c1") as HTMLInputElement).value).toBe("250,250");
    expect((document.getElementById("q128_12_c2") as HTMLInputElement).value).toBe("350,350");
    expect((document.getElementById("q128_12_c3") as HTMLInputElement).value).toBe("450,450");
    expect((document.getElementById("q128_12_c4") as HTMLInputElement).value).toBe("550,550");
    expect(
      questionNode.querySelectorAll('.droparea [data-reduxshare-ddmarker-marker="true"]'),
    ).toHaveLength(4);
    expect(questionNode.querySelectorAll(".draghomes .marker:not(.dragplaceholder)")).toHaveLength(
      4,
    );
    expect(
      Array.from(
        questionNode.querySelectorAll<HTMLElement>(".draghomes .marker:not(.dragplaceholder)"),
      ).every((marker) => marker.style.display === "none"),
    ).toBe(true);
    expect(host.parentElement?.classList.contains("droparea")).toBe(true);
    expect(host.style.position).toBe("absolute");
  });

  it("auto-selects all ddmarker coordinates without leaving visible home-marker copies", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("ddmarker", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("250,250", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("350,350", 2)] }),
      answerSlot(3, { suggestions: [slottedExactSuggestion("450,450", 3)] }),
      answerSlot(4, { suggestions: [slottedExactSuggestion("550,550", 4)] }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect(
      questionNode.querySelectorAll('.droparea [data-reduxshare-ddmarker-marker="true"]'),
    ).toHaveLength(4);
    expect((document.getElementById("q128_12_c1") as HTMLInputElement).value).toBe("250,250");
    expect((document.getElementById("q128_12_c2") as HTMLInputElement).value).toBe("350,350");
    expect((document.getElementById("q128_12_c3") as HTMLInputElement).value).toBe("450,450");
    expect((document.getElementById("q128_12_c4") as HTMLInputElement).value).toBe("550,550");
    expect(
      Array.from(questionNode.querySelectorAll<HTMLElement>(".draghomes .marker")).every(
        (marker) => marker.style.display === "none",
      ),
    ).toBe(true);
  });

  it("mounts one multianswer R widget and applies all exact slots from it", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multianswer", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("цитоплазма", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("ядро", 2)] }),
      answerSlot(3, { suggestions: [slottedExactSuggestion("40", 3)] }),
    ]);
    api.setSourceAnswerData("3700", "reduxshare", answerData);

    api.mountAnswerWidgets("#5eead4");

    const hosts = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
    );
    expect(hosts).toHaveLength(1);
    expect(hosts[0].dataset.reduxshareCompoundQuestion).toBe("true");
    expect(hosts[0].parentElement?.classList.contains("formulation")).toBe(true);

    hosts[0].shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();
    const root = getPortalRoot();
    const exactOption = root.querySelector<HTMLElement>(
      '[data-answer-menu="reduxshare-exact"] [data-answer-label="цитоплазма"]',
    );
    expect(exactOption).toBeInstanceOf(HTMLElement);

    exactOption!.click();

    expect((document.getElementById("q129:12_sub1_answer") as HTMLInputElement).value).toBe(
      "цитоплазма",
    );
    expect((document.getElementById("q129:12_sub2_answer") as HTMLSelectElement).value).toBe("0");
    expect((document.getElementById("q129:12_sub3_answer") as HTMLInputElement).value).toBe("40");
  });
});

describe("human-like auto-select scheduling", () => {
  function baseStoredState() {
    return {
      settings: {
        extensionEnabled: true,
        stealthMode: true,
        language: "ru",
        autoSelect: true,
        autoSelectAvgSeconds: 4,
      },
      authSession: null,
    };
  }

  function dispatchStorageChange(state: unknown) {
    return chrome.storage.local.set({ reduxshare: state });
  }

  it("applies auto-select through the storage watcher flow", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
    api.setStoredState(baseStoredState());

    const currentState = baseStoredState();
    setCurrentStoredState(currentState);
    syncLanguage(currentState);
    syncStealthMode(currentState);
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

    api.watchStoredSettingsChanges();

    await dispatchStorageChange(baseStoredState());
    await new Promise((resolve) => setTimeout(resolve, 300));

    await dispatchStorageChange(baseStoredState());
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("2");
  });

  function deterministicRandom() {
    let seed = 42;
    return () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
  }

  it("computes delays around the average with bounded variance", async () => {
    const api = await getQuizAttemptTestApi();
    const random = deterministicRandom();
    const delays = Array.from({ length: 200 }, () => api.computeAutoSelectDelayMs(4, random, null));

    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(60000);
    }

    const mean = delays.reduce((sum, delay) => sum + delay, 0) / delays.length;
    expect(mean).toBeGreaterThan(3000);
    expect(mean).toBeLessThan(5000);
  });

  it("draws delays from a heavy-tailed distribution around the average", async () => {
    const api = await getQuizAttemptTestApi();
    const random = deterministicRandom();
    const delays = Array.from({ length: 300 }, () => api.computeAutoSelectDelayMs(4, random, null));

    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(60000);
    }

    const sorted = [...delays].sort((a, b) => a - b);
    const mean = delays.reduce((sum, delay) => sum + delay, 0) / delays.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(mean).toBeGreaterThan(3000);
    expect(mean).toBeLessThan(5000);
    expect(median).toBeLessThan(mean);
    expect(sorted[sorted.length - 1]).toBeGreaterThan(8000);
  });

  it("adds reading time, first-question bonus and interactive floor", async () => {
    const api = await getQuizAttemptTestApi();
    const steady = () => 0.5;
    const base = api.computeAutoSelectDelayMs(4, steady, null, {});

    const withReading = api.computeAutoSelectDelayMs(4, steady, null, { readingSeconds: 10 });
    expect(withReading - base).toBeGreaterThanOrEqual(9999);
    expect(withReading - base).toBeLessThanOrEqual(10001);

    const withFirstBonus = api.computeAutoSelectDelayMs(4, steady, null, { firstInPage: true });
    expect(withFirstBonus - base).toBeGreaterThanOrEqual(5999);
    expect(withFirstBonus - base).toBeLessThanOrEqual(6001);

    const interactive = api.computeAutoSelectDelayMs(4, steady, null, { interactive: true });
    expect(interactive).toBeGreaterThanOrEqual(4000);
    expect(interactive).toBeGreaterThan(base);
  });

  it("estimates reading time from question text and options", async () => {
    const api = await getQuizAttemptTestApi();
    const node = document.createElement("div");
    node.className = "que multichoice deferredfeedback";
    node.innerHTML = `<div class="qtext">${"x".repeat(160)}</div>
      <input type="radio" name="a" /><input type="radio" name="a" />
      <input type="radio" name="a" /><input type="radio" name="a" />`;

    const seconds = api.estimateQuestionReadingSeconds(node);
    expect(seconds).toBeGreaterThanOrEqual(160 / 16 + 4 * 1.2 - 0.001);
    expect(seconds).toBeLessThanOrEqual(45);

    const huge = document.createElement("div");
    huge.textContent = "x".repeat(100000);
    expect(api.estimateQuestionReadingSeconds(huge)).toBe(45);

    const empty = document.createElement("div");
    expect(api.estimateQuestionReadingSeconds(empty)).toBe(0);
  });

  it("detects step-per-action behaviours from the question class", async () => {
    const api = await getQuizAttemptTestApi();
    const interactive = document.createElement("div");
    interactive.className = "que multichoice interactive";
    const deferred = document.createElement("div");
    deferred.className = "que numerical deferredfeedback";
    const unknown = document.createElement("div");
    unknown.className = "que foo bar";

    expect(api.getQuestionBehaviour(interactive)).toBe("interactive");
    expect(api.getQuestionBehaviour(deferred)).toBe("deferredfeedback");
    expect(api.getQuestionBehaviour(unknown)).toBeNull();
    expect(api.isStepPerActionBehaviour("interactive")).toBe(true);
    expect(api.isStepPerActionBehaviour("adaptive")).toBe(true);
    expect(api.isStepPerActionBehaviour("immediatefeedback")).toBe(true);
    expect(api.isStepPerActionBehaviour("deferredfeedback")).toBe(false);
    expect(api.isStepPerActionBehaviour(null)).toBe(false);
  });

  it("shuffles schedule order deterministically without mutating input", async () => {
    const api = await getQuizAttemptTestApi();
    const entries = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];

    function seeded(seed: number) {
      let value = seed;
      return () => {
        value = (value * 1103515245 + 12345) % 2147483648;
        return value / 2147483648;
      };
    }

    const first = api.shuffleScheduleOrder(entries, seeded(7));
    const second = api.shuffleScheduleOrder(entries, seeded(7));
    expect(first).toEqual(second);
    expect([...first].sort()).toEqual([...entries].sort());
    expect(entries).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"]);

    const other = api.shuffleScheduleOrder(entries, seeded(99));
    expect(other).not.toEqual(first);
  });

  it("types text answers character by character with keyboard events", async () => {
    const api = await getQuizAttemptTestApi();
    const input = document.createElement("input");
    input.type = "text";
    document.body.append(input);

    const seen: string[] = [];
    for (const type of ["keydown", "keypress", "input", "keyup", "change"]) {
      input.addEventListener(type, () => seen.push(type));
    }

    const changed = await api.typeTextHumanLike(input, "hi", {
      minIntervalMs: 1,
      maxIntervalMs: 2,
      random: () => 0.5,
    });

    expect(changed).toBe(true);
    expect(input.value).toBe("hi");

    for (const type of ["keydown", "keypress", "input", "keyup", "change"]) {
      expect(seen.filter((event) => event === type).length).toBeGreaterThanOrEqual(
        type === "change" ? 1 : 2,
      );
    }

    expect(await api.typeTextHumanLike(input, "   ")).toBe(false);
    input.remove();
  });

  it("runs scroll and focus precursors without throwing", async () => {
    const api = await getQuizAttemptTestApi();
    const node = document.createElement("div");
    node.tabIndex = -1;
    document.body.append(node);

    await api.runHumanPrecursors(node, () => 0.5);
    expect(document.activeElement).toBe(node);
    node.remove();
  });

  it("falls back to safe defaults for invalid averages", async () => {
    const api = await getQuizAttemptTestApi();

    expect(api.computeAutoSelectDelayMs(Number.NaN, () => 0.5, null)).toBeGreaterThanOrEqual(1000);
    expect(api.computeAutoSelectDelayMs(0, () => 0.5, null)).toBeGreaterThanOrEqual(1000);
  });

  it("rushes delays when little quiz time is left", async () => {
    const api = await getQuizAttemptTestApi();
    const unhurried = api.computeAutoSelectDelayMs(4, () => 0.9999, null);
    const rushed = api.computeAutoSelectDelayMs(4, () => 0.9999, 30);

    expect(rushed).toBeLessThan(unhurried);
    expect(rushed).toBeGreaterThanOrEqual(800);
  });

  it("parses Moodle time-left labels", async () => {
    const api = await getQuizAttemptTestApi();

    expect(api.parseQuizTimeLeftSeconds("Time left 0:05:23")).toBe(323);
    expect(api.parseQuizTimeLeftSeconds("12:34")).toBe(754);
    expect(api.parseQuizTimeLeftSeconds("1:02:03")).toBe(3723);
    expect(api.parseQuizTimeLeftSeconds(null)).toBeNull();
    expect(api.parseQuizTimeLeftSeconds("unlimited")).toBeNull();
  });

  it("binds review-learned boolean slots to the right checkboxes on the next attempt", async () => {
    const api = await getQuizAttemptTestApi();
    document.body.innerHTML = `<div id="question-127-1" class="que multichoice deferredfeedback notyetanswered"><div class="info"><h3 class="no">Question <span class="qno">1</span></h3><div class="state">Not yet answered</div><div class="grade">Marked out of 1.00</div><div class="questionflag editable"><input type="hidden" name="q127:1_:flagged" value="0"><input type="hidden" value="qaid=893&amp;qubaid=127&amp;qid=1385&amp;slot=1&amp;checksum=d9d036b49aaf83eccd86eb2263452893&amp;sesskey=aFHd5HyKHw&amp;newstate=" class="questionflagpostdata"></div></div><div class="content"><div class="formulation clearfix"><h4 class="accesshide">Question text</h4><input type="hidden" name="q127:1_:sequencecheck" value="1"><div class="qtext"><div class="clearfix">Research from Harvard shows the mind wanders, on average.....</div></div><fieldset class="ablock no-overflow visual-scroll-x"><legend class="prompt h6 fw-normal visually-hidden"><span class="visually-hidden">Question 1</span> Answer</legend><div class="answer"><div class="r0"><input type="hidden" name="q127:1_choice0" value="0"><input type="checkbox" name="q127:1_choice0" value="1" id="q127:1_choice0" aria-labelledby="q127:1_choice0_label"><div class="d-flex w-auto" id="q127:1_choice0_label" data-region="answer-label"><div class="flex-fill ms-1"><p dir="ltr" style="text-align: left;">63 percent of the time.</p></div></div></div><div class="r1"><input type="hidden" name="q127:1_choice1" value="0"><input type="checkbox" name="q127:1_choice1" value="1" id="q127:1_choice1" aria-labelledby="q127:1_choice1_label"><div class="d-flex w-auto" id="q127:1_choice1_label" data-region="answer-label"><div class="flex-fill ms-1"><p dir="ltr" style="text-align: left;">23 percent of the time.</p></div></div></div><div class="r0"><input type="hidden" name="q127:1_choice2" value="0"><input type="checkbox" name="q127:1_choice2" value="1" id="q127:1_choice2" aria-labelledby="q127:1_choice2_label"><div class="d-flex w-auto" id="q127:1_choice2_label" data-region="answer-label"><div class="flex-fill ms-1"><p dir="ltr" style="text-align: left;">between 10 and 20 percent of the time.</p></div></div></div><div class="r1"><input type="hidden" name="q127:1_choice3" value="0"><input type="checkbox" name="q127:1_choice3" value="1" id="q127:1_choice3" aria-labelledby="q127:1_choice3_label"><div class="d-flex w-auto" id="q127:1_choice3_label" data-region="answer-label"><div class="flex-fill ms-1"><p dir="ltr" style="text-align: left;">47 percent of the time.</p></div></div></div></div></fieldset></div></div></div>`;
    removeFixtureWidgetPlaceholders();

    api.setSourceAnswerData(
      "1385",
      "reduxshare",
      slottedAnswerData([
        answerSlot(1, {
          anchors: ["63 percent of the time."],
          suggestions: [slottedExactSuggestion("false", 1)],
        }),
        answerSlot(2, {
          anchors: ["23 percent of the time."],
          suggestions: [slottedExactSuggestion("true", 2)],
        }),
        answerSlot(3, {
          anchors: ["between 10 and 20 percent of the time."],
          suggestions: [slottedExactSuggestion("false", 3)],
        }),
        answerSlot(4, {
          anchors: ["47 percent of the time."],
          suggestions: [slottedExactSuggestion("true", 4)],
        }),
      ]),
    );

    api.mountAnswerWidgets("#5eead4");

    const slotIndexes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
    ).map((host) => host.dataset.reduxshareSlotIndex ?? null);

    expect(slotIndexes).toEqual(["1", "2", "3", "4"]);
  });

  it("applies scheduled answers after the delay with a progress bar", async () => {
    vi.useFakeTimers();
    try {
      const api = await getQuizAttemptTestApi();
      loadQuestionFixture("match", "attempt");
      removeFixtureWidgetPlaceholders();
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

      const questionNode = document.querySelector(".que");
      expect(questionNode).toBeInstanceOf(Element);

      const scheduled = api.scheduleAutoSelectAnswer(
        "3699",
        questionNode as Element,
        {
          settings: { extensionEnabled: true, autoSelect: true, autoSelectAvgSeconds: 4 },
          authSession: null,
        },
        false,
      );
      expect(scheduled).toBe(true);

      const hosts = Array.from(
        document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
      );
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts.some((host) => host.shadowRoot?.querySelector(".delay-progress"))).toBe(true);
      expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("0");

      await vi.advanceTimersByTimeAsync(70000);

      expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("2");
      expect(
        Array.from(
          document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'),
        ).some((host) => host.shadowRoot?.querySelector(".delay-progress")),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels scheduled answers when the user answers manually", async () => {
    vi.useFakeTimers();
    try {
      const api = await getQuizAttemptTestApi();
      loadQuestionFixture("match", "attempt");
      removeFixtureWidgetPlaceholders();
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

      const questionNode = document.querySelector(".que");
      expect(questionNode).toBeInstanceOf(Element);

      api.scheduleAutoSelectAnswer(
        "3699",
        questionNode as Element,
        {
          settings: { extensionEnabled: true, autoSelect: true, autoSelectAvgSeconds: 4 },
          authSession: null,
        },
        false,
      );

      const sub0 = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
      sub0.value = "1";
      sub0.dispatchEvent(new Event("input", { bubbles: true }));

      await vi.advanceTimersByTimeAsync(70000);

      expect(sub0.value).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("R-menu vote interactions", () => {
  it("votes from the statistics flyout without applying the answer or closing the menu", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    const sendMessageMock = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ ok: true, votesUp: 4, votesDown: 0, myVote: 1 });
      },
    );

    mountChoiceWidget(
      api,
      "q125:1_choice1",
      sourceAnswerData({
        reduxshare: {
          anchors: [],
          suggestions: [],
          submissions: [votedSubmission("false", { taskId: "task-9", votesUp: 3, votesDown: 0 })],
          slots: [],
        },
      }),
    );

    const root = getPortalRoot();
    const row = root.querySelector<HTMLElement>(
      '[data-answer-menu="reduxshare-stats"] [data-answer-label="false"]',
    );
    expect(row).toBeInstanceOf(HTMLElement);
    const upButton = row!.querySelector<HTMLButtonElement>('[data-vote-action="up"]');
    expect(upButton).toBeInstanceOf(HTMLButtonElement);

    upButton!.click();

    await vi.waitFor(() => {
      expect(upButton!.getAttribute("aria-pressed")).toBe("true");
    });

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "REDUXSHARE_VOTE_ANSWER", payload: { taskId: "task-9", value: 1 } },
      expect.any(Function),
    );
    expect(row!.querySelector('[data-vote-action="up"] .flyout-vote-count')?.textContent).toBe("4");
    expect(row!.getAttribute("data-meta-votes")).toBe("4/0");
    expect(document.querySelector('[data-reduxshare-answer-menu-portal="true"]')).not.toBeNull();
    expect(getInput("q125:1_choice1").checked).toBe(false);
  });

  it("rolls the vote row back when the background rejects the vote", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    const sendMessageMock = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({ ok: false, error: "vote rejected" });
      },
    );

    mountChoiceWidget(
      api,
      "q125:1_choice1",
      sourceAnswerData({
        reduxshare: {
          anchors: [],
          suggestions: [],
          submissions: [votedSubmission("false", { taskId: "task-9", votesUp: 3, votesDown: 0 })],
          slots: [],
        },
      }),
    );

    const root = getPortalRoot();
    const row = root.querySelector<HTMLElement>(
      '[data-answer-menu="reduxshare-stats"] [data-answer-label="false"]',
    );
    const upButton = row!.querySelector<HTMLButtonElement>('[data-vote-action="up"]');

    upButton!.click();

    await vi.waitFor(() => {
      expect(row!.getAttribute("data-meta-votes")).toBe("3/0");
    });

    expect(upButton!.getAttribute("aria-pressed")).toBe("false");
    expect(row!.querySelector('[data-vote-action="up"] .flyout-vote-count')?.textContent).toBe("3");
    expect(document.querySelector('[data-reduxshare-answer-menu-portal="true"]')).not.toBeNull();
  });

  it("switches to the opposite vote and back off within one open menu", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multichoice", "attempt");
    const sendMessageMock = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    const responses = [
      { ok: true, votesUp: 0, votesDown: 1, myVote: -1 },
      { ok: true, votesUp: 0, votesDown: 0, myVote: 0 },
    ];
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.(responses.shift() ?? { ok: true, votesUp: 0, votesDown: 0, myVote: 0 });
      },
    );

    mountChoiceWidget(
      api,
      "q125:1_choice1",
      sourceAnswerData({
        reduxshare: {
          anchors: [],
          suggestions: [],
          submissions: [votedSubmission("false", { taskId: "task-9", votesUp: 1, votesDown: 0 })],
          slots: [],
        },
      }),
    );

    const root = getPortalRoot();
    const row = root.querySelector<HTMLElement>(
      '[data-answer-menu="reduxshare-stats"] [data-answer-label="false"]',
    )!;
    const downButton = row.querySelector<HTMLButtonElement>('[data-vote-action="down"]')!;

    downButton.click();

    await vi.waitFor(() => {
      expect(downButton.getAttribute("aria-pressed")).toBe("true");
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    downButton.click();

    await vi.waitFor(() => {
      expect(downButton.getAttribute("aria-pressed")).toBe("false");
    });
    expect(row.getAttribute("data-meta-votes")).toBe("0/0");
    expect(document.querySelector('[data-reduxshare-answer-menu-portal="true"]')).not.toBeNull();
  });
});
