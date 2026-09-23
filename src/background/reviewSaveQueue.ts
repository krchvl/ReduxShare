// Pending review-save queue: chrome.storage-backed persistence plus a flush engine
// that survives MV3 service-worker restarts. Extracted from background/external.ts.
//
// Crash resilience: the SW can be killed mid-flush (the trailing savePendingReviewSaves
// write is lost, in-flight fetches are aborted). The queue itself is durable, so
// recovery only needs triggers:
// 1. runPendingReviewSavesFlush() at SW startup — resumes a flush killed by the ~30s
//    idle timeout or a browser restart;
// 2. the shared update-check alarm, whose period is compressed to 1 minute whenever the
//    queue is non-empty (chrome.alarms minimum period is 0.5 min) and stretched back to
//    the daily cadence after the queue has been empty for a grace period — no extra
//    permission, no second alarm;
// 3. the existing storage.onChanged listener in external.ts, which stays the primary
//    path for "session restored while the SW is alive".
//
// The in-flight guard is deliberately kept in-memory only: a dead worker also drops
// the flag, so a restart can never deadlock behind a stale lock.

import type { AuthSession } from "../types";
import { saveReduxShareReviewAnswers, type SaveReduxShareReviewPayload } from "../lib/quizTasks";
import { PENDING_REVIEW_SAVES_STORAGE_KEY } from "../shared/storageKeys";
import { UPDATE_ALARM_NAME, UPDATE_CHECK_INTERVAL_MS } from "../lib/updates";

export const MAX_PENDING_REVIEW_SAVES = 25;

/** Re-flush cadence while the queue is non-empty. chrome.alarms minimum period is 0.5 min. */
const PENDING_FLUSH_ALARM_PERIOD_MINUTES = 1;
/** Grace period with an empty queue before the shared alarm returns to its daily cadence. */
const PENDING_FLUSH_QUEUE_EMPTY_GRACE_MINUTES = 30;
/** Storage key holding "since when has the queue been empty" for the grace period. */
export const PENDING_FLUSH_ALARM_STRETCH_KEY = "reduxsharePendingFlushAlarmStretch";

export interface PendingReviewSave {
  id: string;
  queuedAt: string;
  payload: SaveReduxShareReviewPayload;
}

export interface PendingSaveFlushDeps {
  /** Loads the stored extension state; an absent auth session short-circuits the flush. */
  loadStoredState: () => Promise<{ authSession?: AuthSession | null }>;
  /**
   * Persists a refreshed auth session after successful saves. The resulting
   * APP_STORAGE_KEY write re-enters the onChanged listener, but the next flush
   * sees an empty queue and terminates, so there is no feedback loop.
   */
  saveStoredStatePatch: (patch: { authSession: AuthSession }) => Promise<void>;
  /** Persisted pipeline telemetry, same key the message handlers use. */
  saveDiagnostics: (stage: string, details?: Record<string, unknown>) => Promise<void>;
}

export interface PendingSaveFlushResult {
  /** Refreshed session after token rotation; equals the input when nothing flushed. */
  authSession: AuthSession;
  flushedCount: number;
  remainingCount: number;
}

interface AlarmLike {
  name: string;
  periodInMinutes?: number;
}

function getStoredAuthSession(state: { authSession?: AuthSession | null } | null | undefined) {
  return state?.authSession?.user?.id ? state.authSession : null;
}

export function getPendingReviewSaveId(payload: SaveReduxShareReviewPayload) {
  return [payload.domain, payload.courseId ?? "unknown-course", payload.quizId ?? "unknown-quiz", payload.attemptKey].join("|");
}

export async function loadPendingReviewSaves(): Promise<PendingReviewSave[]> {
  const result = await chrome.storage.local.get(PENDING_REVIEW_SAVES_STORAGE_KEY);
  const value = result[PENDING_REVIEW_SAVES_STORAGE_KEY];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is PendingReviewSave => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    const candidate = entry as Partial<PendingReviewSave>;
    return typeof candidate.id === "string" && typeof candidate.queuedAt === "string" && typeof candidate.payload === "object";
  });
}

export async function savePendingReviewSaves(queue: PendingReviewSave[]) {
  await chrome.storage.local.set({
    [PENDING_REVIEW_SAVES_STORAGE_KEY]: queue.slice(-MAX_PENDING_REVIEW_SAVES)
  });
}

export async function queuePendingReviewSave(payload: SaveReduxShareReviewPayload) {
  const queue = await loadPendingReviewSaves();
  const nextEntry: PendingReviewSave = {
    id: getPendingReviewSaveId(payload),
    queuedAt: new Date().toISOString(),
    payload
  };
  const dedupedQueue = queue.filter((entry) => entry.id !== nextEntry.id);
  dedupedQueue.push(nextEntry);
  await savePendingReviewSaves(dedupedQueue);
  return dedupedQueue.length;
}

let pendingReviewSaveFlushInProgress = false;

/** Test-only escape hatch: the module-level guard survives across vitest cases. */
export function resetPendingSaveFlushStateForTests() {
  pendingReviewSaveFlushInProgress = false;
}

export async function flushPendingReviewSaves(
  authSession: AuthSession,
  deps: Pick<PendingSaveFlushDeps, "saveStoredStatePatch" | "saveDiagnostics">
): Promise<PendingSaveFlushResult> {
  if (pendingReviewSaveFlushInProgress) {
    return {
      authSession,
      flushedCount: 0,
      remainingCount: (await loadPendingReviewSaves()).length
    };
  }

  pendingReviewSaveFlushInProgress = true;

  try {
    const queue = await loadPendingReviewSaves();
    const remaining: PendingReviewSave[] = [];
    let latestAuthSession = authSession;
    let flushedCount = 0;

    for (const entry of queue) {
      try {
        const result = await saveReduxShareReviewAnswers(latestAuthSession, entry.payload);
        latestAuthSession = result.authSession;
        flushedCount += 1;
      } catch (error) {
        remaining.push(entry);
        await deps.saveDiagnostics("background-pending-save-flush-error", {
          error: error instanceof Error ? error.message : String(error),
          pendingId: entry.id,
          courseId: entry.payload.courseId,
          quizId: entry.payload.quizId,
          attemptKey: entry.payload.attemptKey
        });
      }
    }

    await savePendingReviewSaves(remaining);

    if (flushedCount > 0) {
      await deps.saveStoredStatePatch({ authSession: latestAuthSession });
    }

    return {
      authSession: latestAuthSession,
      flushedCount,
      remainingCount: remaining.length
    };
  } finally {
    pendingReviewSaveFlushInProgress = false;
  }
}

/**
 * Flush variant for triggers without an auth session at hand (SW startup, alarm):
 * reads the session from storage. Returns null when there is no usable session —
 * entries stay queued for the next trigger (login, storage change, alarm).
 */
export async function flushPendingReviewSavesWithStoredState(
  deps: PendingSaveFlushDeps
): Promise<PendingSaveFlushResult | null> {
  const storedState = await deps.loadStoredState();
  const authSession = getStoredAuthSession(storedState);

  if (!authSession) {
    return null;
  }

  return flushPendingReviewSaves(authSession, deps);
}

// --- Alarm-driven recovery -------------------------------------------------
//
// The update-check alarm is shared: compressed while pending saves exist, stretched
// back to the daily cadence after the queue has been empty for the grace period.
// chrome.alarms survive SW death and keep their schedule, so restarts must not
// re-create the alarm needlessly.

function hasPendingAlarmApi() {
  // Cast to unknown: @types/chrome declares every member non-optional, but the
  // alarms namespace is missing in tests and older runtimes.
  const alarms = chrome.alarms as unknown as
    | { get?: unknown; create?: unknown; clear?: unknown }
    | undefined;
  return Boolean(alarms?.get && alarms?.create && alarms?.clear && chrome.storage?.local);
}

async function getAlarmPeriodMinutes() {
  return new Promise<number | null>((resolve) => {
    chrome.alarms.get(UPDATE_ALARM_NAME, (alarm?: chrome.alarms.Alarm) => {
      resolve(alarm ? alarm.periodInMinutes ?? null : null);
    });
  });
}

/**
 * Ensures the shared alarm fires again within the pending-flush cadence. Safe to call
 * from every trigger; recreates the alarm only when its period is not already
 * compressed (or missing entirely, e.g. before the first update-check registration).
 */
export async function schedulePendingFlushAlarm(now: number = Date.now()) {
  if (!hasPendingAlarmApi()) {
    return;
  }

  const period = await getAlarmPeriodMinutes();
  if (period !== null && period <= PENDING_FLUSH_ALARM_PERIOD_MINUTES) {
    return;
  }

  await chrome.alarms.clear(UPDATE_ALARM_NAME);
  chrome.alarms.create(UPDATE_ALARM_NAME, {
    delayInMinutes: PENDING_FLUSH_ALARM_PERIOD_MINUTES,
    periodInMinutes: PENDING_FLUSH_ALARM_PERIOD_MINUTES
  });
}

async function readEmptySince(): Promise<number | null> {
  const result = await chrome.storage.local.get(PENDING_FLUSH_ALARM_STRETCH_KEY);
  const marker = result[PENDING_FLUSH_ALARM_STRETCH_KEY] as { emptySince?: string } | undefined;
  const parsed = marker?.emptySince ? Date.parse(marker.emptySince) : NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Restores the daily update cadence once the queue has been empty for the grace
 * period. A dead SW simply delays the stretch-back — the marker is wall-clock.
 */
export async function maybeStretchUpdateAlarmBack(now: number = Date.now()) {
  if (!hasPendingAlarmApi()) {
    return;
  }

  const queue = await loadPendingReviewSaves();
  if (queue.length > 0) {
    await chrome.storage.local.remove(PENDING_FLUSH_ALARM_STRETCH_KEY);
    return;
  }

  const emptySince = await readEmptySince();
  if (emptySince === null) {
    await chrome.storage.local.set({
      [PENDING_FLUSH_ALARM_STRETCH_KEY]: { emptySince: new Date(now).toISOString() }
    });
    return;
  }

  if (now - emptySince < PENDING_FLUSH_QUEUE_EMPTY_GRACE_MINUTES * 60_000) {
    return;
  }

  const period = await getAlarmPeriodMinutes();
  if (period !== null && period > PENDING_FLUSH_ALARM_PERIOD_MINUTES) {
    return;
  }

  await chrome.alarms.clear(UPDATE_ALARM_NAME);
  chrome.alarms.create(UPDATE_ALARM_NAME, {
    delayInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000,
    periodInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000
  });
  await chrome.storage.local.remove(PENDING_FLUSH_ALARM_STRETCH_KEY);
}

/**
 * Called after every flush attempt: compresses the alarm while work remains and
 * starts the grace clock once the queue drains.
 */
export async function updatePendingFlushAlarmAfterFlush() {
  const queue = await loadPendingReviewSaves();

  if (queue.length > 0) {
    await schedulePendingFlushAlarm();
    return;
  }

  await maybeStretchUpdateAlarmBack();
}

/**
 * Alarm callback for the shared alarm: when the queue is non-empty it performs a
 * flush with the stored session; otherwise it defers to the regular update check.
 */
export async function handleSharedAlarmForPendingSaves(deps: PendingSaveFlushDeps) {
  const queue = await loadPendingReviewSaves();

  if (queue.length === 0) {
    await maybeStretchUpdateAlarmBack();
    return { flushedCount: 0, remainingCount: 0, flushed: false };
  }

  const result = await flushPendingReviewSavesWithStoredState(deps);

  if (!result) {
    // No stored session: leave the queue alone and keep the alarm compressed so a
    // login-plus-queue situation still gets retried on the next tick.
    await schedulePendingFlushAlarm();
    return { flushedCount: 0, remainingCount: queue.length, flushed: false };
  }

  if (result.flushedCount > 0) {
    await deps.saveDiagnostics("background-pending-save-flush-result", {
      flushedPendingCount: result.flushedCount,
      remainingPendingCount: result.remainingCount,
      trigger: "alarm"
    });
  }

  await updatePendingFlushAlarmAfterFlush();

  return { ...result, flushed: result.flushedCount > 0 };
}
