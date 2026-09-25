import { describe, expect, it } from "vitest";
import type { SaveReduxShareReviewPayload } from "../src/lib/quizTasks";
import { loginWithPocketBase, registerWithPocketBase } from "../src/lib/auth";
import { recordUserQuizProgress, touchUserProfile } from "../src/lib/userProfiles";
import { fetchReduxShareTasks, saveReduxShareReviewAnswers } from "../src/lib/quizTasks";
import type { AuthSession } from "../src/types";

const runLiveTests = process.env.RUN_POCKETBASE_LIVE_TESTS === "1";

function getLiveCredentials() {
  const email = process.env.POCKETBASE_TEST_EMAIL;
  const password = process.env.POCKETBASE_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set POCKETBASE_TEST_EMAIL and POCKETBASE_TEST_PASSWORD to run live PocketBase DB tests.",
    );
  }

  return { email, password };
}

async function loginOrRegister(email: string, password: string): Promise<AuthSession> {
  try {
    return await loginWithPocketBase({ email, password });
  } catch {
    const result = await registerWithPocketBase({
      email,
      username: `livetest_${Date.now().toString(36)}`,
      password,
    });

    if (!result.authSession) {
      throw new Error(
        "Live PocketBase test user requires login (email verification may be enabled).",
      );
    }

    return result.authSession;
  }
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
            wasSelected: false,
          },
        ],
      },
    ],
  };
}

describe.skipIf(!runLiveTests)("live PocketBase review save", () => {
  it("writes calculated exact answers and reads them back from internal sources", async () => {
    const { email, password } = getLiveCredentials();
    const authSession = await loginOrRegister(email, password);
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
        questionHash: question.questionHash,
      })),
    });

    expect(fetchResult.results).toHaveLength(1);
    expect(fetchResult.results[0]).toMatchObject({
      ok: true,
      questionId: "calculated-live-3699",
      questionType: "calculated",
      questionHash: payload.questions[0].questionHash,
    });
    expect(JSON.stringify(fetchResult.results[0].data)).toContain("20.10");
  });

  it("ignores duplicate review imports for the same attempt", async () => {
    const { email, password } = getLiveCredentials();
    const authSession = await loginOrRegister(email, password);
    const uniqueKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = liveCalculatedPayload(uniqueKey);

    const firstSave = await saveReduxShareReviewAnswers(authSession, payload);
    expect(firstSave.savedCount).toBe(1);

    const secondSave = await saveReduxShareReviewAnswers(firstSave.authSession, payload);
    expect(secondSave.imported).toBe(false);
    expect(secondSave.savedCount).toBe(0);
  });

  it("touches the user profile and records quiz progress", async () => {
    const { email, password } = getLiveCredentials();
    const authSession = await loginOrRegister(email, password);

    const touched = await touchUserProfile(authSession, "moodle.live-test.local");
    expect(touched.userProfile.moodleDomain).toBe("moodle.live-test.local");

    const progressed = await recordUserQuizProgress(touched.authSession, {
      moodleDomain: "moodle.live-test.local",
      solvedTestsDelta: 1,
      solvedTasksDelta: 2,
    });
    expect(progressed.userProfile.solvedTestsCount).toBeGreaterThanOrEqual(1);
    expect(progressed.userProfile.solvedTasksCount).toBeGreaterThanOrEqual(2);
  });
});
