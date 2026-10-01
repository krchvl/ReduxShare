import {
  CHOICE_QUESTION_TYPES,
  TEXT_INPUT_QUESTION_TYPES,
  type AnswerData,
  type SourceAnswerData,
  type StoredStateLike,
} from "../../model";
import { DEFAULT_SETTINGS } from "../../types";
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
  getEssayAnswerTextareas,
  getExactBooleanChoiceSlotValue,
  getInputAnswerLabelText,
  getQuestionProgressId,
  getAnswerSlotForSelect,
  getSelectableAnswerControls,
  getTextAnswerInputs,
  reportSolvedQuestions,
  selectNextSelectOptionByLabel,
  selectTextAnswerByLabel,
  setAnswerInputChecked,
  setSelectValue,
} from "./answerControls";
import { typeTextHumanLike } from "./textControls";
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

const HUMAN_DELAY_SIGMA = 0.55;
const AUTO_SELECT_MIN_DELAY_MS = 1000;
const AUTO_SELECT_MAX_DELAY_MS = 60000;

const AUTO_SELECT_RUSH_TIME_FRACTION = 0.1;

const READING_CHARS_PER_SECOND = 16;
const READING_SECONDS_PER_OPTION = 1.2;
const READING_MAX_SECONDS = 45;
const PAGE_READ_BONUS_SECONDS = 6;
const INTERACTIVE_MIN_GAP_MS = 5000;

const STEP_PER_ACTION_BEHAVIOURS = new Set([
  "interactive",
  "adaptive",
  "adaptiveno",
  "immediatefeedback",
]);
const PAGE_LEVEL_BEHAVIOURS = new Set(["deferredfeedback", "deferredcbm"]);
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
let autoSelectVisibilityListenerInstalled = false;
let autoSelectHiddenSince: number | null = null;
let autoSelectScheduledTotal = 0;

const HUMAN_SCROLL_SETTLE_MIN_MS = 180;
const HUMAN_SCROLL_SETTLE_MAX_MS = 400;
const HUMAN_HOVER_MIN_MS = 120;
const HUMAN_HOVER_MAX_MS = 300;
const HIDDEN_RESCHEDULE_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shiftPendingSchedulesBy(hiddenMs: number): void {
  if (hiddenMs <= 0) {
    return;
  }

  for (const pending of pendingAutoSelectAnswers.values()) {
    pending.startedAt += hiddenMs;
  }
}

function handleAutoSelectVisibilityChange(): void {
  if (document.hidden) {
    autoSelectHiddenSince ??= Date.now();
    return;
  }

  if (autoSelectHiddenSince !== null) {
    shiftPendingSchedulesBy(Date.now() - autoSelectHiddenSince);
    autoSelectHiddenSince = null;
  }
}

function ensureAutoSelectVisibilityListener(): void {
  if (autoSelectVisibilityListenerInstalled || typeof document === "undefined") {
    return;
  }

  autoSelectVisibilityListenerInstalled = true;
  document.addEventListener("visibilitychange", handleAutoSelectVisibilityChange);
}

export async function runHumanPrecursors(
  target: Element,
  random: () => number = Math.random,
): Promise<void> {
  const element = target instanceof HTMLElement ? target : target.parentElement;

  if (!(element instanceof HTMLElement)) {
    return;
  }

  try {
    if (typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch {}

  await sleep(
    HUMAN_SCROLL_SETTLE_MIN_MS +
      random() * (HUMAN_SCROLL_SETTLE_MAX_MS - HUMAN_SCROLL_SETTLE_MIN_MS),
  );

  try {
    if (typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }
  } catch {}

  await sleep(HUMAN_HOVER_MIN_MS + random() * (HUMAN_HOVER_MAX_MS - HUMAN_HOVER_MIN_MS));
}

function isAutoSelectEnabled(settings: StoredStateLike["settings"] | undefined): boolean {
  return settings?.extensionEnabled !== false && settings?.autoSelect !== false;
}

function isImmediateAutoSelectMode() {
  return Boolean(globalThis.__REDUXSHARE_TEST_MODE__);
}

export interface HumanDelayExtras {
  readingSeconds?: number;
  firstInPage?: boolean;
  interactive?: boolean;
}

function randomNormal(random: () => number): number {
  const uniform1 = Math.max(random(), Number.EPSILON);
  const uniform2 = random();
  return Math.sqrt(-2 * Math.log(uniform1)) * Math.cos(2 * Math.PI * uniform2);
}

function humanDelayMultiplier(random: () => number): number {
  const mean = (-HUMAN_DELAY_SIGMA * HUMAN_DELAY_SIGMA) / 2;
  return Math.exp(mean + HUMAN_DELAY_SIGMA * randomNormal(random));
}

export function computeAutoSelectDelayMs(
  avgSeconds: number,
  random: () => number = Math.random,
  timeLeftSeconds: number | null = null,
  extras: HumanDelayExtras = {},
): number {
  const averageSeconds =
    Number.isFinite(avgSeconds) && avgSeconds > 0 ? avgSeconds : DEFAULT_AUTO_SELECT_AVG_SECONDS;
  const baseDelayMs = averageSeconds * 1000;
  let delayMs = baseDelayMs * humanDelayMultiplier(random);

  const readingMs =
    Math.max(0, extras.readingSeconds ?? 0) * 1000 +
    (extras.firstInPage ? PAGE_READ_BONUS_SECONDS * 1000 : 0);
  delayMs += readingMs;

  if (extras.interactive) {
    delayMs = Math.max(delayMs, INTERACTIVE_MIN_GAP_MS * (0.8 + 0.4 * random()));
  }

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

export function estimateQuestionReadingSeconds(questionNode: Element): number {
  const questionText =
    questionNode.querySelector(".qtext")?.textContent ?? questionNode.textContent ?? "";
  const optionCount = questionNode.querySelectorAll(
    "input[type=radio], input[type=checkbox], select, input[type=text], textarea",
  ).length;
  const seconds =
    questionText.length / READING_CHARS_PER_SECOND + optionCount * READING_SECONDS_PER_OPTION;
  return Math.min(READING_MAX_SECONDS, Math.max(0, seconds));
}

export function getQuestionBehaviour(questionNode: Element): string | null {
  for (const className of Array.from(questionNode.classList)) {
    const name = className.toLowerCase();

    if (STEP_PER_ACTION_BEHAVIOURS.has(name) || PAGE_LEVEL_BEHAVIOURS.has(name)) {
      return name;
    }
  }

  return null;
}

export function isStepPerActionBehaviour(behaviour: string | null): boolean {
  return behaviour !== null && STEP_PER_ACTION_BEHAVIOURS.has(behaviour);
}

export function shuffleScheduleOrder<T>(entries: T[], random: () => number = Math.random): T[] {
  const order = [...entries];

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }

  return order;
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
    if (document.hidden) {
      return;
    }

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

async function applyTextAnswerHumanLike(
  questionNode: Element,
  questionId: string | null,
  answerData: AnswerData,
  settings: StoredStateLike["settings"] | undefined,
): Promise<boolean> {
  if (!(settings?.humanTyping ?? DEFAULT_SETTINGS.humanTyping)) {
    return false;
  }

  const questionType = getSupportedAutoSelectQuestionType(questionNode);

  if (!questionType || !TEXT_INPUT_QUESTION_TYPES.has(questionType)) {
    return false;
  }

  const exactAnswerLabels = getExactAnswerLabels(answerData);

  if (exactAnswerLabels.length !== 1) {
    return false;
  }

  const control =
    getTextAnswerInputs(questionNode)[0] ?? getEssayAnswerTextareas(questionNode)[0] ?? null;

  if (!control) {
    return false;
  }

  if (control instanceof HTMLTextAreaElement && control.dataset.fieldtype === "editor") {
    return false;
  }

  const changed = await typeTextHumanLike(control, exactAnswerLabels[0]);

  if (!changed) {
    return false;
  }

  if (questionNode instanceof HTMLElement) {
    questionNode.dataset.reduxshareAutoSelected = "true";
  }

  logReduxShareInfo("ReduxShare: auto-selected exact answers", 1);
  void reportSolvedQuestions([getQuestionProgressId(questionNode, questionId)]);
  return true;
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
  ensureAutoSelectVisibilityListener();

  const key = getAutoSelectScheduleKey(questionNode, questionId);

  if (pendingAutoSelectAnswers.has(key)) {
    return true;
  }

  const settings = storedState?.settings;
  const readingEnabled = settings?.humanReading ?? DEFAULT_SETTINGS.humanReading;
  const firstInPage = autoSelectScheduledTotal === 0;
  autoSelectScheduledTotal += 1;
  const delayMs = computeAutoSelectDelayMs(
    settings?.autoSelectAvgSeconds ?? DEFAULT_AUTO_SELECT_AVG_SECONDS,
    Math.random,
    readQuizTimeLeftSeconds(),
    {
      readingSeconds: readingEnabled ? estimateQuestionReadingSeconds(questionNode) : 0,
      firstInPage: readingEnabled && firstInPage,
      interactive: isStepPerActionBehaviour(getQuestionBehaviour(questionNode)),
    },
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
  const firePendingAnswer = async () => {
    if (document.hidden) {
      pending.timeoutId = window.setTimeout(() => {
        void firePendingAnswer();
      }, HIDDEN_RESCHEDULE_MS);
      return;
    }

    if (settings?.humanPrecursors ?? DEFAULT_SETTINGS.humanPrecursors) {
      await runHumanPrecursors(questionNode);
    }

    const freshAnswerData = getPreferredAutoSelectAnswerDataForQuestion(
      questionNode,
      getAnswerDataForQuestion(questionId),
      isLoggedInToExtension(currentStoredState),
    );

    if (await applyTextAnswerHumanLike(questionNode, questionId, freshAnswerData, settings)) {
      pendingAutoSelectAnswers.delete(key);
      stopAutoSelectProgress(pending);
      return;
    }

    pendingAutoSelectAnswers.delete(key);
    stopAutoSelectProgress(pending);

    applyAutoSelectAnswer(questionNode, questionId, freshAnswerData);
  };
  pending.timeoutId = window.setTimeout(() => {
    void firePendingAnswer();
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

export function countPendingAutoSelectSchedules(): number {
  return pendingAutoSelectAnswers.size;
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
    const entries = getAnswerEntries().filter((entry) => entry.questionNode);
    const ordered =
      (storedState?.settings?.humanOrder ?? DEFAULT_SETTINGS.humanOrder)
        ? shuffleScheduleOrder(entries)
        : entries;

    for (const { questionId, questionNode } of ordered) {
      if (questionNode) {
        scheduleAutoSelectAnswer(questionId, questionNode, storedState, false);
      }
    }

    return;
  }

  applyAllExactAnswersNow(storedState);
}

export type ApplyAllExactAnswersResult = {
  applied: number;
  total: number;
};

export function applyAllExactAnswersNow(
  storedState: StoredStateLike | undefined,
): ApplyAllExactAnswersResult {
  cancelAllAutoSelectSchedules();

  const allowReduxShareSource = isLoggedInToExtension(storedState);
  const changedQuestionIds: string[] = [];
  let total = 0;

  for (const { questionId, questionNode } of getAnswerEntries()) {
    if (!questionNode) {
      continue;
    }

    const answerData = getPreferredAutoSelectAnswerDataForQuestion(
      questionNode,
      getAnswerDataForQuestion(questionId),
      allowReduxShareSource,
    );

    if (!hasExactAutoSelectData(answerData)) {
      continue;
    }

    total += 1;

    if (autoSelectQuestionAnswers(questionNode, answerData)) {
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

  return { applied: changedQuestionIds.length, total };
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
