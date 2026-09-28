import { SAVE_USER_ANSWER_MESSAGE } from "../../shared/messages";
import { SELECTION_SAVES_STORAGE_KEY } from "../../shared/storageKeys";
import {
  SUPPORTED_REVIEW_QUESTION_TYPES,
  type AnswerData,
  type ReviewObservation,
  type SaveReviewAnswersResponse,
  type SourceAnswerData,
} from "../../model";
import type {
  SaveUserAnswerPayload,
  SelectionVerdict,
  UserAnswerSelectionAnswer,
} from "../../lib/quizTasks";
import { getQuestionId } from "../../dom/questionIdentity";
import { getQuestionText, labelsMatch } from "../../dom/questionDom";
import { getSecondQuestionClass } from "../../dom/questionTypes";
import { findMoodleConfig } from "../../moodleContext";
import { canUseQuizFeatures } from "../../logic/settings";
import { loadStoredState, logReduxShareWarning } from "../../logic/runtime";
import { getPreferredSuggestionLabels } from "../../data/answerData";
import {
  getAnswerDataForQuestion,
  getAnswerSlotByIndex,
  getQuestionAnswerLabels,
  getQuestionHash,
} from "./answerControls";
import {
  createReviewAnswerKey,
  getQuizReviewUrlIdentity,
  getReviewSelectedObservations,
} from "./review";

export interface TrackedSelectionEntry {
  answerKey: string;
  slotKey: string;
  slotIndex: number | null;
  label: string;
  verdict: SelectionVerdict;
}

export interface TrackedAttemptSelections {
  updatedAt: string;
  questions: Record<string, TrackedSelectionEntry[]>;
}

type SelectionSavesStore = Record<string, TrackedAttemptSelections>;

const MAX_TRACKED_ATTEMPTS = 20;
const SELECTION_FLUSH_DELAY_MS = 250;
const SELECTION_SEND_RETRY_DELAYS_MS = [1000, 3000];

const pendingSelectionFlushTimers = new Map<Element, number>();
let selectionListenerInstalled = false;

export function ensureUserAnswerSelectionListener() {
  if (selectionListenerInstalled || typeof document === "undefined") {
    return;
  }

  selectionListenerInstalled = true;
  document.addEventListener("change", handleSelectionChangeEvent, true);
}

function handleSelectionChangeEvent(event: Event) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const questionNode = event.target.closest(".que");

  if (!questionNode) {
    return;
  }

  const existingTimer = pendingSelectionFlushTimers.get(questionNode);

  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }

  const timerId = window.setTimeout(() => {
    pendingSelectionFlushTimers.delete(questionNode);
    void flushQuestionSelections(questionNode);
  }, SELECTION_FLUSH_DELAY_MS);

  pendingSelectionFlushTimers.set(questionNode, timerId);
}

// Один document-level change-слушатель покрывает и ручные клики, и установки
// расширения: setAnswerInputChecked/setSelectValue сами диспатчат bubbling
// change. Повторные события того же ответа отсекает трекинг.
export async function flushQuestionSelections(questionNode: Element) {
  try {
    const storedState = await loadStoredState();

    if (!canUseQuizFeatures(storedState)) {
      return;
    }

    const questionType = getSecondQuestionClass(questionNode);

    if (!questionType || !SUPPORTED_REVIEW_QUESTION_TYPES.has(questionType)) {
      return;
    }

    const questionId = getQuestionId(questionNode);
    const questionHash = getQuestionHash(questionNode, questionType);

    if (!questionId || !questionHash) {
      return;
    }

    const observations: ReviewObservation[] = getReviewSelectedObservations(questionNode);

    if (observations.length === 0) {
      return;
    }

    const moodleConfig = findMoodleConfig();
    const fallbackContext = storedState.latestQuizAttemptContext;
    const courseId = moodleConfig?.courseId ?? fallbackContext?.courseId ?? null;
    const quizId = moodleConfig?.contextInstanceId ?? fallbackContext?.contextInstanceId ?? null;

    if (courseId === null || quizId === null) {
      return;
    }

    const attemptKey = getQuizReviewUrlIdentity(window.location.href).attemptKey;
    const answerData = getAnswerDataForQuestion(questionId);
    const candidates: TrackedSelectionEntry[] = [];

    for (const observation of observations) {
      const answerKey = createReviewAnswerKey(observation.label);

      if (!answerKey) {
        continue;
      }

      candidates.push({
        answerKey,
        slotKey: observation.slotKey,
        slotIndex: observation.slotIndex,
        label: observation.label,
        verdict: resolveSelectionVerdict(answerData, observation),
      });
    }

    if (candidates.length === 0) {
      return;
    }

    const freshEntries = await trackSelectionEntries(attemptKey, questionId, candidates);

    if (freshEntries.length === 0) {
      return;
    }

    const answers: UserAnswerSelectionAnswer[] = freshEntries.map((entry) => ({
      label: entry.label,
      answerKey: entry.answerKey,
      slotKey: entry.slotKey,
      slotIndex: entry.slotIndex,
      verdict: entry.verdict,
    }));

    await sendUserAnswerSelection({
      domain: window.location.hostname,
      courseId,
      quizId,
      attemptKey,
      pageUrl: window.location.href,
      question: {
        questionId,
        questionType,
        questionHash,
        questionText: getQuestionText(questionNode),
        answerOptions: getQuestionAnswerLabels(questionNode),
        answers,
      },
    });
  } catch (error) {
    logReduxShareWarning("ReduxShare: user answer selection save failed", error);
  }
}

function getPreferredSelectionSource(answerData: SourceAnswerData): AnswerData {
  return getPreferredSuggestionLabels(answerData.reduxshare.suggestions).length > 0
    ? answerData.reduxshare
    : answerData.external;
}

function getExactLabelsForObservation(source: AnswerData, observation: ReviewObservation) {
  if (observation.slotIndex !== null) {
    const slot = getAnswerSlotByIndex(source, observation.slotIndex);

    if (slot) {
      return getPreferredSuggestionLabels(slot.suggestions);
    }
  }

  return getPreferredSuggestionLabels(source.suggestions);
}

export function resolveSelectionVerdict(
  answerData: SourceAnswerData | null | undefined,
  observation: ReviewObservation,
): SelectionVerdict {
  if (!answerData) {
    return "unknown";
  }

  const exactLabels = getExactLabelsForObservation(
    getPreferredSelectionSource(answerData),
    observation,
  );

  if (exactLabels.length === 0) {
    return "unknown";
  }

  return exactLabels.some((label) => labelsMatch(label, observation.label))
    ? "correct"
    : "incorrect";
}

async function loadSelectionSavesStore(): Promise<SelectionSavesStore> {
  const result = await chrome.storage.local.get(SELECTION_SAVES_STORAGE_KEY);
  const value = result[SELECTION_SAVES_STORAGE_KEY];

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SelectionSavesStore)
    : {};
}

export async function loadSelectionSavesForAttempt(
  attemptKey: string,
): Promise<TrackedAttemptSelections | null> {
  const store = await loadSelectionSavesStore();
  const entry = store[attemptKey];

  return entry && typeof entry === "object" && entry.questions ? entry : null;
}

export async function clearSelectionSavesForAttempt(attemptKey: string) {
  const store = await loadSelectionSavesStore();

  if (!store[attemptKey]) {
    return;
  }

  delete store[attemptKey];
  await chrome.storage.local.set({ [SELECTION_SAVES_STORAGE_KEY]: store });
}

// Трекинг пишется оптимистично до отправки: потерянный ack при доставленной
// записи не должен привести к двойному учёту на review-переносе. Выбор,
// который так и не долёт до БД, безопасно съедается клампом переносимых дельт.
async function trackSelectionEntries(
  attemptKey: string,
  questionId: string,
  candidates: TrackedSelectionEntry[],
): Promise<TrackedSelectionEntry[]> {
  const store = await loadSelectionSavesStore();
  const existing = store[attemptKey]?.questions?.[questionId] ?? [];
  const seen = new Set(existing.map((entry) => `${entry.slotKey}|${entry.answerKey}`));
  const fresh = candidates.filter((entry) => !seen.has(`${entry.slotKey}|${entry.answerKey}`));

  if (fresh.length === 0) {
    return [];
  }

  store[attemptKey] = {
    updatedAt: new Date().toISOString(),
    questions: {
      ...(store[attemptKey]?.questions ?? {}),
      [questionId]: [...existing, ...fresh],
    },
  };

  const capped = Object.entries(store)
    .sort((left, right) => Date.parse(right[1].updatedAt) - Date.parse(left[1].updatedAt))
    .slice(0, MAX_TRACKED_ATTEMPTS);

  await chrome.storage.local.set({ [SELECTION_SAVES_STORAGE_KEY]: Object.fromEntries(capped) });

  return fresh;
}

async function sendUserAnswerSelection(payload: SaveUserAnswerPayload) {
  for (let attempt = 0; attempt <= SELECTION_SEND_RETRY_DELAYS_MS.length; attempt += 1) {
    if (await sendUserAnswerSelectionOnce(payload)) {
      return;
    }

    if (attempt < SELECTION_SEND_RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, SELECTION_SEND_RETRY_DELAYS_MS[attempt]);
      });
    }
  }

  logReduxShareWarning("ReduxShare: user answer selection save dropped after retries");
}

function sendUserAnswerSelectionOnce(payload: SaveUserAnswerPayload) {
  return new Promise<boolean>((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: SAVE_USER_ANSWER_MESSAGE, payload }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
          return;
        }

        resolve((response as SaveReviewAnswersResponse | undefined)?.ok === true);
      });
    } catch {
      resolve(false);
    }
  });
}

export function resetSelectionSavesForTests() {
  selectionListenerInstalled = false;
  pendingSelectionFlushTimers.clear();
}
