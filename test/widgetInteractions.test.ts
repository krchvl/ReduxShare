import { describe, expect, it } from "vitest";
import type { SourceAnswerData } from "../src/content/quizAttempt/model";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import {
  answerSlot,
  exactAnswerData,
  exactSuggestion,
  sourceAnswerData,
  slottedAnswerData,
  slottedExactSuggestion
} from "./helpers/sourceData";

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
