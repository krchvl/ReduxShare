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

const authSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "access-token",
  expiresAt: null,
  user: {
    id: "user-1",
    email: "user@example.com",
  },
};

function userRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "u1@example.com",
    username: "ivan",
    moodle_domain: "moodle.example.com",
    solved_tests_count: 3,
    solved_tasks_count: 30,
    imported_questions_count: 100,
    attempt_correct_count: 80,
    attempt_incorrect_count: 10,
    ...overrides,
  };
}

async function importUserProfiles() {
  return import("../src/lib/userProfiles");
}

describe("fetchUserLeaderboard (PocketBase)", () => {
  function mockCollection() {
    return {
      getOne: vi.fn(),
      getList: vi.fn(),
    };
  }

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
      users: mockCollection(),
      reduxshare_tasks: mockCollection(),
    };
  });

  it("returns top entries with own rank and community totals", async () => {
    const { fetchUserLeaderboard } = await importUserProfiles();
    const users = pbMocks.collections.users;
    const tasks = pbMocks.collections.reduxshare_tasks;

    users.getOne.mockResolvedValue(userRecord({ id: "user-1", imported_questions_count: 40 }));
    users.getList
      .mockResolvedValueOnce({
        items: [
          userRecord({ id: "u1", username: "ivan", imported_questions_count: 300 }),
          userRecord({
            id: "u2",
            username: "",
            email: "maria@example.com",
            imported_questions_count: 120,
          }),
        ],
        totalItems: 2,
      })
      .mockResolvedValueOnce({ items: [], totalItems: 4 })
      .mockResolvedValueOnce({ items: [], totalItems: 7 });
    tasks.getList.mockResolvedValueOnce({ items: [], totalItems: 1234 });

    const { leaderboard } = await fetchUserLeaderboard(authSession);

    expect(leaderboard.entries).toHaveLength(2);
    expect(leaderboard.entries[0]).toMatchObject({
      id: "u1",
      username: "ivan",
      importedQuestionsCount: 300,
      attemptCorrectCount: 80,
      attemptIncorrectCount: 10,
    });
    expect(leaderboard.entries[1].username).toBe("maria");
    expect(leaderboard.myRank).toBe(5);
    expect(leaderboard.totalContributors).toBe(7);
    expect(leaderboard.totalAnswerRows).toBe(1234);

    const topRequest = users.getList.mock.calls[0];
    expect(topRequest[0]).toBe(1);
    expect(topRequest[1]).toBe(10);
    expect(topRequest[2]).toMatchObject({
      filter: "imported_questions_count > 0",
      sort: "-imported_questions_count",
    });
  });

  it("skips the own rank when the user has not imported anything", async () => {
    const { fetchUserLeaderboard } = await importUserProfiles();
    const users = pbMocks.collections.users;
    const tasks = pbMocks.collections.reduxshare_tasks;

    users.getOne.mockResolvedValue(userRecord({ id: "user-1", imported_questions_count: null }));
    users.getList
      .mockResolvedValueOnce({ items: [], totalItems: 0 })
      .mockResolvedValueOnce({ items: [], totalItems: 0 });
    tasks.getList.mockResolvedValueOnce({ items: [], totalItems: 0 });

    const { leaderboard } = await fetchUserLeaderboard(authSession);

    expect(leaderboard.myRank).toBeNull();
    expect(leaderboard.entries).toHaveLength(0);

    const usersGetListCalls = users.getList.mock.calls.length;
    expect(usersGetListCalls).toBe(2);
    const aheadCalls = users.getList.mock.calls.filter((call) =>
      String(call[2]?.filter ?? "").includes("{:count}"),
    );
    expect(aheadCalls).toHaveLength(0);
  });

  it("wraps transport errors into an i18n error", async () => {
    const { fetchUserLeaderboard } = await importUserProfiles();
    const users = pbMocks.collections.users;
    users.getOne.mockResolvedValue(userRecord());
    users.getList.mockRejectedValue(new Error("network down"));

    await expect(fetchUserLeaderboard(authSession)).rejects.toMatchObject({
      i18nKey: "errors.leaderboardLoadFailed",
    });
  });
});
