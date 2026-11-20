import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStructuredQuery,
  createDocumentWrite,
  createFirestoreClient,
  decodeFirestoreDocument,
  decodeFirestoreValue,
  deleteDocumentWrite,
  documentName,
  encodeFirestoreFields,
  encodeFirestoreValue,
  incrementDocumentWrite,
  normalizeFirestoreTimestamp,
  updateDocumentWrite,
} from "../src/lib/providers/firebase/firestore";
import {
  essayExampleDocumentId,
  reviewImportDocumentId,
  taskDocumentId,
  taskVoteDocumentId,
  usernameDocumentId,
} from "../src/lib/providers/firebase/ids";
import { mapTaskDocument } from "../src/lib/providers/firebase/mappers";
import {
  FirebaseApiError,
  isFirebasePreconditionError,
  isFirebaseUnauthenticatedError,
} from "../src/lib/providers/firebase/http";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchOnce(body: unknown, status = 200) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const TASK_DOCUMENT = {
  name: "projects/demo/databases/(default)/documents/tasks/task-1",
  fields: {
    moodle_domain: { stringValue: "school.example" },
    course_id: { integerValue: "12" },
    quiz_id: { integerValue: "34" },
    question_id: { stringValue: "q1" },
    question_hash: { stringValue: "hash1" },
    question_type: { stringValue: "multichoice" },
    answer_options: { stringValue: '["Alpha","Beta"]' },
    slot_key: { stringValue: "question" },
    slot_index: { integerValue: "1" },
    answer_key: { stringValue: "alpha" },
    answer_label: { stringValue: "Alpha" },
    correct_count: { integerValue: "2" },
    selected_correct_count: { integerValue: "1" },
    selected_incorrect_count: { integerValue: "0" },
    selected_unknown_count: { integerValue: "3" },
    votes_up: { integerValue: "4" },
    votes_down: { integerValue: "1" },
    first_contributor_username: { stringValue: "alice" },
    last_contributor_username: { stringValue: "bob" },
    created: { timestampValue: "2026-11-20T10:00:00.123456Z" },
    updated: { timestampValue: "2026-11-20T11:00:00Z" },
  },
};

describe("firestore value codec", () => {
  it("encodes scalar, array and map values", () => {
    expect(encodeFirestoreValue(12)).toEqual({ integerValue: "12" });
    expect(encodeFirestoreValue(1.5)).toEqual({ doubleValue: 1.5 });
    expect(encodeFirestoreValue("text")).toEqual({ stringValue: "text" });
    expect(encodeFirestoreValue(false)).toEqual({ booleanValue: false });
    expect(encodeFirestoreValue(null)).toEqual({ nullValue: null });
    expect(encodeFirestoreValue(["a", "b"])).toEqual({
      arrayValue: { values: [{ stringValue: "a" }, { stringValue: "b" }] },
    });
    expect(encodeFirestoreValue({ key: "value" })).toEqual({
      mapValue: { fields: { key: { stringValue: "value" } } },
    });
  });

  it("skips undefined fields", () => {
    expect(encodeFirestoreFields({ answer_label: "Alpha", question_text: undefined })).toEqual({
      answer_label: { stringValue: "Alpha" },
    });
  });

  it("decodes values and normalizes timestamps to milliseconds", () => {
    expect(decodeFirestoreValue({ integerValue: "7" })).toBe(7);
    expect(decodeFirestoreValue({ arrayValue: { values: [{ stringValue: "x" }] } })).toEqual(["x"]);
    expect(decodeFirestoreValue({ mapValue: { fields: { a: { stringValue: "b" } } } })).toEqual({
      a: "b",
    });
    expect(normalizeFirestoreTimestamp("2026-11-20T10:00:00.123456789Z")).toBe(
      "2026-11-20T10:00:00.123Z",
    );
    expect(normalizeFirestoreTimestamp("2026-11-20T10:00:00Z")).toBe("2026-11-20T10:00:00.000Z");
  });

  it("decodes a document with its id", () => {
    const document = decodeFirestoreDocument(TASK_DOCUMENT);

    expect(document.id).toBe("task-1");
    expect(document.fields.course_id).toBe(12);
    expect(document.fields.answer_options).toBe('["Alpha","Beta"]');
    expect(document.fields.updated).toBe("2026-11-20T11:00:00.000Z");
  });
});

describe("firestore query and write builders", () => {
  it("builds an AND query with filters, order and limit", () => {
    expect(
      buildStructuredQuery("tasks", {
        filters: [
          { field: "moodle_domain", value: "school.example" },
          { field: "course_id", value: 12 },
        ],
        orderBy: [{ field: "updated", direction: "DESCENDING" }],
        limit: 25,
      }),
    ).toEqual({
      from: [{ collectionId: "tasks" }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "moodle_domain" },
                op: "EQUAL",
                value: { stringValue: "school.example" },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: "course_id" },
                op: "EQUAL",
                value: { integerValue: "12" },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: "updated" }, direction: "DESCENDING" }],
      limit: 25,
    });
  });

  it("builds create, update, increment and delete writes", () => {
    const create = createDocumentWrite("demo", "tasks/task-1", {
      answer_label: "Alpha",
      created: "ignored",
    });

    expect(create).toEqual({
      update: {
        name: documentName("demo", "tasks/task-1"),
        fields: { answer_label: { stringValue: "Alpha" } },
      },
      currentDocument: { exists: false },
      updateTransforms: [
        { fieldPath: "created", setToServerTimestamp: {} },
        { fieldPath: "updated", setToServerTimestamp: {} },
      ],
    });

    expect(
      updateDocumentWrite("demo", "tasks/task-1", {
        answer_label: "Beta",
        last_contributor_username: "bob",
      }),
    ).toEqual({
      update: {
        name: documentName("demo", "tasks/task-1"),
        fields: {
          answer_label: { stringValue: "Beta" },
          last_contributor_username: { stringValue: "bob" },
        },
      },
      updateMask: { fieldPaths: ["answer_label", "last_contributor_username"] },
      updateTransforms: [{ fieldPath: "updated", setToServerTimestamp: {} }],
    });

    expect(
      incrementDocumentWrite("demo", "tasks/task-1", {
        correct_count: 1,
        selected_incorrect_count: 0,
        votes_down: -1,
      }),
    ).toEqual({
      transform: {
        document: documentName("demo", "tasks/task-1"),
        fieldTransforms: [
          { fieldPath: "correct_count", increment: { integerValue: "1" } },
          { fieldPath: "votes_down", increment: { integerValue: "-1" } },
          { fieldPath: "updated", setToServerTimestamp: {} },
        ],
      },
    });

    expect(deleteDocumentWrite("demo", "taskVotes/vote-1")).toEqual({
      delete: documentName("demo", "taskVotes/vote-1"),
    });
  });
});

describe("firestore client", () => {
  const client = createFirestoreClient({ projectId: "demo", accessToken: "token-1" });
  const documentsUrl =
    "https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents";

  it("reads a document and maps not-found to null", async () => {
    const fetchMock = stubFetchOnce(TASK_DOCUMENT);
    const document = await client.getDocument("tasks/task-1");

    expect(document?.id).toBe("task-1");
    expect(fetchMock).toHaveBeenCalledWith(
      `${documentsUrl}/tasks/task-1`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer token-1" }),
      }),
    );

    stubFetchOnce({ error: { code: 404, status: "NOT_FOUND", message: "not found" } }, 404);
    await expect(client.getDocument("tasks/missing")).resolves.toBeNull();
  });

  it("batch-gets documents by name in request order", async () => {
    stubFetchOnce([
      {
        found: {
          name: `${documentsUrl}/taskVotes/vote-b`,
          fields: { value: { integerValue: "-1" } },
        },
      },
      { missing: `${documentsUrl}/taskVotes/missing` },
      {
        found: {
          name: `${documentsUrl}/taskVotes/vote-a`,
          fields: { value: { integerValue: "1" } },
        },
      },
    ]);
    const results = await client.batchGet([
      "taskVotes/vote-a",
      "taskVotes/missing",
      "taskVotes/vote-b",
    ]);

    expect(results.map((result) => result?.id ?? null)).toEqual(["vote-a", null, "vote-b"]);
    expect(results[0]?.fields.value).toBe(1);
    expect(results[2]?.fields.value).toBe(-1);
  });

  it("runs a structured query and skips entries without a document", async () => {
    const fetchMock = stubFetchOnce([{ document: TASK_DOCUMENT }, { readTime: "now" }]);
    const documents = await client.runQuery("tasks", {
      filters: [{ field: "quiz_id", value: 34 }],
    });

    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe("task-1");

    const requestBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(requestBody.structuredQuery.from).toEqual([{ collectionId: "tasks" }]);
  });

  it("reads aggregation counts", async () => {
    const fetchMock = stubFetchOnce([
      { result: { aggregateFields: { total: { integerValue: "7" } } } },
    ]);

    await expect(client.runCount("tasks")).resolves.toBe(7);
    expect((fetchMock.mock.calls[0][0] as string).endsWith(":runAggregationQuery")).toBe(true);
  });

  it("commits writes", async () => {
    const fetchMock = stubFetchOnce({ writeResults: [{ updateTime: "now" }] });
    const write = deleteDocumentWrite("demo", "tasks/task-1");

    await client.commit([write]);

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      writes: [write],
    });
  });
});

describe("firebase error classification", () => {
  it("recognizes unauthenticated and precondition errors", () => {
    expect(isFirebaseUnauthenticatedError(new FirebaseApiError({ status: 401 }))).toBe(true);
    expect(isFirebaseUnauthenticatedError(new FirebaseApiError({ status: 403 }))).toBe(false);
    expect(
      isFirebasePreconditionError(new FirebaseApiError({ status: 409, code: "ALREADY_EXISTS" })),
    ).toBe(true);
    expect(isFirebasePreconditionError(new FirebaseApiError({ status: 400 }))).toBe(false);
  });
});

describe("firebase document ids", () => {
  const baseTask = {
    moodleDomain: "school.example",
    courseId: 12,
    quizId: 34,
    questionId: "q1",
    questionHash: "hash1",
    slotKey: "question",
    answerKey: "alpha",
  };

  it("builds stable task ids from the full identity", () => {
    const first = taskDocumentId(baseTask);

    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(taskDocumentId(baseTask)).toBe(first);
    expect(taskDocumentId({ ...baseTask, answerKey: "beta" })).not.toBe(first);
    expect(taskDocumentId({ ...baseTask, slotKey: "slot-2" })).not.toBe(first);
  });

  it("builds user-scoped ids for imports, votes and examples", () => {
    expect(taskVoteDocumentId("task-1", "uid-1")).toBe("task-1__uid-1");

    const reviewImport = reviewImportDocumentId("uid-1", "school.example", "attempt:1|cmid:2");

    expect(reviewImport).toMatch(/^uid-1__[0-9a-f]{16}$/);
    expect(reviewImportDocumentId("uid-1", "school.example", "attempt:1|cmid:2")).toBe(
      reviewImport,
    );
    expect(reviewImportDocumentId("uid-1", "school.example", "attempt:3|cmid:2")).not.toBe(
      reviewImport,
    );

    const firstExample = essayExampleDocumentId({
      userId: "uid-1",
      moodleDomain: "school.example",
      courseId: 12,
      quizId: 34,
      questionId: "q1",
      questionHash: "hash1",
    });

    expect(firstExample.startsWith("uid-1__")).toBe(true);
    expect(
      essayExampleDocumentId({
        userId: "uid-1",
        moodleDomain: "school.example",
        courseId: 12,
        quizId: 34,
        questionId: "q1",
        questionHash: "hash2",
      }),
    ).not.toBe(firstExample);
    expect(usernameDocumentId(" Alice ")).toBe(usernameDocumentId("alice"));
    expect(usernameDocumentId("alice")).not.toBe(usernameDocumentId("bob"));
  });
});

describe("firebase document mappers", () => {
  it("maps task documents into the shared task record shape", () => {
    const task = mapTaskDocument(decodeFirestoreDocument(TASK_DOCUMENT));

    expect(task.id).toBe("task-1");
    expect(task.course_id).toBe(12);
    expect(task.quiz_id).toBe(34);
    expect(task.question_text).toBeNull();
    expect(task.answer_options).toBe('["Alpha","Beta"]');
    expect(task.correct_count).toBe(2);
    expect(task.selected_unknown_count).toBe(3);
    expect(task.created).toBe("2026-11-20T10:00:00.123Z");
    expect(task.updated).toBe("2026-11-20T11:00:00.000Z");
    expect(task.expand?.first_contributor?.username).toBe("alice");
    expect(task.expand?.last_contributor?.username).toBe("bob");
  });
});
