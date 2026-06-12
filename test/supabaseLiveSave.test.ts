import { describe, expect, it } from "vitest";
import type { SaveReduxShareReviewPayload } from "../src/lib/quizTasks";
import { loginWithSupabase } from "../src/lib/auth";
import { fetchReduxShareTasks, saveReduxShareReviewAnswers } from "../src/lib/quizTasks";

const runLiveTests = process.env.RUN_SUPABASE_LIVE_TESTS === "1";

function getLiveCredentials() {
  const email = process.env.VITE_SUPABASE_TEST_EMAIL ?? process.env.SUPABASE_TEST_EMAIL;
  const password = process.env.VITE_SUPABASE_TEST_PASSWORD ?? process.env.SUPABASE_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error("Set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD to run live Supabase DB tests.");
  }

  return { email, password };
}

function liveCalculatedPayload(uniqueKey: string): SaveReduxShareReviewPayload {
  return {
    domain: "reduxshare-live-test.local",
    courseId: 910001,
    quizId: 910002,
    attemptKey: `attempt:${uniqueKey}|cmid:910002`,
    pageUrl: `https://reduxshare-live-test.local/mod/quiz/review.php?attempt=${uniqueKey}&cmid=910002`,
    questions: [
      {
        questionId: "calculated-live-3699",
        questionType: "calculated",
        questionHash: `calculated-live-hash-${uniqueKey}`,
        answers: [
          {
            label: "20.10",
            answerKey: "20.10",
            slotKey: "question",
            slotIndex: null,
            correctness: 2,
            isCorrect: true,
            wasSelected: false
          }
        ]
      }
    ]
  };
}

describe.skipIf(!runLiveTests)("live Supabase review save", () => {
  it("writes calculated exact answers through save RPC and reads them back from internal sources", async () => {
    const authSession = await loginWithSupabase(getLiveCredentials());
    const uniqueKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = liveCalculatedPayload(uniqueKey);

    const saveResult = await saveReduxShareReviewAnswers(authSession, payload);

    expect(saveResult.imported).toBe(true);
    expect(saveResult.savedCount).toBe(1);

    const fetchResult = await fetchReduxShareTasks(saveResult.authSession, {
      domain: payload.domain,
      courseId: payload.courseId,
      quizId: payload.quizId,
      questions: payload.questions.map((question) => ({
        questionId: question.questionId,
        questionType: question.questionType,
        questionHash: question.questionHash
      }))
    });

    expect(fetchResult.results).toHaveLength(1);
    expect(fetchResult.results[0]).toMatchObject({
      ok: true,
      questionId: "calculated-live-3699",
      questionType: "calculated",
      questionHash: payload.questions[0].questionHash
    });
    expect(JSON.stringify(fetchResult.results[0].data)).toContain("20.10");
  });
});
