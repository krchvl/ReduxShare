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
  ESSAY_EXAMPLES_COLLECTION: "reduxshare_essay_examples",
  ESSAY_VOTES_COLLECTION: "reduxshare_essay_votes",
  isNotFoundError: (error: { isNotFound?: boolean } | null | undefined) =>
    error?.isNotFound === true,
  isValidationError: (error: { isValidation?: boolean } | null | undefined) =>
    error?.isValidation === true,
  toI18nError: (error: unknown, messageKey: string) => {
    if (error instanceof I18nError) {
      return error;
    }

    return new I18nError(messageKey as never, {
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

function essayRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "essay-1",
    moodle_domain: "school.moodledemo.net",
    course_id: 2,
    quiz_id: 1150,
    question_id: "q-1",
    question_hash: "hash-1",
    question_type: "essay",
    question_text: "Explain the causes of the October Revolution.",
    body: "The revolution happened because of the crisis.",
    votes_up: 0,
    votes_down: 0,
    created: "2026-09-01T10:00:00.000Z",
    updated: "2026-09-02T10:00:00.000Z",
    expand: null,
    ...overrides,
  };
}

function essayVoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "evote-1",
    example: "essay-1",
    user: "user-1",
    value: 1,
    ...overrides,
  };
}

async function importEssayExamples() {
  return import("../src/lib/essayExamples");
}

const savePayload = {
  domain: "school.moodledemo.net",
  courseId: 2,
  quizId: 1150,
  questionId: "q-1",
  questionHash: "hash-1",
  questionText: "Explain the causes of the October Revolution.",
  body: "The revolution happened because of the crisis.",
};

describe("ReduxShare essay examples save (PocketBase)", () => {
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
      reduxshare_essay_examples: mockCollection({
        getOne: vi.fn().mockResolvedValue(essayRow()),
      }),
      reduxshare_essay_votes: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
        getFirstListItem: vi.fn().mockRejectedValue(notFoundError()),
        create: vi.fn().mockResolvedValue(essayVoteRow()),
        update: vi.fn().mockResolvedValue(essayVoteRow()),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
    };
  });

  it("creates a new example when the user has none for the question", async () => {
    const { saveEssayExample } = await importEssayExamples();
    const examples = pbMocks.collections.reduxshare_essay_examples;
    examples.getFirstListItem.mockRejectedValue(notFoundError());
    examples.create.mockResolvedValue(essayRow());

    const result = await saveEssayExample(authSession, savePayload);

    expect(examples.create).toHaveBeenCalledWith(
      expect.objectContaining({
        moodle_domain: "school.moodledemo.net",
        course_id: 2,
        quiz_id: 1150,
        question_id: "q-1",
        question_hash: "hash-1",
        question_type: "essay",
        body: "The revolution happened because of the crisis.",
        user: "user-1",
      }),
    );
    expect(examples.update).not.toHaveBeenCalled();
    expect(result.example).toMatchObject({ exampleId: "essay-1", myVote: 0 });
  });

  it("updates the existing own example instead of creating a duplicate", async () => {
    const { saveEssayExample } = await importEssayExamples();
    const examples = pbMocks.collections.reduxshare_essay_examples;
    examples.getFirstListItem.mockResolvedValue(essayRow({ body: "Old draft" }));
    examples.update.mockResolvedValue(essayRow({ body: savePayload.body }));

    const result = await saveEssayExample(authSession, savePayload);

    expect(examples.update).toHaveBeenCalledWith(
      "essay-1",
      expect.objectContaining({ body: "The revolution happened because of the crisis." }),
    );
    expect(examples.create).not.toHaveBeenCalled();
    expect(result.example.body).toBe(savePayload.body);
  });

  it("adopts the winning row and updates it when create loses the unique-index race", async () => {
    const { saveEssayExample } = await importEssayExamples();
    const examples = pbMocks.collections.reduxshare_essay_examples;
    // Первый поиск — своего примера нет; create падает на гонке; повторный поиск находит строку.
    examples.getFirstListItem
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce(essayRow({ id: "essay-winner", user: "user-1" }));
    examples.create.mockRejectedValue({ isValidation: true });
    examples.update.mockResolvedValue(essayRow({ id: "essay-winner" }));

    const result = await saveEssayExample(authSession, savePayload);

    expect(examples.create).toHaveBeenCalled();
    expect(examples.update).toHaveBeenCalledWith(
      "essay-winner",
      expect.objectContaining({ body: savePayload.body }),
    );
    expect(result.example.exampleId).toBe("essay-winner");
  });

  it("rejects an empty body with a dedicated error", async () => {
    const { saveEssayExample } = await importEssayExamples();

    const error = await saveEssayExample(authSession, { ...savePayload, body: "   " }).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(I18nError);
    expect((error as I18nError).i18nKey).toBe("errors.essaySaveEmpty");
    expect(pbMocks.collections.reduxshare_essay_examples.create).not.toHaveBeenCalled();
  });

  it("rejects a save without Moodle ids", async () => {
    const { saveEssayExample } = await importEssayExamples();

    const error = await saveEssayExample(authSession, { ...savePayload, courseId: null }).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(I18nError);
    expect((error as I18nError).i18nKey).toBe("errors.moodleIdsMissing");
  });

  it("truncates the body to the collection limit", async () => {
    const { saveEssayExample, ESSAY_EXAMPLE_MAX_LENGTH } = await importEssayExamples();
    const examples = pbMocks.collections.reduxshare_essay_examples;
    examples.getFirstListItem.mockResolvedValue(essayRow());
    examples.update.mockResolvedValue(essayRow());

    await saveEssayExample(authSession, { ...savePayload, body: "а".repeat(25000) });

    const updateCall = examples.update.mock.calls[0]?.[1] as { body: string };
    expect(updateCall.body.length).toBe(ESSAY_EXAMPLE_MAX_LENGTH);
  });
});

describe("ReduxShare essay examples fetch (PocketBase)", () => {
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
      reduxshare_essay_examples: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
      }),
      reduxshare_essay_votes: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
      }),
    };
  });

  it("groups examples per question, sorts by net votes and attaches own vote", async () => {
    const { fetchEssayExamples } = await importEssayExamples();
    pbMocks.collections.reduxshare_essay_examples.getFullList.mockResolvedValue([
      essayRow({ id: "e1", question_id: "q-1", votes_up: 3 }),
      essayRow({ id: "e2", question_id: "q-1", votes_up: 5 }),
      essayRow({ id: "e3", question_id: "q-2", votes_up: 1 }),
    ]);
    pbMocks.collections.reduxshare_essay_votes.getFullList.mockResolvedValue([
      essayVoteRow({ example: "e2", value: -1 }),
    ]);

    const result = await fetchEssayExamples(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [
        { questionId: "q-1", questionHash: "hash-1" },
        { questionId: "q-2", questionHash: "hash-2" },
      ],
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]?.examples.map((item) => item.exampleId)).toEqual(["e2", "e1"]);
    expect(result.results[0]?.examples[0]).toMatchObject({ myVote: -1, votesUp: 5 });
    expect(result.results[1]?.examples.map((item) => item.exampleId)).toEqual(["e3"]);
  });

  it("sinks downvoted examples to the end of the list", async () => {
    const { fetchEssayExamples } = await importEssayExamples();
    pbMocks.collections.reduxshare_essay_examples.getFullList.mockResolvedValue([
      essayRow({ id: "e1", question_id: "q-1", votes_up: 1 }),
      essayRow({ id: "e2", question_id: "q-1", votes_up: 0, votes_down: 4 }),
    ]);

    const result = await fetchEssayExamples(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [{ questionId: "q-1", questionHash: "hash-1" }],
    });

    expect(result.results[0]?.examples.map((item) => item.exampleId)).toEqual(["e1", "e2"]);
  });

  it("matches rows by question hash for questions without an id", async () => {
    const { fetchEssayExamples } = await importEssayExamples();
    pbMocks.collections.reduxshare_essay_examples.getFullList.mockResolvedValue([
      essayRow({ id: "e7", question_id: "", question_hash: "hash-7" }),
    ]);

    const result = await fetchEssayExamples(authSession, {
      domain: "school.moodledemo.net",
      courseId: 2,
      quizId: 1150,
      questions: [{ questionId: null, questionHash: "hash-7" }],
    });

    expect(result.results[0]?.examples).toHaveLength(1);
    expect(result.results[0]?.examples[0]?.exampleId).toBe("e7");
  });

  it("returns ok:false items when Moodle ids are missing", async () => {
    const { fetchEssayExamples } = await importEssayExamples();

    const result = await fetchEssayExamples(authSession, {
      domain: "school.moodledemo.net",
      courseId: null,
      quizId: 1150,
      questions: [{ questionId: "q-1", questionHash: "hash-1" }],
    });

    expect(result.results[0]).toMatchObject({ ok: false, examples: [] });
    expect(pbMocks.collections.reduxshare_essay_examples.getFullList).not.toHaveBeenCalled();
  });
});

describe("ReduxShare essay example votes (PocketBase)", () => {
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
      reduxshare_essay_examples: mockCollection({
        getOne: vi.fn().mockResolvedValue(essayRow()),
      }),
      reduxshare_essay_votes: mockCollection({
        getFullList: vi.fn().mockResolvedValue([]),
        getFirstListItem: vi.fn().mockRejectedValue(notFoundError()),
        create: vi.fn().mockResolvedValue(essayVoteRow()),
        update: vi.fn().mockResolvedValue(essayVoteRow()),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
    };
  });

  it("creates a vote and increments the matching counter", async () => {
    const { voteEssayExample } = await importEssayExamples();
    const examples = pbMocks.collections.reduxshare_essay_examples;
    const votes = pbMocks.collections.reduxshare_essay_votes;

    const result = await voteEssayExample(authSession, { exampleId: "essay-1", value: 1 });

    expect(votes.create).toHaveBeenCalledWith({
      example: "essay-1",
      user: "user-1",
      value: 1,
    });
    expect(examples.update).toHaveBeenCalledWith("essay-1", {
      "votes_up+": 1,
      "votes_down+": 0,
    });
    expect(result).toEqual({ authSession, votesUp: 0, votesDown: 0, myVote: 1 });
  });

  it("switches an existing vote from up to down and moves the counter", async () => {
    const { voteEssayExample } = await importEssayExamples();
    const examples = pbMocks.collections.reduxshare_essay_examples;
    const votes = pbMocks.collections.reduxshare_essay_votes;
    votes.getFirstListItem.mockResolvedValue(essayVoteRow({ value: 1 }));

    const result = await voteEssayExample(authSession, { exampleId: "essay-1", value: -1 });

    expect(votes.update).toHaveBeenCalledWith("evote-1", { value: -1 });
    expect(examples.update).toHaveBeenCalledWith("essay-1", {
      "votes_up+": -1,
      "votes_down+": 1,
    });
    expect(result.myVote).toBe(-1);
  });

  it("removes the vote when the same button is pressed again", async () => {
    const { voteEssayExample } = await importEssayExamples();
    const examples = pbMocks.collections.reduxshare_essay_examples;
    const votes = pbMocks.collections.reduxshare_essay_votes;
    votes.getFirstListItem.mockResolvedValue(essayVoteRow({ value: 1 }));

    const result = await voteEssayExample(authSession, { exampleId: "essay-1", value: 1 });

    expect(votes.delete).toHaveBeenCalledWith("evote-1");
    expect(examples.update).toHaveBeenCalledWith("essay-1", {
      "votes_up+": -1,
      "votes_down+": 0,
    });
    expect(result.myVote).toBe(0);
  });

  it("adopts the winning vote when create loses the unique-index race", async () => {
    const { voteEssayExample } = await importEssayExamples();
    const votes = pbMocks.collections.reduxshare_essay_votes;
    votes.create.mockRejectedValue({ isValidation: true });
    votes.getFirstListItem
      .mockRejectedValueOnce(notFoundError())
      .mockResolvedValueOnce(essayVoteRow({ value: -1 }));

    const result = await voteEssayExample(authSession, { exampleId: "essay-1", value: 1 });

    expect(votes.update).toHaveBeenCalledWith("evote-1", { value: 1 });
    expect(result.myVote).toBe(1);
  });
});
