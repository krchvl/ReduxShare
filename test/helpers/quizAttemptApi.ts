import type { AiAnswerState, AnswerData, AnswerVariantCounts, SourceAnswerData, StoredStateLike } from "../../src/content/quizAttempt/model";

type QuizAttemptTestApi = {
  reset: () => void;
  setStoredState: (state: StoredStateLike | undefined) => void;
  buildReviewAnswersForQuestion: (questionNode: Element, questionType: string | null) => unknown[];
  collectReviewQuestionsForSave: () => Array<{
    questionId: string | null;
    questionType: string | null;
    questionHash: string | null;
    answers: unknown[];
  }>;
  buildAiAnswerRequestPayload: (questionNode: Element, questionId: string | null) => unknown;
  collectQuestionSummaries: () => Array<{
    questionId: string | null;
    questionType: string | null;
    questionHash: string | null;
    questionText: string;
    answerLabels: string[];
  }>;
  buildReviewSaveRequestPayload: (state: StoredStateLike | undefined) => unknown;
  setSourceAnswerData: (questionId: string | null, source: keyof SourceAnswerData, data: AnswerData) => void;
  applyAiAnswerForQuestion: (questionNode: Element, state: AiAnswerState) => boolean;
  autoSelectQuestionAnswers: (questionNode: Element, answerData: SourceAnswerData["reduxshare"]) => boolean;
  mountAnswerWidgets: (accentColor: string) => void;
  createAnswerWidgetHost: (
    accentColor: string,
    questionId: string | null,
    variantCounts: AnswerVariantCounts,
    answerData: SourceAnswerData,
    slotIndex?: number | null,
    isInline?: boolean
  ) => HTMLElement;
  getAnswerMenuMarkup: (
    answerData: SourceAnswerData,
    aiSettingsSaved: boolean,
    aiAnswerState: AiAnswerState,
    aiToolsEnabled?: boolean
  ) => string;
  createEmptySourceAnswerData: () => SourceAnswerData;
  createEmptyVariantCounts: () => AnswerVariantCounts;
};

export async function getQuizAttemptTestApi() {
  await import("../../src/content/quizAttempt");

  const api = globalThis.__reduxshareQuizAttemptTestApi as QuizAttemptTestApi | undefined;

  if (!api) {
    throw new Error("ReduxShare quizAttempt test API was not installed.");
  }

  api.reset();
  return api;
}
