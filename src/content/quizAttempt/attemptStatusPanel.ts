import type { AnswerEntry, QuizQuestionSummary, StoredStateLike } from "../../model";
import type { Settings } from "../../types";
import { canUseQuizFeatures, getContentLocale } from "../../logic/settings";
import {
  applyContentColorSchemeToHost,
  getAccentColor,
  getRgbCssValue,
  mixHexColors,
} from "../../logic/theme";
import { getOrderingResponseInput } from "../../dom/ordering";
import { isAiOnlyQuestionTypeName } from "../../dom/questionTypes";
import { isPlaceholderSelectOption } from "../../dom/questionDom";
import { getAnswerEntries } from "./answerControls";
import { getDdimageOrTextPlaceInput } from "./ddimageortext";
import { normalizeDdmarkerCoordinate } from "./ddmarker";
import {
  getAnswerDataForQuestion,
  getEssayAnswerTextareas,
  getSelectableAnswerControls,
  hasSourceAnswerData,
} from "./answerControls";
import {
  getDdwtosDrops,
  getDdwtosDropSlotIndex,
  getDdwtosPlaceInput,
  getDdwtosSelectedLabelForDrop,
} from "./ddwtos";
import { getDdmarkerChoices } from "./ddmarker";
import {
  getDdimageOrTextDrops,
  getDdimageOrTextDropSlotIndex,
  getDdimageOrTextSelectedLabelForDrop,
} from "./ddimageortext";
import { getChoiceAnswerInputs, getTextAnswerInputs } from "./answerControls";
import { applyAllExactAnswersNow, type ApplyAllExactAnswersResult } from "./autoSelect";
import {
  continueAutoPass,
  getAutoPassPauseInfo,
  getAutoPassTrayMode,
  handleAutoPassTrayAction,
  stopAutoPass,
} from "./autoPass";
import {
  currentQuizAttemptContext,
  currentStoredState,
  currentT,
  setCurrentStoredState,
  stealthModeEnabled,
} from "../../state";
import { isQuizAttemptUrl } from "./quizUrl";
import { patchStoredState } from "../../lib/storage";

const ATTEMPT_STATUS_PANEL_ID = "reduxshare-attempt-status-panel";
const ATTEMPT_STATUS_PANEL_COLLAPSED_STORAGE_KEY = "reduxshareAttemptStatusPanelCollapsed";
const ATTEMPT_STATUS_PANEL_POSITION_STORAGE_KEY = "reduxshareAttemptStatusPanelPosition";
const SOLVE_ALL_RESULT_VISIBLE_MS = 2500;

let attemptStatusPanelClockId: number | null = null;
let attemptStatusPanelCollapsed = false;
let attemptStatusPanelTrayOpen = false;
let attemptStatusPanelSolveAllResult: string | null = null;
let attemptStatusPanelSolveAllResultTimeoutId: number | null = null;

let attemptStatusPanelClosedInSession = false;
let attemptStatusPanelInteractionListenerInstalled = false;
let attemptStatusPanelResizeListenerInstalled = false;
let attemptStatusPanelDragListenersInstalled = false;
let attemptStatusPanelProgressListenerInstalled = false;
let attemptStatusPanelProgressUpdateId: number | null = null;
type AttemptStatusPanelAnchor = "left" | "right";
type AttemptStatusPanelVerticalAnchor = "top" | "bottom";
type AttemptStatusPanelPosition = {
  anchor: AttemptStatusPanelAnchor;
  offset: number;
  verticalAnchor: AttemptStatusPanelVerticalAnchor;
  verticalOffset: number;
};
let attemptStatusPanelPosition: AttemptStatusPanelPosition | null = null;
let attemptStatusPanelDragState: {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
} | null = null;

export function resetAttemptStatusPanelState() {
  attemptStatusPanelCollapsed = false;
  attemptStatusPanelTrayOpen = false;
  clearAttemptStatusPanelSolveAllResult();
  attemptStatusPanelClosedInSession = false;
  removeAttemptStatusPanel();
}

export function isSourceLookupQuestion(question: QuizQuestionSummary) {
  return !isAiOnlyQuestionTypeName(question.questionType);
}

export function getAttemptStatusPanelUsername() {
  const username = currentStoredState?.userProfile?.username?.trim();

  if (username) {
    return username;
  }

  const email = currentStoredState?.authSession?.user?.email?.trim();

  if (email) {
    return email;
  }

  return currentT("quiz.panel.guest");
}

type AttemptStatusPanelQuestionProgressLevel = "low" | "medium" | "normal" | "good";

type AttemptStatusPanelQuestionProgress = {
  currentQuestion: number | null;
  totalQuestions: number;
  answeredQuestions: number;
  percent: number;
  level: AttemptStatusPanelQuestionProgressLevel;
};

export function getAttemptStatusPanelProgressLevel(
  percent: number,
): AttemptStatusPanelQuestionProgressLevel {
  if (percent < 25) {
    return "low";
  }

  if (percent < 50) {
    return "medium";
  }

  if (percent < 85) {
    return "normal";
  }

  return "good";
}

export function getAttemptStatusPanelProgressColor(percent: number) {
  switch (getAttemptStatusPanelProgressLevel(percent)) {
    case "low":
      return "#ff6b6b";
    case "medium":
      return "#ffd166";
    case "normal":
      return "#5cc8ff";
    case "good":
      return "#68e3a1";
  }
}

export function parseAttemptStatusPanelQuestionNumber(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalizedValue = value.replace(/\s+/g, " ").trim();
  const labelledMatch = /(?:question|вопрос)\s*(\d+)/iu.exec(normalizedValue);
  const numberMatch = labelledMatch ?? /(?:^|\D)(\d+)(?:\D|$)/.exec(normalizedValue);

  if (!numberMatch) {
    return null;
  }

  const parsed = Number.parseInt(numberMatch[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getAttemptStatusPanelQuestionNumberFromElement(element: Element) {
  const values = [
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.id,
    element.textContent,
  ];

  for (const value of values) {
    const questionNumber = parseAttemptStatusPanelQuestionNumber(value);

    if (questionNumber !== null) {
      return questionNumber;
    }
  }

  return null;
}

export function getAttemptStatusPanelQuestionPageFromUrl() {
  try {
    const page = new URL(window.location.href).searchParams.get("page");

    if (page === null) {
      return null;
    }

    const parsed = Number.parseInt(page, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed + 1 : null;
  } catch {
    return null;
  }
}

export function getAttemptStatusPanelQuestionNavButtons() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      "#mod_quiz_navblock .qnbutton, .quiznavigation .qnbutton, .qn_buttons .qnbutton, .qnbutton",
    ),
  ).filter((button) => {
    return (
      getAttemptStatusPanelQuestionNumberFromElement(button) !== null ||
      /^quiznavbutton\d+$/i.test(button.id)
    );
  });
}

export function getAttemptStatusPanelCurrentNavButton(navButtons: HTMLElement[]) {
  const explicitCurrentButton = navButtons.find((button) => {
    return (
      button.classList.contains("thispage") ||
      button.classList.contains("active") ||
      button.getAttribute("aria-current") === "page" ||
      button.getAttribute("data-active") === "true" ||
      button.closest(".thispage") !== null
    );
  });

  if (explicitCurrentButton) {
    return explicitCurrentButton;
  }

  const currentPageQuestion = getAttemptStatusPanelQuestionPageFromUrl();
  return currentPageQuestion === null ? null : (navButtons[currentPageQuestion - 1] ?? null);
}

export function getAttemptStatusPanelVisibleQuestionNumber() {
  const visibleQuestionLabels = Array.from(
    document.querySelectorAll<HTMLElement>(".que .info .no, .que .info .qno, .que .qno, .que .no"),
  );

  for (const label of visibleQuestionLabels) {
    const questionNumber = parseAttemptStatusPanelQuestionNumber(label.textContent);

    if (questionNumber !== null) {
      return questionNumber;
    }
  }

  return null;
}

export function getAttemptStatusPanelQuestionNumberFromQuestionNode(
  questionNode: Element,
  fallbackQuestionNumber: number | null,
) {
  const numberLabel = questionNode.querySelector<HTMLElement>(".info .no, .info .qno, .qno, .no");
  const questionNumber = numberLabel
    ? parseAttemptStatusPanelQuestionNumber(numberLabel.textContent)
    : null;

  if (questionNumber !== null) {
    return questionNumber;
  }

  const navId = questionNode.getAttribute("id") ?? questionNode.id;
  const numberFromId = parseAttemptStatusPanelQuestionNumber(navId);

  if (numberFromId !== null) {
    return numberFromId;
  }

  return fallbackQuestionNumber;
}

export function normalizeAttemptStatusPanelAnswerStateText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function getAttemptStatusPanelAnswerStateFromText(
  value: string | null | undefined,
): boolean | null {
  const normalizedValue = normalizeAttemptStatusPanelAnswerStateText(value);

  if (!normalizedValue) {
    return null;
  }

  if (
    /\bnot\s+yet\s+answered\b|\bnotanswered\b|\bunanswered\b|\bincomplete\b|не\s*отвеч|нет\s+ответ|без\s+ответ|не\s+заверш/iu.test(
      normalizedValue,
    )
  ) {
    return false;
  }

  if (
    /\banswer\s+saved\b|\banswered\b|\bcomplete\b|\bfinished\b|ответ\s+сохран|сохран[её]н|отвечен|отвечено|ответ\s+дан|заверш/iu.test(
      normalizedValue,
    )
  ) {
    return true;
  }

  return null;
}

export function getAttemptStatusPanelQuestionStateFromNode(questionNode: Element): boolean | null {
  const stateText = [
    questionNode.querySelector<HTMLElement>(".state")?.textContent,
    questionNode.getAttribute("aria-label"),
    questionNode.getAttribute("title"),
  ].join(" ");

  return getAttemptStatusPanelAnswerStateFromText(stateText);
}

export function isAttemptStatusPanelNavButtonAnswered(button: HTMLElement) {
  const stateFromText = getAttemptStatusPanelAnswerStateFromText(
    [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.className,
      button.textContent,
    ].join(" "),
  );

  if (stateFromText !== null) {
    return stateFromText;
  }

  return (
    button.classList.contains("answersaved") ||
    button.classList.contains("complete") ||
    button.classList.contains("correct") ||
    button.classList.contains("partiallycorrect") ||
    button.classList.contains("incorrect")
  );
}

export function isAttemptStatusPanelSelectAnswered(select: HTMLSelectElement) {
  if (!select.value) {
    return false;
  }

  const selectedOption = select.selectedOptions[0] ?? select.options[select.selectedIndex];
  return selectedOption ? !isPlaceholderSelectOption(selectedOption) : true;
}

export function areAttemptStatusPanelChoiceControlsAnswered(questionNode: Element): boolean | null {
  const answerInputs = getChoiceAnswerInputs(questionNode);

  if (answerInputs.length === 0) {
    return null;
  }

  const radioGroups = new Map<string, HTMLInputElement[]>();
  const checkboxInputs: HTMLInputElement[] = [];

  for (const input of answerInputs) {
    if (input.type === "checkbox") {
      checkboxInputs.push(input);
      continue;
    }

    const groupKey = input.name || input.id || `choice:${radioGroups.size}`;
    const group = radioGroups.get(groupKey) ?? [];
    group.push(input);
    radioGroups.set(groupKey, group);
  }

  const radioGroupsAnswered = Array.from(radioGroups.values()).every((group) =>
    group.some((input) => input.checked),
  );
  const checkboxControlsAnswered =
    checkboxInputs.length === 0 || checkboxInputs.some((input) => input.checked);

  return radioGroupsAnswered && checkboxControlsAnswered;
}

export function areAttemptStatusPanelSelectControlsAnswered(questionNode: Element): boolean | null {
  const selects = getSelectableAnswerControls(questionNode);

  if (selects.length === 0) {
    return null;
  }

  return selects.every(isAttemptStatusPanelSelectAnswered);
}

export function areAttemptStatusPanelTextControlsAnswered(questionNode: Element): boolean | null {
  const controls = [...getTextAnswerInputs(questionNode), ...getEssayAnswerTextareas(questionNode)];

  if (controls.length === 0) {
    return null;
  }

  return controls.every((control) => control.value.trim() !== "");
}

export function isAttemptStatusPanelHiddenAnswerValueFilled(
  input: HTMLInputElement | null | undefined,
) {
  if (!input) {
    return false;
  }

  const value = input.value.trim();
  return value !== "" && value !== "0";
}

export function areAttemptStatusPanelDdwtosControlsAnswered(questionNode: Element): boolean | null {
  const drops = getDdwtosDrops(questionNode);

  if (drops.length === 0) {
    return null;
  }

  return drops.every((drop) => {
    const slotIndex = getDdwtosDropSlotIndex(drop);
    return (
      slotIndex !== null &&
      (isAttemptStatusPanelHiddenAnswerValueFilled(getDdwtosPlaceInput(questionNode, slotIndex)) ||
        getDdwtosSelectedLabelForDrop(questionNode, drop).trim() !== "")
    );
  });
}

export function areAttemptStatusPanelDdmarkerControlsAnswered(
  questionNode: Element,
): boolean | null {
  const choices = getDdmarkerChoices(questionNode);

  if (choices.length === 0) {
    return null;
  }

  return choices.every((choice) => normalizeDdmarkerCoordinate(choice.input.value) !== "");
}

export function areAttemptStatusPanelDdimageOrTextControlsAnswered(
  questionNode: Element,
): boolean | null {
  const drops = getDdimageOrTextDrops(questionNode);

  if (drops.length === 0) {
    return null;
  }

  return drops.every((drop) => {
    const slotIndex = getDdimageOrTextDropSlotIndex(drop);
    return (
      slotIndex !== null &&
      (isAttemptStatusPanelHiddenAnswerValueFilled(
        getDdimageOrTextPlaceInput(questionNode, slotIndex),
      ) ||
        getDdimageOrTextSelectedLabelForDrop(questionNode, drop).trim() !== "")
    );
  });
}

export function isAttemptStatusPanelOrderingAnswered(questionNode: Element): boolean | null {
  if (!questionNode.classList.contains("ordering")) {
    return null;
  }

  const responseInput = getOrderingResponseInput(questionNode);
  return Boolean(responseInput?.value.trim());
}

export function getAttemptStatusPanelQuestionControlAnswerState(
  questionNode: Element,
): boolean | null {
  const checks = [
    areAttemptStatusPanelChoiceControlsAnswered(questionNode),
    areAttemptStatusPanelSelectControlsAnswered(questionNode),
    areAttemptStatusPanelTextControlsAnswered(questionNode),
    areAttemptStatusPanelDdwtosControlsAnswered(questionNode),
    areAttemptStatusPanelDdmarkerControlsAnswered(questionNode),
    areAttemptStatusPanelDdimageOrTextControlsAnswered(questionNode),
    isAttemptStatusPanelOrderingAnswered(questionNode),
  ].filter((check): check is boolean => check !== null);

  return checks.length > 0 ? checks.every(Boolean) : null;
}

export function isAttemptStatusPanelQuestionAnswered(entry: AnswerEntry) {
  const { questionNode } = entry;
  const controlState = getAttemptStatusPanelQuestionControlAnswerState(questionNode);

  if (controlState !== null) {
    return controlState;
  }

  const stateFromNode = getAttemptStatusPanelQuestionStateFromNode(questionNode);
  return stateFromNode ?? false;
}

export function getAttemptStatusPanelAnsweredQuestionCount(
  totalQuestions: number,
  navButtons: HTMLElement[],
  currentQuestion: number | null,
) {
  const answeredByQuestionNumber = new Map<number, boolean>();

  navButtons.forEach((button, index) => {
    const questionNumber = getAttemptStatusPanelQuestionNumberFromElement(button) ?? index + 1;

    if (questionNumber > 0) {
      answeredByQuestionNumber.set(questionNumber, isAttemptStatusPanelNavButtonAnswered(button));
    }
  });

  const answerEntries = getAnswerEntries();

  answerEntries.forEach((entry, index) => {
    const fallbackQuestionNumber =
      answerEntries.length === 1 && currentQuestion !== null ? currentQuestion : index + 1;
    const questionNumber = getAttemptStatusPanelQuestionNumberFromQuestionNode(
      entry.questionNode,
      fallbackQuestionNumber,
    );

    if (questionNumber !== null && questionNumber > 0) {
      answeredByQuestionNumber.set(questionNumber, isAttemptStatusPanelQuestionAnswered(entry));
    }
  });

  const answeredQuestionCount = Array.from(answeredByQuestionNumber.values()).filter(
    Boolean,
  ).length;
  return totalQuestions > 0
    ? Math.min(totalQuestions, answeredQuestionCount)
    : answeredQuestionCount;
}

export function getAttemptStatusPanelQuestionProgress(
  totalQuestionsFallback: number,
): AttemptStatusPanelQuestionProgress {
  const navButtons = getAttemptStatusPanelQuestionNavButtons();
  const currentNavButton = getAttemptStatusPanelCurrentNavButton(navButtons);
  const currentFromNavigation = currentNavButton
    ? (getAttemptStatusPanelQuestionNumberFromElement(currentNavButton) ??
      navButtons.indexOf(currentNavButton) + 1)
    : null;
  const currentFromVisibleQuestion = getAttemptStatusPanelVisibleQuestionNumber();
  const currentFromPageUrl = getAttemptStatusPanelQuestionPageFromUrl();
  const totalQuestions = Math.max(
    totalQuestionsFallback,
    currentQuizAttemptContext?.questionCount ?? 0,
    navButtons.length,
    currentFromNavigation ?? 0,
    currentFromVisibleQuestion ?? 0,
    currentFromPageUrl ?? 0,
  );
  const rawCurrentQuestion =
    currentFromNavigation ??
    currentFromVisibleQuestion ??
    currentFromPageUrl ??
    (totalQuestions === 1 ? 1 : null);
  const currentQuestion =
    rawCurrentQuestion === null || totalQuestions <= 0
      ? null
      : Math.min(totalQuestions, Math.max(1, rawCurrentQuestion));
  const answeredQuestions = getAttemptStatusPanelAnsweredQuestionCount(
    totalQuestions,
    navButtons,
    currentQuestion,
  );
  const percent =
    totalQuestions <= 0
      ? 0
      : Math.max(0, Math.min(100, Math.round((answeredQuestions / totalQuestions) * 100)));

  return {
    currentQuestion,
    totalQuestions,
    answeredQuestions,
    percent,
    level: getAttemptStatusPanelProgressLevel(percent),
  };
}

export function getAttemptStatusPanelProgressLocale() {
  return getContentLocale(currentStoredState?.settings?.language).toLowerCase().startsWith("ru")
    ? "ru"
    : "en";
}

export function getAttemptStatusPanelProgressTitle() {
  return getAttemptStatusPanelProgressLocale() === "ru"
    ? "Прогресс выполнения"
    : "Completion progress";
}

export function getAttemptStatusPanelCompletedProgressLabel(
  progress: AttemptStatusPanelQuestionProgress,
) {
  return getAttemptStatusPanelProgressLocale() === "ru"
    ? `Сделано ${progress.answeredQuestions} из ${progress.totalQuestions}`
    : `Done ${progress.answeredQuestions} of ${progress.totalQuestions}`;
}

export function getAttemptStatusPanelProgressCaption(progress: AttemptStatusPanelQuestionProgress) {
  return getAttemptStatusPanelCompletedProgressLabel(progress);
}

export function getAttemptStatusPanelProgressAriaLabel(
  progress: AttemptStatusPanelQuestionProgress,
) {
  return `${getAttemptStatusPanelProgressCaption(progress)}, ${progress.percent}%`;
}

export function getAttemptStatusPanelStats() {
  const fallbackQuestionCount = document.querySelectorAll(".que").length;
  const questions = currentQuizAttemptContext?.questions ?? [];
  const sourceQuestions = questions.filter(isSourceLookupQuestion);
  const totalQuestions = currentQuizAttemptContext?.questionCount ?? fallbackQuestionCount;
  const questionsWithAnswers = sourceQuestions.filter((question) => {
    return (
      Boolean(question.questionId) &&
      hasSourceAnswerData(getAnswerDataForQuestion(question.questionId))
    );
  }).length;
  const failedQuestions = Math.max(totalQuestions - questionsWithAnswers, 0);

  return {
    totalQuestions,
    questionsWithAnswers,
    failedQuestions,
  };
}

export function stopAttemptStatusPanelClock() {
  if (attemptStatusPanelClockId !== null) {
    window.clearInterval(attemptStatusPanelClockId);
    attemptStatusPanelClockId = null;
  }

  if (attemptStatusPanelProgressUpdateId !== null) {
    window.clearTimeout(attemptStatusPanelProgressUpdateId);
    attemptStatusPanelProgressUpdateId = null;
  }
}

export function removeAttemptStatusPanel() {
  stopAttemptStatusPanelClock();
  document.getElementById(ATTEMPT_STATUS_PANEL_ID)?.remove();
}

export function getAttemptStatusPanelExpandedWidth() {
  return Math.max(220, Math.min(360, window.innerWidth - 24));
}

export function getAttemptStatusPanelRectLimits(host: HTMLDivElement, shadowRoot: ShadowRoot) {
  const width =
    host.getBoundingClientRect().width ||
    Number.parseFloat(host.style.width) ||
    getAttemptStatusPanelExpandedWidth();
  const panel =
    shadowRoot.querySelector<HTMLElement>(".panel") ??
    (shadowRoot.firstElementChild instanceof HTMLElement ? shadowRoot.firstElementChild : null);
  const height = panel?.getBoundingClientRect().height || host.getBoundingClientRect().height || 72;
  const minOffset = 16;

  return {
    width,
    height,
    minTop: minOffset,
    minOffset,
    maxOffset: Math.max(minOffset, window.innerWidth - width - minOffset),
    maxTop: Math.max(minOffset, window.innerHeight - height - minOffset),
  };
}

export function clampAttemptStatusPanelPosition(
  position: AttemptStatusPanelPosition,
  host: HTMLDivElement,
  shadowRoot: ShadowRoot,
) {
  const limits = getAttemptStatusPanelRectLimits(host, shadowRoot);

  return {
    anchor: position.anchor,
    offset: Math.min(limits.maxOffset, Math.max(limits.minOffset, Math.round(position.offset))),
    verticalAnchor: position.verticalAnchor,
    verticalOffset: Math.min(
      limits.maxTop,
      Math.max(limits.minTop, Math.round(position.verticalOffset)),
    ),
  };
}

export function getDefaultAttemptStatusPanelPosition(host: HTMLDivElement, shadowRoot: ShadowRoot) {
  const limits = getAttemptStatusPanelRectLimits(host, shadowRoot);

  return {
    anchor: "left" as const,
    offset: limits.minOffset,
    verticalAnchor: "bottom" as const,
    verticalOffset: limits.minTop,
  };
}

export function applyAttemptStatusPanelPosition(host: HTMLDivElement, shadowRoot: ShadowRoot) {
  const nextPosition = attemptStatusPanelPosition
    ? clampAttemptStatusPanelPosition(attemptStatusPanelPosition, host, shadowRoot)
    : getDefaultAttemptStatusPanelPosition(host, shadowRoot);

  host.style.left = nextPosition.anchor === "left" ? `${nextPosition.offset}px` : "auto";
  host.style.right = nextPosition.anchor === "right" ? `${nextPosition.offset}px` : "auto";
  host.style.top =
    nextPosition.verticalAnchor === "top" ? `${nextPosition.verticalOffset}px` : "auto";
  host.style.bottom =
    nextPosition.verticalAnchor === "bottom" ? `${nextPosition.verticalOffset}px` : "auto";
}

export function getAttemptStatusPanelPositionFromRect(
  rect: Pick<DOMRect, "left" | "top" | "width">,
  host: HTMLDivElement,
  shadowRoot: ShadowRoot,
): AttemptStatusPanelPosition {
  const anchor: AttemptStatusPanelAnchor =
    rect.left + rect.width / 2 <= window.innerWidth / 2 ? "left" : "right";
  const offset = anchor === "left" ? rect.left : window.innerWidth - rect.width - rect.left;
  const limits = getAttemptStatusPanelRectLimits(host, shadowRoot);
  const verticalAnchor: AttemptStatusPanelVerticalAnchor =
    rect.top + limits.height / 2 <= window.innerHeight / 2 ? "top" : "bottom";
  const verticalOffset =
    verticalAnchor === "top" ? rect.top : window.innerHeight - limits.height - rect.top;

  return clampAttemptStatusPanelPosition(
    {
      anchor,
      offset,
      verticalAnchor,
      verticalOffset,
    },
    host,
    shadowRoot,
  );
}

export function syncAttemptStatusPanelHostWidth(host: HTMLDivElement, shadowRoot: ShadowRoot) {
  const expandedWidth = getAttemptStatusPanelExpandedWidth();
  let targetWidth = expandedWidth;

  if (attemptStatusPanelCollapsed) {
    const brand = shadowRoot.querySelector<HTMLElement>(".brand");
    const panelPaddingX = 28;
    const panelBorderX = 2;
    const brandWidth = brand ? Math.ceil(brand.scrollWidth + panelPaddingX + panelBorderX) : 180;
    targetWidth = Math.min(expandedWidth, Math.max(156, brandWidth));
  }

  host.style.width = `${targetWidth}px`;
}

export function handleAttemptStatusPanelViewportResize() {
  const host = document.getElementById(ATTEMPT_STATUS_PANEL_ID);

  if (!(host instanceof HTMLDivElement) || !host.shadowRoot) {
    return;
  }

  syncAttemptStatusPanelHostWidth(host, host.shadowRoot);
  applyAttemptStatusPanelPosition(host, host.shadowRoot);
}

export function ensureAttemptStatusPanelResizeListener() {
  if (attemptStatusPanelResizeListenerInstalled) {
    return;
  }

  attemptStatusPanelResizeListenerInstalled = true;
  window.addEventListener("resize", handleAttemptStatusPanelViewportResize);
}

export function finishAttemptStatusPanelDrag(event: PointerEvent | null) {
  if (!attemptStatusPanelDragState) {
    return;
  }

  if (event && event.pointerId !== attemptStatusPanelDragState.pointerId) {
    return;
  }

  const host = document.getElementById(ATTEMPT_STATUS_PANEL_ID);

  if (
    attemptStatusPanelDragState.moved &&
    host instanceof HTMLDivElement &&
    host.shadowRoot &&
    Number.isFinite(host.offsetLeft) &&
    Number.isFinite(host.offsetTop)
  ) {
    attemptStatusPanelPosition = getAttemptStatusPanelPositionFromRect(
      host.getBoundingClientRect(),
      host,
      host.shadowRoot,
    );

    void chrome.storage.local.set({
      [ATTEMPT_STATUS_PANEL_POSITION_STORAGE_KEY]: attemptStatusPanelPosition,
    });
    renderAttemptStatusPanel();
  }

  attemptStatusPanelDragState = null;
}

export function handleAttemptStatusPanelDragMove(event: PointerEvent) {
  if (!attemptStatusPanelDragState || event.pointerId !== attemptStatusPanelDragState.pointerId) {
    return;
  }

  const host = document.getElementById(ATTEMPT_STATUS_PANEL_ID);

  if (!(host instanceof HTMLDivElement) || !host.shadowRoot) {
    finishAttemptStatusPanelDrag(event);
    return;
  }

  const nextPosition = getAttemptStatusPanelPositionFromRect(
    {
      left: event.clientX - attemptStatusPanelDragState.offsetX,
      top: event.clientY - attemptStatusPanelDragState.offsetY,
      width: host.getBoundingClientRect().width,
    },
    host,
    host.shadowRoot,
  );

  if (!attemptStatusPanelDragState.moved) {
    const currentRect = host.getBoundingClientRect();
    const nextLeft =
      nextPosition.anchor === "left"
        ? nextPosition.offset
        : window.innerWidth - currentRect.width - nextPosition.offset;
    const nextTop =
      nextPosition.verticalAnchor === "top"
        ? nextPosition.verticalOffset
        : window.innerHeight - currentRect.height - nextPosition.verticalOffset;
    attemptStatusPanelDragState.moved =
      Math.abs(nextLeft - currentRect.left) > 2 || Math.abs(nextTop - currentRect.top) > 2;
  }

  attemptStatusPanelPosition = nextPosition;
  applyAttemptStatusPanelPosition(host, host.shadowRoot);
  event.preventDefault();
}

export function handleAttemptStatusPanelDragEnd(event: PointerEvent) {
  finishAttemptStatusPanelDrag(event);
}

export function ensureAttemptStatusPanelDragListeners() {
  if (attemptStatusPanelDragListenersInstalled) {
    return;
  }

  attemptStatusPanelDragListenersInstalled = true;
  document.addEventListener("pointermove", handleAttemptStatusPanelDragMove, true);
  document.addEventListener("pointerup", handleAttemptStatusPanelDragEnd, true);
  document.addEventListener("pointercancel", handleAttemptStatusPanelDragEnd, true);
}

export function scheduleAttemptStatusPanelProgressUpdate() {
  if (attemptStatusPanelProgressUpdateId !== null) {
    window.clearTimeout(attemptStatusPanelProgressUpdateId);
  }

  attemptStatusPanelProgressUpdateId = window.setTimeout(() => {
    attemptStatusPanelProgressUpdateId = null;
    updateAttemptStatusPanelProgress();
  }, 0);
}

export function handleAttemptStatusPanelAnswerControlChange(event: Event) {
  const target = event.target instanceof Element ? event.target : null;

  if (!target?.closest(".que")) {
    return;
  }

  scheduleAttemptStatusPanelProgressUpdate();
}

export function ensureAttemptStatusPanelProgressListener() {
  if (attemptStatusPanelProgressListenerInstalled) {
    return;
  }

  attemptStatusPanelProgressListenerInstalled = true;
  document.addEventListener("input", handleAttemptStatusPanelAnswerControlChange, true);
  document.addEventListener("change", handleAttemptStatusPanelAnswerControlChange, true);
  document.addEventListener("click", handleAttemptStatusPanelAnswerControlChange, true);
}

export function ensureAttemptStatusPanel(): HTMLDivElement {
  let host = document.getElementById(ATTEMPT_STATUS_PANEL_ID) as HTMLDivElement | null;

  if (!(host instanceof HTMLDivElement)) {
    host = document.createElement("div");
    host.id = ATTEMPT_STATUS_PANEL_ID;
    host.style.position = "fixed";
    host.style.top = "16px";
    host.style.right = "16px";
    host.style.zIndex = "2147483646";
    host.style.pointerEvents = "none";
    host.style.width = `${getAttemptStatusPanelExpandedWidth()}px`;
    host.style.transition = "width 240ms cubic-bezier(0.16, 1, 0.3, 1)";
    host.attachShadow({ mode: "open" });
    document.documentElement.append(host);
  }

  if (host.shadowRoot && host.shadowRoot.childElementCount === 0) {
    ensureAttemptStatusPanelInteractionListener();
    ensureAttemptStatusPanelResizeListener();
    ensureAttemptStatusPanelDragListeners();
    ensureAttemptStatusPanelProgressListener();
    host.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .panel {
          box-sizing: border-box;
          position: relative;
          width: 100%;
          border: 1px solid rgba(var(--reduxshare-panel-accent-rgb), 0.24);
          border-radius: 16px;
          background:
            radial-gradient(circle at top right, rgba(var(--reduxshare-panel-accent-rgb), 0.18), transparent 54%),
            linear-gradient(180deg, rgba(19, 20, 27, 0.95), rgba(15, 16, 22, 0.91)),
            rgba(15, 16, 22, 0.92);
          backdrop-filter: blur(16px) saturate(120%);
          color: #f6f7fb;
          box-shadow:
            0 20px 44px rgba(0, 0, 0, 0.28),
            0 0 0 1px rgba(var(--reduxshare-panel-accent-rgb), 0.05) inset;
          padding: 14px;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          pointer-events: auto;
          transform-origin: top right;
          animation: panel-enter 240ms cubic-bezier(0.16, 1, 0.3, 1);
          transition:
            transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
            border-color 160ms ease,
            box-shadow 180ms ease,
            background 180ms ease;
        }

        .panel--collapsed {
          cursor: pointer;
        }

        .panel:hover {
          transform: translateY(-1px);
          box-shadow:
            0 24px 48px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(var(--reduxshare-panel-accent-rgb), 0.08) inset;
        }

        .header,
        .meta,
        .stats {
          display: grid;
        }

        .header {
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          transition: margin-bottom 220ms cubic-bezier(0.16, 1, 0.3, 1);
          margin-bottom: 12px;
          cursor: grab;
          user-select: none;
          -webkit-user-select: none;
        }

        .panel--collapsed .header {
          grid-template-columns: 1fr;
          margin-bottom: 0;
        }

        .panel--collapsed .header-actions {
          display: none;
        }

        .header:active {
          cursor: grabbing;
        }

        .brand {
          display: grid;
          grid-template-columns: auto max-content;
          gap: 10px;
          align-items: center;
          min-width: 0;
          width: max-content;
          max-width: 100%;
          justify-self: start;
        }

        .brand-mark {
          width: 36px;
          height: 36px;
          border-radius: 11px;
          object-fit: cover;
          box-shadow:
            0 8px 24px rgba(var(--reduxshare-panel-accent-rgb), 0.22),
            0 0 0 1px rgba(255, 255, 255, 0.08) inset;
          transition:
            transform 160ms ease,
            box-shadow 180ms ease;
        }

        .panel:hover .brand-mark {
          transform: scale(1.03);
          box-shadow:
            0 12px 28px rgba(var(--reduxshare-panel-accent-rgb), 0.28),
            0 0 0 1px rgba(255, 255, 255, 0.1) inset;
        }

        .brand-name {
          font-size: 18px;
          font-weight: 700;
          line-height: 1.1;
          color: var(--reduxshare-panel-accent-soft);
          transition: color 160ms ease;
        }

        .brand-subtitle {
          display: none;
        }

        .header-actions {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }

        .close {
          width: 32px;
          height: 32px;
          border: 1px solid rgba(var(--reduxshare-panel-accent-rgb), 0.18);
          border-radius: 10px;
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.08);
          color: #f6f7fb;
          cursor: pointer;
          display: grid;
          place-items: center;
          padding: 0;
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            transform 120ms ease,
            box-shadow 160ms ease,
            opacity 140ms ease;
        }

        .close:hover {
          background: rgba(217, 72, 79, 0.18);
          border-color: rgba(217, 72, 79, 0.45);
          box-shadow: 0 8px 20px rgba(217, 72, 79, 0.16);
        }

        .close:active {
          transform: scale(0.97);
        }

        .close__label {
          display: block;
          font-size: 22px;
          line-height: 1;
          font-weight: 500;
          transform: translateY(-1px);
        }

        .panel--collapsed .close {
          display: none;
        }

        .toggle {
          width: 32px;
          height: 32px;
          border: 1px solid rgba(var(--reduxshare-panel-accent-rgb), 0.18);
          border-radius: 10px;
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.08);
          color: #f6f7fb;
          cursor: pointer;
          display: grid;
          place-items: center;
          padding: 0;
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            transform 120ms ease,
            box-shadow 160ms ease,
            opacity 140ms ease;
        }

        .toggle:hover {
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.14);
          border-color: rgba(var(--reduxshare-panel-accent-rgb), 0.32);
          box-shadow: 0 8px 20px rgba(var(--reduxshare-panel-accent-rgb), 0.16);
        }

        .toggle:active {
          transform: scale(0.97);
        }

        .toggle__label {
          display: block;
          font-size: 22px;
          line-height: 1;
          font-weight: 500;
          transform: translateY(-1px);
        }

        .panel--collapsed .toggle {
          display: none;
        }

        .settings-ear {
          all: unset;
          box-sizing: border-box;
          position: absolute;
          top: 14px;
          display: grid;
          width: 22px;
          height: 36px;
          place-items: center;
          border: 1px solid rgba(var(--reduxshare-panel-accent-rgb), 0.24);
          border-radius: 8px;
          background: linear-gradient(180deg, rgba(19, 20, 27, 0.97), rgba(15, 16, 22, 0.94));
          color: color-mix(in srgb, var(--reduxshare-panel-accent) 78%, #f6f7fb);
          cursor: pointer;
          pointer-events: auto;
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            box-shadow 160ms ease,
            transform 120ms ease;
        }

        .settings-ear[data-side="right"] {
          right: -12px;
        }

        .settings-ear[data-side="left"] {
          left: -12px;
        }

        .settings-ear:hover {
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.14);
          border-color: rgba(var(--reduxshare-panel-accent-rgb), 0.4);
          box-shadow: 0 8px 20px rgba(var(--reduxshare-panel-accent-rgb), 0.16);
        }

        .settings-ear:active {
          transform: scale(0.95);
        }

        .settings-ear__icon {
          display: block;
          width: 14px;
          height: 14px;
          fill: none;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.4;
          transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .settings-ear[data-side="right"] .settings-ear__icon {
          transform: rotate(0deg);
        }

        .settings-ear[data-side="right"][data-open="true"] .settings-ear__icon {
          transform: rotate(180deg);
        }

        .settings-ear[data-side="left"] .settings-ear__icon {
          transform: rotate(180deg);
        }

        .settings-ear[data-side="left"][data-open="true"] .settings-ear__icon {
          transform: rotate(0deg);
        }

        .settings-tray {
          box-sizing: border-box;
          position: absolute;
          top: 14px;
          display: inline-flex;
          gap: 6px;
          align-items: center;
          border: 1px solid rgba(var(--reduxshare-panel-accent-rgb), 0.24);
          border-radius: 12px;
          background:
            radial-gradient(circle at top right, rgba(var(--reduxshare-panel-accent-rgb), 0.14), transparent 60%),
            linear-gradient(180deg, rgba(19, 20, 27, 0.97), rgba(15, 16, 22, 0.94));
          box-shadow:
            0 16px 32px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(var(--reduxshare-panel-accent-rgb), 0.05) inset;
          padding: 6px;
          opacity: 0;
          pointer-events: none;
          visibility: hidden;
          z-index: 1;
          transition:
            opacity 180ms ease,
            transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
            visibility 220ms ease;
        }

        .settings-tray[data-side="right"] {
          left: calc(100% + 10px);
          transform: translateX(-6px);
        }

        .settings-tray[data-side="left"] {
          right: calc(100% + 10px);
          transform: translateX(6px);
        }

        .settings-tray[data-open="true"] {
          opacity: 1;
          pointer-events: auto;
          transform: translateX(0);
          visibility: visible;
        }

        .tray-action {
          all: unset;
          box-sizing: border-box;
          display: grid;
          width: 32px;
          height: 32px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.12);
          color: rgba(246, 247, 251, 0.85);
          cursor: pointer;
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            color 140ms ease,
            box-shadow 160ms ease,
            transform 120ms ease;
        }

        .tray-action:hover {
          border-color: rgba(var(--reduxshare-panel-accent-rgb), 0.4);
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.12);
          color: #f6f7fb;
        }

        .tray-action:active {
          transform: scale(0.95);
        }

        .tray-action[aria-pressed="true"],
        .tray-action[data-result="true"] {
          border-color: rgba(var(--reduxshare-panel-accent-rgb), 0.55);
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.2);
          color: var(--reduxshare-panel-accent);
          box-shadow: 0 8px 20px rgba(var(--reduxshare-panel-accent-rgb), 0.24);
        }

        .tray-action svg {
          display: block;
          width: 16px;
          height: 16px;
          fill: none;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2;
        }

        .settings-ear[data-attention="true"] {
          border-color: rgba(var(--reduxshare-panel-accent-rgb), 0.65);
          color: var(--reduxshare-panel-accent);
          animation: ear-attention 1.4s ease-in-out infinite;
        }

        @keyframes ear-attention {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(var(--reduxshare-panel-accent-rgb), 0.45);
          }

          55% {
            box-shadow: 0 0 0 7px rgba(var(--reduxshare-panel-accent-rgb), 0);
          }
        }

        .settings-tray[data-mode="running"] .auto-pass-icon--play,
        .settings-tray[data-mode="paused"] .auto-pass-icon--play {
          display: none;
        }

        .tray-action:not([data-mode="running"]):not([data-mode="paused"]) .auto-pass-icon--stop {
          display: none;
        }

        .tray-action[data-mode="running"],
        .tray-action[data-mode="paused"] {
          border-color: rgba(var(--reduxshare-panel-accent-rgb), 0.55);
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.2);
          color: var(--reduxshare-panel-accent);
        }

        .tray-pause {
          display: grid;
          gap: 6px;
          max-width: 232px;
          padding: 10px;
          border: 1px solid rgba(var(--reduxshare-panel-accent-rgb), 0.3);
          border-radius: 10px;
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.08);
        }

        .settings-tray:not([data-mode="paused"]) .tray-pause {
          display: none;
        }

        .settings-tray[data-mode="paused"] {
          flex-direction: column;
          align-items: stretch;
          max-width: 256px;
        }

        .tray-pause__title {
          color: #f6f7fb;
          font-size: 12.5px;
          font-weight: 700;
          line-height: 1.35;
        }

        .tray-pause__question {
          color: rgba(246, 247, 251, 0.72);
          font-size: 11.5px;
          line-height: 1.4;
        }

        .tray-pause__hint {
          color: rgba(246, 247, 251, 0.55);
          font-size: 11px;
          line-height: 1.4;
        }

        .tray-pause__actions {
          display: flex;
          gap: 6px;
          margin-top: 2px;
        }

        .tray-pause__continue,
        .tray-pause__stop {
          all: unset;
          box-sizing: border-box;
          flex: 1;
          padding: 6px 10px;
          border-radius: 8px;
          text-align: center;
          font-size: 11.5px;
          font-weight: 650;
          cursor: pointer;
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            color 140ms ease,
            transform 120ms ease;
        }

        .tray-pause__continue {
          border: 1px solid rgba(var(--reduxshare-panel-accent-rgb), 0.55);
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.22);
          color: var(--reduxshare-panel-accent);
        }

        .tray-pause__continue:hover {
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.34);
        }

        .tray-pause__continue:active,
        .tray-pause__stop:active {
          transform: scale(0.96);
        }

        .tray-pause__stop {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.05);
          color: rgba(246, 247, 251, 0.6);
        }

        .tray-pause__stop:hover {
          border-color: rgba(255, 107, 107, 0.5);
          color: #ff6b6b;
        }

        .panel__body {
          display: grid;
          gap: 0;
          max-height: 380px;
          opacity: 1;
          overflow: hidden;
          transform: translateY(0);
          transition:
            max-height 240ms cubic-bezier(0.16, 1, 0.3, 1),
            opacity 180ms ease,
            transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .panel--collapsed .panel__body {
          max-height: 0;
          opacity: 0;
          transform: translateY(-6px);
        }

        .meta {
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-bottom: 12px;
        }

        .meta-item {
          min-width: 0;
        }

        .meta-label,
        .stat__label {
          color: rgba(246, 247, 251, 0.64);
          font-size: 11px;
          line-height: 1.2;
        }

        .meta-value {
          margin-top: 4px;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.25;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .progress {
          display: grid;
          gap: 8px;
          margin-bottom: 12px;
          border: 1px solid rgba(var(--reduxshare-progress-rgb), 0.24);
          border-radius: 12px;
          background:
            radial-gradient(circle at top right, rgba(var(--reduxshare-progress-rgb), 0.2), transparent 62%),
            linear-gradient(180deg, rgba(var(--reduxshare-progress-rgb), 0.12), rgba(255, 255, 255, 0.035));
          padding: 10px;
          box-shadow:
            0 0 0 1px rgba(var(--reduxshare-progress-rgb), 0.04) inset,
            0 10px 24px rgba(var(--reduxshare-progress-rgb), 0.06);
          transition:
            border-color 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
        }

        .progress[hidden] {
          display: none;
        }

        .progress__header,
        .progress__caption {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .progress__label,
        .progress__caption {
          color: rgba(246, 247, 251, 0.66);
          font-size: 11px;
          line-height: 1.2;
        }

        .progress__caption {
          flex-wrap: wrap;
        }

        .progress__percent {
          color: var(--reduxshare-progress-soft);
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          text-shadow: 0 0 16px rgba(var(--reduxshare-progress-rgb), 0.38);
          transition:
            color 180ms ease,
            text-shadow 180ms ease;
        }

        .progress__track {
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.22);
        }

        .progress__bar {
          width: 0%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, rgba(var(--reduxshare-progress-rgb), 0.72), var(--reduxshare-progress-soft));
          box-shadow: 0 0 18px rgba(var(--reduxshare-progress-rgb), 0.32);
          transition:
            width 260ms cubic-bezier(0.16, 1, 0.3, 1),
            background 180ms ease,
            box-shadow 180ms ease;
        }

        .stats {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .stat {
          min-width: 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.04);
          padding: 10px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
          transition:
            transform 160ms ease,
            border-color 160ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
        }

        .stat:hover {
          transform: translateY(-1px);
        }

        .stat__value {
          font-size: 20px;
          font-weight: 700;
          line-height: 1;
          margin-bottom: 6px;
          transition: color 160ms ease;
        }

        .stat--total {
          border-color: rgba(var(--reduxshare-panel-accent-rgb), 0.18);
          background: linear-gradient(180deg, rgba(var(--reduxshare-panel-accent-rgb), 0.1), rgba(var(--reduxshare-panel-accent-rgb), 0.04));
        }

        .stat--total .stat__value {
          color: var(--reduxshare-panel-accent-soft);
        }

        .stat--answers {
          border-color: rgba(77, 214, 143, 0.28);
          background: linear-gradient(180deg, rgba(77, 214, 143, 0.16), rgba(77, 214, 143, 0.06));
        }

        .stat--answers .stat__value {
          color: #68e3a1;
        }

        .stat--failed {
          border-color: rgba(255, 111, 111, 0.24);
          background: linear-gradient(180deg, rgba(255, 111, 111, 0.14), rgba(255, 111, 111, 0.05));
        }

        .stat--failed .stat__value {
          color: #ff8a8a;
        }

        :host([data-theme="light"]) .panel {
          background:
            radial-gradient(circle at top right, rgba(var(--reduxshare-panel-accent-rgb), 0.12), transparent 54%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(240, 242, 246, 0.95));
          box-shadow:
            0 20px 44px rgba(20, 30, 60, 0.14),
            0 0 0 1px rgba(var(--reduxshare-panel-accent-rgb), 0.08) inset;
          color: #14171d;
        }

        :host([data-theme="light"]) .brand-name {
          color: color-mix(in srgb, var(--reduxshare-panel-accent-soft) 60%, #1b2a52);
        }

        :host([data-theme="light"]) .toggle,
        :host([data-theme="light"]) .close {
          color: #14171d;
        }

        :host([data-theme="light"]) .meta-label,
        :host([data-theme="light"]) .stat__label,
        :host([data-theme="light"]) .progress__label,
        :host([data-theme="light"]) .progress__caption {
          color: rgba(20, 25, 40, 0.62);
        }

        :host([data-theme="light"]) .progress__percent {
          color: color-mix(in srgb, var(--reduxshare-progress-soft) 60%, #1b2a52);
          text-shadow: none;
        }

        :host([data-theme="light"]) .progress__track {
          background: rgba(15, 20, 35, 0.1);
          box-shadow: inset 0 1px 2px rgba(20, 30, 60, 0.12);
        }

        :host([data-theme="light"]) .stat {
          border-color: rgba(15, 20, 35, 0.1);
          background: #ffffff;
        }

        :host([data-theme="light"]) .stat--total .stat__value {
          color: color-mix(in srgb, var(--reduxshare-panel-accent-soft) 60%, #1b2a52);
        }

        :host([data-theme="light"]) .stat--answers .stat__value {
          color: #1f9d4d;
        }

        :host([data-theme="light"]) .stat--failed .stat__value {
          color: #d9484f;
        }

        :host([data-theme="light"]) .settings-ear,
        :host([data-theme="light"]) .settings-tray {
          background:
            radial-gradient(circle at top right, rgba(var(--reduxshare-panel-accent-rgb), 0.1), transparent 60%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(240, 242, 246, 0.96));
          box-shadow:
            0 16px 32px rgba(20, 30, 60, 0.14),
            0 0 0 1px rgba(var(--reduxshare-panel-accent-rgb), 0.08) inset;
          color: color-mix(in srgb, var(--reduxshare-panel-accent-soft) 55%, #1b2a52);
        }

        :host([data-theme="light"]) .tray-action {
          border-color: rgba(15, 20, 35, 0.16);
          background: rgba(15, 20, 35, 0.08);
          color: rgba(20, 25, 40, 0.78);
        }

        :host([data-theme="light"]) .tray-action[aria-pressed="true"],
        :host([data-theme="light"]) .tray-action[data-result="true"] {
          border-color: rgba(var(--reduxshare-panel-accent-rgb), 0.5);
          background: rgba(var(--reduxshare-panel-accent-rgb), 0.16);
        }

        :host([data-theme="light"]) .tray-pause {
          border-color: rgba(15, 20, 35, 0.12);
          background: rgba(15, 20, 35, 0.04);
        }

        :host([data-theme="light"]) .tray-pause__title {
          color: #1c2233;
        }

        :host([data-theme="light"]) .tray-pause__question {
          color: rgba(28, 34, 51, 0.72);
        }

        :host([data-theme="light"]) .tray-pause__hint {
          color: rgba(28, 34, 51, 0.55);
        }

        :host([data-theme="light"]) .tray-pause__stop {
          border-color: rgba(15, 20, 35, 0.14);
          background: rgba(15, 20, 35, 0.04);
          color: rgba(20, 25, 40, 0.6);
        }

        @keyframes panel-enter {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.985);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 640px) {
          .panel {
            padding: 12px;
          }

          .meta,
          .stats {
            grid-template-columns: 1fr;
          }
        }
      </style>
      <section class="panel" aria-label="ReduxShare attempt status">
        <div class="header">
          <div class="brand">
            <img class="brand-mark" alt="ReduxShare" />
            <div>
              <div class="brand-name">ReduxShare</div>
              <div class="brand-subtitle"></div>
            </div>
          </div>
          <div class="header-actions">
            <button class="toggle" type="button">
              <span class="toggle__label" aria-hidden="true">-</span>
            </button>
            <button class="close" type="button">
              <span class="close__label" aria-hidden="true">&times;</span>
            </button>
          </div>
        </div>
        <button class="settings-ear" type="button" data-side="right" data-open="false" aria-expanded="false">
          <svg class="settings-ear__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </button>
        <div class="settings-tray" data-side="right" data-open="false" role="group">
          <div class="tray-pause" hidden>
            <div class="tray-pause__title"></div>
            <div class="tray-pause__question" hidden></div>
            <div class="tray-pause__hint"></div>
            <div class="tray-pause__actions">
              <button class="tray-pause__continue" type="button"></button>
              <button class="tray-pause__stop" type="button"></button>
            </div>
          </div>
          <button class="tray-action" type="button" data-tray-action="copyUnlock" aria-pressed="false">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="9" width="12" height="12" rx="2.5" />
              <path d="M5 15h-.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5" />
            </svg>
          </button>
          <button class="tray-action" type="button" data-tray-action="solveAll">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.5 12.75 9.75 18 19.5 6.75" />
            </svg>
          </button>
          <button class="tray-action" type="button" data-tray-action="autoPass" data-mode="idle">
            <svg class="auto-pass-icon auto-pass-icon--play" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6.5v11l9-5.5-9-5.5Z" />
              <path d="M5 5v14" />
            </svg>
            <svg class="auto-pass-icon auto-pass-icon--stop" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
            </svg>
          </button>
        </div>
        <div class="panel__body">
          <div class="meta">
            <div class="meta-item">
              <div class="meta-label meta-label--user"></div>
              <div class="meta-value meta-value--user"></div>
            </div>
            <div class="meta-item">
              <div class="meta-label meta-label--time"></div>
              <div class="meta-value meta-value--time"></div>
            </div>
          </div>
          <div class="progress" hidden>
            <div class="progress__header">
              <div class="progress__label"></div>
              <div class="progress__percent"></div>
            </div>
            <div class="progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <div class="progress__bar"></div>
            </div>
            <div class="progress__caption"></div>
          </div>
          <div class="stats">
            <div class="stat stat--total">
              <div class="stat__value stat__value--total"></div>
              <div class="stat__label stat__label--total"></div>
            </div>
            <div class="stat stat--answers">
              <div class="stat__value stat__value--answers"></div>
              <div class="stat__label stat__label--answers"></div>
            </div>
            <div class="stat stat--failed">
              <div class="stat__value stat__value--failed"></div>
              <div class="stat__label stat__label--failed"></div>
            </div>
          </div>
        </div>
      </section>
    `;

    host.shadowRoot
      .querySelector<HTMLElement>(".header")
      ?.addEventListener("pointerdown", (event) => {
        if (attemptStatusPanelCollapsed || event.button !== 0) {
          return;
        }

        const target = event.target instanceof Element ? event.target : null;

        if (target?.closest(".toggle") || target?.closest(".close")) {
          return;
        }

        const panelHost = document.getElementById(ATTEMPT_STATUS_PANEL_ID);

        if (!(panelHost instanceof HTMLDivElement) || !panelHost.shadowRoot) {
          return;
        }

        const rect = panelHost.getBoundingClientRect();
        attemptStatusPanelPosition = getAttemptStatusPanelPositionFromRect(
          rect,
          panelHost,
          panelHost.shadowRoot,
        );
        attemptStatusPanelDragState = {
          pointerId: event.pointerId,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
          moved: false,
        };
        event.preventDefault();
      });

    host.shadowRoot.querySelector<HTMLButtonElement>(".toggle")?.addEventListener("click", () => {
      setAttemptStatusPanelCollapsed(true);
    });

    host.shadowRoot.querySelector<HTMLButtonElement>(".close")?.addEventListener("click", () => {
      void setAttemptStatusPanelClosedInSession(true);
    });

    host.shadowRoot
      .querySelector<HTMLButtonElement>(".settings-ear")
      ?.addEventListener("click", () => {
        setAttemptStatusPanelTrayOpen(!attemptStatusPanelTrayOpen);
      });

    host.shadowRoot
      .querySelector<HTMLElement>(".settings-tray")
      ?.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (target?.closest('[data-tray-action="copyUnlock"]')) {
          void setCopyUnlockSetting(currentStoredState?.settings?.copyUnlock !== true);
          return;
        }

        if (target?.closest('[data-tray-action="solveAll"]')) {
          runSolveAllTrayAction();
          return;
        }

        if (target?.closest('[data-tray-action="autoPass"]')) {
          handleAutoPassTrayAction();
          return;
        }

        if (target?.closest(".tray-pause__continue")) {
          void continueAutoPass();
          return;
        }

        if (target?.closest(".tray-pause__stop")) {
          void stopAutoPass();
        }
      });
  }

  return host;
}

export function updateAttemptStatusPanelTime() {
  const panelHost = document.getElementById(ATTEMPT_STATUS_PANEL_ID);

  if (
    !(panelHost instanceof HTMLDivElement) ||
    !panelHost.shadowRoot ||
    attemptStatusPanelCollapsed
  ) {
    return;
  }

  const timerValue =
    document.getElementById("quiz-time-left")?.textContent?.replace(/\s+/g, " ").trim() ||
    currentT("quiz.panel.unlimited");
  const timeValue = panelHost.shadowRoot.querySelector<HTMLElement>(".meta-value--time");

  if (timeValue) {
    timeValue.textContent = timerValue;
  }
}

export function applyAttemptStatusPanelProgress(
  host: HTMLDivElement,
  shadowRoot: ShadowRoot,
  progress: AttemptStatusPanelQuestionProgress,
) {
  const progressColor = getAttemptStatusPanelProgressColor(progress.percent);
  const progressSoftColor = mixHexColors(progressColor, "#ffffff", 0.22);
  const progressPanel = shadowRoot.querySelector<HTMLElement>(".progress");
  const progressLabel = shadowRoot.querySelector<HTMLElement>(".progress__label");
  const progressPercent = shadowRoot.querySelector<HTMLElement>(".progress__percent");
  const progressTrack = shadowRoot.querySelector<HTMLElement>(".progress__track");
  const progressBar = shadowRoot.querySelector<HTMLElement>(".progress__bar");
  const progressCaption = shadowRoot.querySelector<HTMLElement>(".progress__caption");

  host.style.setProperty("--reduxshare-progress-color", progressColor);
  host.style.setProperty("--reduxshare-progress-soft", progressSoftColor);
  host.style.setProperty("--reduxshare-progress-rgb", getRgbCssValue(progressColor));

  if (progressPanel) {
    progressPanel.hidden = progress.totalQuestions <= 0;
    progressPanel.dataset.progressLevel = progress.level;
  }

  if (progressLabel) {
    progressLabel.textContent = getAttemptStatusPanelProgressTitle();
  }

  if (progressPercent) {
    progressPercent.textContent = `${progress.percent}%`;
  }

  if (progressTrack) {
    progressTrack.setAttribute("aria-label", getAttemptStatusPanelProgressAriaLabel(progress));
    progressTrack.setAttribute("aria-valuenow", String(progress.percent));
  }

  if (progressBar) {
    progressBar.style.width = `${progress.percent}%`;
  }

  if (progressCaption) {
    progressCaption.textContent = getAttemptStatusPanelProgressCaption(progress);
  }
}

export function updateAttemptStatusPanelProgress() {
  const panelHost = document.getElementById(ATTEMPT_STATUS_PANEL_ID);

  if (
    !(panelHost instanceof HTMLDivElement) ||
    !panelHost.shadowRoot ||
    attemptStatusPanelCollapsed
  ) {
    return;
  }

  applyAttemptStatusPanelProgress(
    panelHost,
    panelHost.shadowRoot,
    getAttemptStatusPanelQuestionProgress(getAttemptStatusPanelStats().totalQuestions),
  );
}

export function renderAttemptStatusPanel() {
  if (
    !isQuizAttemptUrl(window.location) ||
    stealthModeEnabled ||
    !canUseQuizFeatures(currentStoredState)
  ) {
    removeAttemptStatusPanel();
    return;
  }

  if (attemptStatusPanelClosedInSession) {
    removeAttemptStatusPanel();
    return;
  }

  const host = ensureAttemptStatusPanel();
  const shadowRoot = host.shadowRoot;

  if (!shadowRoot) {
    return;
  }

  const accentColor = getAccentColor(currentStoredState?.settings);
  const logoUrl = chrome.runtime.getURL("icons/reduxshare-icon-48.png");
  const username = getAttemptStatusPanelUsername();
  const stats = getAttemptStatusPanelStats();
  const questionProgress = getAttemptStatusPanelQuestionProgress(stats.totalQuestions);
  const toggleLabel = attemptStatusPanelCollapsed
    ? currentT("quiz.panel.expand")
    : currentT("quiz.panel.collapse");
  const closeLabel = currentT("quiz.panel.close");
  const accentSoftColor = mixHexColors(accentColor, "#ffffff", 0.28);
  const panel = shadowRoot.querySelector<HTMLElement>(".panel");
  const brandMark = shadowRoot.querySelector<HTMLImageElement>(".brand-mark");
  const brandSubtitle = shadowRoot.querySelector<HTMLElement>(".brand-subtitle");
  const toggleButton = shadowRoot.querySelector<HTMLButtonElement>(".toggle");
  const userLabel = shadowRoot.querySelector<HTMLElement>(".meta-label--user");
  const userValue = shadowRoot.querySelector<HTMLElement>(".meta-value--user");
  const timeLabel = shadowRoot.querySelector<HTMLElement>(".meta-label--time");
  const totalLabel = shadowRoot.querySelector<HTMLElement>(".stat__label--total");
  const totalValue = shadowRoot.querySelector<HTMLElement>(".stat__value--total");
  const answersLabel = shadowRoot.querySelector<HTMLElement>(".stat__label--answers");
  const answersValue = shadowRoot.querySelector<HTMLElement>(".stat__value--answers");
  const failedLabel = shadowRoot.querySelector<HTMLElement>(".stat__label--failed");
  const failedValue = shadowRoot.querySelector<HTMLElement>(".stat__value--failed");

  host.style.setProperty("--reduxshare-panel-accent", accentColor);
  host.style.setProperty("--reduxshare-panel-accent-soft", accentSoftColor);
  host.style.setProperty("--reduxshare-panel-accent-rgb", getRgbCssValue(accentColor));
  applyContentColorSchemeToHost(host);

  panel?.classList.toggle("panel--collapsed", attemptStatusPanelCollapsed);

  if (brandMark) {
    brandMark.src = logoUrl;

    if (!brandMark.complete) {
      brandMark.addEventListener(
        "load",
        () => {
          syncAttemptStatusPanelHostWidth(host, shadowRoot);
        },
        { once: true },
      );
    }
  }

  if (brandSubtitle) {
    brandSubtitle.textContent = currentT("quiz.panel.subtitle");
  }

  if (toggleButton) {
    toggleButton.setAttribute("aria-label", toggleLabel);
    toggleButton.setAttribute("title", toggleLabel);
  }

  const closeButton = shadowRoot.querySelector<HTMLButtonElement>(".close");

  if (closeButton) {
    closeButton.setAttribute("aria-label", closeLabel);
    closeButton.setAttribute("title", closeLabel);
  }

  const traySide = getAttemptStatusPanelTraySide();
  const settingsEar = shadowRoot.querySelector<HTMLButtonElement>(".settings-ear");
  const settingsTray = shadowRoot.querySelector<HTMLElement>(".settings-tray");
  const copyUnlockAction = shadowRoot.querySelector<HTMLButtonElement>(
    '[data-tray-action="copyUnlock"]',
  );
  const copyUnlockEnabled = currentStoredState?.settings?.copyUnlock === true;

  if (settingsEar) {
    settingsEar.dataset.side = traySide;
    settingsEar.dataset.open = attemptStatusPanelTrayOpen ? "true" : "false";
    settingsEar.toggleAttribute("data-attention", getAutoPassTrayMode() === "paused");
    settingsEar.setAttribute("aria-expanded", attemptStatusPanelTrayOpen ? "true" : "false");
    settingsEar.setAttribute("aria-label", currentT("quiz.panel.settingsTitle"));
    settingsEar.setAttribute("title", currentT("quiz.panel.settingsTitle"));
  }

  if (settingsTray) {
    settingsTray.dataset.side = traySide;
    settingsTray.dataset.open = attemptStatusPanelTrayOpen ? "true" : "false";
    settingsTray.dataset.mode = getAutoPassTrayMode();
  }

  if (copyUnlockAction) {
    copyUnlockAction.setAttribute("aria-pressed", copyUnlockEnabled ? "true" : "false");
    copyUnlockAction.setAttribute("aria-label", currentT("quiz.panel.copyUnlockTitle"));
    copyUnlockAction.setAttribute("title", currentT("quiz.panel.copyUnlockTitle"));
  }

  const solveAllAction = shadowRoot.querySelector<HTMLButtonElement>(
    '[data-tray-action="solveAll"]',
  );

  if (solveAllAction) {
    const solveAllLabel = attemptStatusPanelSolveAllResult ?? currentT("quiz.panel.solveAllTitle");

    solveAllAction.setAttribute("aria-label", solveAllLabel);
    solveAllAction.setAttribute("title", solveAllLabel);
    solveAllAction.toggleAttribute("data-result", attemptStatusPanelSolveAllResult !== null);
  }

  const autoPassMode = getAutoPassTrayMode();
  const autoPassAction = shadowRoot.querySelector<HTMLButtonElement>(
    '[data-tray-action="autoPass"]',
  );

  if (autoPassAction) {
    autoPassAction.dataset.mode = autoPassMode;
    const autoPassLabel =
      autoPassMode === "idle"
        ? currentT("quiz.autoPass.buttonStart")
        : currentT("quiz.autoPass.buttonStop");

    autoPassAction.setAttribute("aria-label", autoPassLabel);
    autoPassAction.setAttribute("title", autoPassLabel);
  }

  const autoPassPause = getAutoPassPauseInfo();
  const trayPause = shadowRoot.querySelector<HTMLElement>(".tray-pause");

  if (trayPause) {
    trayPause.hidden = autoPassPause === null;
    trayPause.setAttribute("aria-label", currentT("quiz.autoPass.running"));

    const pauseTitle = shadowRoot.querySelector<HTMLElement>(".tray-pause__title");

    if (pauseTitle) {
      pauseTitle.textContent =
        autoPassPause?.questionNo !== null && autoPassPause?.questionNo !== undefined
          ? currentT("quiz.autoPass.pausedTitle", { no: autoPassPause.questionNo })
          : currentT("quiz.autoPass.pausedNoNumber");
    }

    const pauseQuestion = shadowRoot.querySelector<HTMLElement>(".tray-pause__question");

    if (pauseQuestion) {
      const questionText = autoPassPause?.questionText ?? null;

      pauseQuestion.textContent = questionText ?? "";
      pauseQuestion.hidden = questionText === null;
    }

    const pauseHint = shadowRoot.querySelector<HTMLElement>(".tray-pause__hint");

    if (pauseHint) {
      pauseHint.textContent = currentT("quiz.autoPass.pausedHint");
    }

    const pauseContinue = shadowRoot.querySelector<HTMLButtonElement>(".tray-pause__continue");

    if (pauseContinue) {
      pauseContinue.textContent = currentT("quiz.autoPass.continue");
      pauseContinue.setAttribute("aria-label", currentT("quiz.autoPass.continue"));
    }

    const pauseStop = shadowRoot.querySelector<HTMLButtonElement>(".tray-pause__stop");

    if (pauseStop) {
      pauseStop.textContent = currentT("quiz.autoPass.buttonStop");
      pauseStop.setAttribute("aria-label", currentT("quiz.autoPass.buttonStop"));
    }
  }

  if (userLabel) {
    userLabel.textContent = currentT("quiz.panel.user");
  }

  if (userValue) {
    userValue.textContent = username;
  }

  if (timeLabel) {
    timeLabel.textContent = currentT("quiz.panel.time");
  }

  applyAttemptStatusPanelProgress(host, shadowRoot, questionProgress);

  if (totalLabel) {
    totalLabel.textContent = currentT("quiz.panel.total");
  }

  if (totalValue) {
    totalValue.textContent = String(stats.totalQuestions);
  }

  if (answersLabel) {
    answersLabel.textContent = currentT("quiz.panel.withAnswers");
  }

  if (answersValue) {
    answersValue.textContent = String(stats.questionsWithAnswers);
  }

  if (failedLabel) {
    failedLabel.textContent = currentT("quiz.panel.failed");
  }

  if (failedValue) {
    failedValue.textContent = String(stats.failedQuestions);
  }

  syncAttemptStatusPanelHostWidth(host, shadowRoot);
  applyAttemptStatusPanelPosition(host, shadowRoot);
  updateAttemptStatusPanelTime();

  if (attemptStatusPanelClockId === null) {
    attemptStatusPanelClockId = window.setInterval(() => {
      updateAttemptStatusPanelTime();
      updateAttemptStatusPanelProgress();
    }, 1000);
  }
}

export async function loadAttemptStatusPanelCollapsedState() {
  try {
    const result = await chrome.storage.local.get(ATTEMPT_STATUS_PANEL_COLLAPSED_STORAGE_KEY);
    attemptStatusPanelCollapsed = result[ATTEMPT_STATUS_PANEL_COLLAPSED_STORAGE_KEY] === true;
  } catch {
    attemptStatusPanelCollapsed = false;
  }
}

export async function loadAttemptStatusPanelPositionState() {
  try {
    const result = await chrome.storage.local.get(ATTEMPT_STATUS_PANEL_POSITION_STORAGE_KEY);
    const value = result[ATTEMPT_STATUS_PANEL_POSITION_STORAGE_KEY];

    if (
      value &&
      typeof value === "object" &&
      (value.anchor === "left" || value.anchor === "right") &&
      typeof value.offset === "number" &&
      Number.isFinite(value.offset) &&
      (value.verticalAnchor === "top" || value.verticalAnchor === "bottom") &&
      typeof value.verticalOffset === "number" &&
      Number.isFinite(value.verticalOffset)
    ) {
      attemptStatusPanelPosition = {
        anchor: value.anchor,
        offset: value.offset,
        verticalAnchor: value.verticalAnchor,
        verticalOffset: value.verticalOffset,
      };
      return;
    }

    if (
      value &&
      typeof value === "object" &&
      typeof value.left === "number" &&
      Number.isFinite(value.left) &&
      typeof value.top === "number" &&
      Number.isFinite(value.top)
    ) {
      attemptStatusPanelPosition = {
        anchor: value.left <= window.innerWidth / 2 ? "left" : "right",
        offset:
          value.left <= window.innerWidth / 2
            ? value.left
            : Math.max(16, window.innerWidth - value.left),
        verticalAnchor: value.top <= window.innerHeight / 2 ? "top" : "bottom",
        verticalOffset:
          value.top <= window.innerHeight / 2
            ? value.top
            : Math.max(16, window.innerHeight - value.top),
      };
      return;
    }
  } catch {
    // Ignore invalid saved UI position and fall back to default placement.
  }

  attemptStatusPanelPosition = null;
}

export async function saveAttemptStatusPanelCollapsedState(collapsed: boolean) {
  try {
    await chrome.storage.local.set({
      [ATTEMPT_STATUS_PANEL_COLLAPSED_STORAGE_KEY]: collapsed,
    });
  } catch {
    // Persisted UI state must not block quiz behavior.
  }
}

export function applyAttemptStatusPanelStorageChanges(
  changes: Record<string, { newValue?: unknown } | undefined>,
) {
  if (changes[ATTEMPT_STATUS_PANEL_COLLAPSED_STORAGE_KEY]) {
    attemptStatusPanelCollapsed =
      changes[ATTEMPT_STATUS_PANEL_COLLAPSED_STORAGE_KEY]?.newValue === true;
    renderAttemptStatusPanel();
  }

  if (changes[ATTEMPT_STATUS_PANEL_POSITION_STORAGE_KEY]) {
    const nextPosition = changes[ATTEMPT_STATUS_PANEL_POSITION_STORAGE_KEY]?.newValue;
    attemptStatusPanelPosition =
      nextPosition &&
      typeof nextPosition === "object" &&
      ((nextPosition as AttemptStatusPanelPosition).anchor === "left" ||
        (nextPosition as AttemptStatusPanelPosition).anchor === "right") &&
      typeof (nextPosition as AttemptStatusPanelPosition).offset === "number" &&
      Number.isFinite((nextPosition as AttemptStatusPanelPosition).offset) &&
      ((nextPosition as AttemptStatusPanelPosition).verticalAnchor === "top" ||
        (nextPosition as AttemptStatusPanelPosition).verticalAnchor === "bottom") &&
      typeof (nextPosition as AttemptStatusPanelPosition).verticalOffset === "number" &&
      Number.isFinite((nextPosition as AttemptStatusPanelPosition).verticalOffset)
        ? {
            anchor: (nextPosition as AttemptStatusPanelPosition).anchor,
            offset: (nextPosition as AttemptStatusPanelPosition).offset,
            verticalAnchor: (nextPosition as AttemptStatusPanelPosition).verticalAnchor,
            verticalOffset: (nextPosition as AttemptStatusPanelPosition).verticalOffset,
          }
        : null;
    renderAttemptStatusPanel();
  }
}

export async function syncAttemptStatusPanelClosedState(storedState: StoredStateLike | undefined) {
  const closed = storedState?.settings?.attemptStatusPanelClosed === true;

  if (closed === attemptStatusPanelClosedInSession) {
    return;
  }

  attemptStatusPanelClosedInSession = closed;
  renderAttemptStatusPanel();

  await patchStoredState({
    settings: {
      ...(currentStoredState?.settings as Settings),
      attemptStatusPanelClosed: closed,
    },
  });

  setCurrentStoredState({
    ...(currentStoredState as StoredStateLike),
    settings: {
      ...(currentStoredState?.settings as Settings),
      attemptStatusPanelClosed: closed,
    },
  });
}

export async function setAttemptStatusPanelClosedInSession(closed: boolean) {
  if (attemptStatusPanelClosedInSession === closed) {
    return;
  }

  attemptStatusPanelClosedInSession = closed;
  renderAttemptStatusPanel();

  await patchStoredState({
    settings: {
      ...(currentStoredState?.settings as Settings),
      attemptStatusPanelClosed: closed,
    },
  });

  setCurrentStoredState({
    ...(currentStoredState as StoredStateLike),
    settings: {
      ...(currentStoredState?.settings as Settings),
      attemptStatusPanelClosed: closed,
    },
  });
}

export function isAttemptStatusPanelClosedInSession() {
  return attemptStatusPanelClosedInSession;
}

export function setAttemptStatusPanelCollapsed(collapsed: boolean) {
  if (attemptStatusPanelCollapsed === collapsed) {
    return;
  }

  attemptStatusPanelCollapsed = collapsed;
  renderAttemptStatusPanel();
  void saveAttemptStatusPanelCollapsedState(collapsed);
}

export function getAttemptStatusPanelTraySide(): "left" | "right" {
  return (attemptStatusPanelPosition?.anchor ?? "left") === "left" ? "right" : "left";
}

export function setAttemptStatusPanelTrayOpen(open: boolean) {
  if (attemptStatusPanelTrayOpen === open) {
    return;
  }

  attemptStatusPanelTrayOpen = open;
  renderAttemptStatusPanel();
}

function clearAttemptStatusPanelSolveAllResult() {
  if (attemptStatusPanelSolveAllResultTimeoutId !== null) {
    window.clearTimeout(attemptStatusPanelSolveAllResultTimeoutId);
    attemptStatusPanelSolveAllResultTimeoutId = null;
  }

  attemptStatusPanelSolveAllResult = null;
}

function showAttemptStatusPanelSolveAllResult(result: ApplyAllExactAnswersResult) {
  clearAttemptStatusPanelSolveAllResult();
  attemptStatusPanelSolveAllResult = currentT("quiz.panel.solveAllResult", {
    applied: result.applied,
    total: result.total,
  });
  renderAttemptStatusPanel();

  attemptStatusPanelSolveAllResultTimeoutId = window.setTimeout(() => {
    attemptStatusPanelSolveAllResultTimeoutId = null;
    attemptStatusPanelSolveAllResult = null;
    renderAttemptStatusPanel();
  }, SOLVE_ALL_RESULT_VISIBLE_MS);
}

function runSolveAllTrayAction() {
  showAttemptStatusPanelSolveAllResult(applyAllExactAnswersNow(currentStoredState));
}

export async function setCopyUnlockSetting(enabled: boolean) {
  if (currentStoredState?.settings?.copyUnlock === enabled) {
    return;
  }

  const nextSettings: Settings = {
    ...(currentStoredState?.settings as Settings),
    copyUnlock: enabled,
  };

  setCurrentStoredState({
    ...(currentStoredState as StoredStateLike),
    settings: nextSettings,
  });
  attemptStatusPanelTrayOpen = true;
  renderAttemptStatusPanel();

  await patchStoredState({ settings: nextSettings });
}

export function handleAttemptStatusPanelPointerDown(event: PointerEvent) {
  if (attemptStatusPanelDragState) {
    return;
  }

  const panelHost = document.getElementById(ATTEMPT_STATUS_PANEL_ID);

  if (!(panelHost instanceof HTMLDivElement)) {
    return;
  }

  const clickedInsidePanel = event.composedPath().includes(panelHost);

  if (!clickedInsidePanel) {
    if (attemptStatusPanelTrayOpen) {
      setAttemptStatusPanelTrayOpen(false);
    }

    return;
  }

  const target = event.composedPath().find((node): node is Element => node instanceof Element);
  const clickedSettingsUi = Boolean(
    target?.closest(".settings-ear") ?? target?.closest(".settings-tray"),
  );

  if (attemptStatusPanelCollapsed && !clickedSettingsUi) {
    setAttemptStatusPanelCollapsed(false);
  }
}

export function ensureAttemptStatusPanelInteractionListener() {
  if (attemptStatusPanelInteractionListenerInstalled) {
    return;
  }

  attemptStatusPanelInteractionListenerInstalled = true;
  document.addEventListener("pointerdown", handleAttemptStatusPanelPointerDown, true);
}
