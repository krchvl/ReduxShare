import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_STORAGE_KEY, PENDING_REVIEW_SAVES_STORAGE_KEY } from "../src/shared/storageKeys";
import { DEFAULT_UPDATE_STATE } from "../src/types";
import type { AuthSession } from "../src/types";
import { SAVE_REVIEW_ANSWERS_MESSAGE } from "../src/shared/messages";
import { loadPendingReviewSaves } from "../src/background/reviewSaveQueue";
import type { SaveReduxShareReviewPayload } from "../src/lib/quizTasks";

const saveReviewAnswersMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/quizTasks", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, saveReduxShareReviewAnswers: saveReviewAnswersMock };
});

const authSession: AuthSession = {
  accessToken: "token-1",
  refreshToken: "refresh-1",
  expiresAt: null,
  user: { id: "user-1", email: "user@example.com" },
};

const payload: SaveReduxShareReviewPayload = {
  domain: "moodle.example",
  courseId: 2,
  quizId: 5,
  attemptKey: "attempt-1",
  pageUrl: "https://moodle.example/mod/quiz/review.php",
  questions: [
    {
      questionId: "3699",
      questionType: "truefalse",
      questionHash: "abc",
      questionText: "Условие",
      answers: [
        {
          label: "Верно",
          answerKey: "верно",
          slotKey: "question",
          slotIndex: null,
          correctness: 2,
          isCorrect: true,
          wasSelected: true,
        },
      ],
    },
  ],
};

function flushMicrotasks(hops: number) {
  return new Promise<void>((resolve) => {
    for (let index = 0; index < hops; index += 1) {
      queueMicrotask(() => {});
    }

    setTimeout(resolve, 0);
  });
}

describe("review save retry queueing", () => {
  beforeEach(async () => {
    vi.resetModules();
    saveReviewAnswersMock.mockReset();
    await chrome.storage.local.remove([PENDING_REVIEW_SAVES_STORAGE_KEY]);
    await chrome.storage.local.set({
      [APP_STORAGE_KEY]: {
        authSession,
        updateState: { ...DEFAULT_UPDATE_STATE, nextCheckAt: "9999-01-01T00:00:00.000Z" },
      },
    });
  });

  it("queues the payload and reports queued when the database save fails", async () => {
    saveReviewAnswersMock.mockRejectedValue(new Error("network down"));

    const addListener = vi.mocked(chrome.runtime.onMessage.addListener);
    await import("../src/background/external");
    const listener = addListener.mock.calls.at(-1)![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => boolean | void;

    let response: { ok: boolean; queued?: boolean } | undefined;
    listener({ type: SAVE_REVIEW_ANSWERS_MESSAGE, payload }, {}, (value) => {
      response = value as typeof response;
    });

    await flushMicrotasks(30);

    expect(response).toMatchObject({ ok: true, queued: true });

    const queue = await loadPendingReviewSaves();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload.attemptKey).toBe("attempt-1");
    expect(queue[0].payload.questions).toHaveLength(1);
  });

  it("keeps returning a plain save result when the database save succeeds", async () => {
    saveReviewAnswersMock.mockResolvedValue({ authSession, imported: true, savedCount: 1 });

    const addListener = vi.mocked(chrome.runtime.onMessage.addListener);
    await import("../src/background/external");
    const listener = addListener.mock.calls.at(-1)![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void,
    ) => boolean | void;

    let response: { ok: boolean; queued?: boolean; savedCount?: number } | undefined;
    listener({ type: SAVE_REVIEW_ANSWERS_MESSAGE, payload }, {}, (value) => {
      response = value as typeof response;
    });

    await flushMicrotasks(30);

    expect(response).toMatchObject({ ok: true, imported: true, savedCount: 1 });
    expect(response!.queued).toBeUndefined();
    expect(await loadPendingReviewSaves()).toHaveLength(0);
  });
});
