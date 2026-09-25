import { describe, expect, it } from "vitest";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { answerSlot, slottedAnswerData, slottedExactSuggestion } from "./helpers/sourceData";

function getInputValue(id: string) {
  const input = document.getElementById(id);
  expect(input).toBeInstanceOf(HTMLInputElement);
  return (input as HTMLInputElement).value;
}

function getSelectValue(id: string) {
  const select = document.getElementById(id);
  expect(select).toBeInstanceOf(HTMLSelectElement);
  return (select as HTMLSelectElement).value;
}

describe("split question-type modules", () => {
  it("auto-selects ddwtos drops from slotted exact data", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("ddwtos", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("adasdada", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("qqq", 2)] }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect(getInputValue("q137_9_p1")).toBe("1");
    expect(getInputValue("q137_9_p2")).toBe("2");
  });

  it("auto-selects compound slots from slotted exact data", async () => {
    const api = await getQuizAttemptTestApi();
    const questionNode = loadQuestionFixture("multianswer", "attempt");
    const answerData = slottedAnswerData([
      answerSlot(1, { suggestions: [slottedExactSuggestion("цитоплазма", 1)] }),
      answerSlot(2, { suggestions: [slottedExactSuggestion("ядро", 2)] }),
      answerSlot(3, { suggestions: [slottedExactSuggestion("40", 3)] }),
    ]);

    expect(api.autoSelectQuestionAnswers(questionNode, answerData)).toBe(true);

    expect(getInputValue("q129:12_sub1_answer")).toBe("цитоплазма");
    expect(getSelectValue("q129:12_sub2_answer")).toBe("0");
    expect(getInputValue("q129:12_sub3_answer")).toBe("40");
  });

  it("does not let one type module claim another type's question", async () => {
    const api = await getQuizAttemptTestApi();

    expect(
      api.autoSelectQuestionAnswers(
        loadQuestionFixture("ddimageortext", "attempt"),
        slottedAnswerData([]),
      ),
    ).toBe(false);
    expect(
      api.autoSelectQuestionAnswers(
        loadQuestionFixture("ddwtos", "attempt"),
        slottedAnswerData([]),
      ),
    ).toBe(false);
    expect(
      api.autoSelectQuestionAnswers(
        loadQuestionFixture("ordering", "attempt"),
        slottedAnswerData([]),
      ),
    ).toBe(false);
  });
});
