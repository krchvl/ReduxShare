import { beforeEach, describe, expect, it, vi } from "vitest";

const quizTasksMocks = vi.hoisted(() => ({
  saveReviewAnswers: vi.fn(),
  saveUserAnswerSelection: vi.fn(),
}));

vi.mock("../src/lib/quizTasks", () => ({
  saveReduxShareReviewAnswers: quizTasksMocks.saveReviewAnswers,
  saveUserAnswerSelection: quizTasksMocks.saveUserAnswerSelection,
}));

import {
  MAX_PENDING_REVIEW_SAVES,
  flushPendingReviewSaves,
  loadPendingReviewSaves,
  queuePendingReviewSave,
  queuePendingSelectionSave,
  resetPendingSaveFlushStateForTests,
  type PendingSaveFlushDeps,
} from "../src/background/reviewSaveQueue";
import type { SaveReduxShareReviewPayload, SaveUserAnswerPayload } from "../src/lib/quizTasks";
import { PENDING_REVIEW_SAVES_STORAGE_KEY } from "../src/shared/storageKeys";
import type { AuthSession } from "../src/types";

function makeReviewPayload(
  overrides: Partial<SaveReduxShareReviewPayload> = {},
): SaveReduxShareReviewPayload {
  return {
    domain: "moodle.example",
    courseId: 2,
    quizId: 5,
    attemptKey: "attempt-1",
    pageUrl: "https://moodle.example/review.php",
    questions: [],
    ...overrides,
  } as SaveReduxShareReviewPayload;
}

function makeSelectionPayload(
  questionId: string,
  overrides: Partial<SaveUserAnswerPayload> = {},
): SaveUserAnswerPayload {
  return {
    domain: "moodle.example",
    courseId: 2,
    quizId: 5,
    attemptKey: "attempt-1",
    pageUrl: "https://moodle.example/attempt.php",
    question: {
      questionId,
      questionType: "multichoice",
      questionHash: `hash-${questionId}`,
      answers: [
        {
          label: "A",
          answerKey: "a",
          slotKey: "question",
          slotIndex: null,
          verdict: "unknown",
        },
      ],
    },
    ...overrides,
  } as SaveUserAnswerPayload;
}

const authSession: AuthSession = {
  accessToken: "token-1",
  refreshToken: "refresh-1",
  expiresAt: null,
  user: { id: "user-1", email: "user@example.com" },
};

function makeDeps(overrides: Partial<PendingSaveFlushDeps> = {}): PendingSaveFlushDeps {
  return {
    loadStoredState: vi.fn(async () => ({ authSession })),
    saveStoredStatePatch: vi.fn(async () => {}),
    saveDiagnostics: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("pending queue with selection saves", () => {
  beforeEach(() => {
    resetPendingSaveFlushStateForTests();
    quizTasksMocks.saveReviewAnswers.mockReset();
    quizTasksMocks.saveReviewAnswers.mockRejectedValue(new Error("unexpected review save"));
    quizTasksMocks.saveUserAnswerSelection.mockReset();
    quizTasksMocks.saveUserAnswerSelection.mockRejectedValue(
      new Error("unexpected selection save"),
    );
    void chrome.storage.local.remove([
      PENDING_REVIEW_SAVES_STORAGE_KEY,
      "reduxsharePendingFlushAlarmStretch",
    ]);
  });

  it("dedupes selection saves per question while keeping review saves separate", async () => {
    await queuePendingSelectionSave(makeSelectionPayload("q-1"));
    await queuePendingSelectionSave(makeSelectionPayload("q-2"));
    await queuePendingSelectionSave(makeSelectionPayload("q-1"));
    await queuePendingReviewSave(makeReviewPayload());

    const queue = await loadPendingReviewSaves();

    expect(queue).toHaveLength(3);
    expect(queue.map((entry) => entry.id)).toEqual([
      "moodle.example|2|5|attempt-1|sel:q-2",
      "moodle.example|2|5|attempt-1|sel:q-1",
      "moodle.example|2|5|attempt-1",
    ]);
    expect(queue.map((entry) => entry.kind)).toEqual(["selection", "selection", "review"]);
  });

  it("flush dispatches selection entries to saveUserAnswerSelection", async () => {
    await queuePendingSelectionSave(makeSelectionPayload("q-1"));
    await queuePendingReviewSave(makeReviewPayload());

    quizTasksMocks.saveUserAnswerSelection.mockResolvedValue({ authSession, savedCount: 1 });
    quizTasksMocks.saveReviewAnswers.mockResolvedValue({
      authSession,
      imported: true,
      savedCount: 1,
    });

    const result = await flushPendingReviewSaves(authSession, makeDeps());

    expect(result.flushedCount).toBe(2);
    expect(quizTasksMocks.saveUserAnswerSelection).toHaveBeenCalledTimes(1);
    expect(quizTasksMocks.saveUserAnswerSelection).toHaveBeenCalledWith(
      authSession,
      expect.objectContaining({ question: expect.objectContaining({ questionId: "q-1" }) }),
    );
    expect(quizTasksMocks.saveReviewAnswers).toHaveBeenCalledTimes(1);
    expect(await loadPendingReviewSaves()).toHaveLength(0);
  });

  it("treats legacy entries without kind as review saves", async () => {
    await chrome.storage.local.set({
      [PENDING_REVIEW_SAVES_STORAGE_KEY]: [
        {
          id: "legacy-entry",
          queuedAt: new Date().toISOString(),
          payload: makeReviewPayload({ attemptKey: "legacy" }),
        },
      ],
    });

    quizTasksMocks.saveReviewAnswers.mockResolvedValue({
      authSession,
      imported: false,
      savedCount: 1,
    });

    const result = await flushPendingReviewSaves(authSession, makeDeps());

    expect(result.flushedCount).toBe(1);
    expect(quizTasksMocks.saveReviewAnswers).toHaveBeenCalledTimes(1);
    expect(quizTasksMocks.saveUserAnswerSelection).not.toHaveBeenCalled();
  });

  it("caps the queue at MAX_PENDING_REVIEW_SAVES by dropping the oldest entries", async () => {
    for (let index = 0; index < MAX_PENDING_REVIEW_SAVES + 5; index += 1) {
      await queuePendingSelectionSave(makeSelectionPayload(`q-${index}`));
    }

    const queue = await loadPendingReviewSaves();

    expect(queue).toHaveLength(MAX_PENDING_REVIEW_SAVES);
    expect(MAX_PENDING_REVIEW_SAVES).toBe(200);
    expect(queue[0].id).toContain("sel:q-5");
    expect(queue.at(-1)?.id).toContain(`sel:q-${MAX_PENDING_REVIEW_SAVES + 4}`);
  });
});
