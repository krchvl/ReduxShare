import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../src/types";
import type { SaveReduxShareReviewPayload } from "../src/lib/quizTasks";

const dbMocks = vi.hoisted(() => ({
  restoreSupabaseSession: vi.fn(),
  rpc: vi.fn(),
  single: vi.fn()
}));

vi.mock("../src/lib/auth", () => ({
  restoreSupabaseSession: dbMocks.restoreSupabaseSession
}));

vi.mock("../src/lib/supabaseClient", () => ({
  getSupabaseClient: () => ({
    rpc: dbMocks.rpc
  })
}));

async function importQuizTasks() {
  return import("../src/lib/quizTasks");
}

const authSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: null,
  user: {
    id: "user-1",
    email: "user@example.com"
  }
};

function calculatedSavePayload(overrides: Partial<SaveReduxShareReviewPayload> = {}): SaveReduxShareReviewPayload {
  return {
    domain: "school.moodledemo.net",
    courseId: 2,
    quizId: 1150,
    attemptKey: "attempt:94|cmid:1150",
    pageUrl: "https://school.moodledemo.net/mod/quiz/review.php?attempt=94&cmid=1150",
    questions: [
      {
        questionId: "3699",
        questionType: "calculated",
        questionHash: "hash",
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
    ],
    ...overrides
  };
}

describe("ReduxShare review DB save", () => {
  beforeEach(() => {
    dbMocks.restoreSupabaseSession.mockReset();
    dbMocks.restoreSupabaseSession.mockResolvedValue(authSession);
    dbMocks.rpc.mockReset();
    dbMocks.single.mockReset();
    dbMocks.single.mockResolvedValue({
      data: {
        imported: true,
        saved_count: 1
      },
      error: null
    });
    dbMocks.rpc.mockReturnValue({
      single: dbMocks.single
    });
  });

  it("sends calculated exact review answers to the Supabase save RPC", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    const payload = calculatedSavePayload();

    const result = await saveReduxShareReviewAnswers(authSession, payload);

    expect(result).toEqual({
      authSession,
      imported: true,
      savedCount: 1
    });
    expect(dbMocks.restoreSupabaseSession).toHaveBeenCalledWith(authSession);
    expect(dbMocks.rpc).toHaveBeenCalledWith("save_reduxshare_review_answers", {
      review_moodle_domain: "school.moodledemo.net",
      review_course_id: 2,
      review_quiz_id: 1150,
      review_attempt_key: "attempt:94|cmid:1150",
      review_page_url: "https://school.moodledemo.net/mod/quiz/review.php?attempt=94&cmid=1150",
      review_questions: payload.questions
    });
  });

  it("does not call Supabase when Moodle courseId or quizId is missing", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();

    await expect(saveReduxShareReviewAnswers(authSession, calculatedSavePayload({ courseId: null }))).resolves.toMatchObject({
      imported: false,
      savedCount: 0
    });
    await expect(saveReduxShareReviewAnswers(authSession, calculatedSavePayload({ quizId: null }))).resolves.toMatchObject({
      imported: false,
      savedCount: 0
    });

    expect(dbMocks.rpc).not.toHaveBeenCalled();
  });

  it("does not reuse old question-id fallback rows for match questions", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();
    dbMocks.rpc.mockResolvedValue({
      data: [
        {
          question_id: "match-1",
          question_type: "match",
          question_hash: "old-row-order-hash",
          data: [{ anchor: { label: "slot:0" }, suggestions: [{ label: "garbage" }], submissions: [] }],
          answer_count: 1
        }
      ],
      error: null
    });

    const result = await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [
        {
          questionId: "match-1",
          questionType: "match",
          questionHash: "new-prompt-scoped-hash"
        }
      ]
    });

    expect(result.results[0]).toMatchObject({
      ok: true,
      questionId: "match-1",
      questionHash: "new-prompt-scoped-hash",
      data: null,
      answerCount: 0
    });
  });

  it("keeps question-id fallback rows for non-match questions", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();
    dbMocks.rpc.mockResolvedValue({
      data: [
        {
          question_id: "shortanswer-1",
          question_type: "shortanswer",
          question_hash: "older-compatible-hash",
          data: [{ anchor: { label: "question" }, suggestions: [{ label: "Joseph Stalin" }], submissions: [] }],
          answer_count: 1
        }
      ],
      error: null
    });

    const result = await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [
        {
          questionId: "shortanswer-1",
          questionType: "shortanswer",
          questionHash: "new-shortanswer-hash"
        }
      ]
    });

    expect(result.results[0]).toMatchObject({
      ok: true,
      questionId: "shortanswer-1",
      questionType: "shortanswer",
      questionHash: "older-compatible-hash",
      answerCount: 1
    });
    expect(JSON.stringify(result.results[0].data)).toContain("Joseph Stalin");
  });
});
