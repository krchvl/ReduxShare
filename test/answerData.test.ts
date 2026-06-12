import { describe, expect, it } from "vitest";
import type { QuizVariantResult } from "../src/content/quizAttempt/model";
import { getAnswerData, getVariantCounts } from "../src/content/quizAttempt/answerData";

function variantResult(data: QuizVariantResult["data"]): QuizVariantResult {
  return {
    questionId: "1385",
    questionType: "multichoice",
    questionHash: "hash",
    ok: true,
    data
  };
}

describe("source answer data parsing", () => {
  it("parses exact slotted true/false answers from API rows", () => {
    const result = variantResult([
      {
        anchor: { index: 1, label: "63 percent of the time." },
        suggestions: [{ label: "false", correctness: 2, confidence: 1, count: 1 }]
      },
      {
        anchor: { index: 2, label: "23 percent of the time." },
        suggestions: [{ label: "false", correctness: 2, confidence: 1, count: 1 }]
      },
      {
        anchor: { index: 3, label: "between 10 and 20 percent of the time." },
        suggestions: [{ label: "false", correctness: 2, confidence: 1, count: 1 }]
      },
      {
        anchor: { index: 4, label: "47 percent of the time." },
        suggestions: [{ label: "true", correctness: 2, confidence: 1, count: 1 }]
      }
    ]);

    const data = getAnswerData(result);

    expect(getVariantCounts(result)).toEqual({ anchors: 4, suggestions: 4, submissions: 0 });
    expect(data.slots.map((slot) => slot.index)).toEqual([1, 2, 3, 4]);
    expect(data.slots.map((slot) => slot.suggestions[0]?.label)).toEqual(["false", "false", "false", "true"]);
    expect(data.submissions).toHaveLength(0);
  });

  it("parses hidden-review correctness=1 answers as statistics, not exact suggestions", () => {
    const result = variantResult([
      {
        anchor: { index: 4, label: "47 percent of the time." },
        submissions: [{ label: "true", correctness: 1, count: 3 }]
      }
    ]);

    const data = getAnswerData(result);

    expect(getVariantCounts(result)).toEqual({ anchors: 1, suggestions: 0, submissions: 1 });
    expect(data.suggestions).toHaveLength(0);
    expect(data.submissions).toMatchObject([{ label: "true", correctness: 1, count: 3 }]);
    expect(data.slots[0].submissions).toMatchObject([{ label: "true", correctness: 1, count: 3 }]);
  });

  it("downgrades non-exact suggestions into statistics items", () => {
    const data = getAnswerData(
      variantResult([
        {
          anchor: { index: 1, label: "Option A" },
          suggestions: [{ label: "false", correctness: 1, confidence: 0.5 }]
        }
      ])
    );

    expect(data.suggestions).toHaveLength(0);
    expect(data.submissions).toMatchObject([{ label: "false", correctness: 1, count: 1 }]);
  });
});
