import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../src/types";
import {
  fetchReduxShareQuizPreviewTasks,
  fetchReduxShareTasks,
  saveReduxShareReviewAnswers,
  saveUserAnswerSelection,
  voteTaskAnswer,
} from "../src/lib/providers/firebase/quizTasks";
import {
  decodeFirestoreFields,
  decodeFirestoreValue,
  encodeFirestoreFields,
  type FirestoreValue,
} from "../src/lib/providers/firebase/firestore";
import {
  reviewImportDocumentId,
  taskDocumentId,
  taskVoteDocumentId,
} from "../src/lib/providers/firebase/ids";
import {
  getReviewQuestionContentHash,
  normalizeReviewQuestions,
  shouldDowngradeMismatchedHashData,
} from "../src/lib/dataCore/quizTasksCore";
import type { SaveReduxShareReviewPayload } from "../src/lib/dataTypes";

const PROJECT_ID = "demo";
const DOCUMENTS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const USER_ID = "uid-1";

interface WriteBody {
  update?: { name: string; fields?: Record<string, unknown> };
  updateMask?: { fieldPaths?: string[] };
  updateTransforms?: Array<{
    fieldPath: string;
    increment?: { integerValue?: string; doubleValue?: number };
    setToServerTimestamp?: unknown;
  }>;
  currentDocument?: { exists?: boolean };
  transform?: {
    document: string;
    fieldTransforms: Array<{
      fieldPath: string;
      increment?: { integerValue?: string; doubleValue?: number };
      setToServerTimestamp?: unknown;
    }>;
  };
  delete?: string;
}

function pathFromName(name: string): string {
  return name.startsWith(`${DOCUMENTS_BASE}/`) ? name.slice(DOCUMENTS_BASE.length + 1) : name;
}

class FakeFirestore {
  docs = new Map<string, Record<string, unknown>>();
  private tick = 0;

  seed(path: string, fields: Record<string, unknown>) {
    const timestamp = this.nextTimestamp();
    this.docs.set(path, { created: timestamp, updated: timestamp, ...fields });
    return this;
  }

  read(path: string) {
    return this.docs.get(path) ?? null;
  }

  install() {
    const mock = vi.fn((url: string, init: RequestInit) => this.handle(url, init));
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  private nextTimestamp() {
    this.tick += 1;
    return new Date(Date.UTC(2026, 10, 20, 0, 0, this.tick)).toISOString();
  }

  private json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
  }

  private docResponse(path: string) {
    const fields = this.docs.get(path);

    if (!fields) {
      return this.json(
        { error: { code: 404, status: "NOT_FOUND", message: "missing document" } },
        404,
      );
    }

    return this.json({
      name: `${DOCUMENTS_BASE}/${path}`,
      fields: encodeFirestoreFields(fields),
      createTime: String(fields.created ?? this.nextTimestamp()),
      updateTime: String(fields.updated ?? this.nextTimestamp()),
    });
  }

  private matches(collectionPath: string, filters: Array<Record<string, unknown>>) {
    return [...this.docs.entries()].filter(([path, fields]) => {
      if (!path.startsWith(`${collectionPath}/`)) {
        return false;
      }

      return filters.every((filter) => {
        const field = ((filter.field as { fieldPath?: string } | undefined)?.fieldPath ??
          "") as string;
        return fields[field] === decodeFirestoreValue(filter.value as never);
      });
    });
  }

  private applyTransforms(
    fields: Record<string, unknown>,
    transforms: WriteBody["updateTransforms"],
  ) {
    for (const transform of transforms ?? []) {
      if (transform.increment) {
        const delta = transform.increment.integerValue
          ? Number.parseInt(transform.increment.integerValue, 10)
          : (transform.increment.doubleValue ?? 0);
        fields[transform.fieldPath] = ((fields[transform.fieldPath] as number) ?? 0) + delta;
      }

      if (transform.setToServerTimestamp !== undefined) {
        fields[transform.fieldPath] = this.nextTimestamp();
      }
    }
  }

  private async handle(url: string, init: RequestInit): Promise<Response> {
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};

    if (url === `${DOCUMENTS_BASE}:batchGet`) {
      const names = (body.documents ?? []) as string[];

      return this.json(
        names.map((name) => {
          const path = pathFromName(name);
          const fields = this.docs.get(path);

          return fields
            ? {
                found: {
                  name,
                  fields: encodeFirestoreFields(fields),
                  createTime: fields.created,
                  updateTime: fields.updated,
                },
              }
            : { missing: name };
        }),
      );
    }

    if (url === `${DOCUMENTS_BASE}:runQuery`) {
      const query = body.structuredQuery ?? {};
      const collectionId = (query.from?.[0]?.collectionId ?? "") as string;
      const filters = (query.where?.compositeFilter?.filters ?? []) as Array<{
        fieldFilter: Record<string, unknown>;
      }>;

      return this.json(
        this.matches(
          collectionId,
          filters.map((filter) => filter.fieldFilter),
        ).map(([path, fields]) => ({
          document: {
            name: `${DOCUMENTS_BASE}/${path}`,
            fields: encodeFirestoreFields(fields),
            createTime: fields.created,
            updateTime: fields.updated,
          },
        })),
      );
    }

    if (url === `${DOCUMENTS_BASE}:commit`) {
      const writes = (body.writes ?? []) as WriteBody[];

      for (const write of writes) {
        if (write.update && write.currentDocument?.exists === false) {
          const path = pathFromName(write.update.name);

          if (this.docs.has(path)) {
            return this.json(
              { error: { code: 409, status: "ALREADY_EXISTS", message: "exists" } },
              409,
            );
          }
        }
      }

      const nextDocs = new Map(
        [...this.docs.entries()].map(([path, fields]) => [path, { ...fields }]),
      );

      for (const write of writes) {
        if (write.delete) {
          nextDocs.delete(pathFromName(write.delete));
          continue;
        }

        if (write.transform) {
          const path = pathFromName(write.transform.document);
          const fields = nextDocs.get(path) ?? {};
          this.applyTransforms(fields, write.transform.fieldTransforms);
          nextDocs.set(path, fields);
          continue;
        }

        if (write.update) {
          const path = pathFromName(write.update.name);
          const patch = decodeFirestoreFields(
            (write.update.fields ?? {}) as Record<string, FirestoreValue>,
          );
          const existing = nextDocs.get(path);

          if (write.currentDocument?.exists === false || !existing) {
            const created = this.nextTimestamp();
            nextDocs.set(path, { created, updated: created, ...patch });
          } else {
            const masked = write.updateMask?.fieldPaths;

            if (masked) {
              for (const field of masked) {
                if (field in patch) {
                  existing[field] = patch[field];
                }
              }
            } else {
              Object.assign(existing, patch);
            }
          }

          const fields = nextDocs.get(path);

          if (fields) {
            this.applyTransforms(fields, write.updateTransforms);
          }
        }
      }

      this.docs = nextDocs;
      return this.json({ writeResults: writes.map(() => ({ updateTime: this.nextTimestamp() })) });
    }

    const path = pathFromName(url);
    return this.docResponse(path);
  }
}

function session(): AuthSession {
  return {
    provider: "firebase",
    accessToken: "token-1",
    refreshToken: "refresh-1",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: { id: USER_ID, email: "alice@example.com" },
  };
}

function taskFields(overrides: Record<string, unknown> = {}) {
  return {
    moodle_domain: "school.example",
    course_id: 12,
    quiz_id: 34,
    question_id: "q1",
    question_hash: "h1",
    question_type: "multichoice",
    question_text: "Capital of France?",
    answer_options: JSON.stringify(["Paris", "Lyon"]),
    slot_key: "question",
    slot_index: 1,
    answer_key: "paris",
    answer_label: "Paris",
    correct_count: 0,
    selected_correct_count: 0,
    selected_incorrect_count: 0,
    selected_unknown_count: 0,
    votes_up: 0,
    votes_down: 0,
    first_contributor_username: "alice",
    last_contributor_username: "alice",
    ...overrides,
  };
}

function reviewPayload(): SaveReduxShareReviewPayload {
  return {
    domain: "school.example",
    courseId: 12,
    quizId: 34,
    attemptKey: "attempt:1|cmid:34",
    pageUrl: "https://school.example/mod/quiz/review.php?attempt=1&cmid=34",
    questions: [
      {
        questionId: "q1",
        questionType: "multichoice",
        questionHash: "h1",
        questionText: "  Capital of France?  ",
        answerOptions: ["Paris", "Lyon"],
        answers: [
          {
            label: "Paris",
            answerKey: "paris",
            slotKey: "question",
            slotIndex: 1,
            correctness: 2,
            isCorrect: true,
            wasSelected: true,
          },
          {
            label: "Lyon",
            answerKey: "lyon",
            slotKey: "question",
            slotIndex: 1,
            correctness: 0,
            isCorrect: false,
            wasSelected: true,
          },
        ],
      },
    ],
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
    moodle_domain: "",
    solved_tests_count: 0,
    solved_tasks_count: 0,
    imported_questions_count: 0,
    attempt_correct_count: 0,
    attempt_incorrect_count: 0,
  });
  fake.install();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("firebase fetchReduxShareTasks", () => {
  it("aggregates suggestions, submissions, votes and contributors", async () => {
    fake.seed(
      "tasks/t1",
      taskFields({
        correct_count: 3,
        selected_correct_count: 1,
        votes_up: 5,
        votes_down: 1,
        first_contributor_username: "alice",
        last_contributor_username: "bob",
      }),
    );
    fake.seed(
      "tasks/t2",
      taskFields({
        answer_key: "lyon",
        answer_label: "Lyon",
        selected_incorrect_count: 2,
        selected_unknown_count: 1,
      }),
    );
    fake.seed(`taskVotes/${taskVoteDocumentId("t1", USER_ID)}`, {
      task_id: "t1",
      user: USER_ID,
      value: 1,
    });

    const result = await fetchReduxShareTasks(session(), {
      domain: "school.example",
      courseId: 12,
      quizId: 34,
      questions: [{ questionId: "q1", questionType: "multichoice", questionHash: "h1" }],
    });

    expect(result.results).toHaveLength(1);
    const question = result.results[0];

    expect(question.ok).toBe(true);
    expect(question.questionHash).toBe("h1");
    expect(question.answerCount).toBe(2);
    expect(question.data).toEqual([
      {
        anchor: { index: 1, label: "question" },
        suggestions: [
          {
            correctness: 2,
            confidence: 1,
            label: "Paris",
            contributor: "bob",
            addedAt: expect.any(String),
            updatedAt: expect.any(String),
            taskId: "t1",
            votesUp: 5,
            votesDown: 1,
            myVote: 1,
          },
        ],
        submissions: [
          {
            correctness: 2,
            count: 4,
            label: "Paris",
            contributor: "bob",
            addedAt: expect.any(String),
            updatedAt: expect.any(String),
            taskId: "t1",
            votesUp: 5,
            votesDown: 1,
            myVote: 1,
          },
          {
            correctness: 0,
            count: 3,
            label: "Lyon",
            contributor: "alice",
            addedAt: expect.any(String),
            updatedAt: expect.any(String),
            taskId: "t2",
            votesUp: 0,
            votesDown: 0,
            myVote: 0,
          },
        ],
      },
    ]);
  });

  it("downgrades boolean suggestions on a hash mismatch", async () => {
    fake.seed(
      "tasks/boolean-true",
      taskFields({
        question_hash: "other",
        question_type: "truefalse",
        answer_key: "true",
        answer_label: "True",
        correct_count: 2,
      }),
    );
    fake.seed(
      "tasks/boolean-false",
      taskFields({
        question_hash: "other",
        question_type: "truefalse",
        answer_key: "false",
        answer_label: "False",
        correct_count: 1,
      }),
    );

    const result = await fetchReduxShareTasks(session(), {
      domain: "school.example",
      courseId: 12,
      quizId: 34,
      questions: [{ questionId: "q1", questionType: "truefalse", questionHash: "h1" }],
    });
    const data = result.results[0].data as Array<{
      suggestions: unknown[];
      submissions: Array<{ label: string; correctness: number; count: number }>;
    }>;

    expect(result.results[0].questionHash).toBe("other");
    expect(
      shouldDowngradeMismatchedHashData([{ suggestions: [{ label: "True" }, { label: "False" }] }]),
    ).toBe(true);
    expect(data[0].suggestions).toEqual([]);
    expect(data[0].submissions).toEqual([
      {
        correctness: 2,
        count: 2,
        label: "True",
        contributor: "alice",
        addedAt: expect.any(String),
        updatedAt: expect.any(String),
        taskId: "boolean-true",
        votesUp: 0,
        votesDown: 0,
        myVote: 0,
      },
      {
        correctness: 2,
        count: 1,
        label: "False",
        contributor: "alice",
        addedAt: expect.any(String),
        updatedAt: expect.any(String),
        taskId: "boolean-false",
        votesUp: 0,
        votesDown: 0,
        myVote: 0,
      },
    ]);
  });

  it("reports missing Moodle ids without touching the network", async () => {
    const fetchMock = fake.install();

    const result = await fetchReduxShareTasks(session(), {
      domain: "school.example",
      courseId: null,
      quizId: null,
      questions: [{ questionId: "q1", questionType: null, questionHash: null }],
    });

    expect(result.results[0]).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("firebase voteTaskAnswer", () => {
  it("creates, toggles and switches votes while updating counters", async () => {
    fake.seed("tasks/task-1", taskFields());

    const created = await voteTaskAnswer(session(), { taskId: "task-1", value: 1 });

    expect(created).toMatchObject({ votesUp: 1, votesDown: 0, myVote: 1 });
    expect(fake.read(`taskVotes/${taskVoteDocumentId("task-1", USER_ID)}`)).toMatchObject({
      task_id: "task-1",
      user: USER_ID,
      value: 1,
    });

    const toggled = await voteTaskAnswer(session(), { taskId: "task-1", value: 1 });

    expect(toggled).toMatchObject({ votesUp: 0, votesDown: 0, myVote: 0 });
    expect(fake.read(`taskVotes/${taskVoteDocumentId("task-1", USER_ID)}`)).toBeNull();

    await voteTaskAnswer(session(), { taskId: "task-1", value: 1 });
    const switched = await voteTaskAnswer(session(), { taskId: "task-1", value: -1 });

    expect(switched).toMatchObject({ votesUp: 0, votesDown: 1, myVote: -1 });
    expect(fake.read(`taskVotes/${taskVoteDocumentId("task-1", USER_ID)}`)).toMatchObject({
      value: -1,
    });
    expect(fake.read("tasks/task-1")).toMatchObject({ votes_up: 0, votes_down: 1 });
  });

  it("rejects verified and missing task rows", async () => {
    fake.seed("tasks/verified", taskFields({ correct_count: 1 }));

    await expect(voteTaskAnswer(session(), { taskId: "verified", value: 1 })).rejects.toMatchObject(
      { i18nKey: "errors.voteUnverifiableOnly" },
    );
    await expect(voteTaskAnswer(session(), { taskId: "missing", value: 1 })).rejects.toMatchObject({
      i18nKey: "errors.voteTaskMissing",
    });
  });

  it("clamps negative counters after a toggle", async () => {
    fake.seed("tasks/task-1", taskFields({ votes_up: -3 }));
    fake.seed(`taskVotes/${taskVoteDocumentId("task-1", USER_ID)}`, {
      task_id: "task-1",
      user: USER_ID,
      value: 1,
    });

    const result = await voteTaskAnswer(session(), { taskId: "task-1", value: 1 });

    expect(result).toMatchObject({ votesUp: 0, votesDown: 0, myVote: 0 });
    expect(fake.read("tasks/task-1")).toMatchObject({ votes_up: 0, votes_down: 0 });
  });
});

describe("firebase saveReduxShareReviewAnswers", () => {
  it("creates task rows, the review import and user stats", async () => {
    const payload = reviewPayload();
    const result = await saveReduxShareReviewAnswers(session(), payload);

    expect(result).toMatchObject({ imported: true, savedCount: 2 });

    const paris = fake.read(
      `tasks/${taskDocumentId({
        moodleDomain: "school.example",
        courseId: 12,
        quizId: 34,
        questionId: "q1",
        questionHash: "h1",
        slotKey: "question",
        answerKey: "paris",
      })}`,
    );
    const lyon = fake.read(
      `tasks/${taskDocumentId({
        moodleDomain: "school.example",
        courseId: 12,
        quizId: 34,
        questionId: "q1",
        questionHash: "h1",
        slotKey: "question",
        answerKey: "lyon",
      })}`,
    );

    expect(paris).toMatchObject({
      answer_label: "Paris",
      correct_count: 1,
      selected_correct_count: 1,
      selected_incorrect_count: 0,
      selected_unknown_count: 0,
      first_contributor: USER_ID,
      first_contributor_username: "alice",
      last_contributor: USER_ID,
      last_contributor_username: "alice",
    });
    expect(lyon).toMatchObject({
      correct_count: 0,
      selected_correct_count: 0,
      selected_incorrect_count: 1,
    });

    const normalizedQuestion = normalizeReviewQuestions(payload.questions)[0];
    const importDocument = fake.read(
      `reviewImports/${reviewImportDocumentId(USER_ID, "school.example", "attempt:1|cmid:34")}`,
    );

    expect(importDocument).toMatchObject({
      user: USER_ID,
      moodle_domain: "school.example",
      attempt_key: "attempt:1|cmid:34",
      course_id: 12,
      quiz_id: 34,
      page_url: payload.pageUrl,
      imported_question_count: 1,
      imported_question_hashes: {
        "q1\nh1": getReviewQuestionContentHash(normalizedQuestion),
      },
    });
    expect(fake.read(`users/${USER_ID}`)).toMatchObject({
      moodle_domain: "school.example",
      imported_questions_count: 1,
      attempt_correct_count: 0,
      attempt_incorrect_count: 1,
    });
  });

  it("skips unchanged questions on a repeated import", async () => {
    const payload = reviewPayload();

    await saveReduxShareReviewAnswers(session(), payload);
    const second = await saveReduxShareReviewAnswers(session(), payload);

    expect(second).toMatchObject({ imported: false, savedCount: 0 });
    const parisPath = `tasks/${taskDocumentId({
      moodleDomain: "school.example",
      courseId: 12,
      quizId: 34,
      questionId: "q1",
      questionHash: "h1",
      slotKey: "question",
      answerKey: "paris",
    })}`;

    expect(fake.read(parisPath)).toMatchObject({ correct_count: 1, selected_correct_count: 1 });
    expect(fake.read(`users/${USER_ID}`)).toMatchObject({ imported_questions_count: 1 });
  });

  it("recounts changed question content", async () => {
    const payload = reviewPayload();

    await saveReduxShareReviewAnswers(session(), payload);

    const changed = reviewPayload();
    changed.questions[0].answers[1].correctness = 1;
    changed.questions[0].answers[1].isCorrect = false;

    const result = await saveReduxShareReviewAnswers(session(), changed);

    expect(result.savedCount).toBe(2);
    const lyonPath = `tasks/${taskDocumentId({
      moodleDomain: "school.example",
      courseId: 12,
      quizId: 34,
      questionId: "q1",
      questionHash: "h1",
      slotKey: "question",
      answerKey: "lyon",
    })}`;

    expect(fake.read(lyonPath)).toMatchObject({
      selected_incorrect_count: 1,
      selected_unknown_count: 1,
    });
    expect(fake.read(`users/${USER_ID}`)).toMatchObject({
      imported_questions_count: 2,
      attempt_correct_count: 1,
      attempt_incorrect_count: 1,
    });
  });

  it("applies pre-counted selection transitions instead of double counting", async () => {
    const parisPath = `tasks/${taskDocumentId({
      moodleDomain: "school.example",
      courseId: 12,
      quizId: 34,
      questionId: "q1",
      questionHash: "h1",
      slotKey: "question",
      answerKey: "paris",
    })}`;
    fake.seed(parisPath, taskFields({ selected_unknown_count: 1 }));

    const payload = reviewPayload();
    payload.questions[0].answers = [payload.questions[0].answers[0]];
    payload.questions[0].preCountedAnswers = [
      { answerKey: "paris", slotKey: "question", verdict: "unknown" },
    ];

    await saveReduxShareReviewAnswers(session(), payload);

    expect(fake.read(parisPath)).toMatchObject({
      correct_count: 1,
      selected_correct_count: 1,
      selected_unknown_count: 0,
    });
  });

  it("releases stale pre-counted selections", async () => {
    const parisPath = `tasks/${taskDocumentId({
      moodleDomain: "school.example",
      courseId: 12,
      quizId: 34,
      questionId: "q1",
      questionHash: "h1",
      slotKey: "question",
      answerKey: "paris",
    })}`;
    fake.seed(parisPath, taskFields({ selected_unknown_count: 1 }));

    const payload = reviewPayload();
    payload.questions[0].answers = [
      {
        label: "Lyon",
        answerKey: "lyon",
        slotKey: "question",
        slotIndex: 1,
        correctness: 2,
        isCorrect: true,
        wasSelected: false,
      },
    ];
    payload.questions[0].preCountedAnswers = [
      { answerKey: "paris", slotKey: "question", verdict: "unknown" },
    ];

    const result = await saveReduxShareReviewAnswers(session(), payload);

    expect(result.savedCount).toBe(2);
    expect(fake.read(parisPath)).toMatchObject({ selected_unknown_count: 0 });
  });

  it("fails when the user profile is missing", async () => {
    fake.docs.delete(`users/${USER_ID}`);

    await expect(saveReduxShareReviewAnswers(session(), reviewPayload())).rejects.toMatchObject({
      i18nKey: "errors.sessionExpired",
    });
  });
});

describe("firebase saveUserAnswerSelection", () => {
  it("creates and then increments selection counters", async () => {
    const payload = {
      domain: "school.example",
      courseId: 12,
      quizId: 34,
      attemptKey: "attempt:1|cmid:34",
      pageUrl: "https://school.example/mod/quiz/attempt.php?attempt=1",
      question: {
        questionId: "q1",
        questionType: "multichoice",
        questionHash: "h1",
        questionText: "Capital of France?",
        answerOptions: ["Paris", "Lyon"],
        answers: [
          {
            label: "Paris",
            answerKey: "paris",
            slotKey: "question",
            slotIndex: 1,
            verdict: "unknown" as const,
          },
        ],
      },
    };

    const first = await saveUserAnswerSelection(session(), payload);

    expect(first.savedCount).toBe(1);

    const path = `tasks/${taskDocumentId({
      moodleDomain: "school.example",
      courseId: 12,
      quizId: 34,
      questionId: "q1",
      questionHash: "h1",
      slotKey: "question",
      answerKey: "paris",
    })}`;

    expect(fake.read(path)).toMatchObject({
      selected_unknown_count: 1,
      correct_count: 0,
      first_contributor_username: "alice",
    });

    const second = await saveUserAnswerSelection(session(), payload);

    expect(second.savedCount).toBe(1);
    expect(fake.read(path)).toMatchObject({ selected_unknown_count: 2 });
  });

  it("returns zero when Moodle ids are missing", async () => {
    const fetchMock = fake.install();
    const result = await saveUserAnswerSelection(session(), {
      domain: "school.example",
      courseId: null,
      quizId: null,
      attemptKey: "attempt:1",
      pageUrl: "",
      question: {
        questionId: "q1",
        questionType: null,
        questionHash: "h1",
        answers: [],
      },
    });

    expect(result.savedCount).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("firebase fetchReduxShareQuizPreviewTasks", () => {
  it("groups answer rows into preview results ordered by newest update", async () => {
    fake.seed("tasks/q1-paris", taskFields());
    fake.seed(
      "tasks/q2-true",
      taskFields({
        question_id: "q2",
        question_hash: "h2",
        question_type: "truefalse",
        question_text: "The sky is blue.",
        answer_options: "",
        slot_key: "question",
        answer_key: "true",
        answer_label: "True",
        correct_count: 2,
      }),
    );

    const result = await fetchReduxShareQuizPreviewTasks(session(), {
      domain: "school.example",
      courseId: 12,
      quizId: 34,
    });

    expect(result.results.map((entry) => entry.questionId)).toEqual(["q2", "q1"]);
    expect(result.results[0]).toMatchObject({
      questionType: "truefalse",
      questionText: "The sky is blue.",
      answerOptions: [],
    });
    expect(result.results[1]).toMatchObject({
      questionType: "multichoice",
      questionText: "Capital of France?",
      answerOptions: ["Paris", "Lyon"],
    });
  });
});
