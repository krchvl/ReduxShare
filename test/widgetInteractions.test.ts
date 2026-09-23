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
  slottedExactSuggestion
} from "./helpers/sourceData";

function opaqueHashSlot(index: number, hash: string, suggestionLabel: string): AnswerSlotData {
  return {
    index,
    hasExplicitIndex: false,
    anchors: [hash],
    suggestions: [slottedExactSuggestion(suggestionLabel, index)],
    submissions: []
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
  const hosts = Array.from(select.parentElement?.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]') ?? []);
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

function mountChoiceWidget(api: Awaited<ReturnType<typeof getQuizAttemptTestApi>>, inputId: string, answerData: SourceAnswerData) {
  const input = getInput(inputId);
  const label = document.getElementById(`${inputId}_label`);
  expect(label).toBeInstanceOf(HTMLElement);

  const host = api.createAnswerWidgetHost("#ff6b6f", "1385", api.createEmptyVariantCounts(), answerData, null, true);
  host.setAttribute("data-reduxshare-choice-input-id", inputId);
  label!.append(host);

  const trigger = host.shadowRoot?.querySelector<HTMLButtonElement>(".trigger");
  expect(trigger).toBeInstanceOf(HTMLButtonElement);
  trigger!.click();

  return {
    input,
    host,
    trigger: trigger!
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
        accentColor: "#9cb9f6"
      },
      authSession: null
    });
    // Manual sync of settings changes (equivalent to watchStoredSettingsChanges)
    const currentState = api.getStoredState();
    setCurrentStoredState(currentState);
    syncLanguage(currentState);
    syncStealthMode(currentState);
    syncAnswerWidgetHotkey(currentState);
    syncPageOverlayOpacity(currentState);
    api.mountAnswerWidgets("#9cb9f6");

    // Register the storage watcher so chrome.storage.local.set triggers the live-update path
    api.watchStoredSettingsChanges();

    const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'));
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host.style.getPropertyValue("--reduxshare-accent")).toBe("#9cb9f6");
    }

    const storedState = {
      settings: {
        extensionEnabled: true,
        stealthMode: true,
        language: "ru",
        accentColor: "#9cb9f6"
      },
      authSession: null
    };

    // The mock now dispatches onChanged from storage.local.set like real Chrome:
    // first write initializes the attempt context (async), the second one exercises
    // the live-update path.
    await chrome.storage.local.set({ reduxshare: storedState });
    await new Promise((resolve) => setTimeout(resolve, 300));

    await chrome.storage.local.set({
      reduxshare: {
        settings: {
          extensionEnabled: true,
          stealthMode: true,
          language: "ru",
          accentColor: "#ff0000"
        },
        authSession: null
      }
    });

    for (const host of Array.from(document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'))) {
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
        colorScheme: "light"
      },
      authSession: null
    });
    api.mountAnswerWidgets("#5eead4");

    const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'));
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
        language: "ru"
      },
      authSession: null
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
          slots: []
        },
        external: {
          anchors: [],
          suggestions: [exactSuggestion("true")],
          submissions: [],
          slots: []
        }
      })
    );

    const root = getPortalRoot();
    expect(root.querySelector('[data-menu-tab="internal"]')).toBeNull();
    expect(root.querySelector('[data-menu-tab="ai"]')).toBeNull();
    expect(root.querySelector('[data-menu-tab="external"]')).toBeInstanceOf(HTMLButtonElement);
    expect(root.querySelector('[data-answer-menu="external-exact"] [data-answer-label="true"]')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector('[data-answer-menu="reduxshare-exact"] [data-answer-label="false"]')).toBeNull();
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
          slots: []
        },
        external: {
          anchors: [],
          suggestions: [exactSuggestion("true")],
          submissions: [],
          slots: []
        }
      })
    );

    const root = getPortalRoot();
    const externalTab = root.querySelector<HTMLButtonElement>('[data-menu-tab="external"]');
    expect(externalTab).toBeInstanceOf(HTMLButtonElement);

    externalTab!.click();

    expect(externalTab!.dataset.active).toBe("true");
    expect(root.querySelector<HTMLElement>('[data-menu-panel="external"]')?.dataset.active).toBe("true");

    const trueOption = root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="true"]');
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
          slots: []
        }
      })
    );

    const root = getPortalRoot();
    const falseOption = root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="false"]');
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
      answerSlot(4, { suggestions: [slottedExactSuggestion("true", 4)] })
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
              { ...slottedExactSuggestion("true", 3, 0.25, 1) }
            ]
          })
        ])
      })
    );

    const root = getPortalRoot();
    const exactOptions = Array.from(root.querySelectorAll<HTMLElement>('[data-answer-menu="reduxshare-exact"] .flyout-option[data-answer-label]'));

    expect(exactOptions.map((option) => option.dataset.answerLabel)).toEqual(["false"]);
    expect(root.querySelector<HTMLElement>('[data-answer-menu="reduxshare-stats"] [data-answer-label="false"]')).toBeTruthy();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="reduxshare-stats"] [data-answer-label="true"]')).toBeTruthy();

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
        answerSlot(1, { anchors: ["63 percent of the time."], suggestions: [slottedExactSuggestion("true", 1)] }),
        answerSlot(2, { anchors: ["23 percent of the time."], suggestions: [slottedExactSuggestion("false", 2)] }),
        answerSlot(3, {
          anchors: ["between 10 and 20 percent of the time."],
          suggestions: [slottedExactSuggestion("false", 3)]
        }),
        answerSlot(4, { anchors: ["47 percent of the time."], suggestions: [slottedExactSuggestion("false", 4)] })
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const host = document.querySelector<HTMLElement>('[data-reduxshare-choice-input-id="q125:1_choice0"]');
    expect(host).toBeInstanceOf(HTMLElement);
    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    const exactOption = root.querySelector<HTMLElement>('[data-answer-menu="reduxshare-exact"] [data-answer-label="true"]');
    expect(exactOption).toBeInstanceOf(HTMLElement);
    expect(root.querySelector<HTMLElement>('[data-answer-menu="reduxshare-exact"] [data-answer-label="false"]')).toBeFalsy();
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
            { ...slottedExactSuggestion("true", 2, 0.5, 2) }
          ]
        })
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const host = document.querySelector<HTMLElement>('[data-reduxshare-choice-input-id="q125:1_choice1"]');
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
      answerSlot(3, { anchors: ["Напряжение"], suggestions: [slottedExactSuggestion("Вольт", 3)] })
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
        answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
        answerSlot(3, { anchors: ["Напряжение"], suggestions: [slottedExactSuggestion("Вольт", 3)] })
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Вольт"]')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="ньютон"]')).toBeNull();
  });

  it("does not fall back to positional match R-menu suggestions when prompt anchors disagree", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        answerSlot(1, { anchors: ["unmatched force"], suggestions: [slottedExactSuggestion("ньютон", 1)] }),
        answerSlot(2, { anchors: ["unmatched mass"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
        answerSlot(3, { anchors: ["unmatched voltage"], suggestions: [slottedExactSuggestion("Вольт", 3)] })
      ])
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
      answerSlot(1, { anchors: ["unmatched force"], suggestions: [slottedExactSuggestion("ньютон", 1)] }),
      answerSlot(2, { anchors: ["unmatched mass"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
      answerSlot(3, { anchors: ["unmatched voltage"], suggestions: [slottedExactSuggestion("Вольт", 3)] })
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
    // Shape mirrors syncshare responses: anchor tuples like ["", "-1192169056"]
    // parse into hash-only anchors; -1192169056 is the Java hash of "напряжение".
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        opaqueHashSlot(1, "-1192169056", "ньютон"),
        opaqueHashSlot(2, "123456789", "Килограмм"),
        opaqueHashSlot(3, "987654321", "Вольт")
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="ньютон"]')).toBeInstanceOf(
      HTMLElement
    );
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Килограмм"]')).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Вольт"]')).toBeNull();
  });

  it("auto-selects match answers by opaque hash anchor when the hash matches the prompt", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("match", "attempt");
    const answerData = slottedAnswerData([
      opaqueHashSlot(1, "-1192169056", "ньютон"),
      opaqueHashSlot(2, "123456789", "Килограмм"),
      opaqueHashSlot(3, "987654321", "Вольт")
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    const sub0 = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(sub0.options[sub0.selectedIndex]?.textContent).toContain("ньютон");
  });

  it("scopes match R-menu suggestions positionally for opaque anchors without a prompt match", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
    // Provider-shaped rows with no hash hit: row order mirrors the DOM order
    // of the same variant, so every select maps to exactly one slot.
    api.setSourceAnswerData(
      "3699",
      "external",
      slottedAnswerData([
        opaqueHashSlot(1, "111111111", "ньютон"),
        opaqueHashSlot(2, "222222222", "Килограмм"),
        opaqueHashSlot(3, "333333333", "Вольт")
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="ньютон"]')).toBeInstanceOf(
      HTMLElement
    );
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Килограмм"]')).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Вольт"]')).toBeNull();
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
          submissions: [{ correctness: 2, count: 1, label: "ньютон" }]
        },
        {
          index: 2,
          hasExplicitIndex: false,
          anchors: ["222222222"],
          suggestions: [slottedExactSuggestion("Килограмм", 2)],
          submissions: [
            { correctness: -1, count: 1, label: "Вольт" },
            { correctness: 2, count: 1, label: "Килограмм" }
          ]
        }
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector('[data-answer-menu="external-exact"]')?.textContent).toContain("Нет ответов");
    expect(root.querySelector('[data-answer-menu="external-exact"] [data-answer-label]')).toBeNull();

    const statsLabels = (label: string) =>
      Array.from(root.querySelectorAll('[data-answer-menu="external-stats"] .flyout-label')).find(
        (node) => node.textContent?.trim() === label
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
        answerSlot(1, { anchors: ["Напряжении"], suggestions: [slottedExactSuggestion("Вольт", 1)] }),
        answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
        answerSlot(3, { anchors: ["сила"], suggestions: [slottedExactSuggestion("ньютон", 3)] })
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq126:12_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Вольт"]')).toBeInstanceOf(
      HTMLElement
    );
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="ньютон"]')).toBeNull();
  });

  it("auto-selects match answers through near-miss option labels", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("match", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, { anchors: ["Напряжение"], suggestions: [slottedExactSuggestion("Вольтт", 1)] }),
      answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
      answerSlot(3, { anchors: ["сила"], suggestions: [slottedExactSuggestion("ньютон", 3)] })
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
        suggestions: [slottedExactSuggestion("Snapchat", 1)]
      }),
      answerSlot(2, {
        anchors: ["image:qtype_match/subquestion/95/icon3.png"],
        suggestions: [slottedExactSuggestion("Instagram", 2)]
      }),
      answerSlot(3, {
        anchors: ["image:qtype_match/subquestion/97/icon66.png"],
        suggestions: [slottedExactSuggestion("Yelp", 3)]
      }),
      answerSlot(4, {
        anchors: ["image:qtype_match/subquestion/99/icon1.png"],
        suggestions: [slottedExactSuggestion("Twitter", 4)]
      }),
      answerSlot(5, {
        anchors: ["image:qtype_match/subquestion/98/icon22.png"],
        suggestions: [slottedExactSuggestion("LinkedIn", 5)]
      })
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
    // Provider-shaped opaque anchors: hashQuestionImage of each prompt image.
    const answerData = slottedAnswerData([
      opaqueHashSlot(1, "1414805592", "Snapchat"),
      opaqueHashSlot(2, "-1859093350", "Yelp"),
      opaqueHashSlot(3, "1860956741", "Instagram"),
      opaqueHashSlot(4, "-838024996", "Twitter"),
      opaqueHashSlot(5, "-1510145339", "LinkedIn")
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
        opaqueHashSlot(5, "-1510145339", "LinkedIn")
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const select = document.getElementById("menuq130:4_sub0") as HTMLSelectElement;
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const host = getInlineWidgetHostForSelect(select);

    host!.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Snapchat"]')).toBeInstanceOf(
      HTMLElement
    );
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Yelp"]')).toBeNull();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="LinkedIn"]')).toBeNull();
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
          suggestions: [slottedExactSuggestion("Snapchat", 1)]
        }),
        answerSlot(2, {
          anchors: ["image:qtype_match/subquestion/95/icon3.png"],
          suggestions: [slottedExactSuggestion("Instagram", 2)]
        }),
        answerSlot(3, {
          anchors: ["image:qtype_match/subquestion/97/icon66.png"],
          suggestions: [slottedExactSuggestion("Yelp", 3)]
        }),
        answerSlot(4, {
          anchors: ["image:qtype_match/subquestion/99/icon1.png"],
          suggestions: [slottedExactSuggestion("Twitter", 4)]
        }),
        answerSlot(5, {
          anchors: ["image:qtype_match/subquestion/98/icon22.png"],
          suggestions: [slottedExactSuggestion("LinkedIn", 5)]
        })
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const firstSelect = document.getElementById("menuq130:4_sub0") as HTMLSelectElement;
    expect(firstSelect).toBeInstanceOf(HTMLSelectElement);
    const firstHost = getInlineWidgetHostForSelect(firstSelect);

    firstHost.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    let root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Snapchat"]')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Instagram"]')).toBeNull();

    firstHost.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const secondSelect = document.getElementById("menuq130:4_sub1") as HTMLSelectElement;
    expect(secondSelect).toBeInstanceOf(HTMLSelectElement);
    const secondHost = getInlineWidgetHostForSelect(secondSelect);

    secondHost.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Instagram"]')).toBeInstanceOf(HTMLElement);
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Snapchat"]')).toBeNull();
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
          suggestions: [slottedExactSuggestion("Snapchat", 1)]
        })
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const firstSelect = document.getElementById("menuq130:4_sub0") as HTMLSelectElement;
    expect(firstSelect).toBeInstanceOf(HTMLSelectElement);
    const firstHost = getInlineWidgetHostForSelect(firstSelect);

    firstHost.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();

    const root = getPortalRoot();
    expect(root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="Snapchat"]')).toBeInstanceOf(HTMLElement);
  });

  it("auto-selects randomsamatch answers by prompt anchor", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("randomsamatch", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, {
        anchors: ["Как называется внутренняя жидкая среда клетки?"],
        suggestions: [slottedExactSuggestion("цитоплазма", 1)]
      }),
      answerSlot(2, {
        anchors: ["Какой органоид хранит наследственную информацию?"],
        suggestions: [slottedExactSuggestion("ядро", 2)]
      })
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
        suggestions: [slottedExactSuggestion("False", 1)]
      })
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect((document.getElementById("q134:8_answertrue") as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById("q134:8_answerfalse") as HTMLInputElement).checked).toBe(true);
  });

  it("applies a full ddmarker External coordinate set without visible home-marker copies", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("ddmarker", "attempt");
    questionNode.querySelectorAll('[data-reduxshare-answer-widget="true"]').forEach((node) => node.remove());
    const targetNode = questionNode.querySelector<HTMLElement>(".draghomes .marker.choice2:not(.dragplaceholder)");
    expect(targetNode).toBeInstanceOf(HTMLElement);
    const fullAnswerData = slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("250,250", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("350,350", 2)] }),
      answerSlot(3, { suggestions: [slottedExactSuggestion("450,450", 3)] }),
      answerSlot(4, { suggestions: [slottedExactSuggestion("550,550", 4)] })
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
          slots: []
        }
      }),
      2,
      true
    );
    host.setAttribute("data-reduxshare-ddmarker-choice", "2");
    targetNode!.after(host);

    host.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();
    const root = getPortalRoot();
    const exactOption = root.querySelector<HTMLElement>('[data-answer-menu="external-exact"] [data-answer-label="350,350"]');
    expect(exactOption).toBeInstanceOf(HTMLElement);

    exactOption!.click();

    expect((document.getElementById("q128_12_c1") as HTMLInputElement).value).toBe("250,250");
    expect((document.getElementById("q128_12_c2") as HTMLInputElement).value).toBe("350,350");
    expect((document.getElementById("q128_12_c3") as HTMLInputElement).value).toBe("450,450");
    expect((document.getElementById("q128_12_c4") as HTMLInputElement).value).toBe("550,550");
    expect(questionNode.querySelectorAll('.droparea [data-reduxshare-ddmarker-marker="true"]')).toHaveLength(4);
    expect(questionNode.querySelectorAll(".draghomes .marker:not(.dragplaceholder)")).toHaveLength(4);
    expect(Array.from(questionNode.querySelectorAll<HTMLElement>(".draghomes .marker:not(.dragplaceholder)")).every((marker) => marker.style.display === "none")).toBe(true);
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
      answerSlot(4, { suggestions: [slottedExactSuggestion("550,550", 4)] })
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect(questionNode.querySelectorAll('.droparea [data-reduxshare-ddmarker-marker="true"]')).toHaveLength(4);
    expect((document.getElementById("q128_12_c1") as HTMLInputElement).value).toBe("250,250");
    expect((document.getElementById("q128_12_c2") as HTMLInputElement).value).toBe("350,350");
    expect((document.getElementById("q128_12_c3") as HTMLInputElement).value).toBe("450,450");
    expect((document.getElementById("q128_12_c4") as HTMLInputElement).value).toBe("550,550");
    expect(Array.from(questionNode.querySelectorAll<HTMLElement>(".draghomes .marker")).every((marker) => marker.style.display === "none")).toBe(true);
  });

  it("mounts one multianswer R widget and applies all exact slots from it", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("multianswer", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("цитоплазма", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("ядро", 2)] }),
      answerSlot(3, { suggestions: [slottedExactSuggestion("40", 3)] })
    ]);
    api.setSourceAnswerData("3700", "reduxshare", answerData);

    api.mountAnswerWidgets("#5eead4");

    const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'));
    expect(hosts).toHaveLength(1);
    expect(hosts[0].dataset.reduxshareCompoundQuestion).toBe("true");
    expect(hosts[0].parentElement?.classList.contains("formulation")).toBe(true);

    hosts[0].shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();
    const root = getPortalRoot();
    const exactOption = root.querySelector<HTMLElement>('[data-answer-menu="reduxshare-exact"] [data-answer-label="цитоплазма"]');
    expect(exactOption).toBeInstanceOf(HTMLElement);

    exactOption!.click();

    expect((document.getElementById("q129:12_sub1_answer") as HTMLInputElement).value).toBe("цитоплазма");
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
        autoSelectAvgSeconds: 4
      },
      authSession: null
    };
  }

  function dispatchStorageChange(state: unknown) {
    // The storage mock dispatches onChanged from set() itself; awaiting the write
    // delivers the change to the registered content-script watcher.
    return chrome.storage.local.set({ reduxshare: state });
  }

  it("applies auto-select through the storage watcher flow", async () => {
    const api = await getQuizAttemptTestApi();
    loadQuestionFixture("match", "attempt");
    removeFixtureWidgetPlaceholders();
    api.setStoredState(baseStoredState());
    // Manual sync of settings changes (equivalent to watchStoredSettingsChanges)
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
        answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
        answerSlot(3, { anchors: ["Напряжение"], suggestions: [slottedExactSuggestion("Вольт", 3)] })
      ])
    );
    api.mountAnswerWidgets("#5eead4");

    // Register the storage watcher so dispatchStorageChange triggers auto-select scheduling
    api.watchStoredSettingsChanges();

    await dispatchStorageChange(baseStoredState());
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The first dispatch initializes the attempt context; the second one
    // runs the live-update path like a real settings/data change would.
    // (Test mode applies immediately without timers or progress bars.)
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

  it("randomizes the delay spread between questions", async () => {
    const api = await getQuizAttemptTestApi();
    const random = deterministicRandom();
    const delays = Array.from({ length: 300 }, () => api.computeAutoSelectDelayMs(4, random, null));

    // Spread is randomized in [0.25, 0.55], so avg 4s lands within [1.8s, 6.2s].
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1800);
      expect(delay).toBeLessThanOrEqual(6200);
    }

    // The old build used a fixed +-40% spread; exceeding it proves the spread is randomized.
    const maxDeviation = Math.max(...delays.map((delay) => Math.abs(delay - 4000) / 4000));
    expect(maxDeviation).toBeGreaterThan(0.42);
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

    // Exactly what the review builder saves for a failed checkbox multichoice:
    // per-option expected truth with correctness 2, in review-page slot order 1..4.
    api.setSourceAnswerData(
      "1385",
      "reduxshare",
      slottedAnswerData([
        answerSlot(1, { anchors: ["63 percent of the time."], suggestions: [slottedExactSuggestion("false", 1)] }),
        answerSlot(2, { anchors: ["23 percent of the time."], suggestions: [slottedExactSuggestion("true", 2)] }),
        answerSlot(3, { anchors: ["between 10 and 20 percent of the time."], suggestions: [slottedExactSuggestion("false", 3)] }),
        answerSlot(4, { anchors: ["47 percent of the time."], suggestions: [slottedExactSuggestion("true", 4)] })
      ])
    );

    api.mountAnswerWidgets("#5eead4");

    const slotIndexes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]')
    ).map((host) => host.dataset.reduxshareSlotIndex ?? null);

    // Review slots 1..4 must bind 1:1 to the four checkboxes in attempt-page order.
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
          answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
          answerSlot(3, { anchors: ["Напряжение"], suggestions: [slottedExactSuggestion("Вольт", 3)] })
        ])
      );
      api.mountAnswerWidgets("#5eead4");

      const questionNode = document.querySelector(".que");
      expect(questionNode).toBeInstanceOf(Element);

      const scheduled = api.scheduleAutoSelectAnswer(
        "3699",
        questionNode as Element,
        { settings: { extensionEnabled: true, autoSelect: true, autoSelectAvgSeconds: 4 }, authSession: null },
        false
      );
      expect(scheduled).toBe(true);

      const hosts = Array.from(document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]'));
      expect(hosts.length).toBeGreaterThan(0);
      expect(hosts.some((host) => host.shadowRoot?.querySelector(".delay-progress"))).toBe(true);
      expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("0");

      await vi.advanceTimersByTimeAsync(70000);

      expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("2");
      expect(
        Array.from(document.querySelectorAll<HTMLElement>('[data-reduxshare-answer-widget="true"]')).some(
          (host) => host.shadowRoot?.querySelector(".delay-progress")
        )
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
          answerSlot(2, { anchors: ["Масса"], suggestions: [slottedExactSuggestion("Килограмм", 2)] }),
          answerSlot(3, { anchors: ["Напряжение"], suggestions: [slottedExactSuggestion("Вольт", 3)] })
        ])
      );
      api.mountAnswerWidgets("#5eead4");

      const questionNode = document.querySelector(".que");
      expect(questionNode).toBeInstanceOf(Element);

      // The cancel listener is installed once per page load like in production.
      // ensureAutoSelectCancelListener() removed from test API - equivalent behavior is automatic

      api.scheduleAutoSelectAnswer(
        "3699",
        questionNode as Element,
        { settings: { extensionEnabled: true, autoSelect: true, autoSelectAvgSeconds: 4 }, authSession: null },
        false
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
