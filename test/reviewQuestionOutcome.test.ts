import { describe, expect, it } from "vitest";
import { getReviewQuestionOutcome } from "../src/lib/quizTasks";

function answer(overrides: Record<string, unknown> = {}) {
  return {
    label: "A",
    key: "a",
    slotKey: "question",
    slotIndex: null,
    correctness: 2,
    isCorrect: true,
    wasSelected: false,
    ...overrides,
  };
}

describe("getReviewQuestionOutcome", () => {
  it("returns none for questions without selected answers", () => {
    expect(getReviewQuestionOutcome([])).toBe("none");
    expect(getReviewQuestionOutcome([answer({ wasSelected: false, correctness: 2 })])).toBe("none");
  });

  it("counts a selected correct answer as correct", () => {
    expect(getReviewQuestionOutcome([answer({ wasSelected: true, correctness: 2 })])).toBe(
      "correct",
    );
  });

  it("counts a selected wrong answer as wrong", () => {
    expect(getReviewQuestionOutcome([answer({ wasSelected: true, correctness: 0 })])).toBe("wrong");
  });

  it("prefers wrong over correct when both are selected", () => {
    expect(
      getReviewQuestionOutcome([
        answer({ key: "a", label: "A", wasSelected: true, correctness: 2 }),
        answer({ key: "b", label: "B", wasSelected: true, correctness: 0, isCorrect: false }),
      ]),
    ).toBe("wrong");
  });

  it("counts a selected unverified answer as unknown", () => {
    expect(getReviewQuestionOutcome([answer({ wasSelected: true, correctness: 1 })])).toBe(
      "unknown",
    );
  });

  it("ignores correct answers the user did not select", () => {
    expect(
      getReviewQuestionOutcome([
        answer({ wasSelected: false, correctness: 2 }),
        answer({ key: "b", label: "B", wasSelected: false, correctness: 2 }),
      ]),
    ).toBe("none");
  });
});
