// Covers the third trigger of the pending-save queue (see reviewSaveQueue.ts header):
// "the existing storage.onChanged listener in external.ts, which stays the primary
// path for 'session restored while the SW is alive'". The emitter-style chrome mock
// dispatches onChanged from storage.local.set, so the production listener registered
// at external.ts import time runs against the real queue code end-to-end.
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveReviewAnswersMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/quizTasks", () => ({
  saveReduxShareReviewAnswers: saveReviewAnswersMock
}));

// Importing external.ts kicks off a startup update check; the guard state written in
// beforeEach (a far-future nextCheckAt) makes it a no-op before the import runs.
import { DEFAULT_UPDATE_STATE } from "../src/types";
import { queuePendingReviewSave } from "../src/background/reviewSaveQueue";
import { APP_STORAGE_KEY, PENDING_REVIEW_SAVES_STORAGE_KEY } from "../src/shared/storageKeys";
import type { SaveReduxShareReviewPayload } from "../src/lib/quizTasks";
import type { AuthSession } from "../src/types";

function makePayload(overrides: Partial<SaveReduxShareReviewPayload> = {}): SaveReduxShareReviewPayload {
  return {
    domain: "moodle.example",
    courseId: 2,
    quizId: 5,
    attemptKey: "attempt-1",
    pageUrl: "https://moodle.example/review.php",
    questions: [],
    ...overrides
  } as SaveReduxShareReviewPayload;
}

const authSession: AuthSession = {
  accessToken: "token-1",
  refreshToken: "refresh-1",
  expiresAt: null,
  user: { id: "user-1", email: "user@example.com" }
};

describe("flush-on-auth through chrome.storage.onChanged", () => {
  beforeEach(async () => {
    // setup.ts wipes every onChanged listener between tests, and import-time
    // registration runs only once per module instance — reset the module registry
    // and re-import the background entry point so each test gets a live listener.
    vi.resetModules();
    await chrome.storage.local.remove([PENDING_REVIEW_SAVES_STORAGE_KEY, "reduxsharePendingFlushAlarmStretch"]);
    await chrome.storage.local.set({
      [APP_STORAGE_KEY]: { updateState: { ...DEFAULT_UPDATE_STATE, nextCheckAt: "9999-01-01T00:00:00.000Z" } }
    });

    await import("../src/background/external");

    saveReviewAnswersMock.mockReset();
    saveReviewAnswersMock.mockRejectedValue(new Error("unexpected save call in test"));
  });

  it("flushes queued saves when an auth session lands in storage", async () => {
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-1" }));

    saveReviewAnswersMock.mockImplementation(async (session: AuthSession) => ({
      ok: true,
      authSession: { ...session, accessToken: `token-after-${session.user.id}` },
      imported: false,
      savedCount: 1
    }));

    // The production "session restored while the SW is alive" path: the write itself
    // must reach the listener registered by external.ts and trigger the flush.
    await chrome.storage.local.set({ [APP_STORAGE_KEY]: { authSession } });

    await vi.waitFor(() => {
      expect(saveReviewAnswersMock).toHaveBeenCalledTimes(1);
    });

    const [, flushedPayload] = saveReviewAnswersMock.mock.calls[0] as [AuthSession, SaveReduxShareReviewPayload];
    expect(flushedPayload.attemptKey).toBe("attempt-1");

    const stored = await chrome.storage.local.get([APP_STORAGE_KEY, PENDING_REVIEW_SAVES_STORAGE_KEY]);
    const appState = stored[APP_STORAGE_KEY] as { authSession?: AuthSession | null };
    expect(appState.authSession?.accessToken).toBe("token-after-user-1");
    expect(stored[PENDING_REVIEW_SAVES_STORAGE_KEY]).toEqual([]);
  });

  it("does not flush on storage changes without an auth session", async () => {
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-2" }));

    await chrome.storage.local.set({ [APP_STORAGE_KEY]: { authSession: null } });

    for (let hop = 0; hop < 6; hop += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(saveReviewAnswersMock).not.toHaveBeenCalled();

    const stored = await chrome.storage.local.get(PENDING_REVIEW_SAVES_STORAGE_KEY);
    expect(stored[PENDING_REVIEW_SAVES_STORAGE_KEY]).toHaveLength(1);
  });
});
