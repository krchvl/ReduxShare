import type {
  AiAnswerState,
  AnswerData,
  AnswerVariantCounts,
  SourceAnswerData,
  StoredStateLike,
} from "../../src/model";

type QuizAttemptTestApi = {
  reset: () => void;
  syncAttemptStatusPanelClosedState: (storedState: unknown) => void;
  setAttemptStatusPanelClosedInSession: (closed: boolean) => Promise<void>;
  setStoredState: (state: StoredStateLike | undefined) => void;
  getStoredState: () => StoredStateLike | undefined;
  computeAutoSelectDelayMs: (
    avgSeconds: number,
    random?: () => number,
    timeLeftSeconds?: number | null,
    extras?: {
      readingSeconds?: number;
      firstInPage?: boolean;
      interactive?: boolean;
    },
  ) => number;
  estimateQuestionReadingSeconds: (questionNode: Element) => number;
  getQuestionBehaviour: (questionNode: Element) => string | null;
  isStepPerActionBehaviour: (behaviour: string | null) => boolean;
  runHumanPrecursors: (target: Element, random?: () => number) => Promise<void>;
  shuffleScheduleOrder: <T>(entries: T[], random?: () => number) => T[];
  typeTextHumanLike: (
    control: HTMLInputElement | HTMLTextAreaElement,
    label: string,
    options?: { minIntervalMs?: number; maxIntervalMs?: number; random?: () => number },
  ) => Promise<boolean>;
  parseQuizTimeLeftSeconds: (text: string | null | undefined) => number | null;
  scheduleAutoSelectAnswer: (
    questionId: string | null,
    questionNode: Element,
    storedState: StoredStateLike | undefined,
    immediate?: boolean,
  ) => boolean;
  cancelAutoSelectSchedule: (questionId: string | null) => void;
  buildReviewAnswersForQuestion: (questionNode: Element, questionType: string | null) => unknown[];
  collectReviewQuestionsForSave: () => Array<{
    questionId: string | null;
    questionType: string | null;
    questionHash: string | null;
    answers: unknown[];
  }>;
  buildAiAnswerRequestPayload: (
    questionNode: Element,
    questionId: string | null,
  ) => Promise<unknown>;
  collectQuestionSummaries: () => Array<{
    questionId: string | null;
    questionType: string | null;
    questionHash: string | null;
    questionText: string;
    answerLabels: string[];
  }>;
  buildReviewSaveRequestPayload: (state: StoredStateLike | undefined) => unknown;
  setSourceAnswerData: (
    questionId: string | null,
    source: keyof SourceAnswerData,
    data: AnswerData,
  ) => void;
  applyAiAnswerForQuestion: (questionNode: Element, state: AiAnswerState) => boolean;
  autoSelectQuestionAnswers: (
    questionNode: Element,
    answerData: SourceAnswerData["reduxshare"],
  ) => boolean;
  mountAnswerWidgets: (accentColor: string) => void;
  createAnswerWidgetHost: (
    accentColor: string,
    questionId: string | null,
    variantCounts: AnswerVariantCounts,
    answerData: SourceAnswerData,
    slotIndex?: number | null,
    isInline?: boolean,
  ) => HTMLElement;
  getAnswerMenuMarkup: (
    answerData: SourceAnswerData,
    aiSettingsSaved: boolean,
    aiAnswerState: AiAnswerState,
    aiToolsEnabled?: boolean,
    externalOnly?: boolean,
    aiExplanationState?: AiAnswerState,
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
