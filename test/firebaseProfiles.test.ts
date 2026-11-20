import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../src/types";
import {
  fetchOwnUserProfile,
  fetchUserAttemptHistory,
  fetchUserLeaderboard,
  recordUserQuizProgress,
  touchUserProfile,
} from "../src/lib/providers/firebase/userProfiles";
import { usernameDocumentId } from "../src/lib/providers/firebase/ids";
import { FakeFirestore, PROJECT_ID } from "./fakeFirestore";

const USER_ID = "uid-1";

function session(): AuthSession {
  return {
    provider: "firebase",
    accessToken: "token-1",
    refreshToken: "refresh-1",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: { id: USER_ID, email: "alice@example.com" },
  };
}

function userFields(overrides: Record<string, unknown> = {}) {
  return {
    email: "alice@example.com",
    username: "alice",
    moodle_domain: "",
    solved_tests_count: 0,
    solved_tasks_count: 0,
    imported_questions_count: 0,
    attempt_correct_count: 0,
    attempt_incorrect_count: 0,
    ...overrides,
  };
}

let fake: FakeFirestore;

beforeEach(() => {
  vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", PROJECT_ID);
  fake = new FakeFirestore();
  fake.install();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("firebase touchUserProfile", () => {
  it("updates the Moodle domain of an existing profile", async () => {
    fake.seed(`users/${USER_ID}`, userFields({ moodle_domain: "old.example" }));

    const result = await touchUserProfile(session(), "new.example");

    expect(result.userProfile.moodleDomain).toBe("new.example");
    expect(fake.read(`users/${USER_ID}`)).toMatchObject({
      moodle_domain: "new.example",
      username: "alice",
    });
  });

  it("creates a missing profile and reserves the username", async () => {
    fake.docs.delete(`users/${USER_ID}`);

    const result = await touchUserProfile(session(), "school.example", {
      email: "alice@example.com",
      username: "alice",
    });

    expect(result.userProfile).toMatchObject({
      id: USER_ID,
      email: "alice@example.com",
      username: "alice",
      moodleDomain: "school.example",
      solvedTestsCount: 0,
      solvedTasksCount: 0,
    });
    expect(fake.read(`users/${USER_ID}`)).toMatchObject({
      email: "alice@example.com",
      username: "alice",
      moodle_domain: "school.example",
    });
    expect(fake.read(`usernames/${usernameDocumentId("alice")}`)).toMatchObject({
      user: USER_ID,
      username: "alice",
    });
  });
});

describe("firebase recordUserQuizProgress", () => {
  it("increments solved counters and fills domain and username", async () => {
    fake.seed(
      `users/${USER_ID}`,
      userFields({ username: "", solved_tests_count: 1, solved_tasks_count: 2 }),
    );

    const result = await recordUserQuizProgress(session(), {
      moodleDomain: "school.example",
      solvedTestsDelta: 2,
      solvedTasksDelta: 3,
      username: "alice",
    });

    expect(result.userProfile).toMatchObject({
      username: "alice",
      moodleDomain: "school.example",
      solvedTestsCount: 3,
      solvedTasksCount: 5,
    });
    expect(fake.read(`users/${USER_ID}`)).toMatchObject({
      username: "alice",
      moodle_domain: "school.example",
      solved_tests_count: 3,
      solved_tasks_count: 5,
    });
  });

  it("ignores negative deltas", async () => {
    fake.seed(`users/${USER_ID}`, userFields({ solved_tests_count: 4, solved_tasks_count: 5 }));

    await recordUserQuizProgress(session(), {
      moodleDomain: null,
      solvedTestsDelta: -3,
      solvedTasksDelta: -2,
    });

    expect(fake.read(`users/${USER_ID}`)).toMatchObject({
      solved_tests_count: 4,
      solved_tasks_count: 5,
    });
  });
});

describe("firebase fetchOwnUserProfile", () => {
  it("maps every counter", async () => {
    fake.seed(
      `users/${USER_ID}`,
      userFields({
        moodle_domain: "school.example",
        solved_tests_count: 7,
        solved_tasks_count: 9,
        imported_questions_count: 11,
        attempt_correct_count: 13,
        attempt_incorrect_count: 17,
      }),
    );

    const result = await fetchOwnUserProfile(session());

    expect(result.userProfile).toEqual({
      id: USER_ID,
      email: "alice@example.com",
      username: "alice",
      moodleDomain: "school.example",
      solvedTestsCount: 7,
      solvedTasksCount: 9,
      importedQuestionsCount: 11,
      attemptCorrectCount: 13,
      attemptIncorrectCount: 17,
    });
  });

  it("fails with sessionExpired when the profile is missing", async () => {
    await expect(fetchOwnUserProfile(session())).rejects.toMatchObject({
      i18nKey: "errors.sessionExpired",
    });
  });
});

describe("firebase fetchUserLeaderboard", () => {
  it("returns the top contributors, own rank and community totals", async () => {
    fake.seed(`users/${USER_ID}`, userFields({ username: "alice", imported_questions_count: 5 }));
    fake.seed(
      "users/alpha",
      userFields({
        email: "alpha@example.com",
        username: "alpha",
        imported_questions_count: 10,
      }),
    );
    fake.seed(
      "users/bravo",
      userFields({
        email: "bravo@example.com",
        username: "bravo",
        imported_questions_count: 3,
      }),
    );
    fake.seed(
      "users/zulu",
      userFields({
        email: "zulu@example.com",
        username: "zulu",
        imported_questions_count: 0,
      }),
    );

    for (let index = 0; index < 4; index += 1) {
      fake.seed(`tasks/task-${index}`, { question_id: `q${index}` });
    }

    const result = await fetchUserLeaderboard(session(), 2);

    expect(result.leaderboard.entries.map((entry) => entry.username)).toEqual(["alpha", "alice"]);
    expect(result.leaderboard.entries[0]).toMatchObject({
      importedQuestionsCount: 10,
      attemptCorrectCount: 0,
      attemptIncorrectCount: 0,
    });
    expect(result.leaderboard.myRank).toBe(2);
    expect(result.leaderboard.totalContributors).toBe(3);
    expect(result.leaderboard.totalAnswerRows).toBe(4);
  });

  it("has no rank while the user has not imported anything", async () => {
    fake.seed(`users/${USER_ID}`, userFields({ username: "alice", imported_questions_count: 0 }));

    const result = await fetchUserLeaderboard(session());

    expect(result.leaderboard).toEqual({
      entries: [],
      myRank: null,
      totalContributors: 0,
      totalAnswerRows: 0,
    });
  });
});

describe("firebase fetchUserAttemptHistory", () => {
  it("returns own imports newest first with a total count", async () => {
    fake.seed("reviewImports/import-1", {
      user: USER_ID,
      moodle_domain: "school.example",
      course_id: 12,
      quiz_id: 34,
      page_url: "https://school.example/1",
      imported_question_count: 3,
      imported_question_hashes: {},
    });
    fake.seed("reviewImports/import-2", {
      user: USER_ID,
      moodle_domain: "school.example",
      course_id: 12,
      quiz_id: 35,
      page_url: "https://school.example/2",
      imported_question_count: 4,
      imported_question_hashes: {},
    });
    fake.seed("reviewImports/import-3", {
      user: USER_ID,
      moodle_domain: "school.example",
      course_id: 12,
      quiz_id: 36,
      page_url: "https://school.example/3",
      imported_question_count: 5,
      imported_question_hashes: {},
    });
    fake.seed("reviewImports/other-user", {
      user: "uid-2",
      moodle_domain: "school.example",
      course_id: 12,
      quiz_id: 37,
      page_url: "https://school.example/4",
      imported_question_count: 6,
      imported_question_hashes: {},
    });

    const result = await fetchUserAttemptHistory(session(), 2);

    expect(result.history.total).toBe(3);
    expect(result.history.entries.map((entry) => entry.id)).toEqual(["import-3", "import-2"]);
    expect(result.history.entries[0]).toMatchObject({
      domain: "school.example",
      courseId: 12,
      quizId: 36,
      pageUrl: "https://school.example/3",
      importedQuestionsCount: 5,
    });
  });
});
