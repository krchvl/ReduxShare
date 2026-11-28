import { afterEach, describe, expect, it, vi } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { exactAnswerData, sourceAnswerData } from "./helpers/sourceData";
import { setCurrentStoredState } from "../src/state";
import { syncLanguage, syncContentUi } from "../src/logic/runtime";
import { convertLatexTokensToSymbols, flattenSuperscripts } from "../src/shared/latexSymbols";

const QUESTION_ID = "900";
const TEXT_QUESTION_ID = "901";

function baseStoredState() {
  return {
    settings: {
      extensionEnabled: true,
      language: "ru",
      autoSelect: true,
      autoSelectAvgSeconds: 4,
      humanTyping: false,
      humanPrecursors: false,
    },
    authSession: null,
  };
}

function renderChoiceQuestion(superscript = false) {
  const correctLabel = superscript ? "x<sup>2</sup>" : "&gt;";

  document.body.innerHTML = `
    <div id="question-900-1" class="que multichoice deferredfeedback" data-questionid="${QUESTION_ID}">
      <div class="content">
        <div class="formulation clearfix">
          <div class="qtext">Choose the sign</div>
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
                <div id="q900:1_choice0_label" data-region="answer-label"><p>${correctLabel}</p></div>
              </div>
              <div class="r1">
                <input
                  type="radio"
                  name="q900:1_choice1"
                  value="1"
                  id="q900:1_choice1"
                  aria-labelledby="q900:1_choice1_label"
                />
                <div id="q900:1_choice1_label" data-region="answer-label"><p>&lt;</p></div>
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
          <div class="qtext">Write the sign</div>
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

async function setupPage(state: unknown) {
  const api = await getQuizAttemptTestApi();
  api.setStoredState(state);
  setCurrentStoredState(state);
  syncLanguage(state);
  syncContentUi();
  return api;
}

describe("LaTeX answer symbols", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("converts Moodle TeX tokens into plain symbols", () => {
    expect(convertLatexTokensToSymbols("\\gt")).toBe(">");
    expect(convertLatexTokensToSymbols("\\lt")).toBe("<");
    expect(convertLatexTokensToSymbols("x \\gt 5")).toBe("x > 5");
    expect(convertLatexTokensToSymbols("x \\geq 5")).toBe("x ≥ 5");
    expect(convertLatexTokensToSymbols("x \\leq 5")).toBe("x ≤ 5");
    expect(convertLatexTokensToSymbols("a \\neq b")).toBe("a ≠ b");
    expect(convertLatexTokensToSymbols("a \\times b")).toBe("a × b");
    expect(convertLatexTokensToSymbols("a \\pm b")).toBe("a ± b");
    expect(convertLatexTokensToSymbols("a \\circ b")).toBe("a ∘ b");
    expect(convertLatexTokensToSymbols("\\to")).toBe("→");
    expect(convertLatexTokensToSymbols("\\alpha")).toBe("α");
    expect(convertLatexTokensToSymbols("\\pi")).toBe("π");
  });

  it("unwraps TeX delimiters and structural commands", () => {
    expect(convertLatexTokensToSymbols("\\(x \\gt 5\\)")).toBe("x > 5");
    expect(convertLatexTokensToSymbols("\\[x \\gt 5\\]")).toBe("x > 5");
    expect(convertLatexTokensToSymbols("\\left(x \\gt 5\\right)")).toBe("(x > 5)");
    expect(convertLatexTokensToSymbols("\\frac{1}{2}")).toBe("1/2");
    expect(convertLatexTokensToSymbols("\\sqrt{2}")).toBe("√2");
    expect(convertLatexTokensToSymbols("\\text{answer}")).toBe("answer");
    expect(convertLatexTokensToSymbols("\\mathbb{R}")).toBe("ℝ");
  });

  it("converts nested fractions and roots with an index", () => {
    expect(convertLatexTokensToSymbols("\\frac{\\frac{1}{2}}{3}")).toBe("1/2/3");
    expect(convertLatexTokensToSymbols("\\frac{\\sqrt{2}}{3}")).toBe("√2/3");
    expect(convertLatexTokensToSymbols("\\sqrt[3]{8}")).toBe("∛8");
    expect(convertLatexTokensToSymbols("\\sqrt[4]{16}")).toBe("∜16");
    expect(convertLatexTokensToSymbols("\\sqrt[n]{x}")).toBe("ⁿ√x");
  });

  it("converts superscripts and escapes braces without extra spacing", () => {
    expect(convertLatexTokensToSymbols("x^{2}")).toBe("x²");
    expect(convertLatexTokensToSymbols("x^2")).toBe("x²");
    expect(convertLatexTokensToSymbols("\\{x\\}")).toBe("{x}");
    expect(convertLatexTokensToSymbols("a\\!b")).toBe("ab");
    expect(convertLatexTokensToSymbols("a\\,b")).toBe("a b");
  });

  it("flattens superscripts for option label matching", () => {
    expect(flattenSuperscripts("x²")).toBe("x2");
    expect(flattenSuperscripts("xⁿ")).toBe("xn");
    expect(flattenSuperscripts("plain")).toBe("plain");
  });

  it("keeps unknown commands and plain text untouched", () => {
    expect(convertLatexTokensToSymbols("plain answer")).toBe("plain answer");
    expect(convertLatexTokensToSymbols("\\unknowncommand")).toBe("\\unknowncommand");
    expect(convertLatexTokensToSymbols("50\\%")).toBe("50%");
  });

  it("applies a LaTeX exact answer to the matching choice option", async () => {
    const state = baseStoredState();
    const api = await setupPage(state);
    const questionNode = renderChoiceQuestion();
    api.setSourceAnswerData(QUESTION_ID, "external", exactAnswerData("\\gt"));

    expect(api.scheduleAutoSelectAnswer(QUESTION_ID, questionNode, state, true)).toBe(true);

    expect(getInput("q900:1_choice0").checked).toBe(true);
    expect(getInput("q900:1_choice1").checked).toBe(false);
  });

  it("matches a superscript answer against a superscript option", async () => {
    const state = baseStoredState();
    const api = await setupPage(state);
    const questionNode = renderChoiceQuestion(true);
    api.setSourceAnswerData(QUESTION_ID, "external", exactAnswerData("x^{2}"));

    expect(api.scheduleAutoSelectAnswer(QUESTION_ID, questionNode, state, true)).toBe(true);

    expect(getInput("q900:1_choice0").checked).toBe(true);
    expect(getInput("q900:1_choice1").checked).toBe(false);
  });

  it("writes the converted sign into a text answer", async () => {
    const state = baseStoredState();
    const api = await setupPage(state);
    const questionNode = renderTextQuestion();
    api.setSourceAnswerData(TEXT_QUESTION_ID, "external", exactAnswerData("\\gt"));

    expect(api.scheduleAutoSelectAnswer(TEXT_QUESTION_ID, questionNode, state, true)).toBe(true);

    expect(getInput("q901:1_response").value).toBe(">");
  });

  it("keeps TeX markup when typing free text such as an essay example", async () => {
    const api = await getQuizAttemptTestApi();
    const textarea = document.createElement("textarea");
    document.body.append(textarea);

    await api.typeTextHumanLike(textarea, "the value \\alpha stays");

    expect(textarea.value).toBe("the value \\alpha stays");
    textarea.remove();
  });

  it("applies a LaTeX answer from the R-menu flyout", async () => {
    const state = baseStoredState();
    const api = await setupPage(state);
    renderChoiceQuestion();
    const answerData = sourceAnswerData({ external: exactAnswerData("\\gt") });
    const host = api.createAnswerWidgetHost(
      "#ff6b6f",
      QUESTION_ID,
      api.createEmptyVariantCounts(),
      answerData,
      null,
      true,
    );
    host.setAttribute("data-reduxshare-choice-input-id", "q900:1_choice0");
    document.getElementById("q900:1_choice0_label")!.append(host);

    const trigger = host.shadowRoot?.querySelector<HTMLButtonElement>(".trigger");
    expect(trigger).toBeInstanceOf(HTMLButtonElement);
    trigger!.click();

    const option = getPortalRoot().querySelector<HTMLElement>(
      '[data-answer-menu="external-exact"] .flyout-option[data-answer-label]',
    );
    expect(option).toBeTruthy();
    expect(option!.dataset.answerLabel).toBe("\\gt");

    option!.click();

    expect(getInput("q900:1_choice0").checked).toBe(true);
    expect(getInput("q900:1_choice1").checked).toBe(false);
  });
});
