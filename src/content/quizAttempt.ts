import {
  ANSWER_MENU_PORTAL_ATTR,
  ANSWER_WIDGET_ATTR,
  CHOICE_QUESTION_TYPES,
  DEFAULT_HOTKEY,
  DEFAULT_HOTKEY_CODE,
  MAX_METADATA_WAIT_MS,
  METADATA_POLL_MS,
  SUPPORTED_WIDGET_QUESTION_TYPES,
  type AiAnswerState,
  type AnswerEntry,
  type AnswerVariantCounts,
  type QuizAnswersResponse,
  type QuizAttemptContext,
  type QuizQuestionSummary,
  type SourceAnswerData,
  type StoredStateLike,
  type SuggestionItem,
} from "../model";
import { APP_STORAGE_KEY, QUIZ_CONTEXT_STORAGE_KEY } from "../shared/storageKeys";
import { patchStoredState } from "../lib/storage";
import { FETCH_QUIZ_ANSWERS_MESSAGE } from "../shared/messages";
import {
  hotkeyMatchesEvent,
  isEditableHotkeyTarget,
  normalizeHotkeyCode,
  normalizeHotkeyValue,
} from "./quizAttempt/hotkeys";
import {
  attachAnswerHovercards,
  getAnswerMenuMarkup,
  getAnswerTriggerMarkup,
  isAiSettingsSaved,
  renderAiAnswerFlyout,
} from "../ui/answerMenu";
import { attachAnswerMenuBehavior } from "../ui/answerMenuBehavior";
import {
  createEmptySourceAnswerData,
  createEmptyVariantCounts,
  getAnswerData,
  hasAnswerData,
} from "../data/answerData";
import { splitReviewAnswerText } from "../data/reviewText";
import {
  getAnswerLabelMatchKeys,
  getQuestionText,
  getSelectOptionLabel,
  getUniqueTexts,
  isPlaceholderSelectOption,
  labelsMatch,
  normalizeAnswerLabel,
  splitSequentialAnswerLabels,
} from "../dom/questionDom";
import {
  getSecondQuestionClass,
  getSupportedAutoSelectQuestionType,
  isAiDisabledQuestionTypeName,
  isAiOnlyQuestionTypeName,
  isChoiceQuestionType,
  isCompoundQuestionType,
  isDragImageOrTextQuestionType,
  isDragMarkerQuestionType,
  isDragTextQuestionType,
  isMatchingQuestionNode,
  isMatchingQuestionTypeName,
  isOrderingQuestionType,
  isSelectableQuestionType,
  isTextInputQuestionType,
} from "../dom/questionTypes";
import {
  findMoodleAttemptIdFromPage,
  findMoodleConfig,
  findMoodleUserIdFromPage,
} from "../moodleContext";
import { getQuestionId } from "../dom/questionIdentity";
import { setTextAnswerValue } from "./quizAttempt/textControls";
import {
  autoSelectExactAnswers,
  autoSelectGapSelectAnswers,
  autoSelectQuestionAnswers,
  cancelAllAutoSelectSchedules,
  cancelAutoSelectSchedule,
  computeAutoSelectDelayMs,
  ensureAutoSelectCancelListener,
  parseQuizTimeLeftSeconds,
  scheduleAutoSelectAnswer,
  selectAnswerByLabel,
} from "./quizAttempt/autoSelect";
import {
  applyQuizAnswerResults,
  clearReduxShareAnswerData,
  findInputForAnswerLabel,
  findInputForAnswerLabelContainer,
  findSelectOptionByLabel,
  getAnswerControlSlotIndex,
  getAnswerDataForDdimageOrTextDrop,
  getAnswerDataForDdmarkerChoice,
  getAnswerDataForDdwtosDrop,
  getAnswerDataForOrderingItem,
  getAnswerDataForQuestion,
  getAnswerDataForQuestionChoice,
  getAnswerDataForQuestionSelect,
  getAnswerDataForQuestionTextControl,
  getAnswerEntries,
  getAnswerSlotByIndex,
  getAnswerSlotForControl,
  getAnswerSlotForSelect,
  getBooleanChoiceAnswerValue,
  getChoiceAnswerInputs,
  getChoiceAnswerSlotMatch,
  getExactBooleanChoiceSlotValue,
  getQuestionAnswerLabels,
  getQuestionHash,
  getQuestionProgressId,
  getSelectControlLabel,
  getSelectableAnswerControls,
  getTextAnswerInputs,
  getVariantCountsForQuestion,
  hasSourceAnswerData,
  isMultiAnswerMultichoiceQuestion,
  isUnsupportedDragDropQuestionType,
  reportSolvedQuestions,
  selectNextSelectOptionByLabel,
  selectTextAnswerByLabel,
  setAnswerInputChecked,
  setSelectValue,
  setSourceAnswerData,
} from "./quizAttempt/answerControls";
import {
  applyAiAnswerForQuestion,
  buildAiAnswerRequestPayload,
  getAiAnswerState,
  getAiQuestionKey,
  requestAiGeneratedAnswer,
} from "./quizAttempt/aiAnswer";
import { getDdimageOrTextDropForTrigger } from "./quizAttempt/ddimageortext";
import {
  applyAttemptStatusPanelStorageChanges,
  loadAttemptStatusPanelCollapsedState,
  syncAttemptStatusPanelClosedState,
  loadAttemptStatusPanelPositionState,
  removeAttemptStatusPanel,
  renderAttemptStatusPanel,
  resetAttemptStatusPanelState,
  setAttemptStatusPanelClosedInSession,
} from "./quizAttempt/attemptStatusPanel";
import { isQuizAttemptUrl, isQuizSummaryUrl, isQuizViewUrl } from "./quizAttempt/quizUrl";
import { initializeQuizPreviewFeatures, syncQuizPreviewFeatures } from "./quizPreview";
import {
  isExtensionContextValid,
  loadStoredState,
  logReduxShareInfo,
  logReduxShareWarning,
  syncLanguage,
  syncStealthMode,
  waitForFullPageLoad,
} from "../logic/runtime";
import { getDdwtosDrops, getDdwtosDropSlotIndex, setDdwtosDropAnswer } from "./quizAttempt/ddwtos";
import { getDdmarkerChoices, applyDdmarkerExactCoordinateSet } from "./quizAttempt/ddmarker";
import {
  getDdimageOrTextDrops,
  getDdimageOrTextDropSlotIndex,
  setDdimageOrTextDropAnswer,
} from "./quizAttempt/ddimageortext";
import { autoSelectCompoundAnswers } from "./quizAttempt/compound";
import { canUseQuizFeatures, isLoggedInToExtension } from "../logic/settings";
import {
  applyContentColorSchemeToHost,
  getAccentColor,
  getContentColorScheme,
} from "../logic/theme";
import {
  buildReviewAnswersForQuestion,
  buildReviewSaveRequestPayload,
  collectReviewQuestionsForSave,
  getQuizReviewUrlIdentity,
  initializeQuizReviewSave,
  isQuizReviewUrl,
  saveQuizReviewPendingMarker,
  saveQuizReviewSaveDiagnostics,
} from "./quizAttempt/review";
import {
  getDdmarkerChoiceForTrigger,
  getDdmarkerCoordinateLabel,
  getDdmarkerVisualMarker,
  positionDdmarkerAnswerWidgetHost,
  resetDdmarkerAnswerWidgetHostPlacement,
  setDdmarkerChoiceAnswer,
  setDdmarkerVisualMarker,
} from "./quizAttempt/ddmarker";
import { getDdwtosDropForTrigger } from "./quizAttempt/ddwtos";
import {
  getOrderingItemLabel,
  getOrderingItems,
  getOrderingList,
  getOrderingSlotPosition,
  selectOrderingPositionByTrigger,
  syncOrderingResponseInput,
} from "../dom/ordering";

import {
  activeCloseAnswerWidgetMenu,
  aiAnswerStatesByQuestionKey,
  answerDataByQuestionId,
  answerWidgetCleanups,
  answerWidgetStates,
  answerWidgetsVisible,
  currentQuizAttemptContext,
  currentStoredState,
  currentT,
  setActiveCloseAnswerWidgetMenu,
  setAnswerWidgetsVisible as setAnswerWidgetsVisibleState,
  setCurrentQuizAttemptContext,
  setCurrentStoredState,
  variantCountsByQuestionId,
} from "../state";

let storageWatcherInstalled = false;

let pendingPipelineRun = true;
let answerWidgetHotkey = DEFAULT_HOTKEY;
let answerWidgetHotkeyCode = DEFAULT_HOTKEY_CODE;
let answerWidgetHotkeyEnabled = true;
let answerWidgetHotkeyListenerInstalled = false;
const ATTEMPT_STATUS_PANEL_ID = "reduxshare-attempt-status-panel";
declare global {
  var __REDUXSHARE_TEST_MODE__: boolean | undefined;
  var __reduxshareQuizAttemptTestApi:
    | {
        reset: () => void;
        setStoredState: (state: StoredStateLike | undefined) => void;
        getStoredState: () => typeof currentStoredState;
        watchStoredSettingsChanges: typeof watchStoredSettingsChanges;
        syncAttemptStatusPanelClosedState: typeof syncAttemptStatusPanelClosedState;
        setAttemptStatusPanelClosedInSession: typeof setAttemptStatusPanelClosedInSession;
        buildReviewAnswersForQuestion: typeof buildReviewAnswersForQuestion;
        collectReviewQuestionsForSave: typeof collectReviewQuestionsForSave;
        collectQuestionSummaries: typeof collectQuestionSummaries;
        buildReviewSaveRequestPayload: typeof buildReviewSaveRequestPayload;
        setSourceAnswerData: typeof setSourceAnswerData;
        buildAiAnswerRequestPayload: typeof buildAiAnswerRequestPayload;
        applyAiAnswerForQuestion: typeof applyAiAnswerForQuestion;
        autoSelectQuestionAnswers: typeof autoSelectQuestionAnswers;
        mountAnswerWidgets: typeof mountAnswerWidgets;
        createAnswerWidgetHost: typeof createAnswerWidgetHost;
        getAnswerMenuMarkup: typeof getAnswerMenuMarkup;
        computeAutoSelectDelayMs: typeof computeAutoSelectDelayMs;
        parseQuizTimeLeftSeconds: typeof parseQuizTimeLeftSeconds;
        scheduleAutoSelectAnswer: typeof scheduleAutoSelectAnswer;
        cancelAutoSelectSchedule: typeof cancelAutoSelectSchedule;
        createEmptySourceAnswerData: typeof createEmptySourceAnswerData;
        createEmptyVariantCounts: typeof createEmptyVariantCounts;
      }
    | undefined;
}

function isHTMLElement(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

function collectQuestionSummaries(): QuizQuestionSummary[] {
  return Array.from(document.querySelectorAll(".que")).map((questionNode) => {
    const questionType = getSecondQuestionClass(questionNode);

    return {
      questionId: getQuestionId(questionNode),
      questionType,
      questionHash: getQuestionHash(questionNode, questionType),
      questionText: getQuestionText(questionNode),
      answerLabels: getQuestionAnswerLabels(questionNode),
    };
  });
}

function collectQuizAttemptContext(): QuizAttemptContext | null {
  const moodleConfig = findMoodleConfig();
  const questions = collectQuestionSummaries();

  if (!moodleConfig && questions.length === 0) {
    return null;
  }

  return {
    domain: window.location.hostname,
    pageUrl: window.location.href,
    detectedAt: new Date().toISOString(),
    courseId: moodleConfig?.courseId ?? null,
    contextInstanceId: moodleConfig?.contextInstanceId ?? null,
    attemptId: findMoodleAttemptIdFromPage(),
    moodleUserId: findMoodleUserIdFromPage(),
    questionCount: questions.length,
    questions,
  };
}

function createBareQuizAttemptContext(): QuizAttemptContext {
  return {
    domain: window.location.hostname,
    pageUrl: window.location.href,
    detectedAt: new Date().toISOString(),
    courseId: null,
    contextInstanceId: null,
    attemptId: findMoodleAttemptIdFromPage(),
    moodleUserId: findMoodleUserIdFromPage(),
    questionCount: 0,
    questions: [],
  };
}

async function waitForQuizAttemptContext() {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= MAX_METADATA_WAIT_MS) {
    const context = collectQuizAttemptContext();

    if (context) {
      return context;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, METADATA_POLL_MS);
    });
  }

  return null;
}

async function saveQuizAttemptContext(context: QuizAttemptContext) {
  setCurrentQuizAttemptContext(context);
  renderAttemptStatusPanel();

  await patchStoredState({
    latestQuizAttemptContext: context,
    moodleDomain: context.domain,
  });
  await chrome.storage.local.set({
    [QUIZ_CONTEXT_STORAGE_KEY]: context,
  });
}

function closeActiveAnswerWidgetMenu() {
  activeCloseAnswerWidgetMenu?.();
  setActiveCloseAnswerWidgetMenu(null);
}

function setAnswerWidgetsVisible(visible: boolean) {
  setAnswerWidgetsVisibleState(visible);

  if (!visible) {
    closeActiveAnswerWidgetMenu();
  }

  for (const host of answerWidgetCleanups.keys()) {
    host.hidden = !visible;
  }
}

function handleAnswerWidgetHotkey(event: KeyboardEvent) {
  if (
    !answerWidgetHotkeyEnabled ||
    event.defaultPrevented ||
    isEditableHotkeyTarget(event) ||
    !hotkeyMatchesEvent(answerWidgetHotkey, answerWidgetHotkeyCode, event)
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  setAnswerWidgetsVisible(!answerWidgetsVisible);
}

export function syncAnswerWidgetHotkey(storedState: StoredStateLike | undefined) {
  const settings = storedState?.settings;
  answerWidgetHotkey = normalizeHotkeyValue(settings?.hotkey);
  answerWidgetHotkeyCode = normalizeHotkeyCode(settings?.hotkeyCode, settings?.hotkey);
  answerWidgetHotkeyEnabled = canUseQuizFeatures(storedState);

  if (answerWidgetHotkeyListenerInstalled) {
    return;
  }

  answerWidgetHotkeyListenerInstalled = true;
  document.addEventListener("keydown", handleAnswerWidgetHotkey, true);
}

function syncAllFeatures(storedState: StoredStateLike | undefined) {
  syncLanguage(storedState);
  syncStealthMode(storedState);
  syncAnswerWidgetHotkey(storedState);
  syncPageOverlayOpacity(storedState);
}

export type ContentColorScheme = "light" | "dark";

function syncContentColorScheme() {
  const colorScheme = getContentColorScheme();

  for (const host of answerWidgetCleanups.keys()) {
    host.dataset.theme = colorScheme;
  }

  const menuPortal = document.querySelector(`[${ANSWER_MENU_PORTAL_ATTR}="true"]`);

  if (menuPortal instanceof HTMLElement) {
    menuPortal.dataset.theme = colorScheme;
  }

  const statusPanel = document.getElementById(ATTEMPT_STATUS_PANEL_ID);

  if (statusPanel instanceof HTMLElement) {
    statusPanel.dataset.theme = colorScheme;
  }
}

let colorSchemeWatcherInstalled = false;

function installColorSchemeWatcher() {
  if (colorSchemeWatcherInstalled) {
    return;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }

  colorSchemeWatcherInstalled = true;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

  const handleChange = () => {
    if ((currentStoredState?.settings?.colorScheme ?? "system") !== "system") {
      return;
    }

    syncContentColorScheme();
    renderAttemptStatusPanel();
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleChange);
  }
}

function findQuestionNodeForTrigger(trigger: HTMLButtonElement): Element | null {
  const root = trigger.getRootNode();
  if (!(root instanceof ShadowRoot)) return null;
  return root.host.closest(".que");
}

function findQuestionBoundsNodeForTrigger(trigger: HTMLElement): HTMLElement | null {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof HTMLElement)) {
    return null;
  }

  const host = root.host;
  const questionNode = host.closest(".que");

  if (!(questionNode instanceof HTMLElement)) {
    return null;
  }

  const boundsCandidates = [".formulation", ".content", ".ablock", ".answer"];

  for (const selector of boundsCandidates) {
    const candidate = questionNode.querySelector<HTMLElement>(selector);

    if (candidate && candidate.contains(host)) {
      return candidate;
    }
  }

  return questionNode;
}

function getAnswerWidgetHostForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof HTMLElement)) {
    return null;
  }

  return root.host;
}

function findChoiceInputForTrigger(trigger: HTMLButtonElement, questionNode: Element) {
  const host = getAnswerWidgetHostForTrigger(trigger);

  if (!host) {
    return null;
  }

  if (host.getAttribute("data-reduxshare-inline-widget") !== "true") {
    return null;
  }

  const inputId = host.getAttribute("data-reduxshare-choice-input-id");

  if (inputId) {
    const inputById = questionNode.querySelector<HTMLInputElement>(`#${CSS.escape(inputId)}`);

    if (inputById) {
      return inputById;
    }
  }

  const parent = host.parentElement;

  if (!parent) {
    return null;
  }

  const inputFromContainer = findInputForAnswerLabelContainer(questionNode, parent);

  if (inputFromContainer) {
    return inputFromContainer;
  }

  return parent.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
}

function findSelectForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const control = root.host.closest(".control");

  if (!control) {
    return null;
  }

  const select = control.querySelector("select");
  return select instanceof HTMLSelectElement ? select : null;
}

function findTextInputForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const questionNode = root.host.closest(".que");
  const inputId = root.host.getAttribute("data-reduxshare-text-input-id");

  if (inputId && questionNode) {
    const input = questionNode.querySelector<HTMLInputElement>(`#${CSS.escape(inputId)}`);

    if (input && getTextAnswerInputs(questionNode).includes(input)) {
      return input;
    }
  }

  const slotIndex = root.host.getAttribute("data-reduxshare-text-slot");

  if (slotIndex && questionNode) {
    const input = getTextAnswerInputs(questionNode).find((candidate) => {
      return getAnswerControlSlotIndex(candidate) === Number.parseInt(slotIndex, 10);
    });

    if (input) {
      return input;
    }
  }

  return null;
}

function getAnswerSourceKeyForFlyoutOption(option: HTMLElement): keyof SourceAnswerData | null {
  const menuKey =
    option.closest<HTMLElement>(".menu-item[data-answer-menu]")?.dataset.answerMenu ?? "";

  if (menuKey.startsWith("reduxshare-")) {
    return "reduxshare";
  }

  if (menuKey.startsWith("external-")) {
    return "external";
  }

  return null;
}

function selectAnswerByLabelForTrigger(
  trigger: HTMLButtonElement,
  questionNode: Element,
  label: string,
  actionSlotIndex: number | null = null,
  sourceContext?: {
    questionId: string | null;
    sourceKey: keyof SourceAnswerData | null;
  },
) {
  const questionType = getSupportedAutoSelectQuestionType(questionNode);

  if (!questionType) {
    return false;
  }

  if (questionType === "ordering") {
    return selectOrderingPositionByTrigger(trigger, questionNode, label, actionSlotIndex);
  }

  if (questionType === "ddwtos") {
    const drop = getDdwtosDropForTrigger(trigger);
    return drop ? setDdwtosDropAnswer(questionNode, drop, label) : false;
  }

  if (questionType === "ddmarker") {
    const sourceAnswerData = sourceContext?.sourceKey
      ? getAnswerDataForQuestion(sourceContext.questionId)[sourceContext.sourceKey]
      : null;

    if (sourceAnswerData && applyDdmarkerExactCoordinateSet(questionNode, sourceAnswerData)) {
      return true;
    }

    const choiceIndex = getDdmarkerChoiceForTrigger(trigger);
    return choiceIndex === null ? false : setDdmarkerChoiceAnswer(questionNode, choiceIndex, label);
  }

  if (questionType === "ddimageortext") {
    const drop = getDdimageOrTextDropForTrigger(trigger);
    return drop ? setDdimageOrTextDropAnswer(questionNode, drop, label) : false;
  }

  if (questionType === "multianswer") {
    const sourceAnswerData = sourceContext?.sourceKey
      ? getAnswerDataForQuestion(sourceContext.questionId)[sourceContext.sourceKey]
      : null;

    if (sourceAnswerData && autoSelectCompoundAnswers(questionNode, sourceAnswerData)) {
      return true;
    }
  }

  if (CHOICE_QUESTION_TYPES.has(questionType)) {
    const booleanChoiceValue = getBooleanChoiceAnswerValue(label);
    const input =
      booleanChoiceValue === null ? null : findChoiceInputForTrigger(trigger, questionNode);

    if (input && booleanChoiceValue !== null) {
      return booleanChoiceValue || input.type === "checkbox"
        ? setAnswerInputChecked(input, booleanChoiceValue)
        : false;
    }
  }

  const select = findSelectForTrigger(trigger);

  if (select) {
    const option = findSelectOptionByLabel(select, label);

    if (option) {
      return setSelectValue(select, option.value);
    }
  }

  const textInput = findTextInputForTrigger(trigger);

  if (textInput) {
    return setTextAnswerValue(textInput, label);
  }

  return selectAnswerByLabel(questionNode, label);
}

function getPreferredSuggestionLabels(suggestions: SuggestionItem[]) {
  const exactSuggestionLabels = suggestions
    .filter((suggestion) => suggestion.correctness === 2 && suggestion.label.trim())
    .map((suggestion) => suggestion.label.trim());

  return Array.from(new Set(exactSuggestionLabels));
}

function positionAnswerMenuPortal(menuPortal: HTMLElement, trigger: HTMLElement) {
  const triggerRect = trigger.getBoundingClientRect();
  const shadowRoot = menuPortal.shadowRoot;
  const menu = shadowRoot?.querySelector<HTMLElement>(".menu");
  const flyout = shadowRoot?.querySelector<HTMLElement>(".flyout");
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const margin = viewportWidth <= 640 ? 12 : 16;
  const gap = 8;
  const menuRect = menu?.getBoundingClientRect();
  const flyoutRect = flyout?.getBoundingClientRect();
  const menuWidth = Math.max(
    1,
    Math.round(menuRect?.width ?? menu?.offsetWidth ?? (viewportWidth <= 640 ? 304 : 348)),
  );
  const menuHeight = Math.max(1, Math.round(menuRect?.height ?? menu?.offsetHeight ?? 0));
  const flyoutWidth = Math.max(
    1,
    Math.round(flyoutRect?.width ?? flyout?.offsetWidth ?? (viewportWidth <= 640 ? 170 : 190)),
  );
  const horizontalBounds = resolveAnswerMenuHorizontalBounds(
    trigger,
    menuWidth,
    margin,
    viewportWidth,
  );
  const maxMenuLeft = Math.max(horizontalBounds.left, horizontalBounds.right - menuWidth);
  const preferredLeft = Math.round(triggerRect.left);
  const preferredRightAlignedLeft = Math.round(triggerRect.right - menuWidth);
  const flyoutOverlap = 4;

  let left = Math.max(horizontalBounds.left, Math.min(preferredLeft, maxMenuLeft));
  const rightSpace = horizontalBounds.right - (left + menuWidth);
  const leftSpace = left - horizontalBounds.left;
  const flyoutSide = chooseAnswerMenuFlyoutSide(leftSpace, rightSpace, flyoutWidth - flyoutOverlap);

  if (flyoutSide === "left") {
    left = Math.min(
      maxMenuLeft,
      Math.max(
        horizontalBounds.left + flyoutWidth - flyoutOverlap,
        Math.min(preferredRightAlignedLeft, maxMenuLeft),
      ),
    );
  }

  const preferredBelowTop = Math.round(triggerRect.bottom + gap);
  const preferredAboveTop = Math.round(triggerRect.top - menuHeight - gap);
  const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
  const top =
    preferredBelowTop <= maxTop
      ? preferredBelowTop
      : preferredAboveTop >= margin
        ? preferredAboveTop
        : Math.max(margin, Math.min(preferredBelowTop, maxTop));

  menuPortal.style.left = `${Math.round(left)}px`;
  menuPortal.style.top = `${Math.round(top)}px`;
  menuPortal.dataset.flyoutSide = flyoutSide;
  menuPortal.dataset.boundsLeft = String(horizontalBounds.left);
  menuPortal.dataset.boundsRight = String(horizontalBounds.right);
  clampAnswerMenuPortalToViewport(menuPortal);
}

function getAnswerMenuPortalVisibleBounds(menuPortal: HTMLElement) {
  const shadowRoot = menuPortal.shadowRoot;
  if (!shadowRoot) {
    return null;
  }

  const menu = shadowRoot.querySelector<HTMLElement>(".menu");

  if (!menu) {
    return null;
  }

  const menuRect = menu.getBoundingClientRect();
  const activeItem = shadowRoot.querySelector<HTMLElement>('.menu-item[data-active="true"]');
  const activeFlyout = activeItem?.querySelector<HTMLElement>(".flyout");

  if (!activeFlyout) {
    return {
      left: menuRect.left,
      right: menuRect.right,
    };
  }

  const flyoutRect = activeFlyout.getBoundingClientRect();

  return {
    left: Math.min(menuRect.left, flyoutRect.left),
    right: Math.max(menuRect.right, flyoutRect.right),
  };
}

function shiftAnswerMenuPortalHorizontally(menuPortal: HTMLElement, deltaX: number) {
  if (Math.abs(deltaX) < 0.5) {
    return;
  }

  const currentLeft = Number.parseFloat(menuPortal.style.left || "0");
  const safeLeft = Number.isFinite(currentLeft) ? currentLeft : 0;
  menuPortal.style.left = `${Math.round(safeLeft + deltaX)}px`;
}

function resolveAnswerMenuHorizontalBounds(
  trigger: HTMLElement,
  menuWidth: number,
  margin: number,
  viewportWidth: number,
) {
  const viewportBounds = {
    left: margin,
    right: viewportWidth - margin,
  };
  const boundsNode =
    trigger instanceof HTMLButtonElement
      ? findQuestionBoundsNodeForTrigger(trigger)
      : trigger.closest<HTMLElement>(".formulation, .content, .ablock, .answer, .que");

  if (!(boundsNode instanceof HTMLElement)) {
    return viewportBounds;
  }

  const questionRect = boundsNode.getBoundingClientRect();
  const questionInnerMargin = 8;
  const questionBounds = {
    left: Math.max(viewportBounds.left, Math.round(questionRect.left) + questionInnerMargin),
    right: Math.min(viewportBounds.right, Math.round(questionRect.right) - questionInnerMargin),
  };

  if (questionBounds.right - questionBounds.left < menuWidth) {
    return viewportBounds;
  }

  return questionBounds;
}

function getAnswerMenuPortalHorizontalBounds(menuPortal: HTMLElement, viewportWidth: number) {
  const margin = viewportWidth <= 640 ? 12 : 16;
  const rawLeft = Number.parseFloat(menuPortal.dataset.boundsLeft ?? "");
  const rawRight = Number.parseFloat(menuPortal.dataset.boundsRight ?? "");
  const left = Number.isFinite(rawLeft) ? rawLeft : margin;
  const right = Number.isFinite(rawRight) ? rawRight : viewportWidth - margin;

  return {
    left,
    right,
  };
}

function clampAnswerMenuPortalToViewport(menuPortal: HTMLElement) {
  const bounds = getAnswerMenuPortalVisibleBounds(menuPortal);

  if (!bounds) {
    return;
  }

  const viewportWidth = document.documentElement.clientWidth;
  const horizontalBounds = getAnswerMenuPortalHorizontalBounds(menuPortal, viewportWidth);
  let deltaX = 0;

  if (bounds.right > horizontalBounds.right) {
    deltaX -= bounds.right - horizontalBounds.right;
  }

  if (bounds.left + deltaX < horizontalBounds.left) {
    deltaX += horizontalBounds.left - (bounds.left + deltaX);
  }

  shiftAnswerMenuPortalHorizontally(menuPortal, deltaX);
}

function chooseAnswerMenuFlyoutSide(
  leftSpace: number,
  rightSpace: number,
  requiredSpace: number,
): "left" | "right" {
  const canFitLeft = leftSpace >= requiredSpace;
  const canFitRight = rightSpace >= requiredSpace;

  if (canFitLeft && canFitRight) {
    return leftSpace > rightSpace ? "left" : "right";
  }

  if (canFitLeft) {
    return "left";
  }

  if (canFitRight) {
    return "right";
  }

  return leftSpace > rightSpace ? "left" : "right";
}

function updateAnswerMenuFlyoutSide(menuPortal: HTMLElement) {
  const shadowRoot = menuPortal.shadowRoot;
  const menu = shadowRoot?.querySelector<HTMLElement>(".menu");
  const activeItem = shadowRoot?.querySelector<HTMLElement>('.menu-item[data-active="true"]');
  const activeFlyout = activeItem?.querySelector<HTMLElement>(".flyout");

  if (!menu || !activeFlyout) {
    return;
  }

  const viewportWidth = document.documentElement.clientWidth;
  const flyoutOverlap = 4;
  const horizontalBounds = getAnswerMenuPortalHorizontalBounds(menuPortal, viewportWidth);
  const menuRect = menu.getBoundingClientRect();
  const flyoutWidth = Math.max(
    1,
    Math.round(
      activeFlyout.getBoundingClientRect().width ||
        activeFlyout.offsetWidth ||
        (viewportWidth <= 640 ? 170 : 190),
    ),
  );
  const rightSpace = horizontalBounds.right - menuRect.right;
  const leftSpace = menuRect.left - horizontalBounds.left;
  const nextFlyoutSide = chooseAnswerMenuFlyoutSide(
    leftSpace,
    rightSpace,
    flyoutWidth - flyoutOverlap,
  );

  menuPortal.dataset.flyoutSide = nextFlyoutSide;
  clampAnswerMenuPortalToViewport(menuPortal);
}

function openAnswerMenuPortal(
  trigger: HTMLButtonElement,
  accentColor: string,
  answerData: SourceAnswerData,
  questionId: string | null,
) {
  closeActiveAnswerWidgetMenu();

  const menuPortal = document.createElement("div");
  const shadowRoot = menuPortal.attachShadow({ mode: "open" });
  let closePortal = () => undefined;
  const initialQuestionNode = findQuestionNodeForTrigger(trigger);
  const initialQuestionType = initialQuestionNode
    ? getSecondQuestionClass(initialQuestionNode)
    : null;
  const aiQuestionKey = getAiQuestionKey(initialQuestionNode, questionId);
  const aiSettingsSaved = isAiSettingsSaved(currentStoredState?.settings);
  const externalOnly = !isLoggedInToExtension(currentStoredState);
  const aiToolsEnabled = !externalOnly && !isAiDisabledQuestionTypeName(initialQuestionType);
  const menuAnswerData =
    initialQuestionNode && isAiOnlyQuestionTypeName(initialQuestionType)
      ? createEmptySourceAnswerData()
      : answerData;

  menuPortal.setAttribute(ANSWER_MENU_PORTAL_ATTR, "true");
  menuPortal.style.setProperty("--reduxshare-accent", accentColor);
  applyContentColorSchemeToHost(menuPortal);
  shadowRoot.innerHTML = getAnswerMenuMarkup(
    menuAnswerData,
    aiSettingsSaved,
    getAiAnswerState(aiQuestionKey),
    aiToolsEnabled,
    externalOnly,
  );

  const menuBehavior = attachAnswerMenuBehavior(shadowRoot, {
    onActiveMenuItemChange: (nextItem) => {
      if (nextItem) {
        updateAnswerMenuFlyoutSide(menuPortal);
      } else {
        clampAnswerMenuPortalToViewport(menuPortal);
      }
    },
  });
  const { setActiveMenuItem } = menuBehavior;

  function updateAiAnswerState(nextState: AiAnswerState) {
    aiAnswerStatesByQuestionKey.set(aiQuestionKey, nextState);

    const answerFlyout = shadowRoot.querySelector<HTMLElement>(
      '.menu-item[data-answer-menu="ai-answer"] .flyout',
    );
    if (answerFlyout) {
      answerFlyout.innerHTML = renderAiAnswerFlyout(nextState);
    }

    const aiButton = shadowRoot.querySelector<HTMLButtonElement>('[data-ai-action="send"]');
    if (aiButton) {
      aiButton.disabled = nextState.status === "loading";
    }
  }

  const aiRequestButton = shadowRoot.querySelector<HTMLButtonElement>('[data-ai-action="send"]');
  aiRequestButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!aiToolsEnabled) {
      return;
    }

    const questionNode = findQuestionNodeForTrigger(trigger);

    if (!questionNode) {
      updateAiAnswerState({
        status: "error",
        answer: null,
        confidence: null,
        actions: [],
        error: currentT("quiz.menu.aiQuestionMissing"),
      });
      setActiveMenuItem(
        shadowRoot.querySelector<HTMLElement>('.menu-item[data-answer-menu="ai-answer"]'),
      );
      return;
    }

    updateAiAnswerState({
      status: "loading",
      answer: null,
      confidence: null,
      actions: [],
      error: null,
    });
    setActiveMenuItem(
      shadowRoot.querySelector<HTMLElement>('.menu-item[data-answer-menu="ai-answer"]'),
    );

    void buildAiAnswerRequestPayload(questionNode, questionId)
      .then((payload) => requestAiGeneratedAnswer(payload))
      .then((response) => {
        updateAiAnswerState({
          status: response.ok ? "success" : "error",
          answer: response.ok ? (response.answer ?? "") : null,
          confidence: response.ok ? (response.confidence ?? 0) : null,
          actions: response.ok ? (response.actions ?? []) : [],
          error: response.ok ? null : (response.error ?? currentT("quiz.menu.empty")),
        });
      })
      .catch((error) => {
        updateAiAnswerState({
          status: "error",
          answer: null,
          confidence: null,
          actions: [],
          error: error instanceof Error ? error.message : currentT("quiz.menu.empty"),
        });
      });
  });

  shadowRoot.addEventListener("click", (event) => {
    const target = event.target;
    const option =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-ai-answer-action="apply"]')
        : null;

    if (!option) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const questionNode = findQuestionNodeForTrigger(trigger);
    const aiState = getAiAnswerState(aiQuestionKey);

    if (
      questionNode &&
      aiState.status === "success" &&
      applyAiAnswerForQuestion(questionNode, aiState)
    ) {
      void reportSolvedQuestions([getQuestionProgressId(questionNode, questionId)]);
    }

    window.setTimeout(() => closePortal(), 120);
  });

  shadowRoot.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const target = event.target;
    const option =
      target instanceof Element
        ? target.closest<HTMLElement>('[data-ai-answer-action="apply"]')
        : null;

    if (!option) {
      return;
    }

    option.click();
  });

  document.body.append(menuPortal);
  positionAnswerMenuPortal(menuPortal, trigger);
  attachAnswerHovercards(shadowRoot);

  const flyoutOptions = shadowRoot.querySelectorAll<HTMLElement>(
    ".flyout-option[data-answer-label]",
  );
  for (const option of flyoutOptions) {
    const labelEl = option.querySelector<HTMLElement>(".flyout-label");
    const labelText = option.dataset.answerLabel ?? (labelEl ?? option).textContent?.trim() ?? "";
    const rawSlotIndex = option.dataset.answerSlotIndex;
    const actionSlotIndex =
      rawSlotIndex && /^\d+$/.test(rawSlotIndex) ? Number.parseInt(rawSlotIndex, 10) : null;
    if (!labelText) continue;

    option.style.cursor = "pointer";

    option.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();

      const questionNode = findQuestionNodeForTrigger(trigger);
      const sourceKey = getAnswerSourceKeyForFlyoutOption(option);
      if (
        questionNode &&
        selectAnswerByLabelForTrigger(trigger, questionNode, labelText, actionSlotIndex, {
          questionId,
          sourceKey,
        })
      ) {
        void reportSolvedQuestions([getQuestionProgressId(questionNode, questionId)]);
      }

      window.setTimeout(() => closePortal(), 120);
    });
  }

  const handleDocumentClick = (event: MouseEvent) => {
    const eventPath = event.composedPath();

    if (!eventPath.includes(menuPortal) && !eventPath.includes(trigger)) {
      closePortal();
    }
  };
  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closePortal();
    }
  };
  const handleReposition = () => {
    if (document.body.contains(menuPortal)) {
      positionAnswerMenuPortal(menuPortal, trigger);
    }
  };

  closePortal = () => {
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("keydown", handleEscape);
    window.removeEventListener("resize", handleReposition);
    window.removeEventListener("scroll", handleReposition, true);
    menuBehavior.dispose();
    trigger.setAttribute("aria-expanded", "false");
    menuPortal.remove();

    if (activeCloseAnswerWidgetMenu === closePortal) {
      setActiveCloseAnswerWidgetMenu(null);
    }
  };

  setActiveCloseAnswerWidgetMenu(closePortal);
  trigger.setAttribute("aria-expanded", "true");
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleEscape);
  window.addEventListener("resize", handleReposition);
  window.addEventListener("scroll", handleReposition, true);

  window.requestAnimationFrame(() => {
    menuPortal.dataset.open = "true";
  });
}

function createAnswerWidgetHost(
  accentColor: string,
  questionId: string | null,
  variantCounts: AnswerVariantCounts,
  answerData: SourceAnswerData,
  slotIndex: number | null = null,
  isInline = false,
) {
  const host = document.createElement("span");
  const shadowRoot = host.attachShadow({ mode: "open" });

  host.setAttribute(ANSWER_WIDGET_ATTR, "true");

  if (isInline) {
    host.setAttribute("data-reduxshare-inline-widget", "true");
    host.setAttribute("data-action", "reduxshare-menu");
  }

  if (slotIndex !== null) {
    host.dataset.reduxshareSlotIndex = String(slotIndex);
  }

  host.style.setProperty("--reduxshare-accent", accentColor);
  applyContentColorSchemeToHost(host);
  shadowRoot.innerHTML = getAnswerTriggerMarkup();
  answerWidgetStates.set(host, {
    questionId,
    variantCounts,
    answerData,
    slotIndex,
  });

  const trigger = shadowRoot.querySelector(".trigger");

  if (!(trigger instanceof HTMLButtonElement)) {
    return host;
  }

  const stopWidgetPointerEvent = (event: Event) => {
    event.stopPropagation();
  };

  const handleTriggerClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (trigger.getAttribute("aria-expanded") === "true") {
      closeActiveAnswerWidgetMenu();
      return;
    }

    const state = answerWidgetStates.get(host);
    openAnswerMenuPortal(
      trigger,
      host.style.getPropertyValue("--reduxshare-accent") || accentColor,
      state?.answerData ?? createEmptySourceAnswerData(),
      state?.questionId ?? questionId,
    );
  };

  trigger.addEventListener("mousedown", stopWidgetPointerEvent);
  trigger.addEventListener("pointerdown", stopWidgetPointerEvent);
  trigger.addEventListener("touchstart", stopWidgetPointerEvent);
  trigger.addEventListener("click", handleTriggerClick);

  answerWidgetCleanups.set(host, () => {
    trigger.removeEventListener("mousedown", stopWidgetPointerEvent);
    trigger.removeEventListener("pointerdown", stopWidgetPointerEvent);
    trigger.removeEventListener("touchstart", stopWidgetPointerEvent);
    trigger.removeEventListener("click", handleTriggerClick);
    answerWidgetStates.delete(host);
  });

  return host;
}

function setAnswerWidgetAccent(accentColor: string) {
  for (const host of answerWidgetCleanups.keys()) {
    host.style.setProperty("--reduxshare-accent", accentColor);
  }

  const menuPortal = document.querySelector(`[${ANSWER_MENU_PORTAL_ATTR}="true"]`);

  if (menuPortal instanceof HTMLElement) {
    menuPortal.style.setProperty("--reduxshare-accent", accentColor);
  }

  syncContentColorScheme();
}

const OVERLAY_OPACITY_STYLE_ID = "reduxshare-overlay-opacity";

function getPageOverlayOpacity(settings: StoredStateLike["settings"] | undefined) {
  const rawOpacity = settings?.pageOverlayOpacity;

  if (typeof rawOpacity !== "number" || !Number.isFinite(rawOpacity)) {
    return 1;
  }

  return Math.min(1, Math.max(0.4, rawOpacity));
}

export function syncPageOverlayOpacity(storedState: StoredStateLike | undefined) {
  const opacity = getPageOverlayOpacity(storedState?.settings ?? currentStoredState?.settings);
  let styleElement = document.getElementById(OVERLAY_OPACITY_STYLE_ID);

  if (!(styleElement instanceof HTMLStyleElement)) {
    styleElement = document.createElement("style");
    styleElement.id = OVERLAY_OPACITY_STYLE_ID;
    document.documentElement.append(styleElement);
  }

  styleElement.textContent =
    `[${ANSWER_WIDGET_ATTR}="true"],` +
    `[${ANSWER_MENU_PORTAL_ATTR}="true"],` +
    `#${ATTEMPT_STATUS_PANEL_ID}{opacity:${opacity}}`;
}

function shouldMountAnswerWidgetForQuestion(entry: AnswerEntry) {
  const questionType = getSecondQuestionClass(entry.questionNode);

  if (isUnsupportedDragDropQuestionType(entry.questionNode)) {
    return false;
  }

  if (questionType !== null && SUPPORTED_WIDGET_QUESTION_TYPES.has(questionType)) {
    return true;
  }

  return hasSourceAnswerData(getAnswerDataForQuestion(entry.questionId));
}

function removeAnswerWidgetsFromQuestion(questionNode: Element) {
  const hosts = Array.from(
    questionNode.querySelectorAll<HTMLElement>(`[${ANSWER_WIDGET_ATTR}="true"]`),
  );

  for (const host of hosts) {
    answerWidgetCleanups.get(host)?.();
    host.remove();
  }
}

function getChoiceAnswerWidgetTarget(questionNode: Element, input: HTMLInputElement) {
  const labelledByIds = (input.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);

  for (const labelledById of labelledByIds) {
    const labelledByElement = document.getElementById(labelledById);

    if (isHTMLElement(labelledByElement) && questionNode.contains(labelledByElement)) {
      return labelledByElement;
    }
  }

  if (input.id) {
    const generatedLabel = document.getElementById(`${input.id}_label`);

    if (isHTMLElement(generatedLabel) && questionNode.contains(generatedLabel)) {
      return generatedLabel;
    }
  }

  const row = input.closest(".r0, .r1, .r, li") ?? input.parentElement;
  return isHTMLElement(row) ? row : null;
}

function mountGapSelectAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const questionLevelHost = answerNode.querySelector(
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`,
  );

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  for (const select of getSelectableAnswerControls(questionNode)) {
    const targetNode = select.closest(".control") ?? select.parentElement;

    if (!isHTMLElement(targetNode)) {
      continue;
    }

    const { answerData, slotIndex } = getAnswerDataForQuestionSelect(questionId, select);
    const existingHost = targetNode.querySelector(`[${ANSWER_WIDGET_ATTR}="true"]`);

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;

      if (slotIndex === null) {
        delete existingHost.dataset.reduxshareSlotIndex;
      } else {
        existingHost.dataset.reduxshareSlotIndex = String(slotIndex);
      }

      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex,
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true,
    );
    host.hidden = !answerWidgetsVisible;
    targetNode.append(host);
  }
}

function mountMultiChoiceAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const questionLevelHost = answerNode.querySelector(
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`,
  );

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  const choiceInputs = isCompoundQuestionType(questionNode)
    ? getChoiceAnswerInputs(questionNode)
    : getChoiceAnswerInputs(questionNode).filter((answerInput) => answerInput.type === "checkbox");

  for (const input of choiceInputs) {
    const targetNode = getChoiceAnswerWidgetTarget(questionNode, input);

    if (!targetNode) {
      continue;
    }

    const { answerData, slotIndex } = getAnswerDataForQuestionChoice(
      questionId,
      questionNode,
      input,
    );
    const existingHost = targetNode.querySelector(`[${ANSWER_WIDGET_ATTR}="true"]`);

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;

      if (slotIndex === null) {
        delete existingHost.dataset.reduxshareSlotIndex;
      } else {
        existingHost.dataset.reduxshareSlotIndex = String(slotIndex);
      }

      if (input.id) {
        existingHost.setAttribute("data-reduxshare-choice-input-id", input.id);
      } else {
        existingHost.removeAttribute("data-reduxshare-choice-input-id");
      }

      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex,
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true,
    );
    host.hidden = !answerWidgetsVisible;

    if (input.id) {
      host.setAttribute("data-reduxshare-choice-input-id", input.id);
    }

    targetNode.append(host);
  }
}

function mountTextAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const questionLevelHost = answerNode.querySelector(
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`,
  );

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  for (const input of getTextAnswerInputs(questionNode)) {
    const targetNode = input.parentElement;

    if (!isHTMLElement(targetNode)) {
      continue;
    }

    targetNode.setAttribute("data-reduxshare-text-control", "true");
    const { answerData, slotIndex } = getAnswerDataForQuestionTextControl(questionId, input);
    const existingHost = Array.from(
      targetNode.querySelectorAll<HTMLElement>(`[${ANSWER_WIDGET_ATTR}="true"]`),
    ).find((host) => {
      if (input.id && host.getAttribute("data-reduxshare-text-input-id") === input.id) {
        return true;
      }

      return (
        slotIndex !== null && host.getAttribute("data-reduxshare-text-slot") === String(slotIndex)
      );
    });

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;

      if (slotIndex === null) {
        delete existingHost.dataset.reduxshareSlotIndex;
        existingHost.removeAttribute("data-reduxshare-text-slot");
      } else {
        existingHost.dataset.reduxshareSlotIndex = String(slotIndex);
        existingHost.setAttribute("data-reduxshare-text-slot", String(slotIndex));
      }

      if (input.id) {
        existingHost.setAttribute("data-reduxshare-text-input-id", input.id);
      }

      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex,
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true,
    );
    host.hidden = !answerWidgetsVisible;

    if (input.id) {
      host.setAttribute("data-reduxshare-text-input-id", input.id);
    }

    if (slotIndex !== null) {
      host.setAttribute("data-reduxshare-text-slot", String(slotIndex));
    }

    targetNode.append(host);
  }
}

function mountDdwtosAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const questionLevelHost = answerNode.querySelector(
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`,
  );

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  for (const drop of getDdwtosDrops(questionNode)) {
    const slotIndex = getDdwtosDropSlotIndex(drop);
    const existingHost =
      slotIndex === null
        ? null
        : questionNode.querySelector<HTMLElement>(
            `[${ANSWER_WIDGET_ATTR}="true"][data-reduxshare-ddwtos-slot="${slotIndex}"]`,
          );
    const { answerData } = getAnswerDataForDdwtosDrop(questionId, drop);

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;
      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex,
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true,
    );
    host.hidden = !answerWidgetsVisible;

    if (slotIndex !== null) {
      host.setAttribute("data-reduxshare-ddwtos-slot", String(slotIndex));
    }

    drop.after(host);
  }
}

function mountDdmarkerAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const questionLevelHost = answerNode.querySelector(
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`,
  );

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  for (const choice of getDdmarkerChoices(questionNode)) {
    const coordinate = getDdmarkerCoordinateLabel(choice.input.value);

    if (coordinate) {
      setDdmarkerVisualMarker(questionNode, choice.choiceIndex, coordinate);
    }

    const targetNode =
      getDdmarkerVisualMarker(questionNode, choice.choiceIndex) ??
      questionNode.querySelector<HTMLElement>(
        `.draghomes .marker.choice${choice.choiceIndex}:not(.dragplaceholder)`,
      ) ??
      questionNode.querySelector<HTMLElement>(
        `.draghomes .marker.choice${choice.choiceIndex}.dragplaceholder`,
      ) ??
      questionNode.querySelector<HTMLElement>(`.draghomes .marker.choice${choice.choiceIndex}`);

    if (!targetNode) {
      continue;
    }

    const existingHost = questionNode.querySelector<HTMLElement>(
      `[${ANSWER_WIDGET_ATTR}="true"][data-reduxshare-ddmarker-choice="${choice.choiceIndex}"]`,
    );
    const { answerData, slotIndex } = getAnswerDataForDdmarkerChoice(
      questionId,
      choice.choiceIndex,
    );

    if (existingHost instanceof HTMLElement) {
      if (existingHost.previousElementSibling !== targetNode) {
        targetNode.after(existingHost);
      }
      if (targetNode.closest(".droparea") && coordinate) {
        positionDdmarkerAnswerWidgetHost(questionNode, choice.choiceIndex, coordinate, targetNode);
      } else {
        resetDdmarkerAnswerWidgetHostPlacement(existingHost);
      }
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;
      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex,
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true,
    );
    host.hidden = !answerWidgetsVisible;
    host.setAttribute("data-reduxshare-ddmarker-choice", String(choice.choiceIndex));
    targetNode.after(host);
    if (targetNode.closest(".droparea") && coordinate) {
      positionDdmarkerAnswerWidgetHost(questionNode, choice.choiceIndex, coordinate, targetNode);
    } else {
      resetDdmarkerAnswerWidgetHostPlacement(host);
    }
  }
}

function mountDdimageOrTextAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const questionLevelHost = answerNode.querySelector(
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`,
  );

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  for (const drop of getDdimageOrTextDrops(questionNode)) {
    const slotIndex = getDdimageOrTextDropSlotIndex(drop);
    const existingHost =
      slotIndex === null
        ? null
        : questionNode.querySelector<HTMLElement>(
            `[${ANSWER_WIDGET_ATTR}="true"][data-reduxshare-ddimageortext-slot="${slotIndex}"]`,
          );
    const { answerData } = getAnswerDataForDdimageOrTextDrop(questionId, drop);

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;
      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex,
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true,
    );
    host.hidden = !answerWidgetsVisible;

    if (slotIndex !== null) {
      host.setAttribute("data-reduxshare-ddimageortext-slot", String(slotIndex));
    }

    drop.after(host);
  }
}

function mountOrderingAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const questionLevelHost = answerNode.querySelector(
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`,
  );
  const items = getOrderingItems(questionNode);

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  for (const item of items) {
    const targetNode = item.querySelector("[data-itemcontent]") ?? item;

    if (!isHTMLElement(targetNode)) {
      continue;
    }

    const { answerData, slotIndex } = getAnswerDataForOrderingItem(questionId, item, items.length);
    const existingHost = targetNode.querySelector(`[${ANSWER_WIDGET_ATTR}="true"]`);

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;

      if (slotIndex === null) {
        delete existingHost.dataset.reduxshareSlotIndex;
      } else {
        existingHost.dataset.reduxshareSlotIndex = String(slotIndex);
      }

      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex,
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true,
    );
    host.hidden = !answerWidgetsVisible;
    targetNode.append(host);
  }
}

function mountCompoundAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const targetNode = questionNode.querySelector<HTMLElement>(".formulation") ?? answerNode;
  removeAnswerWidgetsFromQuestion(questionNode);

  const host = createAnswerWidgetHost(
    accentColor,
    questionId,
    getVariantCountsForQuestion(questionId),
    getAnswerDataForQuestion(questionId),
  );
  host.hidden = !answerWidgetsVisible;
  host.setAttribute("data-reduxshare-compound-question", "true");
  targetNode.append(host);
}

function mountAnswerWidgets(accentColor: string) {
  for (const entry of getAnswerEntries()) {
    const { answerNode, questionId, questionNode } = entry;

    if (!shouldMountAnswerWidgetForQuestion(entry)) {
      removeAnswerWidgetsFromQuestion(questionNode);
      continue;
    }

    if (isOrderingQuestionType(questionNode)) {
      mountOrderingAnswerWidgets(entry, accentColor);
      continue;
    }

    if (isDragTextQuestionType(questionNode)) {
      mountDdwtosAnswerWidgets(entry, accentColor);
      continue;
    }

    if (isDragMarkerQuestionType(questionNode)) {
      mountDdmarkerAnswerWidgets(entry, accentColor);
      continue;
    }

    if (isDragImageOrTextQuestionType(questionNode)) {
      mountDdimageOrTextAnswerWidgets(entry, accentColor);
      continue;
    }

    if (isCompoundQuestionType(questionNode)) {
      mountCompoundAnswerWidgets(entry, accentColor);
      continue;
    }

    if (isTextInputQuestionType(questionNode)) {
      mountTextAnswerWidgets(entry, accentColor);
      continue;
    }

    if (isSelectableQuestionType(questionNode)) {
      mountGapSelectAnswerWidgets(entry, accentColor);
      continue;
    }

    if (isMultiAnswerMultichoiceQuestion(questionNode)) {
      mountMultiChoiceAnswerWidgets(entry, accentColor);
      continue;
    }

    const existingHost = answerNode.querySelector(`[${ANSWER_WIDGET_ATTR}="true"]`);

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;
      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData: getAnswerDataForQuestion(questionId),
        slotIndex: null,
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      getAnswerDataForQuestion(questionId),
    );
    host.hidden = !answerWidgetsVisible;
    answerNode.append(host);
  }
}

function removeAnswerWidgets() {
  closeActiveAnswerWidgetMenu();

  for (const [host, cleanup] of answerWidgetCleanups) {
    cleanup();
    host.remove();
  }

  answerWidgetCleanups.clear();
  answerWidgetStates.clear();
}

function resetRestrictedQuizState() {
  removeAnswerWidgets();
  variantCountsByQuestionId.clear();
  answerDataByQuestionId.clear();
  setCurrentQuizAttemptContext(null);
  removeAttemptStatusPanel();
}

const PIPELINE_RELEVANT_SETTING_KEYS = [
  "extensionEnabled",
  "stealthMode",
  "attemptStatusPanelClosed",
  "autoSelect",
  "autoSelectAvgSeconds",
  "hotkey",
  "hotkeyCode",
  "accentColor",
  "theme",
  "colorScheme",
  "pageOverlayOpacity",
  "language",
] as const;

function getAnswerPipelineFingerprint(storedState: StoredStateLike | undefined): string {
  const settings = storedState?.settings ?? {};

  return JSON.stringify([
    ...PIPELINE_RELEVANT_SETTING_KEYS.map((key) => settings[key]),
    isLoggedInToExtension(storedState),
  ]);
}

function watchStoredSettingsChanges() {
  if (storageWatcherInstalled) {
    return;
  }

  storageWatcherInstalled = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    applyAttemptStatusPanelStorageChanges(changes);

    if (!changes[APP_STORAGE_KEY]) {
      return;
    }

    const nextState = changes[APP_STORAGE_KEY].newValue as StoredStateLike | undefined;
    const pipelineChanged =
      pendingPipelineRun ||
      getAnswerPipelineFingerprint(nextState) !== getAnswerPipelineFingerprint(currentStoredState);

    setCurrentStoredState(nextState);

    if (isQuizViewUrl(window.location)) {
      if (pipelineChanged) {
        syncLanguage(nextState);
        syncStealthMode(nextState);
      }

      syncQuizPreviewFeatures(nextState);
      return;
    }

    if (pipelineChanged) {
      syncLanguage(nextState);
      syncStealthMode(nextState);
      syncAnswerWidgetHotkey(nextState);
      syncPageOverlayOpacity(nextState);
    }

    void syncAttemptStatusPanelClosedState(nextState);

    if (!canUseQuizFeatures(nextState)) {
      resetRestrictedQuizState();
      return;
    }

    if (!currentQuizAttemptContext) {
      pendingPipelineRun = true;
      void initializeQuizAttemptFeatures();
      return;
    }

    if (pipelineChanged) {
      pendingPipelineRun = false;

      if (!isLoggedInToExtension(nextState)) {
        clearReduxShareAnswerData();
      }

      const accentColor = getAccentColor(nextState?.settings);
      setAnswerWidgetAccent(accentColor);
      mountAnswerWidgets(accentColor);
      autoSelectExactAnswers(nextState);
      renderAttemptStatusPanel();
    }
  });
}

function requestQuizAnswers(context: QuizAttemptContext): Promise<QuizAnswersResponse> {
  const sourceQuestions = context.questions.filter(
    (question) => !isAiOnlyQuestionTypeName(question.questionType),
  );

  if (sourceQuestions.length === 0) {
    return Promise.resolve({
      ok: true,
      reduxshareResults: [],
      externalResults: [],
    });
  }

  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: FETCH_QUIZ_ANSWERS_MESSAGE,
          payload: {
            domain: context.domain,
            courseId: context.courseId,
            quizId: context.contextInstanceId,
            attemptId: context.attemptId,
            moodleUserId: context.moodleUserId,
            questions: sourceQuestions,
          },
        },
        (response: QuizAnswersResponse | undefined) => {
          const runtimeError = chrome.runtime.lastError;

          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }

          resolve(
            response ?? {
              ok: false,
              error: "Background script did not return a response.",
            },
          );
        },
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function loadQuizAnswers(context: QuizAttemptContext) {
  if (context.questions.length === 0) {
    renderAttemptStatusPanel();
    return;
  }

  try {
    renderAttemptStatusPanel();
    const response = await requestQuizAnswers(context);

    if (!response.ok) {
      renderAttemptStatusPanel();
      logReduxShareWarning("ReduxShare: quiz answers request failed", response.error);
      return;
    }

    const currentState = await loadStoredState();
    setCurrentStoredState(currentState);
    syncLanguage(currentState);

    if (!canUseQuizFeatures(currentState)) {
      resetRestrictedQuizState();
      return;
    }

    variantCountsByQuestionId.clear();
    answerDataByQuestionId.clear();
    if (isLoggedInToExtension(currentState)) {
      applyQuizAnswerResults(response.reduxshareResults, "reduxshare");
    }
    applyQuizAnswerResults(response.externalResults, "external");

    mountAnswerWidgets(getAccentColor(currentState.settings));
    autoSelectExactAnswers(currentState);
    renderAttemptStatusPanel();
  } catch (error) {
    renderAttemptStatusPanel();
    logReduxShareWarning("ReduxShare: quiz answers request failed", error);
  }
}

async function initializeQuizAttemptFeatures() {
  const storedState = await loadStoredState();
  setCurrentStoredState(storedState);

  await loadAttemptStatusPanelCollapsedState();
  await loadAttemptStatusPanelPositionState();
  syncAllFeatures(storedState);

  if (!canUseQuizFeatures(storedState)) {
    resetRestrictedQuizState();
    return;
  }

  const pageFullyLoaded = await waitForFullPageLoad();

  if (!pageFullyLoaded) {
    logReduxShareInfo("ReduxShare: continuing after page load wait timeout");
  }

  const accentColor = getAccentColor(storedState.settings);

  const context = await waitForQuizAttemptContext();
  syncAllFeatures(await loadStoredState());

  if (!canUseQuizFeatures(storedState)) {
    resetRestrictedQuizState();
    return;
  }

  if (!context) {
    const bareContext = createBareQuizAttemptContext();
    await saveQuizAttemptContext(bareContext);
    mountAnswerWidgets(accentColor);
    logReduxShareInfo("ReduxShare: quiz attempt page detected, metadata not found");
    return;
  }

  await saveQuizAttemptContext(context);
  mountAnswerWidgets(accentColor);
  logReduxShareInfo("ReduxShare: quiz metadata detected");
  await loadQuizAnswers(context);
}

async function initializeQuizSummaryTracking() {
  const storedState = await loadStoredState();
  setCurrentStoredState(storedState);
  syncLanguage(storedState);
  syncStealthMode(storedState);

  if (!canUseQuizFeatures(storedState)) {
    await saveQuizReviewSaveDiagnostics("content-blocked-before-load", {
      reason: "quiz features unavailable",
      hasAuthSession: Boolean(storedState?.authSession?.user?.id),
      extensionEnabled: storedState?.settings?.extensionEnabled !== false,
    });
    return;
  }

  const identity = getQuizReviewUrlIdentity(window.location.href);

  await saveQuizReviewPendingMarker({
    domain: window.location.hostname,
    attemptKey: identity.attemptKey,
    attemptId: identity.attemptId,
    cmId: identity.cmId,
    pageUrl: window.location.href,
    createdAt: new Date().toISOString(),
  });

  logReduxShareInfo("ReduxShare: quiz summary page detected, waiting for review page");
}

async function bootstrapQuizPageDetection() {
  if (!isExtensionContextValid()) {
    return;
  }

  installColorSchemeWatcher();

  if (isQuizAttemptUrl(window.location)) {
    watchStoredSettingsChanges();
    ensureAutoSelectCancelListener();
    await initializeQuizAttemptFeatures();
    return;
  }

  if (isQuizSummaryUrl(window.location)) {
    await initializeQuizSummaryTracking();
    return;
  }

  if (isQuizReviewUrl(window.location)) {
    await initializeQuizReviewSave();
    return;
  }

  if (isQuizViewUrl(window.location)) {
    watchStoredSettingsChanges();
    await initializeQuizPreviewFeatures();
  }
}

function resetQuizAttemptTestState() {
  closeActiveAnswerWidgetMenu();
  cancelAllAutoSelectSchedules();

  storageWatcherInstalled = false;
  removeAnswerWidgets();
  variantCountsByQuestionId.clear();
  answerDataByQuestionId.clear();
  aiAnswerStatesByQuestionKey.clear();
  setCurrentQuizAttemptContext(null);
  pendingPipelineRun = true;
  setCurrentStoredState({
    settings: {
      extensionEnabled: true,
      stealthMode: false,
      language: "ru",
      ai: {
        provider: "google",
        model: "gemini-test",
        apiKey: "test-api-key",
        connectionVerified: true,
        verifiedAt: null,
      },
    },
    authSession: {
      user: {
        id: "test-user",
        email: null,
      },
    },
  });
  syncLanguage(currentStoredState);
  setAnswerWidgetsVisible(true);
  resetAttemptStatusPanelState();
  void syncAttemptStatusPanelClosedState(currentStoredState);
}

function installQuizAttemptTestApi() {
  globalThis.__reduxshareQuizAttemptTestApi = {
    reset: resetQuizAttemptTestState,
    setStoredState: (state) => {
      setCurrentStoredState(state);
      syncLanguage(state);
    },
    getStoredState: () => currentStoredState,
    watchStoredSettingsChanges,
    syncAttemptStatusPanelClosedState,
    setAttemptStatusPanelClosedInSession,
    buildReviewAnswersForQuestion,
    collectReviewQuestionsForSave,
    collectQuestionSummaries,
    buildReviewSaveRequestPayload,
    setSourceAnswerData,
    buildAiAnswerRequestPayload,
    applyAiAnswerForQuestion,
    autoSelectQuestionAnswers,
    mountAnswerWidgets,
    createAnswerWidgetHost,
    getAnswerMenuMarkup,
    computeAutoSelectDelayMs,
    parseQuizTimeLeftSeconds,
    scheduleAutoSelectAnswer,
    cancelAutoSelectSchedule,
    createEmptySourceAnswerData,
    createEmptyVariantCounts,
  };
  resetQuizAttemptTestState();
}

export {
  getQuestionAnswerLabels,
  getQuestionText,
  getChoiceAnswerInputs,
  getTextAnswerInputs,
  getSelectableAnswerControls,
  findInputForAnswerLabel,
  setAnswerInputChecked,
  findSelectOptionByLabel,
  setSelectValue,
  selectTextAnswerByLabel,
  getAnswerLabelMatchKeys,
  normalizeAnswerLabel,
  splitReviewAnswerText,
  getUniqueTexts,
  getPreferredSuggestionLabels,
  getAnswerSlotForControl,
  getAnswerSlotForSelect,
  getAnswerSlotByIndex,
  getChoiceAnswerSlotMatch,
  getExactBooleanChoiceSlotValue,
  getOrderingItems,
  getOrderingList,
  getOrderingItemLabel,
  getOrderingSlotPosition,
  splitSequentialAnswerLabels,
  labelsMatch,
  syncOrderingResponseInput,
  getDdwtosDrops,
  getDdwtosDropSlotIndex,
  setDdwtosDropAnswer,
  getDdmarkerChoices,
  applyDdmarkerExactCoordinateSet,
  getDdimageOrTextDrops,
  getDdimageOrTextDropSlotIndex,
  setDdimageOrTextDropAnswer,
  isMatchingQuestionNode,
  getSelectControlLabel,
  getSelectOptionLabel,
  isPlaceholderSelectOption,
  hasAnswerData,
  getAnswerData as getPreferredAutoSelectAnswerData,
  getPreferredSuggestionLabels as getPreferredAutoSelectSuggestionLabels,
  getSupportedAutoSelectQuestionType,
  isAiOnlyQuestionTypeName,
  isChoiceQuestionType,
  isTextInputQuestionType,
  isMatchingQuestionTypeName,
  isSelectableQuestionType,
  isDragImageOrTextQuestionType,
  isDragMarkerQuestionType,
  isOrderingQuestionType,
  isCompoundQuestionType,
  selectNextSelectOptionByLabel,
  setTextAnswerValue,
  isLoggedInToExtension,
  reportSolvedQuestions,
  autoSelectGapSelectAnswers,
  getAnswerDataForQuestion,
  mountAnswerWidgets,
  createAnswerWidgetHost,
};

if (globalThis.__REDUXSHARE_TEST_MODE__) {
  installQuizAttemptTestApi();
} else {
  void bootstrapQuizPageDetection();
}

export {};
