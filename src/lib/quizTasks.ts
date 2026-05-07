import type { AuthSession } from "../types";
import { getTranslator, I18nError } from "../i18n";
import type { LanguageSetting } from "../types";
import { restoreSupabaseSession } from "./auth";
import { getSupabaseClient } from "./supabaseClient";

export interface QuizTaskQuestionRequest {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
}

export interface FetchReduxShareTasksPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: QuizTaskQuestionRequest[];
}

export interface ReduxShareTaskResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  ok: boolean;
  data?: unknown;
  answerCount?: number;
  error?: string;
}

interface ReduxShareTaskRow {
  question_id: string;
  question_type: string | null;
  question_hash: string;
  data: unknown;
  answer_count: number | null;
}

export interface FetchReduxShareTasksResult {
  authSession: AuthSession;
  results: ReduxShareTaskResult[];
}

export interface ReviewAnswerPayload {
  label: string;
  answerKey: string;
  slotKey: string;
  slotIndex: number | null;
  correctness: number;
  isCorrect: boolean;
  wasSelected: boolean;
}

export interface ReviewQuestionPayload {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  answers: ReviewAnswerPayload[];
}

export interface SaveReduxShareReviewPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptKey: string;
  pageUrl: string;
  questions: ReviewQuestionPayload[];
}

export interface SaveReduxShareReviewResult {
  authSession: AuthSession;
  imported: boolean;
  savedCount: number;
}

function getTaskKey(questionId: string | null, questionHash: string | null) {
  return `${questionId ?? ""}|${questionHash ?? ""}`;
}

function requiresExactTaskHash(question: QuizTaskQuestionRequest) {
  return question.questionType === "match" && Boolean(question.questionHash);
}

export async function fetchReduxShareTasks(
  authSession: AuthSession,
  payload: FetchReduxShareTasksPayload,
  language?: LanguageSetting
): Promise<FetchReduxShareTasksResult> {
  const nextAuthSession = await restoreSupabaseSession(authSession);
  const supabase = getSupabaseClient();
  const t = getTranslator(language);

  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: nextAuthSession,
      results: payload.questions.map((question) => ({
        questionId: question.questionId,
        questionType: question.questionType,
        questionHash: question.questionHash,
        ok: false,
        error: t("errors.moodleIdsMissing")
      }))
    };
  }

  const { data, error } = await supabase.rpc("fetch_reduxshare_tasks", {
    task_moodle_domain: payload.domain,
    task_course_id: payload.courseId,
    task_quiz_id: payload.quizId,
    task_questions: payload.questions.map((question) => ({
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash
    }))
  });

  if (error) {
    throw new I18nError("errors.reduxAnswersFetchFailed", { message: error.message });
  }

  const rowsByQuestion = new Map<string, ReduxShareTaskRow>();
  const rowsByQuestionId = new Map<string, ReduxShareTaskRow>();

  for (const row of (data ?? []) as ReduxShareTaskRow[]) {
    rowsByQuestion.set(getTaskKey(row.question_id, row.question_hash), row);

    if (!rowsByQuestionId.has(row.question_id)) {
      rowsByQuestionId.set(row.question_id, row);
    }
  }

  return {
    authSession: nextAuthSession,
    results: payload.questions.map((question) => {
      const row =
        rowsByQuestion.get(getTaskKey(question.questionId, question.questionHash)) ??
        (requiresExactTaskHash(question) ? undefined : question.questionId ? rowsByQuestionId.get(question.questionId) : undefined);

      if (!row) {
        return {
          questionId: question.questionId,
          questionType: question.questionType,
          questionHash: question.questionHash,
          ok: true,
          data: null,
          answerCount: 0
        };
      }

      return {
        questionId: row.question_id,
        questionType: row.question_type ?? question.questionType,
        questionHash: row.question_hash,
        ok: true,
        data: row.data,
        answerCount: row.answer_count ?? 0
      };
    })
  };
}

export async function saveReduxShareReviewAnswers(
  authSession: AuthSession,
  payload: SaveReduxShareReviewPayload
): Promise<SaveReduxShareReviewResult> {
  const nextAuthSession = await restoreSupabaseSession(authSession);
  const supabase = getSupabaseClient();

  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: nextAuthSession,
      imported: false,
      savedCount: 0
    };
  }

  const { data, error } = await supabase
    .rpc("save_reduxshare_review_answers", {
      review_moodle_domain: payload.domain,
      review_course_id: payload.courseId,
      review_quiz_id: payload.quizId,
      review_attempt_key: payload.attemptKey,
      review_page_url: payload.pageUrl,
      review_questions: payload.questions
    })
    .single<{
      imported: boolean;
      saved_count: number;
    }>();

  if (error) {
    throw new I18nError("errors.reduxReviewSaveFailed", { message: error.message });
  }

  return {
    authSession: nextAuthSession,
    imported: data.imported,
    savedCount: data.saved_count
  };
}
