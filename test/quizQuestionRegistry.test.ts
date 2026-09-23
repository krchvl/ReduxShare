import { beforeEach, describe, expect, it } from "vitest";
import {
  getQuizQuestionStubs,
  recordQuizQuestions,
  type QuizQuestionStub,
} from "../src/lib/quizQuestionRegistry";

const REGISTRY_KEY = "reduxshare_quiz_questions:school.moodledemo.net:66:789";

async function getStoredStubs() {
  const stored = await chrome.storage.local.get(REGISTRY_KEY);
  return (stored[REGISTRY_KEY] ?? []) as QuizQuestionStub[];
}

describe("quiz question registry", () => {
  beforeEach(async () => {
    await chrome.storage.local.remove(REGISTRY_KEY);
  });

  it("records question identities from attempt pages and reads them back", async () => {
    await recordQuizQuestions("school.moodledemo.net", 66, 789, [
      { questionId: "1349", questionType: "match", questionHash: "h1" },
      { questionId: null, questionType: "truefalse", questionHash: "h2" },
      { questionId: "  ", questionType: null, questionHash: null }
    ]);

    const stubs = await getQuizQuestionStubs("school.moodledemo.net", 66, 789);
    expect(stubs).toHaveLength(1);
    expect(stubs[0]).toMatchObject({ questionId: "1349", questionType: "match", questionHash: "h1" });
  });

  it("skips quizzes without course or quiz ids", async () => {
    await recordQuizQuestions("school.moodledemo.net", null, 789, [{ questionId: "1" }]);
    await recordQuizQuestions("school.moodledemo.net", 66, null, [{ questionId: "1" }]);

    expect(await getQuizQuestionStubs("school.moodledemo.net", null, 789)).toEqual([]);
    expect(await getQuizQuestionStubs("school.moodledemo.net", 66, null)).toEqual([]);
  });

  it("merges repeat sightings, keeping the first statement and freshening metadata", async () => {
    await recordQuizQuestions("school.moodledemo.net", 66, 789, [
      { questionId: "1349", questionType: "match", questionHash: "h1", questionText: "Условие" }
    ]);
    await recordQuizQuestions("school.moodledemo.net", 66, 789, [
      { questionId: "1349", questionType: "match", questionHash: "h1-new", questionText: null }
    ]);

    const stubs = await getQuizQuestionStubs("school.moodledemo.net", 66, 789);
    expect(stubs).toHaveLength(1);
    expect(stubs[0].questionText).toBe("Условие");
    expect(stubs[0].questionHash).toBe("h1-new");
  });

  it("caps the registry size per quiz", async () => {
    await recordQuizQuestions(
      "school.moodledemo.net",
      66,
      789,
      Array.from({ length: 510 }, (_, index) => ({ questionId: String(index + 1), questionType: null }))
    );

    const stored = await getStoredStubs();
    expect(stored).toHaveLength(500);
    expect(await getQuizQuestionStubs("school.moodledemo.net", 66, 789)).toHaveLength(500);
  });
});
