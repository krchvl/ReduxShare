import type {
  AiAnswerState,
  AnswerData,
  AnswerVariantCounts,
  EssayExampleEntry,
  SourceAnswerData,
  StoredStateLike,
} from "../../src/model";
import type { AutoPassSession } from "../../src/lib/autoPassSession";

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
  buildReviewSaveRequestPayload: (
    state: StoredStateLike | undefined,
    trackedAttempt?: {
      updatedAt: string;
      questions: Record<
        string,
        Array<{
          answerKey: string;
          slotKey: string;
          slotIndex: number | null;
          label: string;
          verdict: "correct" | "incorrect" | "unknown";
        }>
      >;
    } | null,
  ) => unknown;
  flushQuestionSelections: (questionNode: Element) => Promise<void>;
  resolveSelectionVerdict: (
    answerData: SourceAnswerData | null | undefined,
    observation: { label: string; slotKey: string; slotIndex: number | null },
  ) => "correct" | "incorrect" | "unknown";
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
  applyAllExactAnswersNow: (state: StoredStateLike | undefined) => {
    applied: number;
    total: number;
  };
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
    essayMenu?: { examples: EssayExampleEntry[]; canSave: boolean },
  ) => string;
  createEmptySourceAnswerData: () => SourceAnswerData;
  createEmptyVariantCounts: () => AnswerVariantCounts;
  applyAutoPassStorageChanges: (
    changes: Record<string, { newValue?: unknown } | undefined>,
  ) => void;
  continueAutoPass: () => Promise<void>;
  ensureAutoPassStartButton: () => boolean;
  getAutoPassSessionState: () => AutoPassSession | null;
  handleAutoPassSummaryPage: () => Promise<void>;
  navigateToNextPage: () => void;
  resetAutoPassState: () => void;
  resumeAutoPassOnAttemptPage: () => Promise<void>;
  runAutoPassOnConfirmationPage: () => Promise<void>;
  runAutoPassPage: () => Promise<void>;
  startAutoPassForCurrentAttempt: () => Promise<void>;
  startAutoPassFromViewPage: () => Promise<void>;
  stopAutoPass: () => Promise<void>;
  watchAutoPassStartButtonMount: () => void;
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
