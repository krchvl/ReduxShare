// Quiz view page preloader: fetch answers for questions before the quiz starts.
// The page has no question markup, so we enumerate question identities from the
// "show questions" button and probe the external provider until we find a non-empty
// answer for a given question. The first successful probe is cached locally so the
// quiz attempt page can use it immediately.
import type { ExternalQuestionRequest } from "./externalProvider";
import { EXTERNAL_TYPE_PROBE_ORDER, fetchExternalAnswer } from "./externalProvider";
import {
  getQuizQuestionStubs,
  recordQuizQuestions,
  type QuizQuestionStub
} from "./quizQuestionRegistry";
import { logReduxShareInfo, logReduxShareWarning } from "../logic/runtime";

const PRELOAD_BATCH_SIZE = 5;
const PRELOAD_TIMEOUT_MS = 15_000;

export interface PreloadQuizQuestionsPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: Array<ExternalQuestionRequest & { questionText?: string | null }>;
}

export async function preloadQuizQuestions(
  payload: PreloadQuizQuestionsPayload,
  language?: string
): Promise<{ ok: boolean; found: number; total: number }> {
  const { domain, courseId, quizId, questions } = payload;

  if (courseId === null || quizId === null) {
    return { ok: true, found: 0, total: questions.length };
  }

  // Don't prefill if there are too many questions (quiz view page can have 100+).
  if (questions.length > 100) {
    return { ok: true, found: 0, total: questions.length };
  }

  // Check if we already have cached answers for these questions.
  const existingStubs = await getQuizQuestionStubs(domain, courseId, quizId);
  const existingIds = new Set(existingStubs.map((stub) => stub.questionId));

  const newQuestions = questions.filter((q) => !existingIds.has(q.questionId ?? ""));

  if (newQuestions.length === 0) {
    return { ok: true, found: existingStubs.length, total: questions.length };
  }

  logReduxShareInfo(
    `ReduxShare: preloading ${newQuestions.length} quiz questions for ${domain}/${courseId}/${quizId}`
  );

  const foundQuestionIds = await probeExternalQuestions(newQuestions, domain, courseId, quizId, language);

  // Record only questions with a confirmed hit: misses stay out of the
  // registry so later preview opens retry them instead of treating the
  // earlier empty probe as cached knowledge.
  if (foundQuestionIds.length > 0) {
    const foundIdSet = new Set(foundQuestionIds);
    await recordQuizQuestions(
      domain,
      courseId,
      quizId,
      newQuestions.filter((question) => foundIdSet.has(question.questionId ?? ""))
    );
  }

  return { ok: true, found: foundQuestionIds.length, total: questions.length };
}

async function probeExternalQuestions(
  questions: Array<ExternalQuestionRequest & { questionText?: string | null }>,
  domain: string,
  courseId: number,
  quizId: number,
  language?: string
): Promise<string[]> {
  const foundQuestionIds: string[] = [];

  for (let i = 0; i < questions.length; i += PRELOAD_BATCH_SIZE) {
    const batch = questions.slice(i, i + PRELOAD_BATCH_SIZE);

    // Probe in parallel batches to bound latency.
    const batchPromises = batch.map((question) =>
      probeSingleQuestion(question, domain, courseId, quizId, language)
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value !== null) {
        foundQuestionIds.push(result.value);
      }
    }
  }

  return foundQuestionIds;
}

async function probeSingleQuestion(
  question: ExternalQuestionRequest & { questionText?: string | null },
  domain: string,
  courseId: number,
  quizId: number,
  language?: string
): Promise<string | null> {
  const questionId = question.questionId?.trim();

  if (!questionId) {
    return null;
  }

  // Probe qtypes in order until we find a non-empty answer.
  for (const qtype of EXTERNAL_TYPE_PROBE_ORDER) {
    const probeRequest: ExternalQuestionRequest = {
      questionId,
      questionType: qtype,
      questionHash: question.questionHash?.trim() || null
    };

    try {
      const response = await fetchExternalAnswer(probeRequest, domain, courseId, quizId, language);

      if (!response.ok) {
        // If the endpoint returns an error (e.g., 400 for unknown qtype), we continue probing.
        continue;
      }

      // If the endpoint returns an empty array [], this is still considered "no answer found".
      // We only stop probing when we get a non-empty result.
      if (Array.isArray(response.data) && response.data.length === 0) {
        continue;
      }

      // Non-empty result found: stop probing this question.
      logReduxShareInfo(
        `ReduxShare: preloaded question ${questionId} (${qtype}) from external source for ${domain}/${courseId}/${quizId}`
      );
      return questionId;
    } catch {
      // If any fetch fails, continue probing other qtypes.
      continue;
    }
  }

  // No qtype yielded a non-empty answer.
  return null;
}

