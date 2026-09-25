import {
  CHOICE_QUESTION_TYPES,
  TEXT_INPUT_QUESTION_TYPES,
  type AnswerData,
  type SourceAnswerData,
  type StoredStateLike,
} from "../../model";
import { getPreferredSuggestionLabels } from "../../data/answerData";
import { getAnswerLabelMatchKeys } from "../../dom/questionDom";
import {
  getSupportedAutoSelectQuestionType,
  isSelectableQuestionType,
  isCompoundQuestionType,
  isDragImageOrTextQuestionType,
  isDragMarkerQuestionType,
  isDragTextQuestionType,
  isMatchingQuestionTypeName,
  isOrderingQuestionType,
} from "../../dom/questionTypes";
import { isLoggedInToExtension } from "../../logic/settings";
import { logReduxShareInfo } from "../../logic/runtime";
import { answerWidgetStates, currentStoredState } from "../../state";
import { setAnswerDelayProgress } from "../../ui/answerMenu";
import {
  findInputForAnswerLabel,
  findSelectOptionByLabel,
  getAnswerDataForQuestion,
  getAnswerEntries,
  getChoiceAnswerInputs,
  getChoiceAnswerSlotMatch,
  getExactBooleanChoiceSlotValue,
  getInputAnswerLabelText,
  getQuestionProgressId,
  getAnswerSlotForSelect,
  getSelectableAnswerControls,
  reportSolvedQuestions,
  selectNextSelectOptionByLabel,
  selectTextAnswerByLabel,
  setAnswerInputChecked,
  setSelectValue,
} from "./answerControls";
import { autoSelectDdmarkerAnswers } from "./ddmarker";
import { autoSelectDdwtosAnswers } from "./ddwtos";
import { autoSelectDdimageOrTextAnswers } from "./ddimageortext";
import { autoSelectCompoundAnswers } from "./compound";

import {
  autoSelectOrderingAnswers,
  getOrderingExactOrder,
  splitSequentialAnswerLabels,
} from "./ordering";

const DEFAULT_AUTO_SELECT_AVG_SECONDS = 4;

const AUTO_SELECT_DELAY_SPREAD_MIN = 0.25;
const AUTO_SELECT_DELAY_SPREAD_MAX = 0.55;
const AUTO_SELECT_MIN_DELAY_MS = 1000;
const AUTO_SELECT_MAX_DELAY_MS = 60000;

const AUTO_SELECT_RUSH_TIME_FRACTION = 0.1;
const AUTO_SELECT_PROGRESS_TICK_MS = 100;
const QUIZ_TIME_LEFT_SELECTORS = [
  "#quiz-time-left",
  "[data-region='quiz-timer']",
  ".tertiary-navigation .timer",
  ".quiz-timer",
];

type PendingAutoSelectAnswer = {
  questionId: string | null;
  questionNode: Element;
  timeoutId: number;
  intervalId: number | null;
  hosts: HTMLElement[];
  startedAt: number;
  delayMs: number;
};

const pendingAutoSelectAnswers = new Map<string, PendingAutoSelectAnswer>();
let autoSelectCancelListenerInstalled = false;

function isAutoSelectEnabled(settings: StoredStateLike["settings"] | undefined): boolean {
  return settings?.extensionEnabled !== false && settings?.autoSelect !== false;
}

function isImmediateAutoSelectMode() {
  return Boolean(globalThis.__REDUXSHARE_TEST_MODE__);
}

export function computeAutoSelectDelayMs(
  avgSeconds: number,
  random: () => number = Math.random,
  timeLeftSeconds: number | null = null,
): number {
  const averageSeconds =
    Number.isFinite(avgSeconds) && avgSeconds > 0 ? avgSeconds : DEFAULT_AUTO_SELECT_AVG_SECONDS;
  const baseDelayMs = averageSeconds * 1000;
  const spread =
    AUTO_SELECT_DELAY_SPREAD_MIN +
    (AUTO_SELECT_DELAY_SPREAD_MAX - AUTO_SELECT_DELAY_SPREAD_MIN) * random();
  const variance = (random() * 2 - 1) * spread;
  let delayMs = baseDelayMs * (1 + variance);
  const timeLeft =
    typeof timeLeftSeconds === "number" && Number.isFinite(timeLeftSeconds)
      ? timeLeftSeconds
      : null;

  if (timeLeft !== null && timeLeft > 0) {
    delayMs = Math.min(delayMs, timeLeft * 1000 * AUTO_SELECT_RUSH_TIME_FRACTION);
  }

  return Math.round(
    Math.min(AUTO_SELECT_MAX_DELAY_MS, Math.max(AUTO_SELECT_MIN_DELAY_MS, delayMs)),
  );
}

export function parseQuizTimeLeftSeconds(text: string | null | undefined): number | null {
  if (typeof text !== "string") {
    return null;
  }

  const match = /(\d+):([0-5]?\d)(?::([0-5]?\d))?/.exec(text);

  if (!match) {
    return null;
  }

  const [, first, second, third] = match;
  const firstValue = Number.parseInt(first, 10);
  const secondValue = Number.parseInt(second, 10);

  if (third === undefined) {
    return firstValue * 60 + secondValue;
  }

  return firstValue * 3600 + secondValue * 60 + Number.parseInt(third, 10);
}

function readQuizTimeLeftSeconds(): number | null {
  for (const selector of QUIZ_TIME_LEFT_SELECTORS) {
    const text = document.querySelector(selector)?.textContent;
    const seconds = parseQuizTimeLeftSeconds(text);

    if (seconds !== null) {
      return seconds;
    }
  }

  return null;
}

function getAutoSelectScheduleKey(questionNode: Element, questionId: string | null) {
  return getQuestionProgressId(questionNode, questionId);
}

function getAutoSelectWidgetHosts(questionNode: Element, questionId: string | null) {
  return Array.from(answerWidgetStates.keys()).filter((host) => {
    if (!(host instanceof HTMLElement)) {
      return false;
    }

    const state = answerWidgetStates.get(host);
    return (questionId !== null && state?.questionId === questionId) || questionNode.contains(host);
  });
}

function startAutoSelectProgress(pending: PendingAutoSelectAnswer) {
  const updateProgress = () => {
    const ratio = pending.delayMs > 0 ? (Date.now() - pending.startedAt) / pending.delayMs : 1;

    for (const host of pending.hosts) {
      setAnswerDelayProgress(host, ratio);
    }
  };

  updateProgress();
  pending.intervalId = window.setInterval(() => {
    updateProgress();
  }, AUTO_SELECT_PROGRESS_TICK_MS);
}

function stopAutoSelectProgress(pending: PendingAutoSelectAnswer) {
  if (pending.intervalId !== null) {
    window.clearInterval(pending.intervalId);
    pending.intervalId = null;
  }

  for (const host of pending.hosts) {
    setAnswerDelayProgress(host, null);
  }
}

function dropAutoSelectSchedule(key: string, pending: PendingAutoSelectAnswer) {
  pendingAutoSelectAnswers.delete(key);
  window.clearTimeout(pending.timeoutId);
  stopAutoSelectProgress(pending);
}

function applyAutoSelectAnswer(
  questionNode: Element,
  questionId: string | null,
  answerData: AnswerData,
) {
  if (!autoSelectQuestionAnswers(questionNode, answerData)) {
    return false;
  }

  if (questionNode instanceof HTMLElement) {
    questionNode.dataset.reduxshareAutoSelected = "true";
  }

  logReduxShareInfo("ReduxShare: auto-selected exact answers", 1);
  void reportSolvedQuestions([getQuestionProgressId(questionNode, questionId)]);
  return true;
}

export function scheduleAutoSelectAnswer(
  questionId: string | null,
  questionNode: Element,
  storedState: StoredStateLike | undefined,
  immediate: boolean = isImmediateAutoSelectMode(),
): boolean {
  if (!isAutoSelectEnabled(storedState?.settings)) {
    return false;
  }

  const answerData = getPreferredAutoSelectAnswerDataForQuestion(
    questionNode,
    getAnswerDataForQuestion(questionId),
    isLoggedInToExtension(storedState),
  );

  if (!hasExactAutoSelectData(answerData)) {
    return false;
  }

  if (immediate) {
    cancelAutoSelectSchedule(questionId);
    applyAutoSelectAnswer(questionNode, questionId, answerData);
    return true;
  }

  ensureAutoSelectCancelListener();

  const key = getAutoSelectScheduleKey(questionNode, questionId);

  if (pendingAutoSelectAnswers.has(key)) {
    return true;
  }

  const delayMs = computeAutoSelectDelayMs(
    storedState?.settings?.autoSelectAvgSeconds ?? DEFAULT_AUTO_SELECT_AVG_SECONDS,
    Math.random,
    readQuizTimeLeftSeconds(),
  );
  const pending: PendingAutoSelectAnswer = {
    questionId,
    questionNode,
    timeoutId: 0,
    intervalId: null,
    hosts: getAutoSelectWidgetHosts(questionNode, questionId),
    startedAt: Date.now(),
    delayMs,
  };

  pending.timeoutId = window.setTimeout(() => {
    pendingAutoSelectAnswers.delete(key);
    stopAutoSelectProgress(pending);

    applyAutoSelectAnswer(
      questionNode,
      questionId,
      getPreferredAutoSelectAnswerDataForQuestion(
        questionNode,
        getAnswerDataForQuestion(questionId),
        isLoggedInToExtension(currentStoredState),
      ),
    );
  }, delayMs);
  pendingAutoSelectAnswers.set(key, pending);
  startAutoSelectProgress(pending);
  return true;
}

export function cancelAutoSelectSchedule(questionId: string | null) {
  for (const [key, pending] of Array.from(pendingAutoSelectAnswers)) {
    if (pending.questionId === questionId) {
      dropAutoSelectSchedule(key, pending);
    }
  }
}

export function cancelAllAutoSelectSchedules() {
  for (const [key, pending] of Array.from(pendingAutoSelectAnswers)) {
    dropAutoSelectSchedule(key, pending);
  }
}

function handleAutoSelectUserInput(event: Event) {
  if (pendingAutoSelectAnswers.size === 0) {
    return;
  }

  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  for (const [key, pending] of Array.from(pendingAutoSelectAnswers)) {
    if (pending.questionNode.contains(target)) {
      dropAutoSelectSchedule(key, pending);
    }
  }
}

export function ensureAutoSelectCancelListener() {
  if (autoSelectCancelListenerInstalled) {
    return;
  }

  autoSelectCancelListenerInstalled = true;
  document.addEventListener("input", handleAutoSelectUserInput, true);
  document.addEventListener("change", handleAutoSelectUserInput, true);
}

function selectAnswerByLabel(questionNode: Element, label: string): boolean {
  const input = findInputForAnswerLabel(questionNode, label);

  if (input) {
    return setAnswerInputChecked(input, true);
  }

  if (selectNextSelectOptionByLabel(questionNode, label)) {
    return true;
  }

  return selectTextAnswerByLabel(questionNode, label);
}

function getExactAnswerLabels(answerData: AnswerData): string[] {
  if (answerData.slots.length > 1) {
    const slottedLabels = answerData.slots.flatMap((slot) =>
      getPreferredSuggestionLabels(slot.suggestions),
    );

    if (slottedLabels.length > 0) {
      return Array.from(new Set(slottedLabels));
    }
  }

  return getPreferredSuggestionLabels(answerData.suggestions);
}

function autoSelectChoiceQuestionAnswers(
  questionNode: Element,
  exactAnswerLabels: string[],
): boolean {
  const answerInputs = getChoiceAnswerInputs(questionNode);

  if (answerInputs.length === 0) {
    return false;
  }

  if (answerInputs.some((input) => input.type === "checkbox")) {
    const exactAnswerKeys = new Set(
      exactAnswerLabels.flatMap((label) => [...getAnswerLabelMatchKeys(label)]),
    );
    let changed = false;

    for (const input of answerInputs.filter((answerInput) => answerInput.type === "checkbox")) {
      const containerKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));
      const shouldCheck = [...containerKeys].some((key) => exactAnswerKeys.has(key));
      changed = setAnswerInputChecked(input, shouldCheck) || changed;
    }

    return changed;
  }

  for (const label of exactAnswerLabels) {
    const input = findInputForAnswerLabel(questionNode, label);

    if (input) {
      return setAnswerInputChecked(input, true);
    }
  }

  return false;
}

function autoSelectBooleanChoiceQuestionAnswers(
  questionNode: Element,
  answerData: AnswerData,
): {
  hasBooleanData: boolean;
  changed: boolean;
} {
  const answerInputs = getChoiceAnswerInputs(questionNode);

  if (answerInputs.length === 0) {
    return { hasBooleanData: false, changed: false };
  }

  const checkboxInputs = answerInputs.filter((input) => input.type === "checkbox");

  if (checkboxInputs.length === 0) {
    return { hasBooleanData: false, changed: false };
  }

  let hasBooleanData = false;
  let changed = false;

  for (const input of checkboxInputs) {
    const label = getInputAnswerLabelText(questionNode, input);
    const { slot } = getChoiceAnswerSlotMatch(answerData, input, label);
    const booleanChoiceValue = getExactBooleanChoiceSlotValue(slot);

    if (booleanChoiceValue === null) {
      continue;
    }

    hasBooleanData = true;
    changed = setAnswerInputChecked(input, booleanChoiceValue) || changed;
  }

  return { hasBooleanData, changed };
}

function autoSelectQuestionAnswers(questionNode: Element, answerData: AnswerData): boolean {
  const questionType = getSupportedAutoSelectQuestionType(questionNode);

  if (!questionType) {
    return false;
  }

  if (
    questionType === "gapselect" ||
    questionType === "gapfill" ||
    isMatchingQuestionTypeName(questionType)
  ) {
    return autoSelectGapSelectAnswers(questionNode, answerData);
  }

  if (questionType === "ordering") {
    return autoSelectOrderingAnswers(questionNode, answerData);
  }

  if (questionType === "ddwtos") {
    return autoSelectDdwtosAnswers(questionNode, answerData);
  }

  if (questionType === "ddmarker") {
    return autoSelectDdmarkerAnswers(questionNode, answerData);
  }

  if (questionType === "ddimageortext") {
    return autoSelectDdimageOrTextAnswers(questionNode, answerData);
  }

  if (questionType === "multianswer") {
    return autoSelectCompoundAnswers(questionNode, answerData);
  }

  if (CHOICE_QUESTION_TYPES.has(questionType)) {
    const booleanChoiceResult = autoSelectBooleanChoiceQuestionAnswers(questionNode, answerData);

    if (booleanChoiceResult.hasBooleanData) {
      return booleanChoiceResult.changed;
    }
  }

  const exactAnswerLabels = getExactAnswerLabels(answerData);

  if (CHOICE_QUESTION_TYPES.has(questionType)) {
    return exactAnswerLabels.length > 0
      ? autoSelectChoiceQuestionAnswers(questionNode, exactAnswerLabels)
      : false;
  }

  if (TEXT_INPUT_QUESTION_TYPES.has(questionType)) {
    return exactAnswerLabels.length === 1
      ? selectTextAnswerByLabel(questionNode, exactAnswerLabels[0])
      : false;
  }

  return false;
}

function autoSelectExactAnswers(storedState: StoredStateLike | undefined): void {
  if (!isAutoSelectEnabled(storedState?.settings)) {
    cancelAllAutoSelectSchedules();
    return;
  }

  if (!isImmediateAutoSelectMode()) {
    for (const { questionId, questionNode } of getAnswerEntries()) {
      if (questionNode) {
        scheduleAutoSelectAnswer(questionId, questionNode, storedState, false);
      }
    }

    return;
  }

  const changedQuestionIds: string[] = [];
  const allowReduxShareSource = isLoggedInToExtension(storedState);

  for (const { questionId, questionNode } of getAnswerEntries()) {
    if (!questionNode) {
      continue;
    }

    if (
      autoSelectQuestionAnswers(
        questionNode,
        getPreferredAutoSelectAnswerDataForQuestion(
          questionNode,
          getAnswerDataForQuestion(questionId),
          allowReduxShareSource,
        ),
      )
    ) {
      if (questionNode instanceof HTMLElement) {
        questionNode.dataset.reduxshareAutoSelected = "true";
      }

      changedQuestionIds.push(getQuestionProgressId(questionNode, questionId));
    }
  }

  if (changedQuestionIds.length > 0) {
    logReduxShareInfo("ReduxShare: auto-selected exact answers", changedQuestionIds.length);
    void reportSolvedQuestions(changedQuestionIds);
  }
}

function getPreferredAutoSelectAnswerData(
  answerData: SourceAnswerData,
  allowReduxShareSource = true,
): AnswerData {
  if (!allowReduxShareSource) {
    return answerData.external;
  }

  return getExactAnswerLabels(answerData.reduxshare).length > 0
    ? answerData.reduxshare
    : answerData.external;
}

function hasExactAutoSelectData(answerData: AnswerData): boolean {
  return getExactAnswerLabels(answerData).length > 0;
}

function getPreferredAutoSelectAnswerDataForQuestion(
  questionNode: Element,
  answerData: SourceAnswerData,
  allowReduxShareSource = true,
): AnswerData {
  if (!allowReduxShareSource) {
    return answerData.external;
  }

  if (isOrderingQuestionType(questionNode)) {
    return getOrderingExactOrder(answerData.reduxshare, questionNode).length > 0
      ? answerData.reduxshare
      : answerData.external;
  }

  if (
    isDragTextQuestionType(questionNode) ||
    isCompoundQuestionType(questionNode) ||
    isDragImageOrTextQuestionType(questionNode) ||
    isDragMarkerQuestionType(questionNode)
  ) {
    return hasExactAutoSelectData(answerData.reduxshare)
      ? answerData.reduxshare
      : answerData.external;
  }

  return getPreferredAutoSelectAnswerData(answerData, allowReduxShareSource);
}

function autoSelectGapSelectAnswers(questionNode: Element, answerData: AnswerData): boolean {
  if (!isSelectableQuestionType(questionNode)) {
    return false;
  }

  const selects = getSelectableAnswerControls(questionNode);
  let changed = false;

  for (const select of selects) {
    const slot = getAnswerSlotForSelect(answerData, select);
    const slotLabels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (slotLabels.length !== 1) {
      continue;
    }

    const option = findSelectOptionByLabel(select, slotLabels[0]);

    if (option) {
      changed = setSelectValue(select, option.value) || changed;
    }
  }

  if (changed || answerData.slots.length > 0) {
    return changed;
  }

  const sequentialLabels = splitSequentialAnswerLabels(
    getPreferredSuggestionLabels(answerData.suggestions),
    selects.length,
  );

  if (selects.length === 0 || sequentialLabels.length !== selects.length) {
    return false;
  }

  selects.forEach((select, index) => {
    const option = findSelectOptionByLabel(select, sequentialLabels[index]);

    if (option) {
      changed = setSelectValue(select, option.value) || changed;
    }
  });

  return changed;
}

export {
  autoSelectBooleanChoiceQuestionAnswers,
  autoSelectChoiceQuestionAnswers,
  autoSelectExactAnswers,
  autoSelectGapSelectAnswers,
  autoSelectQuestionAnswers,
  getExactAnswerLabels,
  getPreferredAutoSelectAnswerData,
  getPreferredAutoSelectAnswerDataForQuestion,
  hasExactAutoSelectData,
  isAutoSelectEnabled,
  selectAnswerByLabel,
};
