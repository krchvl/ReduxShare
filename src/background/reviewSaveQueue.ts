import type { AuthSession } from "../types";
import { saveReduxShareReviewAnswers, type SaveReduxShareReviewPayload } from "../lib/quizTasks";
import { PENDING_REVIEW_SAVES_STORAGE_KEY } from "../shared/storageKeys";
import { UPDATE_ALARM_NAME, UPDATE_CHECK_INTERVAL_MS } from "../lib/updates";

export const MAX_PENDING_REVIEW_SAVES = 25;

const PENDING_FLUSH_ALARM_PERIOD_MINUTES = 1;

const PENDING_FLUSH_QUEUE_EMPTY_GRACE_MINUTES = 30;

export const PENDING_FLUSH_ALARM_STRETCH_KEY = "reduxsharePendingFlushAlarmStretch";

export interface PendingReviewSave {
  id: string;
  queuedAt: string;
  payload: SaveReduxShareReviewPayload;
}

export interface PendingSaveFlushDeps {
  loadStoredState: () => Promise<{ authSession?: AuthSession | null }>;

  saveStoredStatePatch: (patch: { authSession: AuthSession }) => Promise<void>;

  saveDiagnostics: (stage: string, details?: Record<string, unknown>) => Promise<void>;
}

export interface PendingSaveFlushResult {
  authSession: AuthSession;
  flushedCount: number;
  remainingCount: number;
}

function getStoredAuthSession(state: { authSession?: AuthSession | null } | null | undefined) {
  return state?.authSession?.user?.id ? state.authSession : null;
}

export function getPendingReviewSaveId(payload: SaveReduxShareReviewPayload) {
  return [
    payload.domain,
    payload.courseId ?? "unknown-course",
    payload.quizId ?? "unknown-quiz",
    payload.attemptKey,
  ].join("|");
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
    return (
      typeof candidate.id === "string" &&
      typeof candidate.queuedAt === "string" &&
      typeof candidate.payload === "object"
    );
  });
}

export async function savePendingReviewSaves(queue: PendingReviewSave[]) {
  await chrome.storage.local.set({
    [PENDING_REVIEW_SAVES_STORAGE_KEY]: queue.slice(-MAX_PENDING_REVIEW_SAVES),
  });
}

export async function queuePendingReviewSave(payload: SaveReduxShareReviewPayload) {
  const queue = await loadPendingReviewSaves();
  const nextEntry: PendingReviewSave = {
    id: getPendingReviewSaveId(payload),
    queuedAt: new Date().toISOString(),
    payload,
  };
  const dedupedQueue = queue.filter((entry) => entry.id !== nextEntry.id);
  dedupedQueue.push(nextEntry);
  await savePendingReviewSaves(dedupedQueue);
  return dedupedQueue.length;
}

let pendingReviewSaveFlushInProgress = false;

export function resetPendingSaveFlushStateForTests() {
  pendingReviewSaveFlushInProgress = false;
}

export async function flushPendingReviewSaves(
  authSession: AuthSession,
  deps: Pick<PendingSaveFlushDeps, "saveStoredStatePatch" | "saveDiagnostics">,
): Promise<PendingSaveFlushResult> {
  if (pendingReviewSaveFlushInProgress) {
    return {
      authSession,
      flushedCount: 0,
      remainingCount: (await loadPendingReviewSaves()).length,
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
          attemptKey: entry.payload.attemptKey,
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
      remainingCount: remaining.length,
    };
  } finally {
    pendingReviewSaveFlushInProgress = false;
  }
}

export async function flushPendingReviewSavesWithStoredState(
  deps: PendingSaveFlushDeps,
): Promise<PendingSaveFlushResult | null> {
  const storedState = await deps.loadStoredState();
  const authSession = getStoredAuthSession(storedState);

  if (!authSession) {
    return null;
  }

  return flushPendingReviewSaves(authSession, deps);
}

function hasPendingAlarmApi() {
  const alarms = chrome.alarms as unknown as
    { get?: unknown; create?: unknown; clear?: unknown } | undefined;
  return Boolean(alarms?.get && alarms?.create && alarms?.clear && chrome.storage?.local);
}

async function getAlarmPeriodMinutes() {
  return new Promise<number | null>((resolve) => {
    chrome.alarms.get(UPDATE_ALARM_NAME, (alarm?: chrome.alarms.Alarm) => {
      resolve(alarm ? (alarm.periodInMinutes ?? null) : null);
    });
  });
}

export async function schedulePendingFlushAlarm() {
  if (!hasPendingAlarmApi()) {
    return;
  }

  const period = await getAlarmPeriodMinutes();
  if (period !== null && period <= PENDING_FLUSH_ALARM_PERIOD_MINUTES) {
    return;
  }

  await chrome.alarms.clear(UPDATE_ALARM_NAME);
  void chrome.alarms.create(UPDATE_ALARM_NAME, {
    delayInMinutes: PENDING_FLUSH_ALARM_PERIOD_MINUTES,
    periodInMinutes: PENDING_FLUSH_ALARM_PERIOD_MINUTES,
  });
}

async function readEmptySince(): Promise<number | null> {
  const result = await chrome.storage.local.get(PENDING_FLUSH_ALARM_STRETCH_KEY);
  const marker = result[PENDING_FLUSH_ALARM_STRETCH_KEY] as { emptySince?: string } | undefined;
  const parsed = marker?.emptySince ? Date.parse(marker.emptySince) : NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

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
      [PENDING_FLUSH_ALARM_STRETCH_KEY]: { emptySince: new Date(now).toISOString() },
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
  void chrome.alarms.create(UPDATE_ALARM_NAME, {
    delayInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000,
    periodInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000,
  });
  await chrome.storage.local.remove(PENDING_FLUSH_ALARM_STRETCH_KEY);
}

export async function updatePendingFlushAlarmAfterFlush() {
  const queue = await loadPendingReviewSaves();

  if (queue.length > 0) {
    await schedulePendingFlushAlarm();
    return;
  }

  await maybeStretchUpdateAlarmBack();
}

export async function handleSharedAlarmForPendingSaves(deps: PendingSaveFlushDeps) {
  const queue = await loadPendingReviewSaves();

  if (queue.length === 0) {
    await maybeStretchUpdateAlarmBack();
    return { flushedCount: 0, remainingCount: 0, flushed: false };
  }

  const result = await flushPendingReviewSavesWithStoredState(deps);

  if (!result) {
    await schedulePendingFlushAlarm();
    return { flushedCount: 0, remainingCount: queue.length, flushed: false };
  }

  if (result.flushedCount > 0) {
    await deps.saveDiagnostics("background-pending-save-flush-result", {
      flushedPendingCount: result.flushedCount,
      remainingPendingCount: result.remainingCount,
      trigger: "alarm",
    });
  }

  await updatePendingFlushAlarmAfterFlush();

  return { ...result, flushed: result.flushedCount > 0 };
}
