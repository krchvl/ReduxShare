import { getContentTranslator, type TranslateFn } from "./i18n/contentI18n";
import type {
  AiAnswerState,
  AnswerVariantCounts,
  AnswerWidgetState,
  QuizAttemptContext,
  SourceAnswerData,
  StoredStateLike,
} from "./model";

export let currentT: TranslateFn = getContentTranslator(undefined);
export let currentStoredState: StoredStateLike | undefined;
export let currentQuizAttemptContext: QuizAttemptContext | null = null;
export let stealthModeEnabled = true;
export let answerWidgetsVisible = true;
export let activeCloseAnswerWidgetMenu: (() => void) | null = null;

export const answerWidgetCleanups = new Map<HTMLElement, () => void>();
export const answerWidgetStates = new Map<HTMLElement, AnswerWidgetState>();
export const variantCountsByQuestionId = new Map<string, AnswerVariantCounts>();
export const answerDataByQuestionId = new Map<string, SourceAnswerData>();
export const aiAnswerStatesByQuestionKey = new Map<string, AiAnswerState>();

export function setCurrentT(value: TranslateFn) {
  currentT = value;
}

export function setCurrentStoredState(value: StoredStateLike | undefined) {
  currentStoredState = value;
}

export function setCurrentQuizAttemptContext(value: QuizAttemptContext | null) {
  currentQuizAttemptContext = value;
}

export function setStealthModeEnabled(value: boolean) {
  stealthModeEnabled = value;
}

export function setAnswerWidgetsVisible(value: boolean) {
  answerWidgetsVisible = value;
}

export function setActiveCloseAnswerWidgetMenu(value: (() => void) | null) {
  activeCloseAnswerWidgetMenu = value;
}
