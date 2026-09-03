import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nError } from "../src/i18n";
import type { AuthSession } from "../src/types";
import type { SaveReduxShareReviewPayload } from "../src/lib/quizTasks";

const pbMocks = vi.hoisted(() => ({
  ensurePocketBaseSession: vi.fn(),
  withSessionRetry: vi.fn(),
  filter: vi.fn(),
  collections: {} as Record<string, Record<string, ReturnType<typeof vi.fn>>>
}));

vi.mock("../src/lib/auth", () => ({
  ensurePocketBaseSession: pbMocks.ensurePocketBaseSession,
  restorePocketBaseSession: vi.fn()
}));

vi.mock("../src/lib/pocketbase", () => ({
  USERS_COLLECTION: "users",
  TASKS_COLLECTION: "reduxshare_tasks",
  REVIEW_IMPORTS_COLLECTION: "reduxshare_review_imports",
  REVIEW_ANSWER_IMPORTS_COLLECTION: "reduxshare_review_answer_imports",
  isNotFoundError: (error: { isNotFound?: boolean } | null | undefined) => error?.isNotFound === true,
  isValidationError: (error: { isValidation?: boolean } | null | undefined) => error?.isValidation === true,
  toI18nError: (error: unknown, messageKey: "errors.reduxAnswersFetchFailed" | "errors.reduxReviewSaveFailed") => {
    if (error instanceof I18nError) {
      return error;
    }

    return new I18nError(messageKey, {
      message: error instanceof Error ? error.message : String(error)
    });
  },
  withPocketBaseSessionRetry: pbMocks.withSessionRetry
}));

function fakePb() {
  return {
    filter: pbMocks.filter,
    collection: (name: string) => pbMocks.collections[name]
  };
}

function mockCollection(overrides: Record<string, unknown> = {}) {
  return {
    getFullList: vi.fn(),
    getOne: vi.fn(),
    getFirstListItem: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    ...overrides
  };
}

function notFoundError() {
  return { isNotFound: true };
}

async function importQuizTasks() {
  return import("../src/lib/quizTasks");
}

const authSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "access-token",
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

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    moodle_domain: "school.moodledemo.net",
    course_id: 2,
    quiz_id: 1150,
    question_id: "q-1",
    question_hash: "hash-1",
    question_type: "multichoice",
    slot_key: "question",
    slot_index: null,
    answer_key: "a",
    answer_label: "A",
    correct_count: 0,
    selected_correct_count: 0,
    selected_incorrect_count: 0,
    selected_unknown_count: 0,
    updated: "2026-09-03T00:00:00.000Z",
    ...overrides
  };
}

describe("ReduxShare review DB save (PocketBase)", () => {
  beforeEach(() => {
    pbMocks.ensurePocketBaseSession.mockReset();
    pbMocks.ensurePocketBaseSession.mockResolvedValue(authSession);
    pbMocks.withSessionRetry.mockReset();
    pbMocks.withSessionRetry.mockImplementation(
      async (
        session: AuthSession,
        runner: (pb: unknown, activeSession: AuthSession) => Promise<unknown>
      ) => ({
        authSession: session,
        result: await runner(fakePb(), session)
      })
    );
    pbMocks.filter.mockReset();
    pbMocks.filter.mockImplementation((template: string) => template);

    pbMocks.collections = {
      users: mockCollection({
        getOne: vi.fn().mockResolvedValue({ id: "user-1", moodle_domain: null })
      }),
      reduxshare_review_imports: mockCollection({
        getFirstListItem: vi.fn().mockRejectedValue(notFoundError())
      }),
      reduxshare_review_answer_imports: mockCollection({
        getFullList: vi.fn().mockResolvedValue([])
      }),
      reduxshare_tasks: mockCollection({
        getFullList: vi.fn().mockResolvedValue([])
      })
    };
  });

  it("sends calculated exact review answers to PocketBase collections", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    const payload = calculatedSavePayload();
    const answerImports = pbMocks.collections.reduxshare_review_answer_imports;
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.create.mockResolvedValue({ id: "task-new" });

    const result = await saveReduxShareReviewAnswers(authSession, payload);

    expect(result).toEqual({
      authSession,
      imported: true,
      savedCount: 1
    });
    expect(answerImports.create).toHaveBeenCalledWith({
      user: "user-1",
      moodle_domain: "school.moodledemo.net",
      attempt_key: "attempt:94|cmid:1150",
      question_id: "3699",
      question_hash: "hash",
      slot_key: "question",
      answer_key: "20.10"
    });
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        moodle_domain: "school.moodledemo.net",
        course_id: 2,
        quiz_id: 1150,
        question_id: "3699",
        question_hash: "hash",
        answer_key: "20.10",
        answer_label: "20.10",
        correct_count: 1,
        selected_correct_count: 0,
        first_contributor: "user-1",
        last_contributor: "user-1"
      })
    );
  });

  it("does not call PocketBase when Moodle courseId or quizId is missing", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();

    await expect(saveReduxShareReviewAnswers(authSession, calculatedSavePayload({ courseId: null }))).resolves.toMatchObject(
      {
        imported: false,
        savedCount: 0
      }
    );
    await expect(saveReduxShareReviewAnswers(authSession, calculatedSavePayload({ quizId: null }))).resolves.toMatchObject(
      {
        imported: false,
        savedCount: 0
      }
    );

    expect(pbMocks.withSessionRetry).not.toHaveBeenCalled();
  });

  it("skips answers that were already imported for the attempt", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    pbMocks.collections.reduxshare_review_answer_imports.getFullList.mockResolvedValue([
      {
        id: "import-1",
        question_id: "3699",
        question_hash: "hash",
        slot_key: "question",
        answer_key: "20.10"
      }
    ]);

    const result = await saveReduxShareReviewAnswers(authSession, calculatedSavePayload());

    expect(result).toMatchObject({ imported: false, savedCount: 0 });
    expect(pbMocks.collections.reduxshare_review_answer_imports.create).not.toHaveBeenCalled();
    expect(pbMocks.collections.reduxshare_tasks.create).not.toHaveBeenCalled();
    expect(pbMocks.collections.reduxshare_tasks.update).not.toHaveBeenCalled();
  });

  it("increments counters on existing task rows instead of duplicating them", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFullList.mockResolvedValue([
      taskRow({
        id: "task-existing",
        question_id: "3699",
        question_hash: "hash",
        slot_key: "question",
        answer_key: "20.10",
        answer_label: "20.10",
        correct_count: 2
      })
    ]);
    tasks.update.mockResolvedValue({ id: "task-existing" });

    const result = await saveReduxShareReviewAnswers(authSession, calculatedSavePayload());

    expect(result).toMatchObject({ imported: true, savedCount: 1 });
    expect(tasks.create).not.toHaveBeenCalled();
    expect(tasks.update).toHaveBeenCalledWith(
      "task-existing",
      expect.objectContaining({
        answer_label: "20.10",
        "correct_count+": 1,
        last_contributor: "user-1"
      })
    );
  });

  it("keeps non-boolean mismatched-hash fallback rows as exact answers", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();
    pbMocks.collections.reduxshare_tasks.getFullList.mockResolvedValue([
      taskRow({
        question_id: "radio-1",
        question_hash: "legacy-hash",
        answer_key: "non-judgement",
        answer_label: "Non-judgement",
        correct_count: 1
      })
    ]);

    const result = await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [
        {
          questionId: "radio-1",
          questionType: "multichoice",
          questionHash: "current-hash"
        }
      ]
    });

    expect(result.results[0]).toMatchObject({
      ok: true,
      questionId: "radio-1",
      questionType: "multichoice",
      questionHash: "legacy-hash",
      answerCount: 1
    });
    expect(result.results[0].data).toEqual([
      {
        anchor: { index: 1, label: "question" },
        suggestions: [{ label: "Non-judgement", correctness: 2, confidence: 1 }],
        submissions: [{ label: "Non-judgement", correctness: 2, count: 1 }]
      }
    ]);
  });

  it("downgrades mismatched-hash fallback rows into statistics-only data for boolean answers", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();
    pbMocks.collections.reduxshare_tasks.getFullList.mockResolvedValue([
      taskRow({
        question_id: "multichoice-1",
        question_hash: "legacy-hash",
        slot_key: "slot:1",
        slot_index: 1,
        answer_key: "true",
        answer_label: "true",
        correct_count: 1
      })
    ]);

    const result = await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [
        {
          questionId: "multichoice-1",
          questionType: "multichoice",
          questionHash: "current-hash"
        }
      ]
    });

    expect(result.results[0]).toMatchObject({
      ok: true,
      questionId: "multichoice-1",
      questionHash: "legacy-hash",
      answerCount: 1
    });
    expect(result.results[0].data).toEqual([
      {
        anchor: { index: 1, label: "slot:1" },
        suggestions: [],
        submissions: [{ label: "true", correctness: 2, count: 1 }]
      }
    ]);
  });

  it("computes suggestion confidence across answers of one slot", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();
    pbMocks.collections.reduxshare_tasks.getFullList.mockResolvedValue([
      taskRow({ id: "t1", question_id: "q-1", question_hash: "h", answer_key: "a", answer_label: "A", correct_count: 3 }),
      taskRow({ id: "t2", question_id: "q-1", question_hash: "h", answer_key: "b", answer_label: "B", correct_count: 1 })
    ]);

    const result = await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [{ questionId: "q-1", questionType: "multichoice", questionHash: "h" }]
    });

    expect(result.results[0].data).toEqual([
      {
        anchor: { index: 1, label: "question" },
        suggestions: [
          { label: "A", correctness: 2, confidence: 0.75 },
          { label: "B", correctness: 2, confidence: 0.25 }
        ],
        submissions: [
          { label: "A", correctness: 2, count: 3 },
          { label: "B", correctness: 2, count: 1 }
        ]
      }
    ]);
  });

  it("returns empty data for questions without stored rows", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();
    pbMocks.collections.reduxshare_tasks.getFullList.mockResolvedValue([]);

    const result = await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [{ questionId: "unknown", questionType: "multichoice", questionHash: "h" }]
    });

    expect(result.results[0]).toMatchObject({
      ok: true,
      questionId: "unknown",
      data: null,
      answerCount: 0
    });
  });
});
