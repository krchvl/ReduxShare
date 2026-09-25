import { beforeEach, describe, expect, it, vi } from "vitest";

const saveReviewAnswersMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/quizTasks", () => ({
  saveReduxShareReviewAnswers: saveReviewAnswersMock,
}));

import {
  flushPendingReviewSaves,
  flushPendingReviewSavesWithStoredState,
  handleSharedAlarmForPendingSaves,
  loadPendingReviewSaves,
  maybeStretchUpdateAlarmBack,
  queuePendingReviewSave,
  resetPendingSaveFlushStateForTests,
  schedulePendingFlushAlarm,
  updatePendingFlushAlarmAfterFlush,
  type PendingSaveFlushDeps,
} from "../src/background/reviewSaveQueue";
import type { SaveReduxShareReviewPayload } from "../src/lib/quizTasks";
import { PENDING_REVIEW_SAVES_STORAGE_KEY } from "../src/shared/storageKeys";
import { UPDATE_ALARM_NAME } from "../src/lib/updates";
import type { AuthSession } from "../src/types";

function makePayload(
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

function mockStoredAlarm(periodInMinutes: number | null) {
  vi.mocked(chrome.alarms.get).mockImplementation(((
    _name: string,
    callback: (alarm?: chrome.alarms.Alarm) => void,
  ) => {
    callback?.(
      periodInMinutes === null
        ? undefined
        : ({ name: UPDATE_ALARM_NAME, periodInMinutes } as chrome.alarms.Alarm),
    );
  }) as never);
}

describe("pending review save queue", () => {
  beforeEach(() => {
    resetPendingSaveFlushStateForTests();
    saveReviewAnswersMock.mockReset();
    saveReviewAnswersMock.mockRejectedValue(new Error("unexpected save call in test"));
    void chrome.storage.local.remove([
      PENDING_REVIEW_SAVES_STORAGE_KEY,
      "reduxsharePendingFlushAlarmStretch",
    ]);
    mockStoredAlarm(null);
  });

  it("queuePendingReviewSave dedupes by id and keeps the newest payload", async () => {
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-1" }));
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-2" }));
    await queuePendingReviewSave(
      makePayload({ attemptKey: "attempt-1", pageUrl: "https://moodle.example/updated" }),
    );

    const queue = await loadPendingReviewSaves();
    expect(queue).toHaveLength(2);
    expect(queue.map((entry) => entry.id)).toEqual([
      "moodle.example|2|5|attempt-2",
      "moodle.example|2|5|attempt-1",
    ]);
    expect(queue[1].payload.pageUrl).toBe("https://moodle.example/updated");
  });

  it("flushPendingReviewSaves delivers entries and persists the refreshed session", async () => {
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-1" }));
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-2" }));

    saveReviewAnswersMock.mockImplementation(
      async (_session: AuthSession, payload: SaveReduxShareReviewPayload) => ({
        authSession: { ...authSession, accessToken: `token-after-${payload.attemptKey}` },
        imported: false,
        savedCount: 1,
      }),
    );

    const deps = makeDeps();
    const result = await flushPendingReviewSaves(authSession, deps);

    expect(result.flushedCount).toBe(2);
    expect(result.remainingCount).toBe(0);
    expect(await loadPendingReviewSaves()).toHaveLength(0);
    expect(deps.saveStoredStatePatch).toHaveBeenCalledWith({
      authSession: { ...authSession, accessToken: "token-after-attempt-2" },
    });
  });

  it("keeps failed entries queued and records diagnostics for them", async () => {
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-1" }));
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-2" }));

    saveReviewAnswersMock.mockImplementation(
      async (_session: AuthSession, payload: SaveReduxShareReviewPayload) => {
        if (payload.attemptKey === "attempt-1") {
          throw new Error("network down");
        }
        return { authSession, imported: false, savedCount: 1 };
      },
    );

    const deps = makeDeps();
    const result = await flushPendingReviewSaves(authSession, deps);

    expect(result.flushedCount).toBe(1);
    const remaining = await loadPendingReviewSaves();
    expect(remaining.map((entry) => entry.id)).toEqual(["moodle.example|2|5|attempt-1"]);
    expect(deps.saveDiagnostics).toHaveBeenCalledWith(
      "background-pending-save-flush-error",
      expect.objectContaining({ pendingId: "moodle.example|2|5|attempt-1" }),
    );
  });

  it("skips a flush while one is already in flight (single-worker guard)", async () => {
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-1" }));

    let releaseFirstFlush: () => void = () => {};
    const firstFlushGate = new Promise<void>((resolve) => {
      releaseFirstFlush = resolve;
    });
    saveReviewAnswersMock.mockImplementationOnce(async () => {
      await firstFlushGate;
      return { authSession, imported: false, savedCount: 1 };
    });

    const deps = makeDeps();
    const firstFlush = flushPendingReviewSaves(authSession, deps);
    const secondFlush = flushPendingReviewSaves(authSession, deps);

    releaseFirstFlush();
    const [firstResult, secondResult] = await Promise.all([firstFlush, secondFlush]);

    expect(firstResult.flushedCount).toBe(1);
    expect(secondResult.flushedCount).toBe(0);
    expect(saveReviewAnswersMock).toHaveBeenCalledTimes(1);
  });

  it("flushPendingReviewSavesWithStoredState returns null when no session is stored", async () => {
    await queuePendingReviewSave(makePayload());

    const deps = makeDeps({
      loadStoredState: vi.fn(async () => ({ authSession: null })),
    });

    const result = await flushPendingReviewSavesWithStoredState(deps);
    expect(result).toBeNull();
    expect((await loadPendingReviewSaves()).length).toBe(1);
  });

  it("schedulePendingFlushAlarm compresses a daily alarm to the retry cadence", async () => {
    mockStoredAlarm(60 * 24);

    await schedulePendingFlushAlarm();

    expect(chrome.alarms.clear).toHaveBeenCalledWith(UPDATE_ALARM_NAME);
    expect(chrome.alarms.create).toHaveBeenCalledWith(UPDATE_ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: 1,
    });
  });

  it("schedulePendingFlushAlarm leaves an already-compressed alarm untouched", async () => {
    mockStoredAlarm(1);

    await schedulePendingFlushAlarm();

    expect(chrome.alarms.create).not.toHaveBeenCalled();
  });

  it("updatePendingFlushAlarmAfterFlush compresses the alarm while the queue is non-empty", async () => {
    await queuePendingReviewSave(makePayload());
    mockStoredAlarm(60 * 24);

    await updatePendingFlushAlarmAfterFlush();

    expect(chrome.alarms.create).toHaveBeenCalledWith(UPDATE_ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: 1,
    });
  });

  it("handleSharedAlarmForPendingSaves flushes the queue with the stored session", async () => {
    await queuePendingReviewSave(makePayload({ attemptKey: "attempt-1" }));
    saveReviewAnswersMock.mockResolvedValue({ authSession, imported: false, savedCount: 1 });
    mockStoredAlarm(1);

    const deps = makeDeps();
    const result = await handleSharedAlarmForPendingSaves(deps);

    expect(result.flushed).toBe(true);
    expect(result.flushedCount).toBe(1);
    expect(deps.saveDiagnostics).toHaveBeenCalledWith(
      "background-pending-save-flush-result",
      expect.objectContaining({ trigger: "alarm" }),
    );
    expect(await loadPendingReviewSaves()).toHaveLength(0);
  });

  it("handleSharedAlarmForPendingSaves keeps an uncompressed alarm retrying when no session exists", async () => {
    await queuePendingReviewSave(makePayload());
    mockStoredAlarm(60 * 24);

    const deps = makeDeps({
      loadStoredState: vi.fn(async () => ({ authSession: null })),
    });

    const result = await handleSharedAlarmForPendingSaves(deps);

    expect(result.flushed).toBe(false);
    expect((await loadPendingReviewSaves()).length).toBe(1);

    expect(chrome.alarms.create).toHaveBeenCalledWith(UPDATE_ALARM_NAME, {
      delayInMinutes: 1,
      periodInMinutes: 1,
    });
  });

  it("maybeStretchUpdateAlarmBack returns to the daily cadence after the grace period", async () => {
    mockStoredAlarm(1);

    await maybeStretchUpdateAlarmBack(new Date("2026-01-01T00:00:00Z").getTime());
    expect(chrome.alarms.create).not.toHaveBeenCalled();

    await maybeStretchUpdateAlarmBack(new Date("2026-01-01T01:00:00Z").getTime());
    expect(chrome.alarms.create).toHaveBeenCalledWith(UPDATE_ALARM_NAME, {
      delayInMinutes: 60 * 24,
      periodInMinutes: 60 * 24,
    });
  });

  it("maybeStretchUpdateAlarmBack resets the marker when the queue is non-empty again", async () => {
    await queuePendingReviewSave(makePayload());

    await maybeStretchUpdateAlarmBack();

    const marker = (await chrome.storage.local.get("reduxsharePendingFlushAlarmStretch"))[
      "reduxsharePendingFlushAlarmStretch"
    ];
    expect(marker).toBeUndefined();
  });
});
