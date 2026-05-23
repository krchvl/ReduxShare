import { describe, expect, it } from "vitest";
import { getFixturePath, isQuestionFixtureReady, loadQuestionFixture } from "./helpers/fixtures";

const QUESTION_TYPES = [
  "multichoice",
  "truefalse",
  "calculatedmulti",
  "shortanswer",
  "numerical",
  "calculated",
  "calculatedsimple",
  "gapselect",
  "match",
  "randomsamatch",
  "multianswer",
  "ddwtos",
  "ddmarker",
  "ddimageortext",
  "ordering",
] as const;

const CASES = ["review-open", "review-hidden", "attempt"] as const;

describe("Moodle question type fixture matrix", () => {
  for (const questionType of QUESTION_TYPES) {
    for (const caseName of CASES) {
      const fixtureName = `${questionType}/${caseName}.html`;

      if (isQuestionFixtureReady(questionType, caseName)) {
        it(`loads fixture ${fixtureName}`, () => {
          const questionNode = loadQuestionFixture(questionType, caseName);

          expect(questionNode.classList.contains("que")).toBe(true);
          expect(questionNode.classList.contains(questionType)).toBe(true);
        });
      } else {
        it.todo(`replace placeholder with fixture ${getFixturePath(questionType, caseName)}`);
      }
    }
  }
});
