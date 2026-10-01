import { AUTO_PASS_SESSION_STORAGE_KEY } from "../shared/storageKeys";

export type AutoPassSessionStatus = "running" | "paused" | "done";

export type AutoPassSession = {
  version: 1;
  status: AutoPassSessionStatus;
  domain: string;
  cmid: number;
  attemptId: number | null;
  quizId: number | null;
  courseId: number | null;
  page: number | null;
  pausedQuestionNo: string | null;
  pausedQuestionText: string | null;
  startedAt: string;
  updatedAt: string;
};

export type AutoPassSessionInput = {
  domain: string;
  cmid: number;
  attemptId?: number | null;
  quizId?: number | null;
  courseId?: number | null;
  page?: number | null;
};

const AUTO_PASS_SESSION_VERSION = 1;
const AUTO_PASS_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const AUTO_PASS_SESSION_STATUSES: AutoPassSessionStatus[] = ["running", "paused", "done"];

export function createAutoPassSession(input: AutoPassSessionInput): AutoPassSession {
  const nowIso = new Date().toISOString();

  return {
    version: AUTO_PASS_SESSION_VERSION,
    status: "running",
    domain: input.domain,
    cmid: input.cmid,
    attemptId: input.attemptId ?? null,
    quizId: input.quizId ?? null,
    courseId: input.courseId ?? null,
    page: input.page ?? null,
    pausedQuestionNo: null,
    pausedQuestionText: null,
    startedAt: nowIso,
    updatedAt: nowIso,
  };
}

export function isAutoPassSessionStale(session: AutoPassSession): boolean {
  const updatedAt = Date.parse(session.updatedAt);
  return !Number.isFinite(updatedAt) || Date.now() - updatedAt > AUTO_PASS_SESSION_TTL_MS;
}

export function normalizeAutoPassSession(value: unknown): AutoPassSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AutoPassSession>;

  if (
    candidate.version !== AUTO_PASS_SESSION_VERSION ||
    !candidate.status ||
    !AUTO_PASS_SESSION_STATUSES.includes(candidate.status) ||
    typeof candidate.domain !== "string" ||
    candidate.domain === "" ||
    typeof candidate.cmid !== "number" ||
    !Number.isFinite(candidate.cmid) ||
    candidate.cmid <= 0
  ) {
    return null;
  }

  const session: AutoPassSession = {
    version: AUTO_PASS_SESSION_VERSION,
    status: candidate.status,
    domain: candidate.domain,
    cmid: candidate.cmid,
    attemptId:
      typeof candidate.attemptId === "number" && Number.isFinite(candidate.attemptId)
        ? candidate.attemptId
        : null,
    quizId:
      typeof candidate.quizId === "number" && Number.isFinite(candidate.quizId)
        ? candidate.quizId
        : null,
    courseId:
      typeof candidate.courseId === "number" && Number.isFinite(candidate.courseId)
        ? candidate.courseId
        : null,
    page:
      typeof candidate.page === "number" && Number.isFinite(candidate.page) && candidate.page >= 0
        ? candidate.page
        : null,
    pausedQuestionNo:
      typeof candidate.pausedQuestionNo === "string" && candidate.pausedQuestionNo.trim() !== ""
        ? candidate.pausedQuestionNo
        : null,
    pausedQuestionText:
      typeof candidate.pausedQuestionText === "string" && candidate.pausedQuestionText.trim() !== ""
        ? candidate.pausedQuestionText
        : null,
    startedAt:
      typeof candidate.startedAt === "string" ? candidate.startedAt : new Date().toISOString(),
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
  };

  return isAutoPassSessionStale(session) ? null : session;
}

export async function loadAutoPassSession(): Promise<AutoPassSession | null> {
  try {
    const result = await chrome.storage.local.get(AUTO_PASS_SESSION_STORAGE_KEY);
    return normalizeAutoPassSession(result[AUTO_PASS_SESSION_STORAGE_KEY]);
  } catch {
    return null;
  }
}

export async function saveAutoPassSession(session: AutoPassSession): Promise<void> {
  try {
    await chrome.storage.local.set({ [AUTO_PASS_SESSION_STORAGE_KEY]: session });
  } catch {}
}

export async function patchAutoPassSession(
  patch: Partial<Omit<AutoPassSession, "version" | "domain" | "cmid" | "startedAt">>,
): Promise<AutoPassSession | null> {
  const current = await loadAutoPassSession();

  if (!current) {
    return null;
  }

  const next: AutoPassSession = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await saveAutoPassSession(next);
  return next;
}

export async function clearAutoPassSession(): Promise<void> {
  try {
    await chrome.storage.local.remove(AUTO_PASS_SESSION_STORAGE_KEY);
  } catch {}
}

export function doesAutoPassSessionMatchPage(
  session: AutoPassSession,
  domain: string,
  cmid: number | null,
): boolean {
  return session.domain === domain && cmid !== null && session.cmid === cmid;
}
