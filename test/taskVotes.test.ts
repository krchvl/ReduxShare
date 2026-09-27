import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nError } from "../src/i18n";
import type { AuthSession } from "../src/types";

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
    messageKey: "errors.reduxAnswersFetchFailed" | "errors.voteSaveFailed",
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
    delete: vi.fn(),
    ...overrides,
  };
}

function notFoundError() {
  return { isNotFound: true };
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
    votes_up: 0,
    votes_down: 0,
    created: "2026-09-01T10:00:00.000Z",
    updated: "2026-09-02T10:00:00.000Z",
    ...overrides,
  };
}

function voteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "vote-1",
    task: "task-1",
    user: "user-1",
    value: 1,
    ...overrides,
  };
}

async function importQuizTasks() {
  return import("../src/lib/quizTasks");
}

describe("ReduxShare task votes (PocketBase)", () => {
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
      reduxshare_tasks: mockCollection({
        getOne: vi.fn().mockResolvedValue(taskRow()),
      }),
      reduxshare_task_votes: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
        getFirstListItem: vi.fn().mockRejectedValue(notFoundError()),
        create: vi.fn().mockResolvedValue(voteRow()),
        update: vi.fn().mockResolvedValue(voteRow()),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
    };
  });

  it("creates a vote and increments the matching counter", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    const votes = pbMocks.collections.reduxshare_task_votes;

    const result = await voteTaskAnswer(authSession, { taskId: "task-1", value: 1 });

    expect(votes.create).toHaveBeenCalledWith({
      task: "task-1",
      user: "user-1",
      value: 1,
    });
    expect(tasks.update).toHaveBeenCalledWith("task-1", {
      "votes_up+": 1,
      "votes_down+": 0,
    });
    expect(result).toEqual({
      authSession,
      votesUp: 0,
      votesDown: 0,
      myVote: 1,
    });
  });

  it("increments the down counter for a negative vote", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;

    await voteTaskAnswer(authSession, { taskId: "task-1", value: -1 });

    expect(tasks.update).toHaveBeenCalledWith("task-1", {
      "votes_up+": 0,
      "votes_down+": 1,
    });
  });

  it("switches an existing vote from up to down and moves the counter", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    const votes = pbMocks.collections.reduxshare_task_votes;
    votes.getFirstListItem.mockResolvedValue(voteRow({ value: 1 }));

    const result = await voteTaskAnswer(authSession, { taskId: "task-1", value: -1 });

    expect(votes.update).toHaveBeenCalledWith("vote-1", { value: -1 });
    expect(votes.delete).not.toHaveBeenCalled();
    expect(votes.create).not.toHaveBeenCalled();
    expect(tasks.update).toHaveBeenCalledWith("task-1", {
      "votes_up+": -1,
      "votes_down+": 1,
    });
    expect(result.myVote).toBe(-1);
  });

  it("removes the vote when the same button is pressed again", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    const votes = pbMocks.collections.reduxshare_task_votes;
    votes.getFirstListItem.mockResolvedValue(voteRow({ value: -1 }));

    const result = await voteTaskAnswer(authSession, { taskId: "task-1", value: -1 });

    expect(votes.delete).toHaveBeenCalledWith("vote-1");
    expect(votes.create).not.toHaveBeenCalled();
    expect(tasks.update).toHaveBeenCalledWith("task-1", {
      "votes_up+": 0,
      "votes_down+": -1,
    });
    expect(result.myVote).toBe(0);
  });

  it("adopts the winning vote and moves the counter when create loses the unique-index race", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    const votes = pbMocks.collections.reduxshare_task_votes;
    votes.create.mockRejectedValue({ isValidation: true });
    // Первый запрос — голоса нет; после неудачного create — голос победителя в гонке.
    votes.getFirstListItem
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce(voteRow({ value: -1 }));

    const result = await voteTaskAnswer(authSession, { taskId: "task-1", value: 1 });

    expect(votes.update).toHaveBeenCalledWith("vote-1", { value: 1 });
    expect(tasks.update).toHaveBeenCalledWith("task-1", {
      "votes_up+": 1,
      "votes_down+": -1,
    });
    expect(result.myVote).toBe(1);
  });

  it("skips counter updates when the race winner already voted the same way", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    const votes = pbMocks.collections.reduxshare_task_votes;
    votes.create.mockRejectedValue({ isValidation: true });
    votes.getFirstListItem
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce(voteRow({ value: 1 }));

    const result = await voteTaskAnswer(authSession, { taskId: "task-1", value: 1 });

    expect(votes.update).not.toHaveBeenCalled();
    expect(tasks.update).not.toHaveBeenCalled();
    expect(result.myVote).toBe(1);
  });

  it("rejects votes for missing task rows with a dedicated error", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    pbMocks.collections.reduxshare_tasks.getOne.mockRejectedValue(notFoundError());

    const error = await voteTaskAnswer(authSession, { taskId: "missing", value: 1 }).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(I18nError);
    expect((error as I18nError).i18nKey).toBe("errors.voteTaskMissing");
  });

  it("rejects votes for verified-correct task rows", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const votes = pbMocks.collections.reduxshare_task_votes;
    pbMocks.collections.reduxshare_tasks.getOne.mockResolvedValue(
      taskRow({ correct_count: 3, selected_correct_count: 1 }),
    );

    const error = await voteTaskAnswer(authSession, { taskId: "task-1", value: 1 }).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(I18nError);
    expect((error as I18nError).i18nKey).toBe("errors.voteUnverifiableOnly");
    expect(votes.create).not.toHaveBeenCalled();
  });

  it("rejects votes for known-wrong task rows", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const votes = pbMocks.collections.reduxshare_task_votes;
    pbMocks.collections.reduxshare_tasks.getOne.mockResolvedValue(
      taskRow({ selected_incorrect_count: 2 }),
    );

    const error = await voteTaskAnswer(authSession, { taskId: "task-1", value: -1 }).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect((error as I18nError).i18nKey).toBe("errors.voteUnverifiableOnly");
    expect(votes.create).not.toHaveBeenCalled();
  });

  it("allows votes for unverified rows that only have unknown selections", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const votes = pbMocks.collections.reduxshare_task_votes;
    pbMocks.collections.reduxshare_tasks.getOne.mockResolvedValue(
      taskRow({ selected_unknown_count: 4 }),
    );

    const result = await voteTaskAnswer(authSession, { taskId: "task-1", value: 1 });

    expect(votes.create).toHaveBeenCalledWith({
      task: "task-1",
      user: "user-1",
      value: 1,
    });
    expect(result.myVote).toBe(1);
  });

  it("clamps negative counters after a decrement", async () => {
    const { voteTaskAnswer } = await importQuizTasks();
    const tasks = pbMocks.collections.reduxshare_tasks;
    const votes = pbMocks.collections.reduxshare_task_votes;
    votes.getFirstListItem.mockResolvedValue(voteRow({ value: 1 }));

    // После декремента сервер вернул -1 — клиент должен исправить значение на 0.
    tasks.getOne.mockResolvedValueOnce(taskRow()).mockResolvedValueOnce(taskRow({ votes_up: -1 }));

    const result = await voteTaskAnswer(authSession, { taskId: "task-1", value: 1 });

    expect(tasks.update).toHaveBeenLastCalledWith("task-1", {
      votes_up: 0,
      votes_down: 0,
    });
    expect(result.votesUp).toBe(0);
  });
});

describe("ReduxShare task votes in fetch (PocketBase)", () => {
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
      reduxshare_tasks: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
      }),
      reduxshare_task_votes: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
      }),
    };
  });

  it("attaches own vote and vote counts to fetched submissions", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();
    pbMocks.collections.reduxshare_tasks.getFullList.mockResolvedValue([
      taskRow({ id: "t1", answer_label: "A", correct_count: 1 }),
      taskRow({ id: "t2", answer_label: "B", correct_count: 1, votes_up: 2, votes_down: 5 }),
    ]);
    pbMocks.collections.reduxshare_task_votes.getFullList.mockResolvedValue([
      voteRow({ task: "t1", value: -1 }),
    ]);

    const result = await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [{ questionId: "q-1", questionType: "multichoice", questionHash: "hash-1" }],
    });

    const submissions = (
      result.results[0]?.data as Array<{ submissions: Array<Record<string, unknown>> }>
    )[0]?.submissions as Array<Record<string, unknown>>;
    const byLabel = new Map(submissions.map((item) => [item.label, item]));

    expect(byLabel.get("A")).toMatchObject({ taskId: "t1", votesUp: 0, votesDown: 0, myVote: -1 });
    expect(byLabel.get("B")).toMatchObject({ taskId: "t2", votesUp: 2, votesDown: 5, myVote: 0 });
  });

  it("queries votes only for the current user in one batched request", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();
    pbMocks.collections.reduxshare_tasks.getFullList.mockResolvedValue([
      taskRow({ id: "t1", answer_label: "A", correct_count: 1 }),
    ]);

    await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [{ questionId: "q-1", questionType: "multichoice", questionHash: "hash-1" }],
    });

    const votes = pbMocks.collections.reduxshare_task_votes;
    expect(votes.getFullList).toHaveBeenCalledTimes(1);
    const filterCall = votes.getFullList.mock.calls[0]?.[0] as { filter: string };
    expect(filterCall.filter).toContain('"user-1"');
    expect(filterCall.filter).toContain('"t1"');
  });

  it("does not query votes when the quiz has no stored rows", async () => {
    const { fetchReduxShareTasks } = await importQuizTasks();

    await fetchReduxShareTasks(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [{ questionId: "unknown", questionType: "multichoice", questionHash: "h" }],
    });

    expect(pbMocks.collections.reduxshare_task_votes.getFullList).not.toHaveBeenCalled();
  });
});
