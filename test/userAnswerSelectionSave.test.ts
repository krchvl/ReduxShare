import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nError } from "../src/i18n";
import type { AuthSession } from "../src/types";
import type { SaveReduxShareReviewPayload, SaveUserAnswerPayload } from "../src/lib/quizTasks";

const pbMocks = vi.hoisted(() => ({
  ensurePocketBaseSession: vi.fn(),
  withSessionRetry: vi.fn(),
  filter: vi.fn(),
  collections: {} as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
}));

vi.mock("../src/lib/auth", () => ({
  ensurePocketBaseSession: pbMocks.ensurePocketBaseSession,
  restorePocketBaseSession: vi.fn(),
}));

vi.mock("../src/lib/pocketbase", () => ({
  USERS_COLLECTION: "users",
  TASKS_COLLECTION: "reduxshare_tasks",
  TASK_VOTES_COLLECTION: "reduxshare_task_votes",
  REVIEW_IMPORTS_COLLECTION: "reduxshare_review_imports",
  isNotFoundError: (error: { isNotFound?: boolean } | null | undefined) =>
    error?.isNotFound === true,
  isValidationError: (error: { isValidation?: boolean } | null | undefined) =>
    error?.isValidation === true,
  toI18nError: (
    error: unknown,
    messageKey:
      "errors.reduxAnswersFetchFailed" | "errors.reduxReviewSaveFailed" | "errors.voteSaveFailed",
  ) => {
    if (error instanceof I18nError) {
      return error;
    }

    return new I18nError(messageKey, {
      message: error instanceof Error ? error.message : String(error),
    });
  },
  withPocketBaseSessionRetry: pbMocks.withSessionRetry,
}));

function fakePb() {
  return {
    filter: pbMocks.filter,
    collection: (name: string) => pbMocks.collections[name],
  };
}

function mockCollection(overrides: Record<string, unknown> = {}) {
  return {
    getFullList: vi.fn(),
    getOne: vi.fn(),
    getFirstListItem: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    ...overrides,
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
    email: "user@example.com",
  },
};

function selectionPayload(
  verdict: "correct" | "incorrect" | "unknown",
  overrides: Partial<SaveUserAnswerPayload> = {},
): SaveUserAnswerPayload {
  return {
    domain: "school.moodledemo.net",
    courseId: 2,
    quizId: 1150,
    attemptKey: "attempt:94|cmid:1150",
    pageUrl: "https://school.moodledemo.net/mod/quiz/attempt.php?attempt=94&cmid=1150",
    question: {
      questionId: "3699",
      questionType: "multichoice",
      questionHash: "hash",
      questionText: "Сколько будет 10 + 10.10?",
      answerOptions: ["20.10", "21.10"],
      answers: [
        {
          label: "20.10",
          answerKey: "20.10",
          slotKey: "question",
          slotIndex: null,
          verdict,
        },
      ],
    },
    ...overrides,
  };
}

function reviewPayloadWithTracking(
  preCountedAnswers: Array<{
    answerKey: string;
    slotKey: string;
    verdict: "correct" | "incorrect" | "unknown";
  }>,
): SaveReduxShareReviewPayload {
  return {
    domain: "school.moodledemo.net",
    courseId: 2,
    quizId: 1150,
    attemptKey: "attempt:94|cmid:1150",
    pageUrl: "https://school.moodledemo.net/mod/quiz/review.php?attempt=94&cmid=1150",
    questions: [
      {
        questionId: "3699",
        questionType: "multichoice",
        questionHash: "hash",
        questionText: "Сколько будет 10 + 10.10?",
        preCountedAnswers,
        answers: [
          {
            label: "20.10",
            answerKey: "20.10",
            slotKey: "question",
            slotIndex: null,
            correctness: 2,
            isCorrect: true,
            wasSelected: true,
          },
          {
            label: "21.10",
            answerKey: "21.10",
            slotKey: "question",
            slotIndex: null,
            correctness: 0,
            isCorrect: false,
            wasSelected: true,
          },
        ],
      },
    ],
  };
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    moodle_domain: "school.moodledemo.net",
    course_id: 2,
    quiz_id: 1150,
    question_id: "3699",
    question_hash: "hash",
    question_type: "multichoice",
    question_text: "",
    answer_options: "",
    slot_key: "question",
    slot_index: null,
    answer_key: "20.10",
    answer_label: "20.10",
    correct_count: 0,
    selected_correct_count: 0,
    selected_incorrect_count: 0,
    selected_unknown_count: 0,
    created: "2026-09-01T10:00:00.000Z",
    updated: "2026-09-02T10:00:00.000Z",
    expand: null,
    ...overrides,
  };
}

describe("saveUserAnswerSelection (PocketBase)", () => {
  beforeEach(() => {
    pbMocks.ensurePocketBaseSession.mockReset();
    pbMocks.ensurePocketBaseSession.mockResolvedValue(authSession);
    pbMocks.withSessionRetry.mockReset();
    pbMocks.withSessionRetry.mockImplementation(
      async (
        session: AuthSession,
        runner: (pb: unknown, activeSession: AuthSession) => Promise<unknown>,
      ) => ({
        authSession: session,
        result: await runner(fakePb(), session),
      }),
    );
    pbMocks.filter.mockReset();
    pbMocks.filter.mockImplementation((template: string, params: Record<string, unknown> = {}) => {
      return template.replaceAll(/\{:(\w+)\}/g, (_, name: string) => {
        const value = params[name];
        return typeof value === "string" ? JSON.stringify(value) : String(value);
      });
    });

    pbMocks.collections = {
      users: mockCollection({
        getOne: vi.fn().mockResolvedValue({ id: "user-1", moodle_domain: null }),
      }),
      reduxshare_review_imports: mockCollection({
        getFirstListItem: vi.fn().mockRejectedValue(notFoundError()),
        create: vi.fn().mockResolvedValue({ id: "ri-1" }),
      }),
      reduxshare_tasks: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
      }),
    };
  });

  it("creates an unverified task row for an unknown-answer selection", async () => {
    const { saveUserAnswerSelection } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    const imports = pbMocks.collections.reduxshare_review_imports;
    tasks.getFirstListItem.mockRejectedValue(notFoundError());
    tasks.create.mockResolvedValue({ id: "task-new" });

    const result = await saveUserAnswerSelection(authSession, selectionPayload("unknown"));

    expect(result).toEqual({ authSession, savedCount: 1 });
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        moodle_domain: "school.moodledemo.net",
        course_id: 2,
        quiz_id: 1150,
        question_id: "3699",
        question_hash: "hash",
        slot_key: "question",
        answer_key: "20.10",
        answer_label: "20.10",
        correct_count: 0,
        selected_correct_count: 0,
        selected_incorrect_count: 0,
        selected_unknown_count: 1,
        first_contributor: "user-1",
        last_contributor: "user-1",
      }),
    );
    expect(imports.create).not.toHaveBeenCalled();
    expect(imports.update).not.toHaveBeenCalled();
    expect(pbMocks.collections.users.update).not.toHaveBeenCalled();
  });

  it("increments the matching verified counter when the exact answer is known", async () => {
    const { saveUserAnswerSelection } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFirstListItem.mockRejectedValue(notFoundError());
    tasks.create.mockResolvedValue({ id: "task-new" });

    await saveUserAnswerSelection(authSession, selectionPayload("correct"));
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ selected_correct_count: 1, selected_unknown_count: 0 }),
    );

    tasks.create.mockClear();
    await saveUserAnswerSelection(authSession, selectionPayload("incorrect"));
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ selected_incorrect_count: 1, selected_unknown_count: 0 }),
    );
  });

  it("updates an existing task row instead of creating a duplicate", async () => {
    const { saveUserAnswerSelection } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFirstListItem.mockResolvedValue(taskRow({ selected_unknown_count: 3 }));
    tasks.update.mockResolvedValue(taskRow({ selected_unknown_count: 4 }));

    const result = await saveUserAnswerSelection(authSession, selectionPayload("unknown"));

    expect(result).toEqual({ authSession, savedCount: 1 });
    expect(tasks.create).not.toHaveBeenCalled();
    expect(tasks.update).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        "selected_unknown_count+": 1,
        last_contributor: "user-1",
      }),
    );
  });

  it("falls back to lookup-and-update when create hits the unique index race", async () => {
    const { saveUserAnswerSelection } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFirstListItem
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce(taskRow({ id: "task-winner" }));
    tasks.create.mockRejectedValue({ isValidation: true });
    tasks.update.mockResolvedValue(taskRow({ id: "task-winner" }));

    const result = await saveUserAnswerSelection(authSession, selectionPayload("correct"));

    expect(result).toEqual({ authSession, savedCount: 1 });
    expect(tasks.update).toHaveBeenCalledWith(
      "task-winner",
      expect.objectContaining({
        "selected_correct_count+": 1,
        last_contributor: "user-1",
      }),
    );
  });

  it("does not call PocketBase when courseId or quizId is missing", async () => {
    const { saveUserAnswerSelection } = await importQuizTasks();

    await expect(
      saveUserAnswerSelection(authSession, selectionPayload("unknown", { courseId: null })),
    ).resolves.toMatchObject({ savedCount: 0 });
    await expect(
      saveUserAnswerSelection(authSession, selectionPayload("unknown", { quizId: null })),
    ).resolves.toMatchObject({ savedCount: 0 });

    expect(pbMocks.withSessionRetry).not.toHaveBeenCalled();
  });
});

describe("review save transitions for pre-counted selections", () => {
  beforeEach(() => {
    pbMocks.ensurePocketBaseSession.mockReset();
    pbMocks.ensurePocketBaseSession.mockResolvedValue(authSession);
    pbMocks.withSessionRetry.mockReset();
    pbMocks.withSessionRetry.mockImplementation(
      async (
        session: AuthSession,
        runner: (pb: unknown, activeSession: AuthSession) => Promise<unknown>,
      ) => ({
        authSession: session,
        result: await runner(fakePb(), session),
      }),
    );
    pbMocks.filter.mockReset();
    pbMocks.filter.mockImplementation((template: string, params: Record<string, unknown> = {}) => {
      return template.replaceAll(/\{:(\w+)\}/g, (_, name: string) => {
        const value = params[name];
        return typeof value === "string" ? JSON.stringify(value) : String(value);
      });
    });

    pbMocks.collections = {
      users: mockCollection({
        getOne: vi.fn().mockResolvedValue({ id: "user-1", moodle_domain: null }),
      }),
      reduxshare_review_imports: mockCollection({
        getFirstListItem: vi.fn().mockRejectedValue(notFoundError()),
        create: vi.fn().mockResolvedValue({ id: "ri-1" }),
      }),
      reduxshare_tasks: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
      }),
    };
  });

  it("moves a pre-counted unknown tick to selected_correct on verified review", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFullList.mockResolvedValue([
      taskRow({ id: "task-unknown", answer_key: "20.10", selected_unknown_count: 1 }),
    ]);
    tasks.update.mockResolvedValue(taskRow({ id: "task-unknown" }));
    tasks.create.mockResolvedValue({ id: "task-new" });

    const result = await saveReduxShareReviewAnswers(
      authSession,
      reviewPayloadWithTracking([{ answerKey: "20.10", slotKey: "question", verdict: "unknown" }]),
    );

    expect(result).toMatchObject({ imported: true, savedCount: 2 });
    expect(tasks.update).toHaveBeenCalledWith(
      "task-unknown",
      expect.objectContaining({
        "correct_count+": 1,
        "selected_correct_count+": 1,
        "selected_incorrect_count+": 0,
        "selected_unknown_count+": -1,
        last_contributor: "user-1",
      }),
    );
  });

  it("keeps a pre-counted unknown tick when review stays unverified", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFullList.mockResolvedValue([
      taskRow({ id: "task-unknown", answer_key: "20.10", selected_unknown_count: 1 }),
    ]);
    tasks.update.mockResolvedValue(taskRow({ id: "task-unknown" }));
    tasks.create.mockResolvedValue({ id: "task-new" });

    const payload = reviewPayloadWithTracking([
      { answerKey: "20.10", slotKey: "question", verdict: "unknown" },
    ]);
    payload.questions[0].answers = payload.questions[0].answers.map((answer) => ({
      ...answer,
      correctness: 1,
      isCorrect: false,
    }));

    await saveReduxShareReviewAnswers(authSession, payload);

    expect(tasks.update).toHaveBeenCalledWith(
      "task-unknown",
      expect.objectContaining({
        "correct_count+": 0,
        "selected_correct_count+": 0,
        "selected_incorrect_count+": 0,
        "selected_unknown_count+": 0,
        last_contributor: "user-1",
      }),
    );
  });

  it("removes the stale tick of a tracked answer that review no longer shows", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFullList.mockResolvedValue([
      taskRow({ id: "task-stale", answer_key: "20.10", selected_unknown_count: 1 }),
    ]);
    tasks.update.mockResolvedValue(taskRow({ id: "task-stale" }));
    tasks.create.mockResolvedValue({ id: "task-new" });

    const payload = reviewPayloadWithTracking([
      { answerKey: "20.10", slotKey: "question", verdict: "unknown" },
    ]);
    payload.questions[0].answers = payload.questions[0].answers.filter(
      (answer) => answer.answerKey !== "20.10",
    );

    const result = await saveReduxShareReviewAnswers(authSession, payload);

    expect(result).toMatchObject({ imported: true, savedCount: 2 });
    expect(tasks.update).toHaveBeenCalledWith("task-stale", {
      "selected_unknown_count+": -1,
    });
  });

  it("clamps the removal when the tracked tick never reached the database", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFullList.mockResolvedValue([
      taskRow({ id: "task-stale", answer_key: "20.10", selected_unknown_count: 0 }),
    ]);
    tasks.update.mockResolvedValue(taskRow({ id: "task-stale" }));
    tasks.create.mockResolvedValue({ id: "task-new" });

    const payload = reviewPayloadWithTracking([
      { answerKey: "20.10", slotKey: "question", verdict: "unknown" },
    ]);
    payload.questions[0].answers = payload.questions[0].answers.filter(
      (answer) => answer.answerKey !== "20.10",
    );

    await saveReduxShareReviewAnswers(authSession, payload);

    expect(tasks.update).not.toHaveBeenCalled();
  });

  it("keeps plain review counting for answers without pre-counted tracking", async () => {
    const { saveReduxShareReviewAnswers } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    tasks.getFullList.mockResolvedValue([]);
    tasks.create.mockResolvedValue({ id: "task-new" });

    await saveReduxShareReviewAnswers(authSession, reviewPayloadWithTracking([]));

    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        answer_key: "20.10",
        correct_count: 1,
        selected_correct_count: 1,
        selected_unknown_count: 0,
      }),
    );
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        answer_key: "21.10",
        correct_count: 0,
        selected_incorrect_count: 1,
        selected_unknown_count: 0,
      }),
    );
  });
});
