// Deep ID scan for the quiz view page: before the first attempt the extension
// knows the quiz (domain/course/quiz) but no question identities, so the
// external provider cannot be queried per question yet. This probes candidate
// question IDs with the very same solution request the attempt page sends,
// iterating the known question types per ID until a non-empty answer shows up.
import { EXTERNAL_TYPE_PROBE_ORDER, fetchExternalAnswer } from "./externalProvider";
import { recordQuizQuestions } from "./quizQuestionRegistry";
import { logReduxShareInfo, logReduxShareWarning } from "../logic/runtime";

export const QUIZ_ID_SCAN_BATCH_SIZE = 10;
export const QUIZ_ID_SCAN_DEFAULT_FROM = 1;
export const QUIZ_ID_SCAN_DEFAULT_TO = 1000;
export const QUIZ_ID_SCAN_MAX_ID = 20000;

export interface QuizIdScanHit {
  questionId: string;
  questionType: string;
  data: unknown;
}

export interface QuizIdScanProgress {
  checked: number;
  total: number;
  found: number;
}

export interface QuizIdScanCallbacks {
  language?: string;
  // Subset of EXTERNAL_TYPE_PROBE_ORDER to probe per ID. Unknown codes are
  // dropped; an empty/omitted selection probes the full order.
  questionTypes?: string[];
  onHit?: (hit: QuizIdScanHit) => void;
  onProgress?: (progress: QuizIdScanProgress) => void;
  // Polled between batches: return true to abort the scan early.
  isCancelled?: () => boolean;
}

export function normalizeQuizIdScanRange(from: unknown, to: unknown): { from: number; to: number } | null {
  const fromId = typeof from === "string" && from.trim() !== "" ? Number(from) : from;
  const toId = typeof to === "string" && to.trim() !== "" ? Number(to) : to;

  if (
    typeof fromId !== "number" ||
    typeof toId !== "number" ||
    !Number.isInteger(fromId) ||
    !Number.isInteger(toId)
  ) {
    return null;
  }

  if (fromId < 1 || toId < 1 || fromId > toId || toId > QUIZ_ID_SCAN_MAX_ID) {
    return null;
  }

  return { from: fromId, to: toId };
}

async function probeSingleId(
  domain: string,
  courseId: number,
  quizId: number,
  questionId: number,
  typeOrder: readonly string[],
  language?: string
): Promise<QuizIdScanHit | null> {
  const questionIdText = String(questionId);

  for (const qtype of typeOrder) {
    let response;

    try {
      response = await fetchExternalAnswer(
        { questionId: questionIdText, questionType: qtype, questionHash: null },
        domain,
        courseId,
        quizId,
        language
      );
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    if (Array.isArray(response.data) && response.data.length === 0) {
      continue;
    }

    logReduxShareInfo(`ReduxShare: scanned question ${questionIdText} (${qtype}) for ${domain}/${courseId}/${quizId}`);

    return { questionId: questionIdText, questionType: qtype, data: response.data };
  }

  return null;
}

export async function scanExternalQuestionIds(
  domain: string,
  courseId: number,
  quizId: number,
  from: number,
  to: number,
  callbacks: QuizIdScanCallbacks = {}
): Promise<QuizIdScanHit[]> {
  const range = normalizeQuizIdScanRange(from, to);

  if (!range) {
    return [];
  }

  const candidateIds: number[] = [];

  for (let id = range.from; id <= range.to; id += 1) {
    candidateIds.push(id);
  }

  // Keep the probe order but honor the type selection from the scan controls.
  const wantedTypes = new Set(
    (callbacks.questionTypes ?? [])
      .map((type) => type.trim().toLowerCase())
      .filter((type) => type !== "")
  );
  const knownSelected = EXTERNAL_TYPE_PROBE_ORDER.filter((type) => wantedTypes.has(type));
  const typeOrder = knownSelected.length > 0 ? knownSelected : EXTERNAL_TYPE_PROBE_ORDER;

  const hits: QuizIdScanHit[] = [];
  let scannedMisses = 0;
  const reportProgress = () => {
    callbacks.onProgress?.({
      checked: Math.min(candidateIds.length, hits.length + scannedMisses),
      total: candidateIds.length,
      found: hits.length
    });
  };

  try {
    for (let i = 0; i < candidateIds.length; i += QUIZ_ID_SCAN_BATCH_SIZE) {
      if (callbacks.isCancelled?.()) {
        break;
      }

      // The modal may be closed mid-scan: stop instead of fetching in the background.
      if (typeof document !== "undefined" && !document.getElementById("reduxshare-quiz-preview-modal")) {
        break;
      }

      const batch = candidateIds.slice(i, i + QUIZ_ID_SCAN_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((id) => probeSingleId(domain, courseId, quizId, id, typeOrder, callbacks.language))
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value !== null) {
          hits.push(result.value);
          callbacks.onHit?.(result.value);
        } else {
          scannedMisses += 1;
        }
      }

      reportProgress();
    }
  } catch (error) {
    logReduxShareWarning("ReduxShare: question ID scan failed", error);
  } finally {
    // Hits are recorded even for an aborted scan so the next one continues
    // from knowledge instead of repeating the same discoveries.
    if (hits.length > 0) {
      await recordQuizQuestions(
        domain,
        courseId,
        quizId,
        hits.map((hit) => ({ questionId: hit.questionId, questionType: hit.questionType, questionHash: null }))
      );
    }
  }

  return hits;
}
