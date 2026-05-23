import { describe, expect, it, type Mock } from "vitest";
import type { AiAnswerState } from "../src/content/quizAttempt/model";
import { GENERATE_AI_ANSWER_MESSAGE } from "../src/content/quizAttempt/model";
import { buildQuizAnswerPrompt, normalizeStructuredAiAnswerForPayload, parseStructuredAiAnswer } from "../src/lib/aiProvider";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";

function setQuestionHtml(html: string) {
  document.body.innerHTML = html;
  const questionNode = document.querySelector(".que");
  expect(questionNode).toBeInstanceOf(HTMLElement);
  return questionNode!;
}

function successState(answer: string, actions: AiAnswerState["actions"] = []): AiAnswerState {
  return {
    status: "success",
    answer,
    confidence: 90,
    actions,
    error: null
  };
}

function getControlKinds(payload: unknown) {
  const controls = (payload as { controls?: Array<{ kind: string }> }).controls ?? [];
  return controls.map((control) => control.kind);
}

function getSendMessageMock() {
  return chrome.runtime.sendMessage as unknown as Mock;
}

function setAmpereMatchQuestionHtml() {
  return setQuestionHtml(`
    <div id="question-ampere" class="que match deferredfeedback notyetanswered">
      <div class="content">
        <div class="formulation clearfix">
          <div class="qtext" id="qamp_qtext">Сопоставьте физическую величину с её единицей измерения.</div>
          <div class="ablock">
            <table class="answer table-reboot" role="presentation">
              <tbody role="presentation">
                <tr>
                  <td class="text" id="qamp_sub0_itemtext"><p>сопротивление</p></td>
                  <td class="control">
                    <select id="menuqamp_sub0" name="qamp_sub0" aria-describedby="qamp_qtext qamp_sub0_itemtext">
                      <option selected value="0">Choose...</option>
                      <option value="1">ом</option>
                      <option value="2">ампер</option>
                      <option value="3">вольт</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td class="text" id="qamp_sub1_itemtext"><p>сила тока</p></td>
                  <td class="control">
                    <select id="menuqamp_sub1" name="qamp_sub1" aria-describedby="qamp_sub1_itemtext">
                      <option selected value="0">Choose...</option>
                      <option value="1">ом</option>
                      <option value="2">ампер</option>
                      <option value="3">вольт</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <td class="text" id="qamp_sub2_itemtext"><p>напряжение</p></td>
                  <td class="control">
                    <select id="menuqamp_sub2" name="qamp_sub2" aria-describedby="qamp_sub2_itemtext">
                      <option selected value="0">Choose...</option>
                      <option value="1">ом</option>
                      <option value="2">ампер</option>
                      <option value="3">вольт</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `);
}

describe("AI quiz behavior", () => {
  it("builds AI payload controls for choice, text, select, ordering, drop, and marker questions", async () => {
    const api = await getQuizAttemptTestApi();

    expect(getControlKinds(api.buildAiAnswerRequestPayload(loadQuestionFixture("multichoice", "attempt"), "1385"))).toEqual([
      "choice",
      "choice",
      "choice",
      "choice"
    ]);
    expect(getControlKinds(api.buildAiAnswerRequestPayload(loadQuestionFixture("shortanswer", "attempt"), "2011"))).toEqual([
      "text"
    ]);
    expect(
      getControlKinds(
        api.buildAiAnswerRequestPayload(
          loadQuestionFixture("match", "attempt"),
          "gap-1"
        )
      )
    ).toEqual(["select", "select", "select"]);
    expect(api.buildAiAnswerRequestPayload(loadQuestionFixture("match", "attempt"), "match-1")).toMatchObject({
      controls: [
        {
          kind: "select",
          label: "Напряжение",
          options: expect.arrayContaining([expect.objectContaining({ label: "Вольт" })])
        },
        {
          kind: "select",
          label: "Масса",
          options: expect.arrayContaining([expect.objectContaining({ label: "Килограмм" })])
        },
        {
          kind: "select",
          label: "сила",
          options: expect.arrayContaining([expect.objectContaining({ label: "ньютон" })])
        }
      ]
    });
    expect(api.buildAiAnswerRequestPayload(loadQuestionFixture("randomsamatch", "attempt"), "randomsamatch-1")).toMatchObject({
      questionType: "randomsamatch",
      controls: [
        {
          kind: "select",
          label: "Как называется внутренняя жидкая среда клетки?",
          slotIndex: 1,
          options: expect.arrayContaining([expect.objectContaining({ label: "цитоплазма" })])
        },
        {
          kind: "select",
          label: "Какой органоид хранит наследственную информацию?",
          slotIndex: 2,
          options: expect.arrayContaining([expect.objectContaining({ label: "ядро" })])
        }
      ]
    });
    expect(
      getControlKinds(
        api.buildAiAnswerRequestPayload(
          setQuestionHtml(`
            <div class="que ordering">
              <div class="qtext">Order items</div>
              <div class="answer ordering"><ul class="sortablelist"><li id="item-a"><span data-itemcontent>Alpha</span></li><li id="item-b"><span data-itemcontent>Beta</span></li></ul><input type="hidden" name="q_response" value="item-a,item-b"></div>
            </div>
          `),
          "ordering-1"
        )
      )
    ).toEqual(["ordering-item", "ordering-item"]);
    expect(
      getControlKinds(
        api.buildAiAnswerRequestPayload(
          setQuestionHtml(`
            <div class="que ddwtos">
              <div class="qtext">Fill <span class="drop place1 group1"></span></div>
              <div class="answercontainer"><span class="draghome choice1 group1">alpha</span><input type="hidden" class="placeinput place1" value="0"></div>
            </div>
          `),
          "ddwtos-1"
        )
      )
    ).toEqual(["drop"]);
    expect(
      getControlKinds(
        api.buildAiAnswerRequestPayload(
          setQuestionHtml(`
            <div class="que ddmarker">
              <div class="qtext">Place marker</div>
              <div class="answer"><div class="droparea"></div><input type="hidden" class="choices choice1" value=""><div class="dd-original"><div class="marker choice1"><span class="markertext">City</span></div></div></div>
            </div>
          `),
          "ddmarker-1"
        )
      )
    ).toEqual(["marker"]);
    expect(api.buildAiAnswerRequestPayload(loadQuestionFixture("ddmarker", "attempt"), "3700")).toMatchObject({
      controls: [
        { kind: "marker", label: "Ядро", slotIndex: 1 },
        { kind: "marker", label: "Митохондрия", slotIndex: 2 },
        { kind: "marker", label: "Клеточная мембрана", slotIndex: 3 },
        { kind: "marker", label: "Цитоплазма", slotIndex: 4 }
      ],
      images: [
        expect.objectContaining({
          label: "ddmarker background image",
          url: expect.stringContaining("/pluginfile.php/")
        })
      ]
    });
    expect(
      getControlKinds(
        api.buildAiAnswerRequestPayload(loadQuestionFixture("ddimageortext", "attempt"), "3001")
      )
    ).toEqual(["drop"]);
  });

  it("passes every match dropdown option to AI, including non-selected ampere", async () => {
    const api = await getQuizAttemptTestApi();
    const payload = api.buildAiAnswerRequestPayload(setAmpereMatchQuestionHtml(), "match-ampere") as {
      answerLabels: string[];
      controls: Array<{ label: string; slotIndex: number; options: Array<{ label: string; value: string }> }>;
      questionType: string;
      questionText: string;
      pageUrl: string;
      questionId: string;
    };

    expect(payload.answerLabels).toEqual(expect.arrayContaining(["сопротивление", "сила тока", "напряжение", "ом", "ампер", "вольт"]));
    expect(payload.controls).toMatchObject([
      {
        label: "сопротивление",
        slotIndex: 1,
        options: [
          { label: "ом", value: "1" },
          { label: "ампер", value: "2" },
          { label: "вольт", value: "3" }
        ]
      },
      {
        label: "сила тока",
        slotIndex: 2,
        options: [
          { label: "ом", value: "1" },
          { label: "ампер", value: "2" },
          { label: "вольт", value: "3" }
        ]
      },
      {
        label: "напряжение",
        slotIndex: 3,
        options: [
          { label: "ом", value: "1" },
          { label: "ампер", value: "2" },
          { label: "вольт", value: "3" }
        ]
      }
    ]);
    expect(JSON.stringify(payload.controls)).not.toContain("Choose");

    const prompt = buildQuizAnswerPrompt(payload);
    expect(prompt).toContain("Allowed options by control");
    expect(prompt).toContain("\"сила тока\"");
    expect(prompt).toContain("\"ампер\"");
  });

  it("applies AI shortanswer and choice answers to Moodle controls", async () => {
    const api = await getQuizAttemptTestApi();
    const shortanswerNode = loadQuestionFixture("shortanswer", "attempt");
    const shortanswerInput = document.getElementById("q201:1_answer") as HTMLInputElement;

    expect(api.applyAiAnswerForQuestion(shortanswerNode, successState("Joseph Stalin"))).toBe(true);
    expect(shortanswerInput.value).toBe("Joseph Stalin");

    const multichoiceNode = loadQuestionFixture("multichoice", "attempt");

    expect(api.applyAiAnswerForQuestion(multichoiceNode, successState("47 percent of the time."))).toBe(true);
    expect((document.getElementById("q125:1_choice3") as HTMLInputElement).checked).toBe(true);
  });

  it("applies AI select, ordering, drop, and marker actions by slot/index", async () => {
    const api = await getQuizAttemptTestApi();

    const selectNode = setQuestionHtml(`
      <div class="que gapselect">
        <div class="qtext">Pick the word</div>
        <div class="answer"><select id="gap1"><option value=""></option><option value="1">alpha</option><option value="2">beta</option></select></div>
      </div>
    `);
    expect(api.applyAiAnswerForQuestion(selectNode, successState("", [{ label: "beta", slotIndex: 1 }]))).toBe(true);
    expect((document.getElementById("gap1") as HTMLSelectElement).value).toBe("2");

    const orderingNode = setQuestionHtml(`
      <div class="que ordering">
        <div class="qtext">Order items</div>
        <div class="answer ordering"><ul class="sortablelist"><li id="item-a"><span data-itemcontent>Alpha</span></li><li id="item-b"><span data-itemcontent>Beta</span></li></ul><input type="hidden" name="q_response" value="item-a,item-b"></div>
      </div>
    `);
    expect(api.applyAiAnswerForQuestion(orderingNode, successState("", [{ label: "Beta", position: 1 }, { label: "Alpha", position: 2 }]))).toBe(true);
    expect(Array.from(document.querySelectorAll(".sortablelist li")).map((item) => item.id)).toEqual(["item-b", "item-a"]);

    const dropNode = setQuestionHtml(`
      <div class="que ddwtos">
        <div class="qtext">Fill <span class="drop place1 group1"></span></div>
        <div class="answercontainer"><span class="draghome choice1 group1">alpha</span><input type="hidden" class="placeinput place1" value="0"></div>
      </div>
    `);
    expect(api.applyAiAnswerForQuestion(dropNode, successState("", [{ label: "alpha", slotIndex: 1 }]))).toBe(true);
    expect((document.querySelector(".placeinput.place1") as HTMLInputElement).value).toBe("1");

    const markerNode = setQuestionHtml(`
      <div class="que ddmarker">
        <div class="qtext">Place marker</div>
        <div class="answer"><div class="droparea"></div><input type="hidden" class="choices choice1" value=""><div class="dd-original"><div class="marker choice1"><span class="markertext">City</span></div></div></div>
      </div>
    `);
    expect(api.applyAiAnswerForQuestion(markerNode, successState("", [{ label: "City", slotIndex: 1, coordinate: "12,34" }]))).toBe(true);
    expect((document.querySelector(".choices.choice1") as HTMLInputElement).value).toBe("12,34");
  });

  it("includes ddmarker image metadata in the AI prompt", async () => {
    const api = await getQuizAttemptTestApi();
    const payload = api.buildAiAnswerRequestPayload(loadQuestionFixture("ddmarker", "attempt"), "3700") as Parameters<
      typeof buildQuizAnswerPrompt
    >[0];
    const prompt = buildQuizAnswerPrompt(payload);

    expect(prompt).toContain("Attached question images");
    expect(prompt).toContain("ddmarker background image");
    expect(prompt).toContain("Coordinates must be CSS pixels");
    expect(prompt).toContain("Ядро");
    expect(prompt).toContain("Митохондрия");
  });

  it("keeps ddmarker home markers while updating one overlay marker on the image", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("ddmarker", "attempt");
    const host = questionNode.querySelector<HTMLElement>('[data-reduxshare-ddmarker-choice="2"]')!;

    expect(questionNode.querySelectorAll('.droparea [data-reduxshare-ddmarker-marker="true"][data-reduxshare-ddmarker-choice="2"]')).toHaveLength(0);
    expect(questionNode.querySelectorAll(".draghomes .marker:not(.dragplaceholder)")).toHaveLength(4);
    expect(questionNode.querySelectorAll(".draghomes .marker.choice2:not(.dragplaceholder)")).toHaveLength(1);

    expect(api.applyAiAnswerForQuestion(questionNode, successState("", [{ label: "Митохондрия", slotIndex: 2, coordinate: "350,350" }]))).toBe(true);
    expect((document.getElementById("q128_12_c2") as HTMLInputElement).value).toBe("350,350");
    expect(questionNode.querySelectorAll('.droparea [data-reduxshare-ddmarker-marker="true"][data-reduxshare-ddmarker-choice="2"]')).toHaveLength(1);
    expect(questionNode.querySelectorAll(".draghomes .marker:not(.dragplaceholder)")).toHaveLength(4);
    expect(questionNode.querySelectorAll(".draghomes .marker.choice2:not(.dragplaceholder)")).toHaveLength(1);
    expect((questionNode.querySelector(".draghomes .marker.choice2:not(.dragplaceholder)") as HTMLElement).style.display).toBe("none");
    expect(host.parentElement?.classList.contains("droparea")).toBe(true);
    expect(host.style.position).toBe("absolute");

    expect(api.applyAiAnswerForQuestion(questionNode, successState("", [{ label: "Митохондрия", slotIndex: 2, coordinate: "360,360" }]))).toBe(true);
    expect((document.getElementById("q128_12_c2") as HTMLInputElement).value).toBe("360,360");
    expect(questionNode.querySelectorAll('.droparea [data-reduxshare-ddmarker-marker="true"][data-reduxshare-ddmarker-choice="2"]')).toHaveLength(1);
    expect(questionNode.querySelectorAll(".draghomes .marker:not(.dragplaceholder)")).toHaveLength(4);
    expect(questionNode.querySelectorAll(".draghomes .marker.choice2:not(.dragplaceholder)")).toHaveLength(1);
    expect((questionNode.querySelector(".draghomes .marker.choice2:not(.dragplaceholder)") as HTMLElement).style.display).toBe("none");
    expect(host.parentElement?.classList.contains("droparea")).toBe(true);
  });

  it("moves the existing ddimageortext drag item instead of creating a duplicate", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("ddimageortext", "attempt");

    expect(questionNode.querySelectorAll(".dropzone.place1 .choice2")).toHaveLength(0);
    expect(questionNode.querySelectorAll(".draghomes .choice2:not(.dragplaceholder)")).toHaveLength(1);

    expect(api.applyAiAnswerForQuestion(questionNode, successState("", [{ label: "portraitheadshot.png", slotIndex: 1 }]))).toBe(true);
    expect((document.querySelector(".placeinput.place1") as HTMLInputElement).value).toBe("2");
    expect(questionNode.querySelectorAll(".dropzone.place1 .choice2")).toHaveLength(1);
    expect(questionNode.querySelectorAll(".draghomes .choice2:not(.dragplaceholder)")).toHaveLength(0);

    expect(api.applyAiAnswerForQuestion(questionNode, successState("", [{ label: "portraitheadshot.png", slotIndex: 1 }]))).toBe(false);
    expect(questionNode.querySelectorAll(".dropzone.place1 .choice2")).toHaveLength(1);
    expect(questionNode.querySelectorAll(".draghomes .choice2:not(.dragplaceholder)")).toHaveLength(0);
  });

  it("applies match AI answers returned as prompt-answer pairs", async () => {
    const api = await getQuizAttemptTestApi();
    const matchNode = loadQuestionFixture("match", "attempt");

    expect(
      api.applyAiAnswerForQuestion(
        matchNode,
        successState("Напряжение: Вольт, Масса: Килограмм, сила: ньютон")
      )
    ).toBe(true);
    expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuq126:12_sub1") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("menuq126:12_sub2") as HTMLSelectElement).value).toBe("3");
  });

  it("applies randomsamatch AI answers returned as prompt-answer pairs", async () => {
    const api = await getQuizAttemptTestApi();
    const matchNode = loadQuestionFixture("randomsamatch", "attempt");

    expect(
      api.applyAiAnswerForQuestion(
        matchNode,
        successState("Как называется внутренняя жидкая среда клетки?: цитоплазма, Какой органоид хранит наследственную информацию?: ядро")
      )
    ).toBe(true);
    expect((document.getElementById("menuq123:11_sub0") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuq123:11_sub1") as HTMLSelectElement).value).toBe("1");
  });

  it("applies match AI actions even when action labels contain prompt-answer pairs", async () => {
    const api = await getQuizAttemptTestApi();
    const matchNode = loadQuestionFixture("match", "attempt");

    expect(
      api.applyAiAnswerForQuestion(
        matchNode,
        successState("Напряжение: Вольт, Масса: Килограмм, сила: ньютон", [
          { label: "Напряжение: Вольт" },
          { label: "Масса: Килограмм" },
          { label: "сила: ньютон" }
        ])
      )
    ).toBe(true);
    expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuq126:12_sub1") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("menuq126:12_sub2") as HTMLSelectElement).value).toBe("3");
  });

  it("applies match AI answers when the menu state still contains raw json text", async () => {
    const api = await getQuizAttemptTestApi();
    const matchNode = loadQuestionFixture("match", "attempt");

    expect(
      api.applyAiAnswerForQuestion(
        matchNode,
        successState(`{
          "answer": "Напряжение: Вольт, Масса: Килограмм, сила: ньютон",
          "confidence": 98
        }`)
      )
    ).toBe(true);
    expect((document.getElementById("menuq126:12_sub0") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuq126:12_sub1") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("menuq126:12_sub2") as HTMLSelectElement).value).toBe("3");
  });

  it("applies match AI answers with ampere as a non-selected dropdown option", async () => {
    const api = await getQuizAttemptTestApi();
    const matchNode = setAmpereMatchQuestionHtml();

    expect(
      api.applyAiAnswerForQuestion(
        matchNode,
        successState("сопротивление: ом, сила тока: ампер, напряжение: вольт")
      )
    ).toBe(true);
    expect((document.getElementById("menuqamp_sub0") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("menuqamp_sub1") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuqamp_sub2") as HTMLSelectElement).value).toBe("3");
  });

  it("applies match AI actions by unique one-based dropdown order, not Moodle sub indexes", async () => {
    const api = await getQuizAttemptTestApi();
    const matchNode = setAmpereMatchQuestionHtml();

    expect(
      api.applyAiAnswerForQuestion(
        matchNode,
        successState("сопротивление: ом, сила тока: ампер, напряжение: вольт", [
          { label: "ом", slotIndex: 1 },
          { label: "ампер", slotIndex: 2 },
          { label: "вольт", slotIndex: 3 }
        ])
      )
    ).toBe(true);
    expect((document.getElementById("menuqamp_sub0") as HTMLSelectElement).value).toBe("1");
    expect((document.getElementById("menuqamp_sub1") as HTMLSelectElement).value).toBe("2");
    expect((document.getElementById("menuqamp_sub2") as HTMLSelectElement).value).toBe("3");
  });

  it("normalizes match structured AI answers into extension-supported actions", () => {
    const parsed = parseStructuredAiAnswer(`{
      "answer": "Напряжение: Вольт, Масса: Килограмм, сила: ньютон",
      "confidence": 98,
      "actions": [
        { "label": "Напряжение: Вольт" },
        { "label": "Масса: Килограмм" },
        { "label": "сила: ньютон" }
      ]
    }`);

    const normalized = normalizeStructuredAiAnswerForPayload(parsed, {
      questionId: "match-1",
      questionType: "match",
      questionText: "Сопоставьте физическую величину с её единицей измерения.",
      answerLabels: [],
      controls: [
        {
          kind: "select",
          label: "Напряжение",
          slotIndex: 1,
          options: [
            { label: "Килограмм", value: "1" },
            { label: "Вольт", value: "2" },
            { label: "ньютон", value: "3" }
          ]
        },
        {
          kind: "select",
          label: "Масса",
          slotIndex: 2,
          options: [
            { label: "Килограмм", value: "1" },
            { label: "Вольт", value: "2" },
            { label: "ньютон", value: "3" }
          ]
        },
        {
          kind: "select",
          label: "сила",
          slotIndex: 3,
          options: [
            { label: "Килограмм", value: "1" },
            { label: "Вольт", value: "2" },
            { label: "ньютон", value: "3" }
          ]
        }
      ],
      pageUrl: "https://example.test/mod/quiz/attempt.php"
    });

    expect(normalized.confidence).toBe(98);
    expect(normalized.answer).toBe("Напряжение: Вольт, Масса: Килограмм, сила: ньютон");
    expect(normalized.actions).toEqual([
      { label: "Вольт", slotIndex: 1 },
      { label: "Килограмм", slotIndex: 2 },
      { label: "ньютон", slotIndex: 3 }
    ]);
  });

  it("recovers match answers from json-like AI text with an unescaped multiline answer", () => {
    const parsed = parseStructuredAiAnswer(`{
      "answer": "Напряжение: Вольт,
Масса: Килограмм,
сила: ньютон",
      "confidence": 98
    }`);
    const normalized = normalizeStructuredAiAnswerForPayload(parsed, {
      questionId: "match-1",
      questionType: "match",
      questionText: "Сопоставьте физическую величину с её единицей измерения.",
      answerLabels: [],
      controls: [
        {
          kind: "select",
          label: "Напряжение",
          slotIndex: 1,
          options: [{ label: "Вольт", value: "2" }]
        },
        {
          kind: "select",
          label: "Масса",
          slotIndex: 2,
          options: [{ label: "Килограмм", value: "1" }]
        },
        {
          kind: "select",
          label: "сила",
          slotIndex: 3,
          options: [{ label: "ньютон", value: "3" }]
        }
      ],
      pageUrl: "https://example.test/mod/quiz/attempt.php"
    });

    expect(parsed.answer).not.toContain('"answer"');
    expect(normalized.confidence).toBe(98);
    expect(normalized.actions).toEqual([
      { label: "Вольт", slotIndex: 1 },
      { label: "Килограмм", slotIndex: 2 },
      { label: "ньютон", slotIndex: 3 }
    ]);
  });

  it("does not expose AI controls or send requests for disabled drag/drop question types", async () => {
    const api = await getQuizAttemptTestApi();

    for (const [type, caseName, questionId] of [
      ["ddimageortext", "attempt", "3001"],
      ["ddmarker", "attempt", "3700"]
    ] as const) {
      const questionNode = loadQuestionFixture(type, caseName);
      const answerNode = questionNode.querySelector(".answer, .ddarea")!;
      const host = api.createAnswerWidgetHost(
        "#76d982",
        questionId,
        api.createEmptyVariantCounts(),
        api.createEmptySourceAnswerData(),
        null,
        false
      );
      answerNode.append(host);

      host.shadowRoot!.querySelector<HTMLButtonElement>(".trigger")!.click();
      const root = document.querySelector('[data-reduxshare-answer-menu-portal="true"]')!.shadowRoot!;

      expect(root.querySelector('[data-menu-tab="ai"]')).toBeNull();
      expect(root.querySelector('[data-ai-action="send"]')).toBeNull();
      document.querySelector('[data-reduxshare-answer-menu-portal="true"]')?.remove();
    }

    expect(getSendMessageMock()).not.toHaveBeenCalled();
  });
});
