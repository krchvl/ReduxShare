import { getRequestErrorMessage, getTranslator } from "../i18n";
import type { LanguageSetting } from "../types";

export const EXTERNAL_CLIENT_VERSION = "2.6.0";
export const EXTERNAL_REQUEST_TIMEOUT_MS = 10_000;

const EXTERNAL_ENDPOINT_KEY = [91, 17, 203, 44, 7, 180, 63, 128, 54] as const;
const EXTERNAL_ENDPOINT_SEGMENTS = {
  authority: [57, 88, 234, 33, 249, 112, 149, 24, 90, 93, 56, 204, 197, 204, 22, 169, 248, 56, 9, 42],
  resource: [101, 64, 244, 43, 165, 110, 198, 69, 78, 6, 63, 215, 134, 208, 24, 177, 244, 98, 13, 32, 216]
} as const;

function decodeExternalEndpointSegment(segment: readonly number[]) {
  return segment
    .map((value, index) => {
      const positionalMask = (index * 31 + 17) & 255;
      return String.fromCharCode(value ^ EXTERNAL_ENDPOINT_KEY[index % EXTERNAL_ENDPOINT_KEY.length] ^ positionalMask);
    })
    .join("");
}

function getExternalVariantsUrl() {
  return `https://${decodeExternalEndpointSegment(EXTERNAL_ENDPOINT_SEGMENTS.authority)}${decodeExternalEndpointSegment(
    EXTERNAL_ENDPOINT_SEGMENTS.resource
  )}`;
}

export interface ExternalQuestionRequest {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
}

export interface ExternalVariantsPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptId?: string | null;
  moodleUserId?: string | null;
  questions: ExternalQuestionRequest[];
}

export interface ExternalVariantResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  ok: boolean;
  status?: number;
  data?: unknown;
  answerCount?: number;
  error?: string;
}

export function buildVariantsUrl(payload: ExternalVariantsPayload, question: ExternalQuestionRequest) {
  const params = new URLSearchParams({
    host: payload.domain,
    courseId: String(payload.courseId),
    quizId: String(payload.quizId),
    // Real page meta when the content script could read it, otherwise the
    // historical "1" placeholders (server tolerates them).
    moodleId: payload.moodleUserId ?? "1",
    questionId: question.questionId ?? "",
    attemptId: payload.attemptId ?? "1",
    client: EXTERNAL_CLIENT_VERSION,
    questionType: question.questionType ?? ""
  });

  return `${getExternalVariantsUrl()}?${params.toString()}`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Variants data is always null, an array of rows, or a single row object.
 * Anything else (bare strings from HTML error pages, numbers, booleans)
 * is never valid data: normalize it to null so downstream parsers that
 * expect rows keep behaving exactly as they do for empty responses.
 */
export function normalizeExternalVariantsData(data: unknown): { data: unknown; invalid: boolean } {
  if (data === null || data === undefined) {
    return { data: null, invalid: false };
  }

  if (Array.isArray(data)) {
    return { data, invalid: false };
  }

  if (typeof data === "object") {
    return { data, invalid: false };
  }

  return { data: null, invalid: true };
}

export function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

// The provider returns an empty list for an unknown qtype instead of an error,
// so "no rows" from a possibly-wrong type says nothing about data existence.
// The probe order puts the common qtypes first; the list mirrors
// MOODLE_QUESTION_TYPE_LABELS and is bounded per question.
export const EXTERNAL_TYPE_PROBE_ORDER = [
  "multichoice",
  "truefalse",
  "shortanswer",
  "matching",
  "match",
  "numerical",
  "gapselect",
  "ddwtos",
  "ddmarker",
  "ddimageortext",
  "ordering",
  "essay",
  "multichoiceset",
  "multianswer",
  "calculated",
  "calculatedsimple",
  "calculatedmulti"
] as const;

export const EXTERNAL_TYPE_PROBE_LIMIT = 10;

export function hasExternalAnswerRows(result: ExternalVariantResult) {
  if (!result.ok) {
    return false;
  }

  if (Array.isArray(result.data)) {
    return result.data.length > 0;
  }

  return result.data !== null && result.data !== undefined;
}

export function buildExternalAnswerUrl(
  domain: string,
  courseId: number,
  quizId: number,
  question: ExternalQuestionRequest,
  language?: string
): string {
  const params = new URLSearchParams({
    host: domain,
    courseId: String(courseId),
    quizId: String(quizId),
    moodleId: "1",
    questionId: question.questionId ?? "",
    attemptId: "1",
    client: EXTERNAL_CLIENT_VERSION,
    questionType: question.questionType ?? "",
    language: language ?? "en"
  });

  return `https://naloaty.me/quiz/solution?${params.toString()}`;
}

export async function fetchExternalAnswer(
  question: ExternalQuestionRequest,
  domain: string,
  courseId: number,
  quizId: number,
  language?: string,
  timeoutMs: number = EXTERNAL_REQUEST_TIMEOUT_MS
): Promise<{ ok: boolean; data: unknown | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = buildExternalAnswerUrl(domain, courseId, quizId, question, language);
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Accept: "*/*" }
    }, timeoutMs);

    clearTimeout(timeoutId);

    const text = await response.text();

    if (!text) {
      return { ok: false, data: null };
    }

    try {
      const data = JSON.parse(text);
      return { ok: response.ok, data };
    } catch {
      return { ok: false, data: null };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    return { ok: false, data: null };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchQuestionVariants(
  payload: ExternalVariantsPayload,
  question: ExternalQuestionRequest,
  language?: LanguageSetting,
  timeoutMs: number = EXTERNAL_REQUEST_TIMEOUT_MS
): Promise<ExternalVariantResult> {
  const t = getTranslator(language);

  if (!question.questionId) {
    return {
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash,
      ok: false,
      error: t("errors.questionIdMissing")
    };
  }

  try {
    const response = await fetchWithTimeout(
      buildVariantsUrl(payload, question),
      {
        method: "GET",
        headers: {
          Accept: "*/*"
        }
      },
      timeoutMs
    );
    const { data, invalid } = normalizeExternalVariantsData(await readResponseBody(response));

    if (!response.ok || invalid) {
      return {
        questionId: question.questionId,
        questionType: question.questionType,
        questionHash: question.questionHash,
        ok: false,
        status: response.status,
        data,
        error: t("errors.externalRequest")
      };
    }

    return {
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash,
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    return {
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash,
      ok: false,
      error: isAbortError(error) ? t("errors.externalRequest") : getRequestErrorMessage(error, language)
    };
  }
}
