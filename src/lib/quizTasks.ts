import type { AuthSession, LanguageSetting } from "../types";
import type {
  FetchReduxShareTasksPayload,
  FetchReduxShareTasksResult,
  QuizPreviewTaskResult,
  SaveReduxShareReviewPayload,
  SaveReduxShareReviewResult,
  SaveUserAnswerPayload,
  SaveUserAnswerResult,
  VoteTaskAnswerPayload,
  VoteTaskAnswerResult,
} from "./dataTypes";
import { getQuizTasksProvider } from "./dataProvider";

export type {
  QuizTaskQuestionRequest,
  FetchReduxShareTasksPayload,
  ReduxShareTaskResult,
  ReviewImportRecord,
  FetchReduxShareTasksResult,
  ReviewAnswerPayload,
  SelectionVerdict,
  PreCountedSelection,
  ReviewQuestionPayload,
  SaveReduxShareReviewPayload,
  SaveReduxShareReviewResult,
  UserAnswerSelectionAnswer,
  UserAnswerSelectionQuestion,
  SaveUserAnswerPayload,
  SaveUserAnswerResult,
  VoteTaskAnswerPayload,
  VoteTaskAnswerResult,
  QuizPreviewTaskResult,
  ReviewQuestionOutcome,
} from "./dataTypes";

export {
  parseTaskAnswerOptions,
  mergeAnswerOptionLabels,
  getReviewQuestionOutcome,
} from "./dataCore/quizTasksCore";

export async function fetchReduxShareTasks(
  authSession: AuthSession,
  payload: FetchReduxShareTasksPayload,
  language?: LanguageSetting,
): Promise<FetchReduxShareTasksResult> {
  return getQuizTasksProvider().fetchReduxShareTasks(authSession, payload, language);
}

export async function voteTaskAnswer(
  authSession: AuthSession,
  payload: VoteTaskAnswerPayload,
): Promise<VoteTaskAnswerResult> {
  return getQuizTasksProvider().voteTaskAnswer(authSession, payload);
}

export async function fetchReduxShareQuizPreviewTasks(
  authSession: AuthSession,
  payload: { domain: string; courseId: number | null; quizId: number | null },
): Promise<{ authSession: AuthSession; results: QuizPreviewTaskResult[] }> {
  return getQuizTasksProvider().fetchReduxShareQuizPreviewTasks(authSession, payload);
}

export async function saveReduxShareReviewAnswers(
  authSession: AuthSession,
  payload: SaveReduxShareReviewPayload,
): Promise<SaveReduxShareReviewResult> {
  return getQuizTasksProvider().saveReduxShareReviewAnswers(authSession, payload);
}

export async function saveUserAnswerSelection(
  authSession: AuthSession,
  payload: SaveUserAnswerPayload,
): Promise<SaveUserAnswerResult> {
  return getQuizTasksProvider().saveUserAnswerSelection(authSession, payload);
}
