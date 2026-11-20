import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../src/types";
import {
  fetchEssayExamples,
  saveEssayExample,
  voteEssayExample,
} from "../src/lib/providers/firebase/essayExamples";
import { essayExampleDocumentId, essayVoteDocumentId } from "../src/lib/providers/firebase/ids";
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

function exampleId(questionHash = "hash-1") {
  return essayExampleDocumentId({
    userId: USER_ID,
    moodleDomain: "school.example",
    courseId: 12,
    quizId: 34,
    questionId: "q1",
    questionHash,
  });
}

function exampleFields(overrides: Record<string, unknown> = {}) {
  return {
    moodle_domain: "school.example",
    course_id: 12,
    quiz_id: 34,
    question_id: "q1",
    question_hash: "hash-1",
    question_type: "essay",
    question_text: "Explain the theory.",
    body: "An example answer.",
    user: USER_ID,
    author_name: "alice",
    votes_up: 0,
    votes_down: 0,
    ...overrides,
  };
}

let fake: FakeFirestore;

beforeEach(() => {
  vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", PROJECT_ID);
  fake = new FakeFirestore();
  fake.seed(`users/${USER_ID}`, {
    email: "alice@example.com",
    username: "alice",
    moodle_domain: "school.example",
  });
  fake.install();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("firebase saveEssayExample", () => {
  const payload = {
    domain: "school.example",
    courseId: 12,
    quizId: 34,
    questionId: "q1",
    questionHash: "hash-1",
    questionText: "  Explain the theory.  ",
    body: "  An example answer.  ",
  };

  it("creates one example per user and question", async () => {
    const result = await saveEssayExample(session(), payload);
    const path = `essayExamples/${exampleId()}`;

    expect(result.example).toMatchObject({
      exampleId: exampleId(),
      questionId: "q1",
      questionHash: "hash-1",
      body: "An example answer.",
      authorName: "alice",
      votesUp: 0,
      votesDown: 0,
      myVote: 0,
    });
    expect(fake.read(path)).toMatchObject({
      body: "An example answer.",
      question_type: "essay",
      question_text: "Explain the theory.",
      user: USER_ID,
      author_name: "alice",
    });
    expect([...fake.docs.keys()].filter((key) => key.startsWith("essayExamples/"))).toHaveLength(1);
  });

  it("updates the existing example instead of creating a duplicate", async () => {
    await saveEssayExample(session(), payload);

    const updated = await saveEssayExample(session(), {
      ...payload,
      body: "  A better answer.  ",
    });

    expect(updated.example.body).toBe("A better answer.");
    expect(fake.read(`essayExamples/${exampleId()}`)).toMatchObject({
      body: "A better answer.",
    });
    expect([...fake.docs.keys()].filter((key) => key.startsWith("essayExamples/"))).toHaveLength(1);
  });

  it("rejects empty bodies and missing Moodle ids", async () => {
    await expect(saveEssayExample(session(), { ...payload, body: "   " })).rejects.toMatchObject({
      i18nKey: "errors.essaySaveEmpty",
    });
    await expect(saveEssayExample(session(), { ...payload, courseId: null })).rejects.toMatchObject(
      { i18nKey: "errors.moodleIdsMissing" },
    );
  });
});

describe("firebase fetchEssayExamples", () => {
  it("groups examples by question, attaches votes and sorts downvoted last", async () => {
    fake.seed(
      `essayExamples/${exampleExample("a")}`,
      exampleFields({ body: "Answer A", votes_up: 2, votes_down: 0 }),
    );
    fake.seed(
      `essayExamples/${exampleExample("b")}`,
      exampleFields({ body: "Answer B", votes_up: 1, votes_down: 3 }),
    );
    fake.seed(
      `essayExamples/${exampleExample("c")}`,
      exampleFields({ body: "Answer C", votes_up: 2, votes_down: 0 }),
    );
    fake.seed(`essayVotes/${essayVoteDocumentId(exampleExample("a"), USER_ID)}`, {
      user: USER_ID,
      example_id: exampleExample("a"),
      value: 1,
    });

    const result = await fetchEssayExamples(session(), {
      domain: "school.example",
      courseId: 12,
      quizId: 34,
      questions: [{ questionId: "q1", questionHash: "hash-1" }],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[0].examples.map((example) => example.body)).toEqual([
      "Answer C",
      "Answer A",
      "Answer B",
    ]);
    expect(result.results[0].examples.find((example) => example.body === "Answer A")?.myVote).toBe(
      1,
    );
    expect(result.results[0].examples[2]).toMatchObject({
      body: "Answer B",
      votesUp: 1,
      votesDown: 3,
      authorName: "alice",
    });
  });

  it("falls back to the question hash when there is no question id", async () => {
    fake.seed(
      `essayExamples/${essayExampleDocumentId({
        userId: USER_ID,
        moodleDomain: "school.example",
        courseId: 12,
        quizId: 34,
        questionId: "",
        questionHash: "hash-only",
      })}`,
      exampleFields({ question_id: "", question_hash: "hash-only", body: "Hash answer" }),
    );

    const result = await fetchEssayExamples(session(), {
      domain: "school.example",
      courseId: 12,
      quizId: 34,
      questions: [{ questionId: null, questionHash: "hash-only" }],
    });

    expect(result.results[0].examples.map((example) => example.body)).toEqual(["Hash answer"]);
  });

  it("returns empty results for missing Moodle ids without a network call", async () => {
    const fetchMock = fake.install();

    const result = await fetchEssayExamples(session(), {
      domain: "school.example",
      courseId: null,
      quizId: null,
      questions: [{ questionId: "q1", questionHash: "hash-1" }],
    });

    expect(result.results[0]).toEqual({
      questionId: "q1",
      questionHash: "hash-1",
      ok: false,
      examples: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("firebase voteEssayExample", () => {
  it("creates, toggles and switches example votes", async () => {
    const id = exampleExample("voted");
    fake.seed(`essayExamples/${id}`, exampleFields({ body: "Voted" }));

    const created = await voteEssayExample(session(), { exampleId: id, value: 1 });

    expect(created).toMatchObject({ votesUp: 1, votesDown: 0, myVote: 1 });
    expect(fake.read(`essayVotes/${essayVoteDocumentId(id, USER_ID)}`)).toMatchObject({
      example_id: id,
      user: USER_ID,
      value: 1,
    });

    const toggled = await voteEssayExample(session(), { exampleId: id, value: 1 });

    expect(toggled).toMatchObject({ votesUp: 0, votesDown: 0, myVote: 0 });
    expect(fake.read(`essayVotes/${essayVoteDocumentId(id, USER_ID)}`)).toBeNull();

    await voteEssayExample(session(), { exampleId: id, value: 1 });
    const switched = await voteEssayExample(session(), { exampleId: id, value: -1 });

    expect(switched).toMatchObject({ votesUp: 0, votesDown: 1, myVote: -1 });
    expect(fake.read(`essayExamples/${id}`)).toMatchObject({ votes_up: 0, votes_down: 1 });
  });

  it("clamps negative counters and rejects missing examples", async () => {
    const id = exampleExample("negative");
    fake.seed(`essayExamples/${id}`, exampleFields({ votes_up: -2 }));
    fake.seed(`essayVotes/${essayVoteDocumentId(id, USER_ID)}`, {
      user: USER_ID,
      example_id: id,
      value: 1,
    });

    const result = await voteEssayExample(session(), { exampleId: id, value: 1 });

    expect(result).toMatchObject({ votesUp: 0, votesDown: 0, myVote: 0 });
    await expect(
      voteEssayExample(session(), { exampleId: "missing", value: 1 }),
    ).rejects.toMatchObject({ i18nKey: "errors.essayVoteFailed" });
  });
});

function exampleExample(suffix: string) {
  return essayExampleDocumentId({
    userId: USER_ID,
    moodleDomain: "school.example",
    courseId: 12,
    quizId: 34,
    questionId: `q-${suffix}`,
    questionHash: "hash-1",
  });
}
