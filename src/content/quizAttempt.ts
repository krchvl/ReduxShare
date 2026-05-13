import {
  AI_DISABLED_QUESTION_TYPES,
  AI_ONLY_QUESTION_TYPES,
  ANSWER_MENU_PORTAL_ATTR,
  ANSWER_WIDGET_ATTR,
  APP_STORAGE_KEY,
  CHOICE_QUESTION_TYPES,
  COMPOUND_QUESTION_TYPES,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_HOTKEY,
  DEFAULT_HOTKEY_CODE,
  DRAG_IMAGE_OR_TEXT_QUESTION_TYPES,
  DRAG_MARKER_QUESTION_TYPES,
  DRAG_TEXT_QUESTION_TYPES,
  ESSAY_QUESTION_TYPES,
  FETCH_QUIZ_ANSWERS_MESSAGE,
  FULL_PAGE_LOAD_MAX_WAIT_MS,
  GENERATE_AI_ANSWER_MESSAGE,
  LEGACY_THEME_ACCENTS,
  MATCHING_QUESTION_TYPES,
  MAX_METADATA_WAIT_MS,
  METADATA_POLL_MS,
  QUIZ_CONTEXT_STORAGE_KEY,
  QUIZ_PROGRESS_REPORTS_STORAGE_KEY,
  QUIZ_REVIEW_PENDING_STORAGE_KEY,
  QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY,
  RECORD_QUIZ_PROGRESS_MESSAGE,
  SAVE_REVIEW_ANSWERS_MESSAGE,
  SELECTABLE_QUESTION_TYPES,
  STEALTH_MESSAGE_SOURCE,
  STEALTH_MODE_MESSAGE,
  SUPPORTED_AUTO_SELECT_QUESTION_TYPES,
  SUPPORTED_REVIEW_QUESTION_TYPES,
  SUPPORTED_WIDGET_QUESTION_TYPES,
  TEXT_INPUT_QUESTION_TYPES,
  UNSUPPORTED_DRAG_DROP_QUESTION_TYPES,
  type AiAnswerAction,
  type AiAnswerResponse,
  type AiAnswerState,
  type AiQuestionControl,
  type AiQuestionImage,
  type AiQuestionOption,
  type AnswerData,
  type AnswerEntry,
  type AnswerSlotData,
  type AnswerVariantCounts,
  type AnswerWidgetState,
  type MoodleConfig,
  type QuizAnswersResponse,
  type QuizAttemptContext,
  type QuizProgressReports,
  type QuizQuestionSummary,
  type QuizReviewPendingMarker,
  type QuizVariantResult,
  type RecordQuizProgressResponse,
  type ReviewAnswerPayload,
  type ReviewObservation,
  type ReviewQuestionPayload,
  type SaveReviewAnswersResponse,
  type SourceAnswerData,
  type StoredStateLike,
  type SubmissionItem,
  type SuggestionItem
} from "./quizAttempt/model";
import { getContentTranslator, type TranslateFn } from "./quizAttempt/contentI18n";
import { hotkeyMatchesEvent, normalizeHotkeyCode, normalizeHotkeyValue } from "./quizAttempt/hotkeys";
import {
  createIdleAiAnswerState,
  getAnswerMenuMarkup,
  getAnswerTriggerMarkup,
  isAiSettingsSaved,
  renderAiAnswerFlyout,
  setAnswerMenuTranslator
} from "./quizAttempt/answerMenu";
import {
  createEmptyAnswerData,
  createEmptySourceAnswerData,
  createEmptyVariantCounts,
  getAnswerData,
  getVariantCounts,
  hasAnswerData
} from "./quizAttempt/answerData";

let currentT: TranslateFn = getContentTranslator(undefined);

const answerWidgetCleanups = new Map<HTMLElement, () => void>();
const answerWidgetStates = new Map<HTMLElement, AnswerWidgetState>();
const variantCountsByQuestionId = new Map<string, AnswerVariantCounts>();
const answerDataByQuestionId = new Map<string, SourceAnswerData>();
const aiAnswerStatesByQuestionKey = new Map<string, AiAnswerState>();
let activeCloseAnswerWidgetMenu: (() => void) | null = null;
let storageWatcherInstalled = false;
let answerWidgetHotkey = DEFAULT_HOTKEY;
let answerWidgetHotkeyCode = DEFAULT_HOTKEY_CODE;
let answerWidgetHotkeyEnabled = true;
let answerWidgetHotkeyListenerInstalled = false;
let answerWidgetsVisible = true;
let stealthModeEnabled = true;
let currentQuizAttemptContext: QuizAttemptContext | null = null;
let currentStoredState: StoredStateLike | undefined;

declare global {
  var __REDUXSHARE_TEST_MODE__: boolean | undefined;
  var __reduxshareQuizAttemptTestApi:
    | {
        reset: () => void;
        setStoredState: (state: StoredStateLike | undefined) => void;
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
        createEmptySourceAnswerData: typeof createEmptySourceAnswerData;
        createEmptyVariantCounts: typeof createEmptyVariantCounts;
      }
    | undefined;
}

function isQuizAttemptUrl(url: Location) {
  return url.protocol === "https:" && url.pathname.endsWith("/mod/quiz/attempt.php");
}

function isQuizSummaryUrl(url: Location) {
  return url.protocol === "https:" && url.pathname.endsWith("/mod/quiz/summary.php");
}

function isQuizReviewUrl(url: Location) {
  return url.protocol === "https:" && url.pathname.endsWith("/mod/quiz/review.php");
}

function getAccentColor(settings: StoredStateLike["settings"] | undefined) {
  const accentColor = settings?.accentColor;

  if (typeof accentColor === "string" && /^#[0-9a-f]{6}$/i.test(accentColor.trim())) {
    return accentColor.trim().toLowerCase();
  }

  const legacyTheme = settings?.theme;

  if (typeof legacyTheme === "string" && Object.prototype.hasOwnProperty.call(LEGACY_THEME_ACCENTS, legacyTheme)) {
    return LEGACY_THEME_ACCENTS[legacyTheme as keyof typeof LEGACY_THEME_ACCENTS];
  }

  return DEFAULT_ACCENT_COLOR;
}

function syncLanguage(storedState: StoredStateLike | undefined) {
  currentT = getContentTranslator(storedState?.settings?.language);
  setAnswerMenuTranslator(currentT);
}

function isLoggedInToExtension(storedState: StoredStateLike | undefined) {
  const userId = storedState?.authSession?.user?.id;
  return typeof userId === "string" && userId.trim() !== "";
}

function canUseQuizFeatures(storedState: StoredStateLike | undefined) {
  return storedState?.settings?.extensionEnabled !== false && isLoggedInToExtension(storedState);
}

function syncStealthMode(storedState: StoredStateLike | undefined) {
  stealthModeEnabled = canUseQuizFeatures(storedState) && storedState?.settings?.stealthMode !== false;
  window.postMessage(
    {
      source: STEALTH_MESSAGE_SOURCE,
      type: STEALTH_MODE_MESSAGE,
      enabled: stealthModeEnabled
    },
    window.location.origin
  );
}

function isAutoSelectEnabled(settings: StoredStateLike["settings"] | undefined) {
  return settings?.extensionEnabled !== false && settings?.autoSelect !== false;
}

function logReduxShareInfo(...args: unknown[]) {
  if (!stealthModeEnabled) {
    console.log(...args);
  }
}

function logReduxShareWarning(...args: unknown[]) {
  if (!stealthModeEnabled) {
    console.warn(...args);
  }
}

async function saveQuizReviewSaveDiagnostics(stage: string, details: Record<string, unknown> = {}) {
  try {
    await chrome.storage.local.set({
      [QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY]: {
        stage,
        pageUrl: window.location.href,
        savedAt: new Date().toISOString(),
        details
      }
    });
  } catch {
    // Diagnostics must not block quiz behavior.
  }
}

function isHTMLElement(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

function getSecondQuestionClass(questionNode: Element) {
  const classNames = Array.from(questionNode.classList);
  const queIndex = classNames.indexOf("que");

  if (queIndex >= 0) {
    return classNames[queIndex + 1] ?? null;
  }

  return classNames[1] ?? null;
}

function extractBalancedObject(source: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
      }

      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function findMoodleConfig(): MoodleConfig | null {
  const scripts = Array.from(document.scripts);

  for (const script of scripts) {
    const scriptText = script.textContent ?? "";
    const cfgIndex = scriptText.indexOf("M.cfg");

    if (cfgIndex < 0 || (!scriptText.includes("courseId") && !scriptText.includes("contextInstanceId"))) {
      continue;
    }

    const objectStart = scriptText.indexOf("{", cfgIndex);

    if (objectStart < 0) {
      continue;
    }

    const objectSource = extractBalancedObject(scriptText, objectStart);

    if (!objectSource) {
      continue;
    }

    try {
      const parsedConfig = JSON.parse(objectSource) as Record<string, unknown>;
      const courseId =
        typeof parsedConfig.courseId === "number" ? parsedConfig.courseId : parseMoodleNumericId(String(parsedConfig.courseId ?? ""));
      const contextInstanceId =
        typeof parsedConfig.contextInstanceId === "number"
          ? parsedConfig.contextInstanceId
          : parseMoodleNumericId(String(parsedConfig.contextInstanceId ?? ""));

      return {
        courseId,
        contextInstanceId
      };
    } catch {
      continue;
    }
  }

  return null;
}

function parseMoodleNumericId(value: string | null | undefined) {
  const normalizedValue = value?.trim() ?? "";

  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function findMoodleModuleIdFromPage() {
  try {
    const url = new URL(window.location.href);
    const urlModuleId = parseMoodleNumericId(url.searchParams.get("cmid") ?? url.searchParams.get("id"));

    if (urlModuleId !== null) {
      return urlModuleId;
    }
  } catch {
    // Continue with DOM fallback.
  }

  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="cmid="], a[href*="/mod/quiz/"]'))) {
    try {
      const linkUrl = new URL(link.href, window.location.href);
      const linkModuleId = parseMoodleNumericId(linkUrl.searchParams.get("cmid") ?? linkUrl.searchParams.get("id"));

      if (linkModuleId !== null) {
        return linkModuleId;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getReviewSaveMoodleConfig(storedState: StoredStateLike | undefined): MoodleConfig {
  const moodleConfig = findMoodleConfig();
  const latestContext = storedState?.latestQuizAttemptContext;

  return {
    courseId: moodleConfig?.courseId ?? latestContext?.courseId ?? null,
    contextInstanceId: moodleConfig?.contextInstanceId ?? latestContext?.contextInstanceId ?? findMoodleModuleIdFromPage()
  };
}

function getQuestionPostData(questionNode: Element) {
  const postDataInput = questionNode.querySelector(".questionflagpostdata");

  if (!(postDataInput instanceof HTMLInputElement)) {
    return null;
  }

  return postDataInput.value || postDataInput.getAttribute("value")?.replace(/&amp;/g, "&") || null;
}

function getQuestionIdFromEditLink(questionNode: Element) {
  const editLink = questionNode.querySelector<HTMLAnchorElement>(
    '.editquestion a[href*="question.php"], a[href*="/question/bank/editquestion/question.php"]'
  );

  if (!editLink) {
    return null;
  }

  try {
    return new URL(editLink.href, window.location.href).searchParams.get("id");
  } catch {
    return null;
  }
}

function getQuestionId(questionNode: Element) {
  const dataQuestionId =
    questionNode.getAttribute("data-questionid") ??
    questionNode.getAttribute("data-qid") ??
    questionNode.querySelector("[data-questionid]")?.getAttribute("data-questionid") ??
    questionNode.querySelector("[data-qid]")?.getAttribute("data-qid");

  if (dataQuestionId && /^\d+$/.test(dataQuestionId.trim())) {
    return dataQuestionId.trim();
  }

  const postData = getQuestionPostData(questionNode);

  if (postData) {
    const postDataQuestionId = new URLSearchParams(postData).get("qid");

    if (postDataQuestionId) {
      return postDataQuestionId;
    }
  }

  return getQuestionIdFromEditLink(questionNode);
}

function normalizeFingerprintText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stableHashText(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getUniqueTexts(values: string[]) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const trimmedValue = value.replace(/\s+/g, " ").trim();
    const key = normalizeFingerprintText(trimmedValue);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueValues.push(trimmedValue);
  }

  return uniqueValues;
}

function getQuestionText(questionNode: Element) {
  const qTextNode = questionNode.querySelector(".qtext");

  if (qTextNode) {
    return getMoodleAnswerLabelText(qTextNode).replace(/\s+/g, " ").trim();
  }

  if (questionNode.classList.contains("multianswer")) {
    const formulationNode = questionNode.querySelector(".formulation");
    const clonedFormulation = formulationNode?.cloneNode(true);

    if (clonedFormulation instanceof Element) {
      clonedFormulation.querySelectorAll(
        [
          "input",
          "select",
          "textarea",
          "button",
          ".feedbacktrigger",
          ".validationerror",
          `[${ANSWER_WIDGET_ATTR}="true"]`
        ].join(",")
      ).forEach((node) => node.remove());
      clonedFormulation.querySelectorAll("br").forEach((node) => node.replaceWith(" "));
      clonedFormulation.querySelectorAll("p, div").forEach((node) => node.append(document.createTextNode(" ")));

      return getMoodleAnswerLabelText(clonedFormulation).replace(/\s+/g, " ").trim();
    }
  }

  return getMoodleAnswerLabelText(questionNode).replace(/\s+/g, " ").trim();
}

function getSelectOptionLabel(option: HTMLOptionElement) {
  return (option.textContent ?? option.label).replace(/\s+/g, " ").trim();
}

function isPlaceholderSelectOption(option: HTMLOptionElement) {
  const optionLabel = getSelectOptionLabel(option).toLowerCase();

  if (!option.value) {
    return true;
  }

  return option.value === "0" && /^(choose|choose\.{3}|select|select\.{3}|выберите|выберите\.{3}|-+)$/.test(optionLabel);
}

function isMatchingQuestionTypeName(questionType: string | null | undefined) {
  return questionType !== null && questionType !== undefined && MATCHING_QUESTION_TYPES.has(questionType);
}

function isMatchingQuestionNode(questionNode: Element | null | undefined) {
  return isMatchingQuestionTypeName(questionNode ? getSecondQuestionClass(questionNode) : null);
}

function getQuestionAnswerLabels(
  questionNode: Element,
  options: { includePlaceholderSelectOptions?: boolean } = {}
) {
  const includePlaceholderSelectOptions = options.includePlaceholderSelectOptions ?? true;
  const labels: string[] = [];
  const choiceInputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  );

  for (const input of choiceInputs) {
    if (input.closest(".questionflag") || input.name.includes("_:flagged")) {
      continue;
    }

    labels.push(getInputAnswerLabelText(questionNode, input));
  }

  for (const [selectIndex, select] of Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select")).entries()) {
    if (isMatchingQuestionNode(questionNode)) {
      labels.push(getSelectControlLabel(questionNode, select, selectIndex));
    }

    for (const option of Array.from(select.options)) {
      if (option.value && (includePlaceholderSelectOptions || !isPlaceholderSelectOption(option))) {
        labels.push(getSelectOptionLabel(option));
      }
    }
  }

  if (questionNode.classList.contains("ordering")) {
    labels.push(...getOrderingItems(questionNode).map(getOrderingItemLabel));
  }

  if (questionNode.classList.contains("ddwtos")) {
    labels.push(...getDdwtosChoices(questionNode).map((choice) => choice.label));
  }

  if (questionNode.classList.contains("ddmarker")) {
    labels.push(...getDdmarkerChoices(questionNode).map((choice) => choice.label));
  }

  if (questionNode.classList.contains("ddimageortext")) {
    labels.push(...getDdimageOrTextChoices(questionNode).map((choice) => choice.label));
  }

  return getUniqueTexts(labels);
}

function getAiQuestionAnswerLabels(questionNode: Element) {
  return getQuestionAnswerLabels(questionNode, { includePlaceholderSelectOptions: false });
}

function getQuestionHash(questionNode: Element, questionType: string | null) {
  const questionText = getQuestionText(questionNode);
  const answerLabels = getQuestionAnswerLabels(questionNode)
    .map(normalizeFingerprintText)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const fingerprint = [
    normalizeFingerprintText(questionType ?? ""),
    normalizeFingerprintText(questionText),
    ...answerLabels
  ].join("|");

  return fingerprint ? stableHashText(fingerprint) : null;
}

function collectQuestionSummaries(): QuizQuestionSummary[] {
  return Array.from(document.querySelectorAll(".que")).map((questionNode) => {
    const questionType = getSecondQuestionClass(questionNode);

    return {
      questionId: getQuestionId(questionNode),
      questionType,
      questionHash: getQuestionHash(questionNode, questionType),
      questionText: getQuestionText(questionNode),
      answerLabels: getQuestionAnswerLabels(questionNode)
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
    questionCount: questions.length,
    questions
  };
}

function createBareQuizAttemptContext(): QuizAttemptContext {
  return {
    domain: window.location.hostname,
    pageUrl: window.location.href,
    detectedAt: new Date().toISOString(),
    courseId: null,
    contextInstanceId: null,
    questionCount: 0,
    questions: []
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

async function waitForFullPageLoad() {
  if (document.readyState === "complete") {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const finish = (isFullyLoaded: boolean) => {
      if (resolved) {
        return;
      }

      resolved = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("load", handleLoad);
      resolve(isFullyLoaded);
    };

    const handleLoad = () => finish(true);
    const timeoutId = window.setTimeout(() => finish(false), FULL_PAGE_LOAD_MAX_WAIT_MS);

    window.addEventListener("load", handleLoad, { once: true });
  });
}

async function loadStoredState(): Promise<StoredStateLike> {
  const result = await chrome.storage.local.get(APP_STORAGE_KEY);
  currentStoredState = (result[APP_STORAGE_KEY] as StoredStateLike | undefined) ?? {};
  return currentStoredState;
}

async function saveQuizAttemptContext(context: QuizAttemptContext) {
  currentQuizAttemptContext = context;

  const storedState = await loadStoredState();
  const nextStoredState: StoredStateLike = {
    ...storedState,
    latestQuizAttemptContext: context,
    userProfile: storedState.userProfile
      ? {
          ...storedState.userProfile,
          moodleDomain: context.domain
        }
      : storedState.userProfile
  };

  await chrome.storage.local.set({
    [APP_STORAGE_KEY]: nextStoredState,
    [QUIZ_CONTEXT_STORAGE_KEY]: context
  });
}

function createEmptyProgressReports(): QuizProgressReports {
  return {
    tests: {},
    questions: {}
  };
}

function normalizeProgressReportMap(value: unknown): Record<string, true> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const reportMap: Record<string, true> = {};

  for (const [key, isReported] of Object.entries(value)) {
    if (isReported === true) {
      reportMap[key] = true;
    }
  }

  return reportMap;
}

function normalizeProgressReports(value: unknown): QuizProgressReports {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyProgressReports();
  }

  const record = value as Partial<QuizProgressReports>;

  return {
    tests: normalizeProgressReportMap(record.tests),
    questions: normalizeProgressReportMap(record.questions)
  };
}

async function loadProgressReports(): Promise<QuizProgressReports> {
  const result = await chrome.storage.local.get(QUIZ_PROGRESS_REPORTS_STORAGE_KEY);
  return normalizeProgressReports(result[QUIZ_PROGRESS_REPORTS_STORAGE_KEY]);
}

async function saveProgressReports(reports: QuizProgressReports) {
  await chrome.storage.local.set({
    [QUIZ_PROGRESS_REPORTS_STORAGE_KEY]: reports
  });
}

function getQuizAttemptUrlIdentity(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    const attemptId = url.searchParams.get("attempt");
    const cmId = url.searchParams.get("cmid") ?? url.searchParams.get("id");

    if (attemptId) {
      return `attempt:${attemptId}`;
    }

    if (cmId) {
      return `cmid:${cmId}`;
    }

    return `page:${url.pathname}?${url.searchParams.toString()}`;
  } catch {
    return `page:${pageUrl}`;
  }
}

function getQuizProgressTestKey(context: QuizAttemptContext) {
  return [
    `domain:${context.domain}`,
    `course:${context.courseId ?? "unknown"}`,
    `quiz:${context.contextInstanceId ?? "unknown"}`,
    getQuizAttemptUrlIdentity(context.pageUrl)
  ].join("|");
}

function getQuestionProgressId(questionNode: Element, questionId: string | null) {
  if (questionId) {
    return `qid:${questionId}`;
  }

  const questionIndex = Array.from(document.querySelectorAll(".que")).indexOf(questionNode);
  return `index:${questionIndex >= 0 ? questionIndex : "unknown"}`;
}

function requestQuizProgressRecord(payload: {
  moodleDomain: string | null;
  solvedTestsDelta: number;
  solvedTasksDelta: number;
}): Promise<RecordQuizProgressResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: RECORD_QUIZ_PROGRESS_MESSAGE,
        payload
      },
      (response: RecordQuizProgressResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      }
    );
  });
}

async function reportSolvedQuestions(questionProgressIds: string[]) {
  const context = currentQuizAttemptContext;
  const uniqueQuestionProgressIds = Array.from(new Set(questionProgressIds.filter(Boolean)));

  if (!context || uniqueQuestionProgressIds.length === 0) {
    return;
  }

  const reports = await loadProgressReports();
  const testKey = getQuizProgressTestKey(context);
  const newQuestionKeys = uniqueQuestionProgressIds
    .map((questionProgressId) => `${testKey}|${questionProgressId}`)
    .filter((questionKey) => reports.questions[questionKey] !== true);
  const solvedTestsDelta = reports.tests[testKey] === true ? 0 : 1;
  const solvedTasksDelta = newQuestionKeys.length;

  if (solvedTestsDelta === 0 && solvedTasksDelta === 0) {
    return;
  }

  try {
    const response = await requestQuizProgressRecord({
      moodleDomain: context.domain,
      solvedTestsDelta,
      solvedTasksDelta
    });

    if (!response.ok) {
      logReduxShareWarning("ReduxShare: quiz progress update failed", response.error);
      return;
    }

    if (solvedTestsDelta > 0) {
      reports.tests[testKey] = true;
    }

    for (const questionKey of newQuestionKeys) {
      reports.questions[questionKey] = true;
    }

    await saveProgressReports(reports);
  } catch (error) {
    logReduxShareWarning("ReduxShare: quiz progress update failed", error);
  }
}

function closeActiveAnswerWidgetMenu() {
  activeCloseAnswerWidgetMenu?.();
  activeCloseAnswerWidgetMenu = null;
}

function isEditableHotkeyTarget(event: KeyboardEvent) {
  const firstElementTarget = event.composedPath().find((target): target is Element => target instanceof Element);

  if (!firstElementTarget) {
    return false;
  }

  if (
    firstElementTarget instanceof HTMLInputElement ||
    firstElementTarget instanceof HTMLTextAreaElement ||
    firstElementTarget instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (firstElementTarget instanceof HTMLElement && firstElementTarget.isContentEditable) {
    return true;
  }

  return Boolean(firstElementTarget.closest("[contenteditable=''], [contenteditable='true']"));
}

function setAnswerWidgetsVisible(visible: boolean) {
  answerWidgetsVisible = visible;

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

function syncAnswerWidgetHotkey(storedState: StoredStateLike | undefined) {
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

function findQuestionNodeForTrigger(trigger: HTMLButtonElement): Element | null {
  const root = trigger.getRootNode();
  if (!(root instanceof ShadowRoot)) return null;
  return root.host.closest(".que");
}

function isSelectableQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && SELECTABLE_QUESTION_TYPES.has(questionType);
}

function isOrderingQuestionType(questionNode: Element) {
  return questionNode.classList.contains("ordering");
}

function isCompoundQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && COMPOUND_QUESTION_TYPES.has(questionType);
}

function isDragTextQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && DRAG_TEXT_QUESTION_TYPES.has(questionType);
}

function isDragMarkerQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && DRAG_MARKER_QUESTION_TYPES.has(questionType);
}

function isDragImageOrTextQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && DRAG_IMAGE_OR_TEXT_QUESTION_TYPES.has(questionType);
}

function isTextInputQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && TEXT_INPUT_QUESTION_TYPES.has(questionType);
}

function isEssayQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && ESSAY_QUESTION_TYPES.has(questionType);
}

function isAiOnlyQuestionTypeName(questionType: string | null | undefined) {
  return questionType !== null && questionType !== undefined && AI_ONLY_QUESTION_TYPES.has(questionType);
}

function isAiDisabledQuestionTypeName(questionType: string | null | undefined) {
  return questionType !== null && questionType !== undefined && AI_DISABLED_QUESTION_TYPES.has(questionType);
}

function isChoiceQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && CHOICE_QUESTION_TYPES.has(questionType);
}

function getChoiceAnswerInputs(questionNode: Element) {
  return Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  ).filter((input) => !input.disabled && !input.closest(".questionflag") && !input.name.includes("_:flagged"));
}

function isMultiAnswerMultichoiceQuestion(questionNode: Element) {
  return isChoiceQuestionType(questionNode) && getChoiceAnswerInputs(questionNode).some((input) => input.type === "checkbox");
}

function getSupportedAutoSelectQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType && SUPPORTED_AUTO_SELECT_QUESTION_TYPES.has(questionType) ? questionType : null;
}

function normalizeAnswerLabel(label: string) {
  return label
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripMoodleAnswerPrefix(label: string) {
  return label.replace(/^(?:[a-zа-яё]|\d{1,3})\s*[\.)]\s+/iu, "");
}

function getAnswerLabelMatchKeys(label: string) {
  const normalizedLabel = normalizeAnswerLabel(label);
  const normalizedWithoutPrefix = normalizeAnswerLabel(stripMoodleAnswerPrefix(normalizedLabel));

  return new Set([normalizedLabel, normalizedWithoutPrefix].filter(Boolean));
}

function getMoodleAnswerLabelText(container: Element) {
  const clonedContainer = container.cloneNode(true);

  if (!(clonedContainer instanceof Element)) {
    return container.textContent ?? "";
  }

  clonedContainer.querySelectorAll(
    ".answernumber, .sr-only, .accesshide, .visually-hidden, [data-reduxshare-answer-widget]"
  ).forEach((node) => {
    node.remove();
  });

  return clonedContainer.textContent ?? "";
}

function getOrderingList(questionNode: Element) {
  const list = questionNode.querySelector(".answer.ordering .sortablelist");
  return list instanceof HTMLUListElement || list instanceof HTMLOListElement ? list : null;
}

function getOrderingItems(questionNode: Element) {
  const list = getOrderingList(questionNode);

  if (!list) {
    return [];
  }

  return Array.from(list.querySelectorAll<HTMLLIElement>("li"));
}

function getOrderingItemLabel(item: Element) {
  const content = item.querySelector("[data-itemcontent]") ?? item;
  return getMoodleAnswerLabelText(content).replace(/\s+/g, " ").trim();
}

function getOrderingPositionLabel(position: number) {
  return currentT("quiz.ordering.position", { position });
}

function getOrderingPositionObservation(position: number, label: string): ReviewObservation {
  return {
    label,
    slotKey: `position:${position}`,
    slotIndex: position
  };
}

function getClassNumber(element: Element, prefix: string) {
  for (const className of Array.from(element.classList)) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(className);

    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

function getDdwtosDrops(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLElement>(".qtext .drop, .drop.place1, .drop[class*='place']"))
    .filter((drop) => getClassNumber(drop, "place") !== null);
}

function getDdwtosDropSlotIndex(drop: Element) {
  return getClassNumber(drop, "place");
}

function getDdwtosDropGroupIndex(drop: Element) {
  return getClassNumber(drop, "group");
}

function getDdwtosChoiceIndex(choice: Element) {
  return getClassNumber(choice, "choice");
}

function getDdwtosChoiceGroupIndex(choice: Element) {
  return getClassNumber(choice, "group");
}

function getDdwtosChoices(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLElement>(".answercontainer .draghome, .draghome"))
    .map((choice) => ({
      element: choice,
      choiceIndex: getDdwtosChoiceIndex(choice),
      groupIndex: getDdwtosChoiceGroupIndex(choice),
      label: getMoodleAnswerLabelText(choice).replace(/\s+/g, " ").trim()
    }))
    .filter((choice) => choice.choiceIndex !== null && choice.label !== "");
}

function getDdwtosPlaceInput(questionNode: Element, slotIndex: number) {
  const input = questionNode.querySelector<HTMLInputElement>(
    `input.placeinput.place${slotIndex}, input[type="hidden"].place${slotIndex}, input[type="hidden"][name$="_p${slotIndex}"]`
  );

  return input ?? null;
}

function findDdwtosChoiceForLabel(questionNode: Element, drop: Element, label: string) {
  const dropGroupIndex = getDdwtosDropGroupIndex(drop);
  const choices = getDdwtosChoices(questionNode);

  return (
    choices.find((choice) => {
      const groupMatches = dropGroupIndex === null || choice.groupIndex === null || choice.groupIndex === dropGroupIndex;
      return groupMatches && labelsMatch(choice.label, label);
    }) ?? null
  );
}

function setDdwtosDropVisibleLabel(drop: HTMLElement, label: string) {
  let labelNode = drop.querySelector<HTMLElement>("[data-reduxshare-ddwtos-label]");

  if (!labelNode) {
    labelNode = document.createElement("span");
    labelNode.setAttribute("data-reduxshare-ddwtos-label", "true");
    drop.prepend(labelNode);
  }

  labelNode.textContent = label;
}

function setDdwtosDropAnswer(questionNode: Element, drop: HTMLElement, label: string) {
  const slotIndex = getDdwtosDropSlotIndex(drop);

  if (slotIndex === null) {
    return false;
  }

  const choice = findDdwtosChoiceForLabel(questionNode, drop, label);
  const input = getDdwtosPlaceInput(questionNode, slotIndex);

  if (!choice || !input || choice.choiceIndex === null) {
    return false;
  }

  const nextValue = String(choice.choiceIndex);
  const changed = input.value !== nextValue;

  input.value = nextValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  setDdwtosDropVisibleLabel(drop, choice.label);
  drop.dispatchEvent(new Event("change", { bubbles: true }));

  return changed;
}

function getDdwtosSelectedLabelForDrop(questionNode: Element, drop: Element) {
  const slotIndex = getDdwtosDropSlotIndex(drop);

  if (slotIndex === null) {
    return "";
  }

  const input = getDdwtosPlaceInput(questionNode, slotIndex);
  const selectedChoiceIndex = input?.value && input.value !== "0" ? Number.parseInt(input.value, 10) : null;

  if (!Number.isFinite(selectedChoiceIndex)) {
    return "";
  }

  const groupIndex = getDdwtosDropGroupIndex(drop);
  const selectedChoice = getDdwtosChoices(questionNode).find((choice) => {
    const groupMatches = groupIndex === null || choice.groupIndex === null || choice.groupIndex === groupIndex;
    return groupMatches && choice.choiceIndex === selectedChoiceIndex;
  });

  return selectedChoice?.label ?? "";
}

function getDdmarkerChoiceIndex(element: Element) {
  return getClassNumber(element, "choice");
}

function getDdmarkerChoiceInput(questionNode: Element, choiceIndex: number) {
  return (
    questionNode.querySelector<HTMLInputElement>(
      `input.choices.choice${choiceIndex}, input[type="hidden"].choice${choiceIndex}, input[type="hidden"][name$="_c${choiceIndex}"]`
    ) ?? null
  );
}

function getDdmarkerChoiceInputs(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLInputElement>("input.choices"))
    .filter((input) => getDdmarkerChoiceIndex(input) !== null);
}

function getDdmarkerMarkerLabel(marker: Element) {
  const markerText = marker.querySelector(".markertext");
  return getMoodleAnswerLabelText(markerText ?? marker).replace(/\s+/g, " ").trim();
}

function getDdmarkerChoices(questionNode: Element) {
  return getDdmarkerChoiceInputs(questionNode)
    .map((input) => {
      const choiceIndex = getDdmarkerChoiceIndex(input);
      const marker =
        (choiceIndex === null
          ? null
          : questionNode.querySelector(
              `.dd-original .marker.choice${choiceIndex}, .draghomes .marker.choice${choiceIndex}.dragplaceholder, .draghomes .marker.choice${choiceIndex}`
            )) ?? null;

      return choiceIndex === null
        ? null
        : {
            input,
            choiceIndex,
            label: marker ? getDdmarkerMarkerLabel(marker) : `Marker ${choiceIndex}`
          };
    })
    .filter((choice): choice is { input: HTMLInputElement; choiceIndex: number; label: string } => {
      return choice !== null && choice.label.trim() !== "";
    });
}

function normalizeDdmarkerCoordinate(value: string) {
  const match = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(value);

  if (!match) {
    return "";
  }

  return `${match[1]},${match[2]}`;
}

function getDdmarkerCoordinateLabel(value: string) {
  return normalizeDdmarkerCoordinate(value);
}

function getDdmarkerDropArea(questionNode: Element) {
  return questionNode.querySelector<HTMLElement>(".ddarea .droparea");
}

function getDdmarkerVisualMarker(questionNode: Element, choiceIndex: number) {
  return questionNode.querySelector<HTMLElement>(
    `.droparea [data-reduxshare-ddmarker-marker="true"][data-reduxshare-ddmarker-choice="${choiceIndex}"]`
  );
}

function setDdmarkerHomeMarkerHidden(questionNode: Element, choiceIndex: number, hidden: boolean) {
  for (const marker of Array.from(
    questionNode.querySelectorAll<HTMLElement>(`.draghomes .marker.choice${choiceIndex}`)
  )) {
    marker.style.display = hidden ? "none" : "";
    marker.dataset.reduxshareDdmarkerHomeHidden = hidden ? "true" : "false";
  }
}

function getDdmarkerAnswerWidgetHost(questionNode: Element, choiceIndex: number) {
  return questionNode.querySelector<HTMLElement>(
    `[${ANSWER_WIDGET_ATTR}="true"][data-reduxshare-ddmarker-choice="${choiceIndex}"]`
  );
}

function resetDdmarkerAnswerWidgetHostPlacement(host: HTMLElement) {
  host.style.removeProperty("position");
  host.style.removeProperty("left");
  host.style.removeProperty("top");
  host.style.removeProperty("z-index");
}

function positionDdmarkerAnswerWidgetHost(
  questionNode: Element,
  choiceIndex: number,
  coordinate: string,
  marker: HTMLElement
) {
  const host = getDdmarkerAnswerWidgetHost(questionNode, choiceIndex);
  const coordinateMatch = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(normalizeDdmarkerCoordinate(coordinate));

  if (!host || !coordinateMatch) {
    return;
  }

  const dropArea = getDdmarkerDropArea(questionNode);

  if (!dropArea) {
    return;
  }

  dropArea.append(host);
  host.style.position = "absolute";
  host.style.left = `${Number.parseFloat(coordinateMatch[1]) + 18}px`;
  host.style.top = `${Math.max(0, Number.parseFloat(coordinateMatch[2]) - 16)}px`;
  host.style.zIndex = "30";
  marker.after(host);
}

function getDdmarkerMarkerTemplate(questionNode: Element, choiceIndex: number) {
  return questionNode.querySelector<HTMLElement>(
    `.dd-original .marker.choice${choiceIndex}, .draghomes .marker.choice${choiceIndex}.dragplaceholder, .draghomes .marker.choice${choiceIndex}`
  );
}

function getDdmarkerChoiceLabel(questionNode: Element, choiceIndex: number) {
  return getDdmarkerChoices(questionNode).find((choice) => choice.choiceIndex === choiceIndex)?.label ?? `Marker ${choiceIndex}`;
}

function createDdmarkerVisualMarker(questionNode: Element, choiceIndex: number) {
  const template = getDdmarkerMarkerTemplate(questionNode, choiceIndex);
  const marker = template ? (template.cloneNode(true) as HTMLElement) : document.createElement("span");

  marker.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));
  marker.querySelectorAll<HTMLElement>("[tabindex]").forEach((element) => element.removeAttribute("tabindex"));
  marker.removeAttribute("id");
  marker.removeAttribute("tabindex");
  marker.removeAttribute("draggable");

  if (!marker.querySelector(".markertext")) {
    const markerText = document.createElement("span");
    markerText.className = "markertext";
    markerText.textContent = getDdmarkerChoiceLabel(questionNode, choiceIndex);
    marker.append(markerText);
  }

  marker.setAttribute("aria-hidden", "true");
  marker.setAttribute("data-reduxshare-ddmarker-marker", "true");
  marker.setAttribute("data-reduxshare-ddmarker-choice", String(choiceIndex));
  return marker;
}

function setDdmarkerVisualMarker(questionNode: Element, choiceIndex: number, coordinateLabel: string) {
  const coordinate = normalizeDdmarkerCoordinate(coordinateLabel);
  const coordinateMatch = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(coordinate);
  const dropArea = getDdmarkerDropArea(questionNode);

  if (!dropArea || !coordinateMatch) {
    return;
  }

  dropArea.style.position = dropArea.style.position || "relative";

  let marker = getDdmarkerVisualMarker(questionNode, choiceIndex);

  if (!marker) {
    marker = createDdmarkerVisualMarker(questionNode, choiceIndex);
    dropArea.append(marker);
  }

  marker.classList.add("marker", "user-select-none", "active", `choice${choiceIndex}`);
  marker.classList.remove("dragplaceholder", "unneeded");
  marker.setAttribute("data-reduxshare-ddmarker-marker", "true");
  marker.setAttribute("data-reduxshare-ddmarker-choice", String(choiceIndex));
  marker.style.pointerEvents = "none";
  marker.style.removeProperty("display");
  marker.style.removeProperty("visibility");
  dropArea.append(marker);
  marker.style.position = "absolute";
  marker.style.left = `${coordinateMatch[1]}px`;
  marker.style.top = `${coordinateMatch[2]}px`;
  marker.style.transform = "scale(1)";
  marker.style.transformOrigin = "left top";
  marker.style.zIndex = "25";
  setDdmarkerHomeMarkerHidden(questionNode, choiceIndex, true);
  positionDdmarkerAnswerWidgetHost(questionNode, choiceIndex, coordinate, marker);
}

function setDdmarkerChoiceAnswer(questionNode: Element, choiceIndex: number, coordinateLabel: string) {
  const coordinate = normalizeDdmarkerCoordinate(coordinateLabel);
  const input = getDdmarkerChoiceInput(questionNode, choiceIndex);

  if (!coordinate || !input) {
    return false;
  }

  const changed = input.value !== coordinate;
  input.value = coordinate;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  setDdmarkerVisualMarker(questionNode, choiceIndex, coordinate);
  getDdmarkerDropArea(questionNode)?.dispatchEvent(new Event("change", { bubbles: true }));

  return changed;
}

function getDdmarkerExactCoordinateSet(questionNode: Element, answerData: AnswerData) {
  const choices = getDdmarkerChoices(questionNode);
  const slottedCoordinates = choices
    .map((choice, index) => {
      const slot = getAnswerSlotByIndex(answerData, choice.choiceIndex);
      const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];
      const coordinate = labels.map(normalizeDdmarkerCoordinate).find(Boolean) ?? "";

      return coordinate
        ? {
            choiceIndex: choice.choiceIndex,
            coordinate
          }
        : null;
    })
    .filter((entry): entry is { choiceIndex: number; coordinate: string } => entry !== null);

  if (slottedCoordinates.length === choices.length) {
    return slottedCoordinates;
  }

  const sequentialCoordinates = splitSequentialAnswerLabels(
    getPreferredSuggestionLabels(answerData.suggestions),
    choices.length
  )
    .map(normalizeDdmarkerCoordinate)
    .filter(Boolean);

  if (sequentialCoordinates.length !== choices.length) {
    return [];
  }

  return choices.map((choice, index) => ({
    choiceIndex: choice.choiceIndex,
    coordinate: sequentialCoordinates[index]
  }));
}

function applyDdmarkerExactCoordinateSet(questionNode: Element, answerData: AnswerData) {
  const coordinateSet = getDdmarkerExactCoordinateSet(questionNode, answerData);

  if (coordinateSet.length === 0) {
    return false;
  }

  let changed = false;

  for (const { choiceIndex, coordinate } of coordinateSet) {
    changed = setDdmarkerChoiceAnswer(questionNode, choiceIndex, coordinate) || changed;
  }

  return changed;
}

function getDdmarkerChoiceForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const choiceIndex = root.host.getAttribute("data-reduxshare-ddmarker-choice");
  return choiceIndex && /^\d+$/.test(choiceIndex) ? Number.parseInt(choiceIndex, 10) : null;
}

function getDdimageOrTextDrops(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLElement>(".dropzones .dropzone"))
    .filter((drop) => getClassNumber(drop, "place") !== null);
}

function getDdimageOrTextDropSlotIndex(drop: Element) {
  return getClassNumber(drop, "place");
}

function getDdimageOrTextDropGroupIndex(drop: Element) {
  return getClassNumber(drop, "group");
}

function getDdimageOrTextChoiceIndex(choice: Element) {
  return getClassNumber(choice, "choice");
}

function getDdimageOrTextChoiceGroupIndex(choice: Element) {
  return getClassNumber(choice, "group");
}

function getDdimageOrTextChoiceLabel(choice: Element) {
  if (choice instanceof HTMLImageElement) {
    return (choice.alt || choice.title || choice.src.split("/").pop() || "").replace(/\s+/g, " ").trim();
  }

  return getMoodleAnswerLabelText(choice).replace(/\s+/g, " ").trim();
}

function getDdimageOrTextChoices(questionNode: Element) {
  const choicesByKey = new Map<
    string,
    {
      element: HTMLElement;
      choiceIndex: number | null;
      groupIndex: number | null;
      label: string;
      isPlaceholder: boolean;
    }
  >();

  for (const choice of Array.from(
    questionNode.querySelectorAll<HTMLElement>(
      ".draghomes .draghome, .dropzones .draghome, .droparea .draghome, [data-reduxshare-ddimageortext-choice]"
    )
  )) {
    const choiceIndex = getDdimageOrTextChoiceIndex(choice);
    const groupIndex = getDdimageOrTextChoiceGroupIndex(choice);
    const label = getDdimageOrTextChoiceLabel(choice);
    const isPlaceholder = choice.classList.contains("dragplaceholder");

    if (choiceIndex === null || label === "") {
      continue;
    }

    const key = `${groupIndex ?? "any"}:${choiceIndex}`;
    const existingChoice = choicesByKey.get(key);

    if (existingChoice && !existingChoice.isPlaceholder) {
      continue;
    }

    choicesByKey.set(key, {
      element: choice,
      choiceIndex,
      groupIndex,
      label,
      isPlaceholder
    });
  }

  return Array.from(choicesByKey.values()).map(({ isPlaceholder: _isPlaceholder, ...choice }) => choice);
}

function getDdimageOrTextPlaceInput(questionNode: Element, slotIndex: number) {
  return (
    questionNode.querySelector<HTMLInputElement>(
      `input.placeinput.place${slotIndex}, input[type="hidden"].place${slotIndex}, input[type="hidden"][name$="_p${slotIndex}"]`
    ) ?? null
  );
}

function findDdimageOrTextChoiceForLabel(questionNode: Element, drop: Element, label: string) {
  const dropGroupIndex = getDdimageOrTextDropGroupIndex(drop);

  return (
    getDdimageOrTextChoices(questionNode).find((choice) => {
      const groupMatches = dropGroupIndex === null || choice.groupIndex === null || choice.groupIndex === dropGroupIndex;
      return groupMatches && labelsMatch(choice.label, label);
    }) ?? null
  );
}

function getDdimageOrTextSelectedLabelForDrop(questionNode: Element, drop: Element) {
  const slotIndex = getDdimageOrTextDropSlotIndex(drop);

  if (slotIndex === null) {
    return "";
  }

  const input = getDdimageOrTextPlaceInput(questionNode, slotIndex);
  const selectedChoiceIndex = input?.value && input.value !== "0" ? Number.parseInt(input.value, 10) : null;
  const visualChoiceIndex = getDdimageOrTextVisualChoiceIndex(questionNode, drop);

  if (!Number.isFinite(selectedChoiceIndex) && visualChoiceIndex === null) {
    const visualLabel = getDdimageOrTextVisualChoiceLabel(questionNode, drop);
    const matchingChoice = getDdimageOrTextChoices(questionNode).find((candidate) => labelsMatch(candidate.label, visualLabel));

    return matchingChoice?.label ?? visualLabel;
  }

  const selectedIndex = Number.isFinite(selectedChoiceIndex) ? selectedChoiceIndex : visualChoiceIndex;

  if (selectedIndex === null) {
    return "";
  }

  const groupIndex = getDdimageOrTextDropGroupIndex(drop);
  const choice = getDdimageOrTextChoices(questionNode).find((candidate) => {
    const groupMatches = groupIndex === null || candidate.groupIndex === null || candidate.groupIndex === groupIndex;
    return groupMatches && candidate.choiceIndex === selectedIndex;
  });

  return choice?.label ?? "";
}

function getDdimageOrTextVisualChoiceForDrop(questionNode: Element, drop: Element) {
  const slotIndex = getDdimageOrTextDropSlotIndex(drop);
  const candidates = slotIndex === null
    ? Array.from(drop.querySelectorAll<HTMLElement>(".draghome, .drag, .dragitem, [class*='choice']"))
    : [
        ...Array.from(drop.querySelectorAll<HTMLElement>(".draghome, .drag, .dragitem, [class*='choice']")),
        ...Array.from(questionNode.querySelectorAll<HTMLElement>(`.dropzones .inplace${slotIndex}`))
      ];

  return (
    candidates.find((candidate) => {
      return !candidate.hasAttribute(ANSWER_WIDGET_ATTR) && !candidate.closest(`[${ANSWER_WIDGET_ATTR}="true"]`);
    }) ?? null
  );
}

function getDdimageOrTextVisualChoiceIndex(questionNode: Element, drop: Element) {
  const visualChoice = getDdimageOrTextVisualChoiceForDrop(questionNode, drop);

  if (visualChoice) {
    return getDdimageOrTextChoiceIndex(visualChoice);
  }

  for (const candidate of Array.from(drop.querySelectorAll<HTMLElement>(".draghome, .drag, .dragitem, [class*='choice']"))) {
    if (candidate.hasAttribute(ANSWER_WIDGET_ATTR) || candidate.closest(`[${ANSWER_WIDGET_ATTR}="true"]`)) {
      continue;
    }

    const choiceIndex = getDdimageOrTextChoiceIndex(candidate);

    if (choiceIndex !== null) {
      return choiceIndex;
    }
  }

  return null;
}

function getDdimageOrTextVisualChoiceLabel(questionNode: Element, drop: Element) {
  const candidate = getDdimageOrTextVisualChoiceForDrop(questionNode, drop);

  if (!candidate) {
    return "";
  }

  return getDdimageOrTextChoiceLabel(candidate);
}

function setDdimageOrTextDropVisibleChoice(questionNode: Element, drop: HTMLElement, choice: { element: HTMLElement; label: string }) {
  const slotIndex = getDdimageOrTextDropSlotIndex(drop);
  const choiceIndex = getDdimageOrTextChoiceIndex(choice.element);
  const existingDropChoice = getDdimageOrTextVisualChoiceForDrop(questionNode, drop);
  let placedChoice = choice.element;

  if (!isHTMLElement(placedChoice) || placedChoice.closest(".dd-original")) {
    placedChoice = choice.element.cloneNode(true) as HTMLElement;
  }

  if (existingDropChoice && existingDropChoice !== placedChoice) {
    existingDropChoice.remove();
  }

  if (choiceIndex !== null) {
    for (const duplicate of Array.from(
      questionNode.querySelectorAll<HTMLElement>(`.draghomes .choice${choiceIndex}:not(.dragplaceholder)`)
    )) {
      if (duplicate !== placedChoice) {
        duplicate.remove();
      }
    }
  }

  placedChoice.classList.remove("unplaced", "dragplaceholder");
  placedChoice.classList.add("placed");

  if (slotIndex !== null) {
    placedChoice.setAttribute("data-reduxshare-ddimageortext-choice", String(slotIndex));
  }

  drop.append(placedChoice);

  if (placedChoice instanceof HTMLImageElement && choice.element instanceof HTMLImageElement) {
    placedChoice.src = choice.element.src;
    placedChoice.alt = choice.element.alt;
    placedChoice.title = choice.element.title;
  } else {
    placedChoice.textContent = choice.label;
  }
}

function setDdimageOrTextDropAnswer(questionNode: Element, drop: HTMLElement, label: string) {
  const slotIndex = getDdimageOrTextDropSlotIndex(drop);

  if (slotIndex === null) {
    return false;
  }

  const choice = findDdimageOrTextChoiceForLabel(questionNode, drop, label);
  const input = getDdimageOrTextPlaceInput(questionNode, slotIndex);

  if (!choice || !input || choice.choiceIndex === null) {
    return false;
  }

  const nextValue = String(choice.choiceIndex);
  const changed = input.value !== nextValue;

  input.value = nextValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  setDdimageOrTextDropVisibleChoice(questionNode, drop, { element: choice.element, label: choice.label });
  drop.dispatchEvent(new Event("change", { bubbles: true }));

  return changed;
}

function getDdimageOrTextDropForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const slotIndex = root.host.getAttribute("data-reduxshare-ddimageortext-slot");

  if (!slotIndex) {
    return null;
  }

  const questionNode = root.host.closest(".que");
  return questionNode?.querySelector<HTMLElement>(`.dropzone.place${slotIndex}`) ?? null;
}

function getInputAnswerLabelText(questionNode: Element, input: HTMLInputElement) {
  const getUniqueLabelText = (labelTexts: string[]) =>
    Array.from(new Set(labelTexts.map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean))).join(" ");
  const labelTexts: string[] = [];
  const labels = input.labels ? Array.from(input.labels) : [];

  for (const label of labels) {
    const labelText = getMoodleAnswerLabelText(label).trim();

    if (labelText) {
      labelTexts.push(labelText);
    }
  }

  if (labelTexts.length > 0) {
    return getUniqueLabelText(labelTexts);
  }

  if (input.id) {
    const generatedLabel = document.getElementById(`${input.id}_label`);

    if (generatedLabel && questionNode.contains(generatedLabel)) {
      const generatedLabelText = getMoodleAnswerLabelText(generatedLabel).trim();

      if (generatedLabelText) {
        labelTexts.push(generatedLabelText);
      }
    }
  }

  if (labelTexts.length > 0) {
    return getUniqueLabelText(labelTexts);
  }

  const labelledByIds = (input.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);

  for (const labelledById of labelledByIds) {
    const labelledByElement = document.getElementById(labelledById);

    if (!labelledByElement || !questionNode.contains(labelledByElement)) {
      continue;
    }

    const labelledByText = getMoodleAnswerLabelText(labelledByElement).trim();

    if (labelledByText) {
      labelTexts.push(labelledByText);
    }
  }

  if (labelTexts.length > 0) {
    return getUniqueLabelText(labelTexts);
  }

  if (labelTexts.length === 0) {
    const row = input.closest(".r0, .r1, .r, li") ?? input.parentElement;

    if (row && questionNode.contains(row)) {
      const rowText = getMoodleAnswerLabelText(row).trim();

      if (rowText) {
        labelTexts.push(rowText);
      }
    }
  }

  return getUniqueLabelText(labelTexts);
}

function getChoiceInputIndex(input: HTMLInputElement) {
  const indexMatch = /(?:^|[_:])choice(\d+)$/.exec(input.id) ?? /(?:^|[_:])choice(\d+)$/.exec(input.name);
  return indexMatch ? Number.parseInt(indexMatch[1], 10) : null;
}

function getSubQuestionIndex(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const subMatch = /(?:^|[_:])sub(\d+)(?:[_:]|$)/.exec(`${control.name} ${control.id}`);
  return subMatch ? Number.parseInt(subMatch[1], 10) : null;
}

function getAnswerControlSlotIndex(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const placeClassIndex = getClassNumber(control, "place");

  if (placeClassIndex !== null) {
    return placeClassIndex;
  }

  const placeIdMatch = /_p(\d+)$/.exec(control.id);

  if (placeIdMatch) {
    return Number.parseInt(placeIdMatch[1], 10);
  }

  const subIndex = getSubQuestionIndex(control);

  if (subIndex !== null) {
    return subIndex > 0 ? subIndex : subIndex + 1;
  }

  return null;
}

function getAnswerControlSlotIndexCandidates(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  answerData?: AnswerData
) {
  const candidates: number[] = [];
  const primaryIndex = getAnswerControlSlotIndex(control);

  if (primaryIndex !== null) {
    candidates.push(primaryIndex);
  }

  const subIndex = getSubQuestionIndex(control);

  if (subIndex !== null) {
    candidates.push(subIndex, subIndex + 1);
  }

  return Array.from(new Set(candidates.filter((candidate) => {
    if (!Number.isFinite(candidate) || candidate < 0) {
      return false;
    }

    return !answerData || answerData.slots.length === 0 || answerData.slots.some((slot) => slot.index === candidate);
  })));
}

function getChoiceSlotIndex(input: HTMLInputElement, answerData: AnswerData) {
  const choiceIndex = getChoiceInputIndex(input);

  if (input.closest(".que.multianswer")) {
    const controlSlotIndex = getAnswerControlSlotIndex(input);
    return controlSlotIndex ?? choiceIndex;
  }

  if (choiceIndex === null) {
    return null;
  }

  return answerData.slots.some((slot) => slot.index === 0) ? choiceIndex : choiceIndex + 1;
}

function labelsMatch(left: string, right: string) {
  if (!left || !right) {
    return false;
  }

  const leftKeys = getAnswerLabelMatchKeys(left);
  const rightKeys = getAnswerLabelMatchKeys(right);
  return [...leftKeys].some((key) => rightKeys.has(key));
}

function itemLabelMatches<T extends { label: string }>(item: T, label: string) {
  return labelsMatch(item.label, label);
}

function answerSlotMatchesLabel(slot: AnswerSlotData, label: string) {
  return (
    slot.anchors.some((anchor) => labelsMatch(anchor, label)) ||
    slot.suggestions.some((suggestion) => itemLabelMatches(suggestion, label)) ||
    slot.submissions.some((submission) => itemLabelMatches(submission, label))
  );
}

function getChoiceAnswerSlotMatch(answerData: AnswerData, input: HTMLInputElement, label: string) {
  const slotIndex = getChoiceSlotIndex(input, answerData);
  const labelMatchedSlot = answerData.slots.find((slot) => answerSlotMatchesLabel(slot, label));
  const indexMatchedSlot =
    slotIndex === null ? null : (answerData.slots.find((slot) => slot.hasExplicitIndex && slot.index === slotIndex) ?? null);
  const slot = input.closest(".que.multianswer") ? (indexMatchedSlot ?? labelMatchedSlot) : (labelMatchedSlot ?? indexMatchedSlot);

  return { slot, slotIndex };
}

function getBooleanChoiceAnswerValue(label: string) {
  const normalizedLabel = label.trim().toLowerCase();

  if (normalizedLabel === "true") {
    return true;
  }

  if (normalizedLabel === "false") {
    return false;
  }

  return null;
}

function getExactBooleanChoiceSlotValue(slot: AnswerSlotData | null | undefined) {
  if (!slot) {
    return null;
  }

  const exactBooleanValues = slot.suggestions
    .filter((suggestion) => suggestion.correctness === 2)
    .map((suggestion) => getBooleanChoiceAnswerValue(suggestion.label))
    .filter((value): value is boolean => value !== null);

  if (exactBooleanValues.includes(true)) {
    return true;
  }

  if (exactBooleanValues.includes(false)) {
    return false;
  }

  return null;
}

function getNonBooleanExactChoiceSuggestions(answerData: AnswerData) {
  const exactSuggestions = answerData.suggestions.filter((suggestion) => {
    return suggestion.correctness === 2 && suggestion.label.trim() && getBooleanChoiceAnswerValue(suggestion.label) === null;
  });

  return exactSuggestions.length > 0 ? exactSuggestions : [];
}

function getNonBooleanChoiceSubmissions(answerData: AnswerData) {
  return answerData.submissions.filter((submission) => {
    return submission.label.trim() && getBooleanChoiceAnswerValue(submission.label) === null;
  });
}

function scopeQuestionLevelChoiceDataToBoolean(answerData: AnswerData, input: HTMLInputElement, label: string) {
  if (input.type !== "checkbox") {
    return null;
  }

  const exactSuggestions = getNonBooleanExactChoiceSuggestions(answerData);
  const nonBooleanSubmissions = getNonBooleanChoiceSubmissions(answerData);

  if (exactSuggestions.length === 0 && nonBooleanSubmissions.length === 0) {
    return null;
  }

  const slotIndex = getChoiceSlotIndex(input, answerData) ?? getChoiceInputIndex(input);
  const matchingSuggestion = exactSuggestions.find((suggestion) => itemLabelMatches(suggestion, label));
  const matchingSubmission = nonBooleanSubmissions.find((submission) => itemLabelMatches(submission, label));
  const hasExactData = exactSuggestions.length > 0;
  const booleanLabel = (hasExactData ? matchingSuggestion : matchingSubmission) ? "true" : "false";
  const fallbackCount = Math.max(1, ...exactSuggestions.map((suggestion) => suggestion.count ?? 0));
  const fallbackSubmissionCount = Math.max(1, ...nonBooleanSubmissions.map((submission) => submission.count));
  const booleanCount = matchingSuggestion?.count ?? matchingSubmission?.count ?? (hasExactData ? fallbackCount : fallbackSubmissionCount);
  const suggestions: SuggestionItem[] = hasExactData
    ? [
        {
          correctness: 2,
          confidence: 1,
          count: booleanCount,
          label: booleanLabel
        }
      ]
    : [];
  const submissions: SubmissionItem[] = hasExactData
    ? answerData.submissions
        .filter((submission) => itemLabelMatches(submission, label))
        .map((submission): SubmissionItem => ({
          ...submission,
          label: "true",
          displayLabel: "true"
        }))
    : [];

  if (submissions.length === 0) {
    submissions.push({
      correctness: hasExactData ? 2 : 1,
      count: booleanCount,
      label: booleanLabel
    });
  }

  return {
    answerData: {
      anchors: label ? [label] : [],
      suggestions,
      submissions,
      slots:
        slotIndex === null
          ? []
          : [
              {
                index: slotIndex,
                hasExplicitIndex: false,
                anchors: label ? [label] : [],
                suggestions,
                submissions
              }
            ]
    },
    slotIndex
  };
}

function scopeAnswerDataToChoice(answerData: AnswerData, input: HTMLInputElement, label: string) {
  const booleanScopedData = scopeQuestionLevelChoiceDataToBoolean(answerData, input, label);

  if (booleanScopedData) {
    return booleanScopedData;
  }

  const { slot, slotIndex } = getChoiceAnswerSlotMatch(answerData, input, label);

  if (slot) {
    return {
      answerData: {
        anchors: slot.anchors,
        suggestions: slot.suggestions,
        submissions: slot.submissions,
        slots: [slot]
      },
      slotIndex: slot.index
    };
  }

  const anchors = answerData.anchors.filter((anchor) => labelsMatch(anchor, label));
  const suggestions = answerData.suggestions.filter((suggestion) => itemLabelMatches(suggestion, label));
  const submissions = answerData.submissions.filter((submission) => itemLabelMatches(submission, label));
  const fallbackIndex = getChoiceInputIndex(input);
  const fallbackSlotIndex = slotIndex ?? fallbackIndex;

  return {
    answerData: {
      anchors,
      suggestions,
      submissions,
      slots:
        fallbackSlotIndex === null || (anchors.length === 0 && suggestions.length === 0 && submissions.length === 0)
          ? []
          : [
              {
                index: fallbackSlotIndex,
                hasExplicitIndex: false,
                anchors,
                suggestions,
                submissions
              }
            ]
    },
    slotIndex: fallbackSlotIndex
  };
}

function findInputForAnswerLabelContainer(questionNode: Element, container: Element) {
  const answerInputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  );

  if (container.id) {
    const inputByAria = answerInputs.find((input) =>
      (input.getAttribute("aria-labelledby") ?? "").split(/\s+/).includes(container.id)
    );

    if (inputByAria) {
      return inputByAria;
    }

    if (container.id.endsWith("_label")) {
      const inputId = container.id.slice(0, -"_label".length);
      const inputById = answerInputs.find((input) => input.id === inputId);

      if (inputById) {
        return inputById;
      }
    }
  }

  const row = container.parentElement;

  if (!row) {
    return null;
  }

  return row.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
}

function findInputForAnswerLabel(questionNode: Element, label: string) {
  const targetKeys = getAnswerLabelMatchKeys(label);
  const labelContainers = Array.from(
    questionNode.querySelectorAll('[data-region="answer-label"]')
  );

  for (const container of labelContainers) {
    const containerKeys = getAnswerLabelMatchKeys(getMoodleAnswerLabelText(container));

    if (![...targetKeys].some((key) => containerKeys.has(key))) {
      continue;
    }

    const input = findInputForAnswerLabelContainer(questionNode, container);

    if (input) {
      return input;
    }
  }

  const answerInputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  );

  for (const input of answerInputs) {
    const inputKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));

    if ([...targetKeys].some((key) => inputKeys.has(key))) {
      return input;
    }
  }

  return null;
}

function setAnswerInputChecked(input: HTMLInputElement, checked: boolean) {
  if (input.disabled || input.checked === checked) {
    return false;
  }

  input.click();

  if (input.checked !== checked) {
    input.checked = checked;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
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

function getSelectableAnswerControls(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select")).filter((select) => !select.disabled);
}

function findSelectOptionByLabel(select: HTMLSelectElement, label: string) {
  const targetKeys = getAnswerLabelMatchKeys(label);

  return Array.from(select.options).find((option) => {
    if (!option.value) {
      return false;
    }

    const optionKeys = getAnswerLabelMatchKeys(option.textContent ?? option.label);
    return [...targetKeys].some((key) => optionKeys.has(key));
  });
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  if (select.value === value) {
    return false;
  }

  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function getTextAnswerInputs(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLInputElement>("input")).filter((input) => {
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    return type === "text" && !input.disabled && !input.readOnly;
  });
}

function getEssayAnswerTextareas(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLTextAreaElement>("textarea")).filter((textarea) => {
    return !textarea.disabled && !textarea.readOnly && !textarea.closest(".questionflag");
  });
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const InputConstructor = input.ownerDocument.defaultView?.HTMLInputElement ?? window.HTMLInputElement;
  const ownSetter = Object.getOwnPropertyDescriptor(input, "value")?.set;
  const prototypeSetter = Object.getOwnPropertyDescriptor(InputConstructor.prototype, "value")?.set;
  const setter = prototypeSetter && ownSetter !== prototypeSetter ? prototypeSetter : ownSetter;

  if (setter) {
    setter.call(input, value);
    return;
  }

  input.value = value;
}

function setTextAnswerValue(input: HTMLInputElement, label: string) {
  const nextValue = label.trim();

  if (!nextValue) {
    return false;
  }

  const previousValue = input.value;
  setNativeInputValue(input, nextValue);

  if (input.getAttribute("value") !== nextValue) {
    input.setAttribute("value", nextValue);
  }

  dispatchTextControlEvents(input);
  return previousValue !== nextValue;
}

function escapeEditorHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextToEditorHtml(value: string) {
  const paragraphs = value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return "";
  }

  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split(/\n/).map((line) => escapeEditorHtml(line.trim()));
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

function getTextareaEditorContainer(textarea: HTMLTextAreaElement) {
  return textarea.closest(".qtype_essay_editor, .qtype_essay_response, .editor_atto, .editor_tiny") ?? textarea.parentElement;
}

function getTinyMceIframeForTextarea(textarea: HTMLTextAreaElement) {
  if (textarea.id) {
    const iframe = document.getElementById(`${textarea.id}_ifr`);

    if (iframe instanceof HTMLIFrameElement) {
      return iframe;
    }
  }

  const container = getTextareaEditorContainer(textarea);
  return container?.querySelector<HTMLIFrameElement>("iframe.tox-edit-area__iframe, iframe[id$='_ifr']") ?? null;
}

function getTinyMceBodyForTextarea(textarea: HTMLTextAreaElement) {
  const iframe = getTinyMceIframeForTextarea(textarea);

  if (!iframe) {
    return null;
  }

  try {
    const body = iframe.contentDocument?.body ?? iframe.contentWindow?.document.body ?? null;

    if (!body) {
      return null;
    }

    if (textarea.id && body.dataset.id && body.dataset.id !== textarea.id) {
      return null;
    }

    return body;
  } catch {
    return null;
  }
}

function getContentEditableForTextarea(textarea: HTMLTextAreaElement) {
  if (textarea.id) {
    const attoEditable = document.getElementById(`${textarea.id}editable`);

    if (attoEditable instanceof HTMLElement && attoEditable.isContentEditable) {
      return attoEditable;
    }
  }

  const container = getTextareaEditorContainer(textarea);

  if (!container) {
    return null;
  }

  return Array.from(container.querySelectorAll<HTMLElement>("[contenteditable='true']")).find((node) => {
    return node.isContentEditable && node.closest(`[${ANSWER_WIDGET_ATTR}="true"]`) === null;
  }) ?? null;
}

function createControlEvent(control: HTMLElement, type: string) {
  const EventConstructor = control.ownerDocument.defaultView?.Event ?? Event;
  return new EventConstructor(type, { bubbles: true });
}

function dispatchTextControlEvents(control: HTMLElement) {
  control.dispatchEvent(createControlEvent(control, "input"));
  control.dispatchEvent(createControlEvent(control, "change"));
}

function setRichEditorContent(editorElement: HTMLElement, html: string) {
  if (editorElement.innerHTML === html) {
    return false;
  }

  editorElement.innerHTML = html;
  dispatchTextControlEvents(editorElement);
  return true;
}

function setTextareaAnswerValue(textarea: HTMLTextAreaElement, label: string) {
  const nextValue = label.trim();

  if (!nextValue) {
    return false;
  }

  const tinyMceBody = getTinyMceBodyForTextarea(textarea);
  const contentEditable = tinyMceBody ? null : getContentEditableForTextarea(textarea);
  const usesRichEditor = textarea.dataset.fieldtype === "editor" || Boolean(tinyMceBody || contentEditable);
  const textareaValue = usesRichEditor ? plainTextToEditorHtml(nextValue) : nextValue;
  let changed = false;

  if (tinyMceBody) {
    changed = setRichEditorContent(tinyMceBody, textareaValue) || changed;
  }

  if (contentEditable) {
    changed = setRichEditorContent(contentEditable, textareaValue) || changed;
  }

  if (textarea.value !== textareaValue) {
    textarea.value = textareaValue;
    changed = true;
  }

  if (changed) {
    dispatchTextControlEvents(textarea);
  }

  return changed;
}

function selectTextAnswerByLabel(questionNode: Element, label: string) {
  const input = getTextAnswerInputs(questionNode)[0];
  return input ? setTextAnswerValue(input, label) : false;
}

function splitSequentialAnswerLabels(labels: string[], expectedCount: number) {
  if (labels.length !== 1 || expectedCount <= 1) {
    return labels;
  }

  const [label] = labels;
  const delimiters = [/\r?\n+/, /\s*\|\s*/, /\s*;\s*/, /\s+→\s+/, /\s+->\s+/];

  for (const delimiter of delimiters) {
    const parts = label.split(delimiter).map((part) => part.trim()).filter(Boolean);

    if (parts.length === expectedCount) {
      return parts;
    }
  }

  return labels;
}

function getSelectSubIndex(select: HTMLSelectElement) {
  return getSubQuestionIndex(select);
}

function getSelectQuestionNode(select: HTMLSelectElement) {
  return select.closest(".que");
}

function getSelectControlLabel(questionNode: Element, select: HTMLSelectElement, index: number) {
  const labelledByIds = (select.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const describedByIds = (select.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const labelIds = [
    ...labelledByIds,
    ...describedByIds.filter((id) => /(?:^|[_-])(?:sub\d+_)?itemtext$|_itemtext$/i.test(id))
  ];

  for (const labelId of labelIds) {
    const labelElement = document.getElementById(labelId);

    if (labelElement && questionNode.contains(labelElement)) {
      const label = getMoodleAnswerLabelText(labelElement).replace(/\s+/g, " ").trim();

      if (label) {
        return label;
      }
    }
  }

  const rowTextCell = select.closest("tr")?.querySelector<HTMLElement>("td.text, th.text, .text");

  if (rowTextCell && questionNode.contains(rowTextCell)) {
    const label = getMoodleAnswerLabelText(rowTextCell).replace(/\s+/g, " ").trim();

    if (label) {
      return label;
    }
  }

  return `Select ${index + 1}`;
}

function getSelectPlaceIndex(select: HTMLSelectElement) {
  const slotIndex = getAnswerControlSlotIndex(select);

  if (slotIndex !== null) {
    return slotIndex;
  }

  const subIndex = getSelectSubIndex(select);
  return subIndex === null ? null : subIndex + 1;
}

function getSelectSlotIndexCandidates(select: HTMLSelectElement, answerData?: AnswerData) {
  const candidates: number[] = [];
  const subIndex = getSelectSubIndex(select);

  if (subIndex !== null) {
    if (select.closest(".que.multianswer")) {
      candidates.push(...getAnswerControlSlotIndexCandidates(select, answerData));
    } else if (answerData?.slots.some((slot) => slot.index === 0)) {
      candidates.push(subIndex, subIndex + 1);
    } else {
      candidates.push(subIndex + 1, subIndex);
    }

    return Array.from(new Set(candidates.filter((candidate) => Number.isFinite(candidate))));
  }

  const primaryIndex = getSelectPlaceIndex(select);

  if (primaryIndex !== null) {
    candidates.push(primaryIndex);
  }

  return Array.from(new Set(candidates.filter((candidate) => Number.isFinite(candidate))));
}

function getAnswerSlotByIndex(answerData: AnswerData, slotIndex: number | null) {
  return slotIndex === null ? null : (answerData.slots.find((slot) => slot.index === slotIndex) ?? null);
}

function getAnswerSlotForSelect(answerData: AnswerData, select: HTMLSelectElement) {
  const questionNode = getSelectQuestionNode(select);

  if (questionNode && isMatchingQuestionNode(questionNode)) {
    const selects = getSelectableAnswerControls(questionNode);
    const selectIndex = Math.max(0, selects.indexOf(select));
    const label = getSelectControlLabel(questionNode, select, selectIndex);
    const labelMatchedSlot = answerData.slots.find((slot) => answerSlotMatchesLabel(slot, label));

    if (labelMatchedSlot) {
      return labelMatchedSlot;
    }
  }

  for (const slotIndex of getSelectSlotIndexCandidates(select, answerData)) {
    const slot = getAnswerSlotByIndex(answerData, slotIndex);

    if (slot) {
      return slot;
    }
  }

  return null;
}

function selectNextSelectOptionByLabel(questionNode: Element, label: string) {
  for (const select of getSelectableAnswerControls(questionNode)) {
    const option = findSelectOptionByLabel(select, label);

    if (option && setSelectValue(select, option.value)) {
      return true;
    }
  }

  return false;
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

function getOrderingItemForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const item = root.host.closest(".answer.ordering li");
  return item instanceof HTMLLIElement ? item : null;
}

function getDdwtosDropForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const slotIndex = root.host.getAttribute("data-reduxshare-ddwtos-slot");

  if (!slotIndex) {
    return null;
  }

  const questionNode = root.host.closest(".que");
  const drop = questionNode?.querySelector<HTMLElement>(`.drop.place${slotIndex}`);
  return drop ?? null;
}

function getDdmarkerChoiceIndexForTrigger(trigger: HTMLButtonElement) {
  return getDdmarkerChoiceForTrigger(trigger);
}

function getAnswerSourceKeyForFlyoutOption(option: HTMLElement): keyof SourceAnswerData | null {
  const menuKey = option.closest<HTMLElement>(".menu-item[data-answer-menu]")?.dataset.answerMenu ?? "";

  if (menuKey.startsWith("reduxshare-")) {
    return "reduxshare";
  }

  if (menuKey.startsWith("external-")) {
    return "external";
  }

  return null;
}

function getOrderingResponseInput(questionNode: Element) {
  const itemIds = getOrderingItems(questionNode).map((item) => item.id).filter(Boolean);
  const inputs = Array.from(questionNode.querySelectorAll<HTMLInputElement>('input[type="hidden"]'));

  return (
    inputs.find((input) => {
      const nameOrId = `${input.name} ${input.id}`;
      return nameOrId.includes("_response") && itemIds.some((itemId) => input.value.includes(itemId));
    }) ??
    inputs.find((input) => `${input.name} ${input.id}`.includes("_response")) ??
    null
  );
}

function syncOrderingResponseInput(questionNode: Element) {
  const input = getOrderingResponseInput(questionNode);
  const itemIds = getOrderingItems(questionNode).map((item) => item.id).filter(Boolean);

  if (!input || itemIds.length === 0) {
    return false;
  }

  const nextValue = itemIds.join(",");
  const changed = input.value !== nextValue;

  input.value = nextValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  getOrderingList(questionNode)?.dispatchEvent(new Event("change", { bubbles: true }));

  return changed;
}

function moveOrderingItemToPosition(questionNode: Element, item: HTMLLIElement, position: number) {
  const list = getOrderingList(questionNode);
  const items = getOrderingItems(questionNode);

  if (!list || !items.includes(item) || !Number.isFinite(position)) {
    return false;
  }

  const previousOrder = items.map((currentItem) => currentItem.id).join(",");
  const clampedIndex = Math.max(0, Math.min(items.length - 1, Math.trunc(position) - 1));
  const remainingItems = items.filter((currentItem) => currentItem !== item);
  const referenceItem = remainingItems[clampedIndex] ?? null;

  list.insertBefore(item, referenceItem);
  const changed = previousOrder !== getOrderingItems(questionNode).map((currentItem) => currentItem.id).join(",");
  const inputChanged = syncOrderingResponseInput(questionNode);
  return changed || inputChanged;
}

function getOrderingPositionFromLabel(label: string) {
  const match = /(?:^|\s)(?:позиция|position)\s*(\d+)(?:\s|$)/iu.exec(label);
  return match ? Number.parseInt(match[1], 10) : null;
}

function selectOrderingPositionByTrigger(
  trigger: HTMLButtonElement,
  questionNode: Element,
  label: string,
  actionSlotIndex: number | null
) {
  const item = getOrderingItemForTrigger(trigger);
  const position = actionSlotIndex ?? getOrderingPositionFromLabel(label);

  if (!item || position === null) {
    return false;
  }

  return moveOrderingItemToPosition(questionNode, item, position);
}

function selectAnswerByLabelForTrigger(
  trigger: HTMLButtonElement,
  questionNode: Element,
  label: string,
  actionSlotIndex: number | null = null,
  sourceContext?: {
    questionId: string | null;
    sourceKey: keyof SourceAnswerData | null;
  }
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

    const choiceIndex = getDdmarkerChoiceIndexForTrigger(trigger);
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
    const input = booleanChoiceValue === null ? null : findChoiceInputForTrigger(trigger, questionNode);

    if (input && booleanChoiceValue !== null) {
      return booleanChoiceValue || input.type === "checkbox" ? setAnswerInputChecked(input, booleanChoiceValue) : false;
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

function getAiActionLabel(action: AiAnswerAction) {
  return (action.coordinate ?? action.label ?? "").trim();
}

function getAiActionForSlot(actions: AiAnswerAction[], slotIndex: number | null, fallbackIndex: number) {
  if (slotIndex !== null) {
    const slottedAction = actions.find((action) => action.slotIndex === slotIndex);

    if (slottedAction) {
      return slottedAction;
    }
  }

  return actions[fallbackIndex] ?? null;
}

function extractAiAnswerFieldText(text: string) {
  const trimmedText = text.trim();

  if (!trimmedText.includes('"answer"')) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmedText);
    return parsed && typeof parsed === "object" && typeof (parsed as { answer?: unknown }).answer === "string"
      ? (parsed as { answer: string }).answer.trim()
      : "";
  } catch {
    const match = /"answer"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"|\s*})/i.exec(trimmedText);
    return match
      ? match[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\\\/g, "\\")
          .trim()
      : "";
  }
}

function splitAiMatchPairText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split(/\n|;|,(?=\s*[^,;:\n]+(?:→|->|=>|=|:))/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseAiMatchPairs(text: string) {
  return splitAiMatchPairText(text)
    .map((segment) => {
      const match = /^(.+?)\s*(?:→|->|=>|=|:)\s*(.+)$/.exec(segment);
      if (!match) {
        return null;
      }

      return {
        prompt: match[1].replace(/^["'{\s]+|["'}]\s*$/g, "").trim(),
        answer: match[2].replace(/^["'\s]+|["'}]\s*$/g, "").trim()
      };
    })
    .filter((pair): pair is { prompt: string; answer: string } => Boolean(pair?.prompt && pair.answer));
}

function getAiMatchMappedSelectLabel(
  questionNode: Element,
  select: HTMLSelectElement,
  actions: AiAnswerAction[],
  fallbackAnswer: string | null | undefined,
  selectIndex: number
) {
  if (!isMatchingQuestionNode(questionNode)) {
    return "";
  }

  const promptLabel = getSelectControlLabel(questionNode, select, selectIndex);
  const candidateTexts = [
    fallbackAnswer ?? "",
    extractAiAnswerFieldText(fallbackAnswer ?? ""),
    ...actions.flatMap((action) => {
      const label = getAiActionLabel(action);
      return [label, extractAiAnswerFieldText(label)];
    })
  ].filter((text) => text.trim() !== "");

  for (const text of candidateTexts) {
    for (const pair of parseAiMatchPairs(text)) {
      if (!labelsMatch(pair.prompt, promptLabel)) {
        continue;
      }

      const option = findSelectOptionByLabel(select, pair.answer);
      if (option) {
        return option.textContent?.trim() || option.label || pair.answer;
      }
    }
  }

  return "";
}

function applyAiSelectAnswers(questionNode: Element, actions: AiAnswerAction[], fallbackAnswer?: string | null) {
  const selects = getSelectableAnswerControls(questionNode);
  let changed = false;

  selects.forEach((select, index) => {
    const slotCandidates = isMatchingQuestionNode(questionNode) ? [index + 1] : getSelectSlotIndexCandidates(select);
    const action =
      actions.find((candidate) => slotCandidates.some((slotIndex) => candidate.slotIndex === slotIndex)) ??
      actions[index] ??
      null;
    const directLabel = action ? getAiActionLabel(action) : "";
    const label = directLabel && findSelectOptionByLabel(select, directLabel)
      ? directLabel
      : getAiMatchMappedSelectLabel(questionNode, select, actions, fallbackAnswer, index);
    const option = label ? findSelectOptionByLabel(select, label) : null;

    if (option) {
      changed = setSelectValue(select, option.value) || changed;
    }
  });

  return changed;
}

function applyAiTextAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  const inputs = getTextAnswerInputs(questionNode);
  let changed = false;

  inputs.forEach((input, index) => {
    const action = getAiActionForSlot(actions, getAnswerControlSlotIndex(input), index);
    const label = action ? getAiActionLabel(action) : "";

    if (label) {
      changed = setTextAnswerValue(input, label) || changed;
    }
  });

  return changed;
}

function applyAiEssayAnswer(questionNode: Element, actions: AiAnswerAction[], fallbackAnswer: string | null) {
  const textarea = getEssayAnswerTextareas(questionNode)[0];
  const label = getAiActionLabel(actions[0] ?? { label: fallbackAnswer ?? "" });

  return textarea && label ? setTextareaAnswerValue(textarea, label) : false;
}

function applyAiChoiceAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  const labels = actions.map(getAiActionLabel).filter(Boolean);
  return labels.length > 0 ? autoSelectChoiceQuestionAnswers(questionNode, labels) : false;
}

function applyAiDdwtosAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  let changed = false;

  getDdwtosDrops(questionNode).forEach((drop, index) => {
    const action = getAiActionForSlot(actions, getDdwtosDropSlotIndex(drop), index);
    const label = action ? getAiActionLabel(action) : "";

    if (label) {
      changed = setDdwtosDropAnswer(questionNode, drop, label) || changed;
    }
  });

  return changed;
}

function applyAiDdmarkerAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  let changed = false;

  getDdmarkerChoices(questionNode).forEach((choice, index) => {
    const action = getAiActionForSlot(actions, choice.choiceIndex, index);
    const coordinate = action ? getAiActionLabel(action) : "";

    if (coordinate) {
      changed = setDdmarkerChoiceAnswer(questionNode, choice.choiceIndex, coordinate) || changed;
    }
  });

  return changed;
}

function applyAiDdimageOrTextAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  let changed = false;

  getDdimageOrTextDrops(questionNode).forEach((drop, index) => {
    const action = getAiActionForSlot(actions, getDdimageOrTextDropSlotIndex(drop), index);
    const label = action ? getAiActionLabel(action) : "";

    if (label) {
      changed = setDdimageOrTextDropAnswer(questionNode, drop, label) || changed;
    }
  });

  return changed;
}

function applyAiOrderingAnswers(questionNode: Element, state: AiAnswerState) {
  const itemCount = getOrderingItems(questionNode).length;
  const positionedActions = state.actions
    .filter((action) => typeof action.position === "number" && Number.isFinite(action.position))
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  const orderedLabels = positionedActions.length === itemCount
    ? positionedActions.map((action) => action.label)
    : splitSequentialAnswerLabels(state.actions.map(getAiActionLabel).filter(Boolean), itemCount);

  if (orderedLabels.length === itemCount) {
    return applyOrderingOrder(questionNode, orderedLabels);
  }

  return state.answer ? applyOrderingOrder(questionNode, splitSequentialAnswerLabels([state.answer], itemCount)) : false;
}

function applyAiCompoundAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  let changed = false;

  changed = applyAiSelectAnswers(questionNode, actions) || changed;
  changed = applyAiTextAnswers(questionNode, actions) || changed;

  const choiceGroups = new Map<string, HTMLInputElement[]>();

  for (const input of getChoiceAnswerInputs(questionNode)) {
    const key = input.name || input.id;
    const inputs = choiceGroups.get(key) ?? [];
    inputs.push(input);
    choiceGroups.set(key, inputs);
  }

  let groupIndex = 0;
  for (const inputs of choiceGroups.values()) {
    const action = getAiActionForSlot(actions, getAnswerControlSlotIndex(inputs[0]), groupIndex);
    const label = action ? getAiActionLabel(action) : "";

    if (!label) {
      groupIndex += 1;
      continue;
    }

    if (inputs.some((input) => input.type === "checkbox")) {
      const exactKeys = new Set(getAnswerLabelMatchKeys(label));

      for (const input of inputs) {
        const labelKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));
        changed = setAnswerInputChecked(input, [...labelKeys].some((key) => exactKeys.has(key))) || changed;
      }
    } else {
      const targetInput = inputs.find((input) => labelsMatch(getInputAnswerLabelText(questionNode, input), label));
      if (targetInput) {
        changed = setAnswerInputChecked(targetInput, true) || changed;
      }
    }

    groupIndex += 1;
  }

  return changed;
}

function applyAiAnswerForQuestion(questionNode: Element, state: AiAnswerState) {
  const questionType = getSecondQuestionClass(questionNode);
  const actions = state.actions.length > 0
    ? state.actions
    : state.answer
      ? [{ label: state.answer }]
      : [];

  if (actions.length === 0 && !state.answer) {
    return false;
  }

  if (questionType === "essay") {
    return applyAiEssayAnswer(questionNode, actions, state.answer);
  }

  if (questionType === "ordering") {
    return applyAiOrderingAnswers(questionNode, state);
  }

  if (questionType === "ddwtos") {
    return applyAiDdwtosAnswers(questionNode, actions);
  }

  if (questionType === "ddmarker") {
    return applyAiDdmarkerAnswers(questionNode, actions);
  }

  if (questionType === "ddimageortext") {
    return applyAiDdimageOrTextAnswers(questionNode, actions);
  }

  if (questionType === "gapselect") {
    return applyAiSelectAnswers(questionNode, actions);
  }

  if (isMatchingQuestionTypeName(questionType)) {
    return applyAiSelectAnswers(questionNode, actions, state.answer);
  }

  if (questionType === "multianswer") {
    return applyAiCompoundAnswers(questionNode, actions);
  }

  if (questionType && TEXT_INPUT_QUESTION_TYPES.has(questionType)) {
    return applyAiTextAnswers(questionNode, actions);
  }

  if (questionType && CHOICE_QUESTION_TYPES.has(questionType)) {
    return applyAiChoiceAnswers(questionNode, actions);
  }

  return state.answer ? selectAnswerByLabel(questionNode, state.answer) : false;
}

function getPreferredSuggestionLabels(suggestions: SuggestionItem[]) {
  const exactSuggestionLabels = suggestions
    .filter((suggestion) => suggestion.correctness === 2 && suggestion.label.trim())
    .map((suggestion) => suggestion.label.trim());

  return Array.from(new Set(exactSuggestionLabels));
}

function autoSelectGapSelectAnswers(questionNode: Element, answerData: AnswerData) {
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

  const sequentialLabels = splitSequentialAnswerLabels(getPreferredSuggestionLabels(answerData.suggestions), selects.length);

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

function getExactAnswerLabels(answerData: AnswerData) {
  if (answerData.slots.length > 1) {
    const slottedLabels = answerData.slots.flatMap((slot) => getPreferredSuggestionLabels(slot.suggestions));

    if (slottedLabels.length > 0) {
      return Array.from(new Set(slottedLabels));
    }
  }

  return getPreferredSuggestionLabels(answerData.suggestions);
}

function answerDataHasZeroBasedOrderingSlots(answerData: AnswerData) {
  return answerData.slots.some((slot) => slot.index === 0);
}

function getOrderingSlotPosition(slot: AnswerSlotData, itemCount: number, hasZeroBasedSlots = false) {
  if (hasZeroBasedSlots && slot.index >= 0 && slot.index < itemCount) {
    return slot.index + 1;
  }

  if (slot.index >= 1 && slot.index <= itemCount) {
    return slot.index;
  }

  return null;
}

function getOrderingExactOrder(answerData: AnswerData, questionNode: Element) {
  const itemCount = getOrderingItems(questionNode).length;

  if (itemCount === 0) {
    return [];
  }

  const labelsByPosition = new Map<number, string>();
  const hasZeroBasedSlots = answerDataHasZeroBasedOrderingSlots(answerData);

  for (const slot of answerData.slots) {
    const position = getOrderingSlotPosition(slot, itemCount, hasZeroBasedSlots);
    const labels = getPreferredSuggestionLabels(slot.suggestions);

    if (position === null || labels.length !== 1) {
      continue;
    }

    labelsByPosition.set(position, labels[0]);
  }

  if (labelsByPosition.size === itemCount) {
    const slottedLabels = Array.from({ length: itemCount }, (_, index) => labelsByPosition.get(index + 1) ?? "");

    if (slottedLabels.every(Boolean)) {
      return slottedLabels;
    }
  }

  const sequentialLabels = splitSequentialAnswerLabels(getPreferredSuggestionLabels(answerData.suggestions), itemCount);
  return sequentialLabels.length === itemCount ? sequentialLabels : [];
}

function applyOrderingOrder(questionNode: Element, orderedLabels: string[]) {
  const list = getOrderingList(questionNode);
  const items = getOrderingItems(questionNode);

  if (!list || items.length === 0 || orderedLabels.length !== items.length) {
    return false;
  }

  const usedItems = new Set<HTMLLIElement>();
  const orderedItems: HTMLLIElement[] = [];

  for (const label of orderedLabels) {
    const item = items.find((candidate) => !usedItems.has(candidate) && labelsMatch(getOrderingItemLabel(candidate), label));

    if (!item) {
      return false;
    }

    usedItems.add(item);
    orderedItems.push(item);
  }

  if (orderedItems.length !== items.length) {
    return false;
  }

  const previousOrder = items.map((item) => item.id).join(",");

  for (const item of orderedItems) {
    list.append(item);
  }

  const changed = previousOrder !== getOrderingItems(questionNode).map((item) => item.id).join(",");
  const inputChanged = syncOrderingResponseInput(questionNode);
  return changed || inputChanged;
}

function autoSelectOrderingAnswers(questionNode: Element, answerData: AnswerData) {
  if (!questionNode.classList.contains("ordering")) {
    return false;
  }

  const orderedLabels = getOrderingExactOrder(answerData, questionNode);
  return orderedLabels.length > 0 ? applyOrderingOrder(questionNode, orderedLabels) : false;
}

function autoSelectDdwtosAnswers(questionNode: Element, answerData: AnswerData) {
  if (!questionNode.classList.contains("ddwtos")) {
    return false;
  }

  let changed = false;

  for (const drop of getDdwtosDrops(questionNode)) {
    const slotIndex = getDdwtosDropSlotIndex(drop);
    const slot = getAnswerSlotByIndex(answerData, slotIndex);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (labels.length !== 1) {
      continue;
    }

    changed = setDdwtosDropAnswer(questionNode, drop, labels[0]) || changed;
  }

  return changed;
}

function autoSelectDdmarkerAnswers(questionNode: Element, answerData: AnswerData) {
  if (!questionNode.classList.contains("ddmarker")) {
    return false;
  }

  return applyDdmarkerExactCoordinateSet(questionNode, answerData);
}

function autoSelectDdimageOrTextAnswers(questionNode: Element, answerData: AnswerData) {
  if (!questionNode.classList.contains("ddimageortext")) {
    return false;
  }

  let changed = false;

  for (const drop of getDdimageOrTextDrops(questionNode)) {
    const slotIndex = getDdimageOrTextDropSlotIndex(drop);
    const slot = getAnswerSlotByIndex(answerData, slotIndex);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (labels.length !== 1) {
      continue;
    }

    changed = setDdimageOrTextDropAnswer(questionNode, drop, labels[0]) || changed;
  }

  return changed;
}

function autoSelectCompoundAnswers(questionNode: Element, answerData: AnswerData) {
  if (!questionNode.classList.contains("multianswer")) {
    return false;
  }

  let changed = false;

  for (const select of getSelectableAnswerControls(questionNode)) {
    const slot = getAnswerSlotForSelect(answerData, select);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];
    const option = labels.length === 1 ? findSelectOptionByLabel(select, labels[0]) : null;

    if (option) {
      changed = setSelectValue(select, option.value) || changed;
    }
  }

  for (const input of getTextAnswerInputs(questionNode)) {
    const slot = getAnswerSlotForControl(answerData, input);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (labels.length === 1) {
      changed = setTextAnswerValue(input, labels[0]) || changed;
    }
  }

  const choiceInputsByName = new Map<string, HTMLInputElement[]>();

  for (const input of getChoiceAnswerInputs(questionNode)) {
    const key = input.name || input.id;
    const inputs = choiceInputsByName.get(key) ?? [];
    inputs.push(input);
    choiceInputsByName.set(key, inputs);
  }

  for (const inputs of choiceInputsByName.values()) {
    const slot = getAnswerSlotForControl(answerData, inputs[0]);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (labels.length === 0) {
      continue;
    }

    const exactKeys = new Set(labels.flatMap((label) => [...getAnswerLabelMatchKeys(label)]));

    if (inputs.some((input) => input.type === "checkbox")) {
      for (const input of inputs) {
        const labelKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));
        const shouldCheck = [...labelKeys].some((key) => exactKeys.has(key));
        changed = setAnswerInputChecked(input, shouldCheck) || changed;
      }
      continue;
    }

    const targetInput = inputs.find((input) => {
      const labelKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));
      return [...labelKeys].some((key) => exactKeys.has(key));
    });

    if (targetInput) {
      changed = setAnswerInputChecked(targetInput, true) || changed;
    }
  }

  return changed;
}

function getPreferredAutoSelectAnswerData(answerData: SourceAnswerData) {
  return getExactAnswerLabels(answerData.reduxshare).length > 0 ? answerData.reduxshare : answerData.external;
}

function hasExactAutoSelectData(answerData: AnswerData) {
  return getExactAnswerLabels(answerData).length > 0;
}

function getPreferredAutoSelectAnswerDataForQuestion(questionNode: Element, answerData: SourceAnswerData) {
  if (questionNode.classList.contains("ordering")) {
    return getOrderingExactOrder(answerData.reduxshare, questionNode).length > 0 ? answerData.reduxshare : answerData.external;
  }

  if (questionNode.classList.contains("ddwtos") || questionNode.classList.contains("multianswer")) {
    return hasExactAutoSelectData(answerData.reduxshare) ? answerData.reduxshare : answerData.external;
  }

  if (questionNode.classList.contains("ddmarker")) {
    return hasExactAutoSelectData(answerData.reduxshare) ? answerData.reduxshare : answerData.external;
  }

  if (questionNode.classList.contains("ddimageortext")) {
    return hasExactAutoSelectData(answerData.reduxshare) ? answerData.reduxshare : answerData.external;
  }

  return getPreferredAutoSelectAnswerData(answerData);
}

function autoSelectChoiceQuestionAnswers(questionNode: Element, exactAnswerLabels: string[]) {
  const answerInputs = getChoiceAnswerInputs(questionNode);

  if (answerInputs.length === 0) {
    return false;
  }

  if (answerInputs.some((input) => input.type === "checkbox")) {
    const exactAnswerKeys = new Set(exactAnswerLabels.flatMap((label) => [...getAnswerLabelMatchKeys(label)]));
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

function autoSelectBooleanChoiceQuestionAnswers(questionNode: Element, answerData: AnswerData) {
  const answerInputs = getChoiceAnswerInputs(questionNode);

  if (answerInputs.length === 0) {
    return { hasBooleanData: false, changed: false };
  }

  let hasBooleanData = false;
  let changed = false;

  if (answerInputs.some((input) => input.type === "checkbox")) {
    for (const input of answerInputs.filter((answerInput) => answerInput.type === "checkbox")) {
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

  const trueInputs: HTMLInputElement[] = [];

  for (const input of answerInputs) {
    const label = getInputAnswerLabelText(questionNode, input);
    const { slot } = getChoiceAnswerSlotMatch(answerData, input, label);
    const booleanChoiceValue = getExactBooleanChoiceSlotValue(slot);

    if (booleanChoiceValue === null) {
      continue;
    }

    hasBooleanData = true;

    if (booleanChoiceValue) {
      trueInputs.push(input);
    }
  }

  if (trueInputs.length === 1) {
    changed = setAnswerInputChecked(trueInputs[0], true);
  }

  return { hasBooleanData, changed };
}

function autoSelectQuestionAnswers(questionNode: Element, answerData: AnswerData) {
  const questionType = getSupportedAutoSelectQuestionType(questionNode);

  if (!questionType) {
    return false;
  }

  if (questionType === "gapselect" || isMatchingQuestionTypeName(questionType)) {
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
    return exactAnswerLabels.length > 0 ? autoSelectChoiceQuestionAnswers(questionNode, exactAnswerLabels) : false;
  }

  if (TEXT_INPUT_QUESTION_TYPES.has(questionType)) {
    return exactAnswerLabels.length === 1 ? selectTextAnswerByLabel(questionNode, exactAnswerLabels[0]) : false;
  }

  return false;
}

function getQuizReviewUrlIdentity(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    const attemptId = url.searchParams.get("attempt");
    const cmId = url.searchParams.get("cmid") ?? url.searchParams.get("id");
    const attemptPart = attemptId ? `attempt:${attemptId}` : `attempt:unknown`;
    const cmidPart = cmId ? `cmid:${cmId}` : `cmid:unknown`;

    return {
      attemptId,
      cmId,
      attemptKey: `${attemptPart}|${cmidPart}`
    };
  } catch {
    return {
      attemptId: null,
      cmId: null,
      attemptKey: `page:${pageUrl}`
    };
  }
}

async function saveQuizReviewPendingMarker(marker: QuizReviewPendingMarker) {
  await chrome.storage.local.set({
    [QUIZ_REVIEW_PENDING_STORAGE_KEY]: marker
  });
}

async function clearQuizReviewPendingMarker(attemptKey: string) {
  const result = await chrome.storage.local.get(QUIZ_REVIEW_PENDING_STORAGE_KEY);
  const marker = result[QUIZ_REVIEW_PENDING_STORAGE_KEY] as QuizReviewPendingMarker | undefined;

  if (marker?.attemptKey === attemptKey) {
    await chrome.storage.local.remove(QUIZ_REVIEW_PENDING_STORAGE_KEY);
  }
}

function splitReviewAnswerText(answerText: string) {
  return answerText
    .split(/\r?\n+|\s*\|\s*|\s*;\s*|\s*,\s*/g)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function splitReviewMatchPairText(answerText: string) {
  return answerText
    .split(/\r?\n+|\s*\|\s*|\s*;\s*|\s*,\s*/g)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseReviewMatchPairs(answerText: string) {
  return splitReviewMatchPairText(answerText)
    .map((part) => {
      const pieces = part.split(/\s*(?:→|->|=>|=)\s*/).map((piece) => piece.trim()).filter(Boolean);

      return pieces.length >= 2
        ? {
            prompt: pieces[0],
            answer: pieces.slice(1).join(" ")
          }
        : null;
    })
    .filter((pair): pair is { prompt: string; answer: string } => pair !== null);
}

function getRightAnswerBodyText(rawText: string) {
  const normalizedText = rawText.replace(/\s+/g, " ").trim();
  const prefixedAnswerMatch =
    /^(?:the\s+correct\s+answers?\s+(?:is|are)|correct\s+answers?|правильн(?:ый|ые)\s+ответ(?:ы)?|верн(?:ый|ые)\s+ответ(?:ы)?)\s*[:：]\s*(.+)$/i.exec(
      normalizedText
    );

  if (prefixedAnswerMatch) {
    return prefixedAnswerMatch[1].trim();
  }

  const colonIndex = normalizedText.indexOf(":");

  return colonIndex >= 0 ? normalizedText.slice(colonIndex + 1).trim() : normalizedText;
}

function matchAnswerTextToOptions(answerText: string, optionLabels: string[]) {
  const normalizedAnswerText = normalizeAnswerLabel(answerText);
  const answerPartKeys = new Set(splitReviewAnswerText(answerText).map(normalizeAnswerLabel));
  const matchedLabels: string[] = [];

  for (const optionLabel of optionLabels) {
    const optionKeys = getAnswerLabelMatchKeys(optionLabel);
    const isMatched = [...optionKeys].some((key) => {
      return answerPartKeys.has(key) || normalizedAnswerText === key || (key.length >= 3 && normalizedAnswerText.includes(key));
    });

    if (isMatched) {
      matchedLabels.push(optionLabel);
    }
  }

  return getUniqueTexts(matchedLabels);
}

function getReviewCorrectLabels(questionNode: Element) {
  const optionLabels = getQuestionAnswerLabels(questionNode);
  const labels: string[] = [];

  for (const rightAnswerNode of Array.from(questionNode.querySelectorAll(".rightanswer"))) {
    const answerText = getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode));

    if (!answerText) {
      continue;
    }

    const optionMatches = matchAnswerTextToOptions(answerText, optionLabels);

    if (optionMatches.length > 0) {
      labels.push(...optionMatches);
      continue;
    }

    labels.push(...splitReviewAnswerText(answerText));
  }

  return getUniqueTexts(labels);
}

function getReviewMatchCorrectObservations(questionNode: Element): ReviewObservation[] {
  const pairs = Array.from(questionNode.querySelectorAll(".rightanswer"))
    .flatMap((rightAnswerNode) => parseReviewMatchPairs(getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode))));

  if (pairs.length === 0) {
    return [];
  }

  const observations: ReviewObservation[] = [];
  const selects = Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"));

  selects.forEach((select, index) => {
    const promptLabel = getSelectControlLabel(questionNode, select, index);
    const pair = pairs.find((candidate) => labelsMatch(candidate.prompt, promptLabel));

    if (!pair?.answer) {
      return;
    }

    observations.push({
      label: pair.answer,
      slotKey: promptLabel,
      slotIndex: getSelectPlaceIndex(select)
    });
  });

  return observations;
}

function getReviewFeedbackContentText(feedbackTrigger: Element) {
  const rawContent =
    feedbackTrigger.getAttribute("data-bs-content") ??
    feedbackTrigger.getAttribute("data-content") ??
    feedbackTrigger.getAttribute("title") ??
    "";

  if (!rawContent) {
    return "";
  }

  const container = document.createElement("div");
  container.innerHTML = rawContent.replace(/<br\s*\/?>/gi, "\n");
  return getMoodleAnswerLabelText(container).replace(/\s+/g, " ").trim();
}

function getCorrectAnswerFromFeedbackText(feedbackText: string) {
  const match =
    /(?:the\s+correct\s+answers?\s+(?:is|are)|правильн(?:ый|ые)\s+ответ(?:ы)?|верн(?:ый|ые)\s+ответ(?:ы)?)\s*[:：]\s*(.+?)(?=\s*(?:mark|grade|score|оценка|балл)\b|$)/iu.exec(
      feedbackText
    );

  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function getFirstCompoundControl(container: Element) {
  const textInput = Array.from(container.querySelectorAll<HTMLInputElement>("input")).find((input) => {
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    return type === "text";
  });

  if (textInput) {
    return textInput;
  }

  const select = container.querySelector<HTMLSelectElement>("select");

  if (select) {
    return select;
  }

  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')).find((input) => {
    return !input.closest(".questionflag") && !input.name.includes("_:flagged");
  }) ?? null;
}

function getReviewMultianswerCorrectObservations(questionNode: Element): ReviewObservation[] {
  const observations: ReviewObservation[] = [];

  for (const subquestion of Array.from(questionNode.querySelectorAll(".subquestion"))) {
    const control = getFirstCompoundControl(subquestion);
    const feedbackTrigger = subquestion.querySelector(".feedbacktrigger");

    if (!control || !feedbackTrigger) {
      continue;
    }

    const correctLabel = getCorrectAnswerFromFeedbackText(getReviewFeedbackContentText(feedbackTrigger));

    if (!correctLabel) {
      continue;
    }

    observations.push(getControlSlotObservation(control, correctLabel));
  }

  if (observations.length > 0) {
    return observations;
  }

  return isReviewQuestionMarkedCorrect(questionNode) ? getReviewMultianswerSelectedObservations(questionNode) : [];
}

function getReviewChoiceInputs(questionNode: Element) {
  return Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  ).filter((input) => !input.closest(".questionflag") && !input.name.includes("_:flagged"));
}

function getReviewChoiceSlotIndex(input: HTMLInputElement, fallbackIndex: number) {
  return getAnswerControlSlotIndex(input) ?? (getChoiceInputIndex(input) ?? fallbackIndex) + 1;
}

function getReviewTextInputCorrectObservations(questionNode: Element) {
  const labels = Array.from(questionNode.querySelectorAll(".rightanswer"))
    .flatMap((rightAnswerNode) => splitReviewAnswerText(getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode))));

  return getUniqueTexts(labels).map(getQuestionSlotObservation);
}

function createReviewAnswerKey(label: string) {
  return normalizeAnswerLabel(stripMoodleAnswerPrefix(label));
}

function parseMoodleReviewNumber(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function getReviewQuestionStateText(questionNode: Element) {
  return normalizeAnswerLabel(questionNode.querySelector(".state")?.textContent ?? "");
}

function getReviewQuestionFeedbackText(questionNode: Element) {
  return normalizeAnswerLabel(questionNode.querySelector(".outcome .feedback, .specificfeedback")?.textContent ?? "");
}

function isPartiallyCorrectReviewQuestion(questionNode: Element) {
  const stateText = getReviewQuestionStateText(questionNode);
  const feedbackText = getReviewQuestionFeedbackText(questionNode);

  return (
    questionNode.classList.contains("partiallycorrect") ||
    stateText.includes("partially correct") ||
    stateText.includes("частично") ||
    feedbackText.includes("partially correct") ||
    feedbackText.includes("частично")
  );
}

function hasFullReviewGrade(questionNode: Element) {
  const gradeText = (questionNode.querySelector(".grade")?.textContent ?? "").replace(/\s+/g, " ").trim();
  const gradeMatch = /(?:mark|score|grade|оценка|балл)[^\d]*(\d+(?:[.,]\d+)?)\s*(?:out of|\/|из)\s*(\d+(?:[.,]\d+)?)/i.exec(
    gradeText
  );

  if (!gradeMatch) {
    return false;
  }

  const score = parseMoodleReviewNumber(gradeMatch[1]);
  const maxScore = parseMoodleReviewNumber(gradeMatch[2]);

  return score !== null && maxScore !== null && maxScore > 0 && score >= maxScore;
}

function isReviewQuestionMarkedCorrect(questionNode: Element) {
  if (isPartiallyCorrectReviewQuestion(questionNode)) {
    return false;
  }

  const stateText = getReviewQuestionStateText(questionNode);
  const feedbackText = getReviewQuestionFeedbackText(questionNode);

  return (
    questionNode.classList.contains("correct") ||
    /\bcorrect\b/i.test(stateText) ||
    stateText === "верно" ||
    stateText === "правильно" ||
    /\byour answer is correct\b/i.test(feedbackText) ||
    feedbackText.includes("ответ верен") ||
    hasFullReviewGrade(questionNode)
  );
}

function isReviewQuestionMarkedIncorrect(questionNode: Element) {
  const stateText = getReviewQuestionStateText(questionNode);
  const feedbackText = getReviewQuestionFeedbackText(questionNode);

  return (
    questionNode.classList.contains("incorrect") ||
    /\bincorrect\b/i.test(stateText) ||
    stateText.includes("невер") ||
    /\byour answer is incorrect\b/i.test(feedbackText) ||
    feedbackText.includes("ответ невер")
  );
}

function buildReviewAnswersFromObservations(observations: ReviewObservation[], correctness: number) {
  return observations
    .map((observation): ReviewAnswerPayload | null => {
      const answerKey = createReviewAnswerKey(observation.label);

      return answerKey
        ? {
            label: observation.label,
            answerKey,
            slotKey: observation.slotKey,
            slotIndex: observation.slotIndex,
            correctness,
            isCorrect: correctness === 2,
            wasSelected: true
          }
        : null;
    })
    .filter((answer): answer is ReviewAnswerPayload => answer !== null);
}

function getQuestionSlotObservation(label: string) {
  return {
    label,
    slotKey: "question",
    slotIndex: null as number | null
  };
}

function getSelectSlotObservation(select: HTMLSelectElement, label: string) {
  const questionNode = getSelectQuestionNode(select);

  if (questionNode && isMatchingQuestionNode(questionNode)) {
    const selects = Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"));
    const selectIndex = Math.max(0, selects.indexOf(select));
    const promptLabel = getSelectControlLabel(questionNode, select, selectIndex);
    const slotIndex = getSelectPlaceIndex(select);

    if (promptLabel) {
      return {
        label,
        slotKey: promptLabel,
        slotIndex
      };
    }
  }

  const slotIndex = getSelectPlaceIndex(select);

  return getControlSlotObservation(select, label, slotIndex);
}

function getMoodleSelectedOption(select: HTMLSelectElement) {
  return (
    Array.from(select.options).find((option) => option.hasAttribute("selected")) ??
    select.selectedOptions[0] ??
    Array.from(select.options).find((option) => option.value === select.value) ??
    null
  );
}

function getControlSlotObservation(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  label: string,
  explicitSlotIndex: number | null = null
) {
  const slotIndex = explicitSlotIndex ?? getAnswerControlSlotIndex(control);

  return {
    label,
    slotKey: slotIndex === null ? "question" : `slot:${slotIndex}`,
    slotIndex
  };
}

function buildReviewMultichoiceBooleanAnswers(questionNode: Element): ReviewAnswerPayload[] {
  const inputs = getReviewChoiceInputs(questionNode);

  if (!inputs.some((input) => input.type === "checkbox")) {
    return [];
  }

  const correctLabels = getReviewCorrectLabels(questionNode);
  const hasSelectedChoice = inputs.some((input) => input.type === "checkbox" && input.checked);

  if (correctLabels.length === 0 && !hasSelectedChoice) {
    return [];
  }

  return inputs
    .filter((input) => input.type === "checkbox")
    .map((input, index): ReviewAnswerPayload | null => {
      const optionLabel = getInputAnswerLabelText(questionNode, input);
      const hasCorrectLabels = correctLabels.length > 0;
      const isCorrectOption = hasCorrectLabels && correctLabels.some((correctLabel) => labelsMatch(optionLabel, correctLabel));
      const label = hasCorrectLabels ? (isCorrectOption ? "true" : "false") : input.checked ? "true" : "false";
      const slotIndex = getReviewChoiceSlotIndex(input, index);
      const answerKey = createReviewAnswerKey(label);

      return answerKey
        ? {
            label,
            answerKey,
            slotKey: `slot:${slotIndex}`,
            slotIndex,
            correctness: hasCorrectLabels ? 2 : 1,
            isCorrect: hasCorrectLabels,
            wasSelected: true
          }
        : null;
    })
    .filter((answer): answer is ReviewAnswerPayload => answer !== null);
}

function getReviewOrderingSelectedObservations(questionNode: Element): ReviewObservation[] {
  return getOrderingItems(questionNode)
    .map((item, index) => getOrderingPositionObservation(index + 1, getOrderingItemLabel(item)))
    .filter((observation) => observation.label.trim() !== "");
}

function getReviewOrderingCorrectObservations(questionNode: Element): ReviewObservation[] {
  return Array.from(questionNode.querySelectorAll(".rightanswer ol.correctorder li"))
    .map((item, index) => getOrderingPositionObservation(index + 1, getMoodleAnswerLabelText(item).replace(/\s+/g, " ").trim()))
    .filter((observation) => observation.label.trim() !== "");
}

function getReviewTextInputValue(input: HTMLInputElement) {
  return (input.value || input.getAttribute("value") || "").replace(/\s+/g, " ").trim();
}

function cleanReviewDisplayedTextAnswer(value: string) {
  const cleaned = getRightAnswerBodyText(value)
    .replace(/^(?:answer|response|your answer|ответ|ваш ответ)\s*[:：]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:answer|response|your answer|ответ|ваш ответ|not answered|не отвечено|нет ответа)$/i.test(cleaned)
    ? ""
    : cleaned;
}

function getReviewDisplayedTextAnswer(questionNode: Element) {
  const answerNode = questionNode.querySelector(".answer");

  if (!answerNode) {
    return "";
  }

  const clone = answerNode.cloneNode(true);

  if (!(clone instanceof Element)) {
    return "";
  }

  clone.querySelectorAll(
    [
      `[${ANSWER_WIDGET_ATTR}="true"]`,
      "input",
      "select",
      "textarea",
      "button",
      "script",
      "style",
      ".accesshide",
      ".visually-hidden",
      ".icon",
      ".feedback",
      ".rightanswer",
      ".validationerror"
    ].join(",")
  ).forEach((node) => node.remove());

  return cleanReviewDisplayedTextAnswer(getMoodleAnswerLabelText(clone));
}

function getReviewTextInputSelectedObservations(questionNode: Element): ReviewObservation[] {
  const observations: ReviewObservation[] = [];
  const textInputs = Array.from(questionNode.querySelectorAll<HTMLInputElement>("input")).filter((input) => {
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    return type === "text" && getReviewTextInputValue(input) !== "";
  });

  for (const input of textInputs) {
    const label = getReviewTextInputValue(input);

    observations.push(
      questionNode.classList.contains("multianswer")
        ? getControlSlotObservation(input, label)
        : getQuestionSlotObservation(label)
    );
  }

  if (observations.length === 0) {
    const displayedAnswer = getReviewDisplayedTextAnswer(questionNode);

    if (displayedAnswer) {
      observations.push(getQuestionSlotObservation(displayedAnswer));
    }
  }

  return observations;
}

function getReviewMultianswerSelectedObservations(questionNode: Element): ReviewObservation[] {
  const observations: ReviewObservation[] = [];

  observations.push(...getReviewTextInputSelectedObservations(questionNode));

  const choiceInputs = getReviewChoiceInputs(questionNode);

  for (const [index, input] of choiceInputs.entries()) {
    if (!input.checked) {
      continue;
    }

    const label = getInputAnswerLabelText(questionNode, input);

    if (label) {
      const slotIndex = getReviewChoiceSlotIndex(input, index);
      observations.push(getControlSlotObservation(input, label, slotIndex));
    }
  }

  for (const select of Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"))) {
    const selectedOption = getMoodleSelectedOption(select);

    if (!selectedOption || isPlaceholderSelectOption(selectedOption)) {
      continue;
    }

    const label = getSelectOptionLabel(selectedOption);

    if (label) {
      observations.push(getControlSlotObservation(select, label));
    }
  }

  return observations;
}

function matchAnswerTextToOptionsInTextOrder(answerText: string, optionLabels: string[], expectedCount: number) {
  const normalizedAnswerText = normalizeAnswerLabel(answerText);
  const matches = optionLabels
    .map((label) => {
      const indexes = [...getAnswerLabelMatchKeys(label)]
        .map((key) => normalizedAnswerText.indexOf(key))
        .filter((index) => index >= 0);

      return indexes.length > 0 ? { label, index: Math.min(...indexes) } : null;
    })
    .filter((match): match is { label: string; index: number } => match !== null)
    .sort((left, right) => left.index - right.index)
    .map((match) => match.label);

  return getUniqueTexts(matches).slice(0, expectedCount);
}

function getReviewDdwtosSelectedObservations(questionNode: Element): ReviewObservation[] {
  return getDdwtosDrops(questionNode)
    .map((drop): ReviewObservation | null => {
      const slotIndex = getDdwtosDropSlotIndex(drop);
      const label = getDdwtosSelectedLabelForDrop(questionNode, drop);

      return label && slotIndex !== null
        ? {
            label,
            slotKey: `slot:${slotIndex}`,
            slotIndex
          }
        : null;
    })
    .filter((observation): observation is ReviewObservation => observation !== null);
}

function getReviewDdwtosCorrectObservations(questionNode: Element): ReviewObservation[] {
  const drops = getDdwtosDrops(questionNode);
  const choices = getDdwtosChoices(questionNode).map((choice) => choice.label);

  for (const rightAnswerNode of Array.from(questionNode.querySelectorAll(".rightanswer"))) {
    const inlineCorrectLabels = Array.from(rightAnswerNode.querySelectorAll(".drop, .draghome"))
      .map((node) => getMoodleAnswerLabelText(node).replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const labels =
      inlineCorrectLabels.length >= drops.length
        ? inlineCorrectLabels
        : matchAnswerTextToOptionsInTextOrder(
            getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode)),
            choices,
            drops.length
          );

    if (labels.length >= drops.length) {
      return drops
        .map((drop, index): ReviewObservation | null => {
          const slotIndex = getDdwtosDropSlotIndex(drop);
          const label = labels[index] ?? "";

          return label && slotIndex !== null
            ? {
                label,
                slotKey: `slot:${slotIndex}`,
                slotIndex
              }
            : null;
        })
        .filter((observation): observation is ReviewObservation => observation !== null);
    }
  }

  return [];
}

function getReviewDdmarkerSelectedObservations(questionNode: Element): ReviewObservation[] {
  return getDdmarkerChoices(questionNode)
    .map((choice): ReviewObservation | null => {
      const coordinate = getDdmarkerCoordinateLabel(choice.input.value);

      return coordinate
        ? {
            label: coordinate,
            slotKey: `slot:${choice.choiceIndex}`,
            slotIndex: choice.choiceIndex
          }
        : null;
    })
    .filter((observation): observation is ReviewObservation => observation !== null);
}

function getReviewDdmarkerCoordinatesFromRightAnswer(questionNode: Element) {
  const rightAnswerText = Array.from(questionNode.querySelectorAll(".rightanswer"))
    .map((node) => getRightAnswerBodyText(getMoodleAnswerLabelText(node)))
    .join(" ");
  const coordinates = rightAnswerText.match(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/g) ?? [];

  return coordinates.map(getDdmarkerCoordinateLabel).filter(Boolean);
}

function getReviewDdmarkerCorrectObservations(questionNode: Element): ReviewObservation[] {
  if (isReviewQuestionMarkedCorrect(questionNode)) {
    return getReviewDdmarkerSelectedObservations(questionNode);
  }

  const coordinates = getReviewDdmarkerCoordinatesFromRightAnswer(questionNode);

  if (coordinates.length === 0) {
    return [];
  }

  return getDdmarkerChoices(questionNode)
    .map((choice, index): ReviewObservation | null => {
      const coordinate = coordinates[index] ?? "";

      return coordinate
        ? {
            label: coordinate,
            slotKey: `slot:${choice.choiceIndex}`,
            slotIndex: choice.choiceIndex
          }
        : null;
    })
    .filter((observation): observation is ReviewObservation => observation !== null);
}

function getReviewDdimageOrTextSelectedObservations(questionNode: Element): ReviewObservation[] {
  return getDdimageOrTextDrops(questionNode)
    .map((drop): ReviewObservation | null => {
      const slotIndex = getDdimageOrTextDropSlotIndex(drop);
      const label = getDdimageOrTextSelectedLabelForDrop(questionNode, drop);

      return label && slotIndex !== null
        ? {
            label,
            slotKey: `slot:${slotIndex}`,
            slotIndex
          }
        : null;
    })
    .filter((observation): observation is ReviewObservation => observation !== null);
}

function getReviewDdimageOrTextCorrectObservations(questionNode: Element): ReviewObservation[] {
  if (isReviewQuestionMarkedCorrect(questionNode)) {
    return getReviewDdimageOrTextSelectedObservations(questionNode);
  }

  const drops = getDdimageOrTextDrops(questionNode);
  const choices = getDdimageOrTextChoices(questionNode).map((choice) => choice.label);

  for (const rightAnswerNode of Array.from(questionNode.querySelectorAll(".rightanswer"))) {
    const labels = matchAnswerTextToOptionsInTextOrder(
      getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode)),
      choices,
      drops.length
    );

    if (labels.length >= drops.length) {
      return drops
        .map((drop, index): ReviewObservation | null => {
          const slotIndex = getDdimageOrTextDropSlotIndex(drop);
          const label = labels[index] ?? "";

          return label && slotIndex !== null
            ? {
                label,
                slotKey: `slot:${slotIndex}`,
                slotIndex
              }
            : null;
        })
        .filter((observation): observation is ReviewObservation => observation !== null);
    }
  }

  return [];
}

function getCompoundReviewControls(questionNode: Element) {
  const controls: Array<HTMLInputElement | HTMLSelectElement> = [
    ...Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select")),
    ...getTextAnswerInputs(questionNode)
  ];
  const seenChoiceGroups = new Set<string>();

  for (const input of getChoiceAnswerInputs(questionNode)) {
    const key = input.name || input.id;

    if (seenChoiceGroups.has(key)) {
      continue;
    }

    seenChoiceGroups.add(key);
    controls.push(input);
  }

  return controls.sort((left, right) => {
    const leftSlotIndex = getAnswerControlSlotIndex(left) ?? Number.MAX_SAFE_INTEGER;
    const rightSlotIndex = getAnswerControlSlotIndex(right) ?? Number.MAX_SAFE_INTEGER;

    return leftSlotIndex - rightSlotIndex;
  });
}

function getReviewSelectedObservations(questionNode: Element) {
  if (questionNode.classList.contains("multianswer")) {
    return getReviewMultianswerSelectedObservations(questionNode);
  }

  if (questionNode.classList.contains("ordering")) {
    return getReviewOrderingSelectedObservations(questionNode);
  }

  if (questionNode.classList.contains("ddwtos")) {
    return getReviewDdwtosSelectedObservations(questionNode);
  }

  if (questionNode.classList.contains("ddmarker")) {
    return getReviewDdmarkerSelectedObservations(questionNode);
  }

  if (questionNode.classList.contains("ddimageortext")) {
    return getReviewDdimageOrTextSelectedObservations(questionNode);
  }

  if (isTextInputQuestionType(questionNode)) {
    return getReviewTextInputSelectedObservations(questionNode);
  }

  const observations: ReviewObservation[] = [];
  const choiceInputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  );

  for (const input of choiceInputs) {
    if (!input.checked) {
      continue;
    }

    const label = getInputAnswerLabelText(questionNode, input);

    if (label) {
      observations.push(
        questionNode.classList.contains("multianswer")
          ? getControlSlotObservation(input, label)
          : getQuestionSlotObservation(label)
      );
    }
  }

  for (const select of Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"))) {
    const selectedOption = getMoodleSelectedOption(select);

    if (!selectedOption || isPlaceholderSelectOption(selectedOption)) {
      continue;
    }

    const label = getSelectOptionLabel(selectedOption);

    if (label) {
      observations.push(getSelectSlotObservation(select, label));
    }
  }

  return observations;
}

function getReviewCorrectObservations(questionNode: Element, questionType: string | null, correctLabels: string[]) {
  if (questionType !== null && TEXT_INPUT_QUESTION_TYPES.has(questionType)) {
    return getReviewTextInputCorrectObservations(questionNode);
  }

  if (questionType === "ordering") {
    return getReviewOrderingCorrectObservations(questionNode);
  }

  if (questionType === "ddwtos") {
    return getReviewDdwtosCorrectObservations(questionNode);
  }

  if (questionType === "ddmarker") {
    return getReviewDdmarkerCorrectObservations(questionNode);
  }

  if (questionType === "ddimageortext") {
    return getReviewDdimageOrTextCorrectObservations(questionNode);
  }

  if (isMatchingQuestionTypeName(questionType)) {
    const matchObservations = getReviewMatchCorrectObservations(questionNode);

    if (matchObservations.length > 0) {
      return matchObservations;
    }
  }

  if (questionType === "multianswer") {
    const multianswerObservations = getReviewMultianswerCorrectObservations(questionNode);

    if (multianswerObservations.length > 0) {
      return multianswerObservations;
    }
  }

  if ((questionType === "gapselect" || isMatchingQuestionTypeName(questionType)) && correctLabels.length > 0) {
    const selects = Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"));

    if (selects.length === correctLabels.length) {
      return correctLabels.map((label, index) => getSelectSlotObservation(selects[index], label));
    }
  }

  if (questionType === "multianswer" && correctLabels.length > 0) {
    const controls = getCompoundReviewControls(questionNode);

    if (controls.length === correctLabels.length) {
      return correctLabels.map((label, index) => getControlSlotObservation(controls[index], label));
    }
  }

  return correctLabels.map(getQuestionSlotObservation);
}

function reviewObservationsMatch(
  left: { label: string; slotKey: string },
  right: { label: string; slotKey: string }
) {
  const slotsMatch = left.slotKey === right.slotKey || left.slotKey === "question" || right.slotKey === "question";
  return slotsMatch && labelsMatch(left.label, right.label);
}

function buildReviewAnswersForQuestion(questionNode: Element, questionType: string | null) {
  if (questionType === "multichoice") {
    const booleanAnswers = buildReviewMultichoiceBooleanAnswers(questionNode);

    if (booleanAnswers.length > 0) {
      return booleanAnswers;
    }
  }

  const correctLabels =
    questionType === "ordering" || questionType === "ddwtos" || questionType === "ddmarker" || questionType === "ddimageortext"
      ? []
      : getReviewCorrectLabels(questionNode);
  const correctObservations = getReviewCorrectObservations(questionNode, questionType, correctLabels);
  const selectedObservations = getReviewSelectedObservations(questionNode);

  if (correctObservations.length === 0) {
    if (selectedObservations.length > 0) {
      return buildReviewAnswersFromObservations(selectedObservations, 1);
    }

    return [];
  }

  const answersByKey = new Map<string, ReviewAnswerPayload>();

  const addAnswer = (
    observation: { label: string; slotKey: string; slotIndex: number | null },
    isCorrect: boolean,
    wasSelected: boolean
  ) => {
    const answerKey = createReviewAnswerKey(observation.label);

    if (!answerKey) {
      return;
    }

    const key = `${observation.slotKey}|${answerKey}`;
    const existingAnswer = answersByKey.get(key);
    const correctness = isCorrect ? 2 : 0;
    const existingCorrectness = existingAnswer?.correctness ?? correctness;

    answersByKey.set(key, {
      label: observation.label,
      answerKey,
      slotKey: observation.slotKey,
      slotIndex: observation.slotIndex,
      correctness: existingCorrectness === 2 || correctness === 2 ? 2 : Math.min(existingCorrectness, correctness),
      isCorrect: existingAnswer?.isCorrect === true || isCorrect,
      wasSelected: existingAnswer?.wasSelected === true || wasSelected
    });
  };

  for (const correctObservation of correctObservations) {
    addAnswer(
      correctObservation,
      true,
      selectedObservations.some((selectedObservation) => reviewObservationsMatch(selectedObservation, correctObservation))
    );
  }

  for (const selectedObservation of selectedObservations) {
    if (correctObservations.some((correctObservation) => reviewObservationsMatch(selectedObservation, correctObservation))) {
      continue;
    }

    addAnswer(selectedObservation, false, true);
  }

  return Array.from(answersByKey.values());
}

function collectReviewQuestionsForSave(): ReviewQuestionPayload[] {
  return Array.from(document.querySelectorAll(".que"))
    .map((questionNode): ReviewQuestionPayload | null => {
      const questionType = getSecondQuestionClass(questionNode);

      if (!questionType || !SUPPORTED_REVIEW_QUESTION_TYPES.has(questionType)) {
        return null;
      }

      const questionId = getQuestionId(questionNode);
      const questionHash = getQuestionHash(questionNode, questionType);
      const answers = buildReviewAnswersForQuestion(questionNode, questionType);

      if (!questionId || !questionHash || answers.length === 0) {
        return null;
      }

      return {
        questionId,
        questionType,
        questionHash,
        answers
      };
    })
    .filter((question): question is ReviewQuestionPayload => question !== null);
}

function requestSaveReviewAnswers(payload: {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptKey: string;
  pageUrl: string;
  questions: ReviewQuestionPayload[];
}): Promise<SaveReviewAnswersResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: SAVE_REVIEW_ANSWERS_MESSAGE,
        payload
      },
      (response: SaveReviewAnswersResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      }
    );
  });
}

function buildReviewSaveRequestPayload(storedState: StoredStateLike | undefined) {
  const moodleConfig = getReviewSaveMoodleConfig(storedState);
  const identity = getQuizReviewUrlIdentity(window.location.href);
  const questions = collectReviewQuestionsForSave();

  if (questions.length === 0) {
    return null;
  }

  return {
    domain: window.location.hostname,
    courseId: moodleConfig.courseId,
    quizId: moodleConfig.contextInstanceId,
    attemptKey: identity.attemptKey,
    pageUrl: window.location.href,
    questions
  };
}

function getAiQuestionKey(questionNode: Element | null, questionId: string | null) {
  if (questionId) {
    return `qid:${questionId}`;
  }

  if (!questionNode) {
    return "unknown";
  }

  const questionType = getSecondQuestionClass(questionNode);
  const questionHash = getQuestionHash(questionNode, questionType);

  return questionHash ? `hash:${questionHash}` : `text:${stableHashText(getQuestionText(questionNode))}`;
}

function getAiAnswerState(questionKey: string) {
  return aiAnswerStatesByQuestionKey.get(questionKey) ?? createIdleAiAnswerState();
}

function requestAiGeneratedAnswer(payload: {
  questionId: string | null;
  questionType: string | null;
  questionText: string;
  answerLabels: string[];
  controls: AiQuestionControl[];
  images: AiQuestionImage[];
  pageUrl: string;
}): Promise<AiAnswerResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: GENERATE_AI_ANSWER_MESSAGE,
        payload
      },
      (response: AiAnswerResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      }
    );
  });
}

function buildAiQuestionControls(questionNode: Element): AiQuestionControl[] {
  const controls: AiQuestionControl[] = [];

  for (const [index, input] of getChoiceAnswerInputs(questionNode).entries()) {
    controls.push({
      kind: "choice",
      label: getInputAnswerLabelText(questionNode, input),
      slotIndex: getAnswerControlSlotIndex(input) ?? getChoiceInputIndex(input),
      index
    });
  }

  for (const [index, select] of getSelectableAnswerControls(questionNode).entries()) {
    controls.push({
      kind: "select",
      label: getSelectControlLabel(questionNode, select, index),
      slotIndex: isMatchingQuestionNode(questionNode) ? index + 1 : getSelectPlaceIndex(select) ?? index + 1,
      index,
      options: Array.from(select.options)
        .filter((option) => !isPlaceholderSelectOption(option))
        .map((option, optionIndex) => ({
          label: getSelectOptionLabel(option),
          value: option.value,
          index: optionIndex
        }))
    });
  }

  for (const [index, input] of getTextAnswerInputs(questionNode).entries()) {
    controls.push({
      kind: "text",
      label: input.getAttribute("aria-label")?.trim() || input.placeholder.trim() || input.name || `Text input ${index + 1}`,
      slotIndex: getAnswerControlSlotIndex(input) ?? index + 1,
      index
    });
  }

  for (const [index, textarea] of getEssayAnswerTextareas(questionNode).entries()) {
    controls.push({
      kind: "textarea",
      label:
        textarea.getAttribute("aria-label")?.trim() ||
        textarea.placeholder.trim() ||
        textarea.name ||
        `Essay response ${index + 1}`,
      slotIndex: getAnswerControlSlotIndex(textarea) ?? index + 1,
      index
    });
  }

  if (questionNode.classList.contains("ordering")) {
    getOrderingItems(questionNode).forEach((item, index) => {
      controls.push({
        kind: "ordering-item",
        label: getOrderingItemLabel(item),
        slotIndex: index + 1,
        index
      });
    });
  }

  if (questionNode.classList.contains("ddwtos")) {
    const choices = getDdwtosChoices(questionNode);

    for (const drop of getDdwtosDrops(questionNode)) {
      const slotIndex = getDdwtosDropSlotIndex(drop);
      const groupIndex = getDdwtosDropGroupIndex(drop);
      controls.push({
        kind: "drop",
        label: `Blank ${slotIndex ?? controls.length + 1}`,
        slotIndex,
        groupIndex,
        options: choices
          .filter((choice) => groupIndex === null || choice.groupIndex === null || choice.groupIndex === groupIndex)
          .map((choice) => ({
            label: choice.label,
            index: choice.choiceIndex,
            groupIndex: choice.groupIndex
          }))
      });
    }
  }

  if (questionNode.classList.contains("ddmarker")) {
    for (const choice of getDdmarkerChoices(questionNode)) {
      controls.push({
        kind: "marker",
        label: choice.label,
        slotIndex: choice.choiceIndex,
        index: choice.choiceIndex
      });
    }
  }

  if (questionNode.classList.contains("ddimageortext")) {
    const choices = getDdimageOrTextChoices(questionNode);

    for (const drop of getDdimageOrTextDrops(questionNode)) {
      const slotIndex = getDdimageOrTextDropSlotIndex(drop);
      const groupIndex = getDdimageOrTextDropGroupIndex(drop);
      controls.push({
        kind: "drop",
        label: `Dropzone ${slotIndex ?? controls.length + 1}`,
        slotIndex,
        groupIndex,
        options: choices
          .filter((choice) => groupIndex === null || choice.groupIndex === null || choice.groupIndex === groupIndex)
          .map((choice) => ({
            label: choice.label,
            index: choice.choiceIndex,
            groupIndex: choice.groupIndex
          }))
      });
    }
  }

  return controls.filter((control) => control.label.trim() !== "");
}

function getImageDimension(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function buildAiQuestionImages(questionNode: Element): AiQuestionImage[] {
  if (!questionNode.classList.contains("ddmarker")) {
    return [];
  }

  const backgroundImage = questionNode.querySelector<HTMLImageElement>(".ddarea .dropbackground");

  if (!backgroundImage?.src) {
    return [];
  }

  const imageRect = backgroundImage.getBoundingClientRect();
  const dropAreaRect = getDdmarkerDropArea(questionNode)?.getBoundingClientRect();

  return [
    {
      label: "ddmarker background image",
      url: backgroundImage.src,
      width: getImageDimension(imageRect.width || backgroundImage.clientWidth || dropAreaRect?.width || backgroundImage.naturalWidth),
      height: getImageDimension(imageRect.height || backgroundImage.clientHeight || dropAreaRect?.height || backgroundImage.naturalHeight),
      naturalWidth: getImageDimension(backgroundImage.naturalWidth),
      naturalHeight: getImageDimension(backgroundImage.naturalHeight)
    }
  ];
}

function buildAiAnswerRequestPayload(questionNode: Element, questionId: string | null) {
  return {
    questionId,
    questionType: getSecondQuestionClass(questionNode),
    questionText: getQuestionText(questionNode),
    answerLabels: getAiQuestionAnswerLabels(questionNode),
    controls: buildAiQuestionControls(questionNode),
    images: buildAiQuestionImages(questionNode),
    pageUrl: window.location.href
  };
}

function positionAnswerMenuPortal(menuPortal: HTMLElement, trigger: HTMLElement) {
  const triggerRect = trigger.getBoundingClientRect();
  const margin = 60;
  const menuWidth = Math.min(window.innerWidth <= 640 ? 286 : 316, window.innerWidth - margin * 2);
  const flyoutWidth = window.innerWidth <= 640 ? 170 : 190;
  const flyoutGap = 0;
  const totalOpenWidth = menuWidth + flyoutGap + flyoutWidth;
  const maxLeft = Math.max(margin, window.innerWidth - totalOpenWidth - margin);
  const left = Math.max(margin, Math.min(triggerRect.left, maxLeft));
  const top = Math.max(margin, triggerRect.bottom + 8);

  menuPortal.style.left = `${Math.round(left)}px`;
  menuPortal.style.top = `${Math.round(top)}px`;
}

function openAnswerMenuPortal(
  trigger: HTMLButtonElement,
  accentColor: string,
  answerData: SourceAnswerData,
  questionId: string | null
) {
  closeActiveAnswerWidgetMenu();

  const menuPortal = document.createElement("div");
  const shadowRoot = menuPortal.attachShadow({ mode: "open" });
  let closePortal = () => undefined;
  const initialQuestionNode = findQuestionNodeForTrigger(trigger);
  const initialQuestionType = initialQuestionNode ? getSecondQuestionClass(initialQuestionNode) : null;
  const aiQuestionKey = getAiQuestionKey(initialQuestionNode, questionId);
  const aiSettingsSaved = isAiSettingsSaved(currentStoredState?.settings);
  const aiToolsEnabled = !isAiDisabledQuestionTypeName(initialQuestionType);
  const menuAnswerData =
    initialQuestionNode && isAiOnlyQuestionTypeName(initialQuestionType)
      ? createEmptySourceAnswerData()
      : answerData;

  menuPortal.setAttribute(ANSWER_MENU_PORTAL_ATTR, "true");
  menuPortal.style.setProperty("--reduxshare-accent", accentColor);
  shadowRoot.innerHTML = getAnswerMenuMarkup(
    menuAnswerData,
    aiSettingsSaved,
    getAiAnswerState(aiQuestionKey),
    aiToolsEnabled
  );

  const menuTabsContainer = shadowRoot.querySelector<HTMLElement>(".menu-tabs");
  const menuTabs = Array.from(shadowRoot.querySelectorAll<HTMLButtonElement>(".menu-tab[data-menu-tab]"));
  const menuPanels = Array.from(shadowRoot.querySelectorAll<HTMLElement>(".menu-panel[data-menu-panel]"));
  const menuItems = Array.from(shadowRoot.querySelectorAll<HTMLElement>(".menu-item"));
  const aiActionButtons = Array.from(shadowRoot.querySelectorAll<HTMLButtonElement>(".menu-ai-button"));

  let activeMenuItem: HTMLElement | null = null;

  function setActiveMenuItem(nextItem: HTMLElement | null) {
    if (activeMenuItem === nextItem) {
      return;
    }

    for (const item of menuItems) {
      item.dataset.active = item === nextItem ? "true" : "false";
    }

    activeMenuItem = nextItem;
  }

  function setActiveMenuTab(tabKey: string) {
    const nextTab = menuTabs.find((tab) => tab.dataset.menuTab === tabKey) ?? menuTabs[0] ?? null;
    const activeTabKey = nextTab?.dataset.menuTab ?? "ai";
    const activeTabIndex = Math.max(0, nextTab ? menuTabs.indexOf(nextTab) : 0);

    menuTabsContainer?.setAttribute("data-active-tab", activeTabKey);
    menuTabsContainer?.style.setProperty("--active-tab-index", String(activeTabIndex));
    setActiveMenuItem(null);

    for (const tab of menuTabs) {
      const isActive = tab === nextTab;
      tab.dataset.active = isActive ? "true" : "false";
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    }

    for (const panel of menuPanels) {
      panel.dataset.active = panel.dataset.menuPanel === activeTabKey ? "true" : "false";
    }
  }

  for (const tab of menuTabs) {
    tab.addEventListener("mouseenter", () => {
      setActiveMenuItem(null);
    });

    tab.addEventListener("focusin", () => {
      setActiveMenuItem(null);
    });

    tab.addEventListener("click", (event) => {
      event.stopPropagation();
      setActiveMenuTab(tab.dataset.menuTab ?? menuTabs[0]?.dataset.menuTab ?? "ai");
    });

    tab.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const currentIndex = Math.max(0, menuTabs.indexOf(tab));
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = menuTabs[(currentIndex + direction + menuTabs.length) % menuTabs.length];

      nextTab?.focus();
      setActiveMenuTab(nextTab?.dataset.menuTab ?? menuTabs[0]?.dataset.menuTab ?? "ai");
    });
  }

  setActiveMenuTab(menuTabs[0]?.dataset.menuTab ?? "ai");

  for (const item of menuItems) {
    item.dataset.active = "false";

    item.addEventListener("mouseenter", () => {
      setActiveMenuItem(item);
    });

    item.addEventListener("focusin", () => {
      setActiveMenuItem(item);
    });
  }

  for (const button of aiActionButtons) {
    button.addEventListener("mouseenter", () => {
      setActiveMenuItem(null);
    });

    button.addEventListener("focusin", () => {
      setActiveMenuItem(null);
    });
  }

  const menu = shadowRoot.querySelector<HTMLElement>(".menu");

  menu?.addEventListener("mouseleave", () => {
    setActiveMenuItem(null);
  });

  function updateAiAnswerState(nextState: AiAnswerState) {
    aiAnswerStatesByQuestionKey.set(aiQuestionKey, nextState);

    const answerFlyout = shadowRoot.querySelector<HTMLElement>('.menu-item[data-answer-menu="ai-answer"] .flyout');
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
        error: currentT("quiz.menu.aiQuestionMissing")
      });
      setActiveMenuItem(shadowRoot.querySelector<HTMLElement>('.menu-item[data-answer-menu="ai-answer"]'));
      return;
    }

    updateAiAnswerState({
      status: "loading",
      answer: null,
      confidence: null,
      actions: [],
      error: null
    });
    setActiveMenuItem(shadowRoot.querySelector<HTMLElement>('.menu-item[data-answer-menu="ai-answer"]'));

    void requestAiGeneratedAnswer(buildAiAnswerRequestPayload(questionNode, questionId))
      .then((response) => {
        updateAiAnswerState({
          status: response.ok ? "success" : "error",
          answer: response.ok ? response.answer ?? "" : null,
          confidence: response.ok ? response.confidence ?? 0 : null,
          actions: response.ok ? response.actions ?? [] : [],
          error: response.ok ? null : response.error ?? currentT("quiz.menu.empty")
        });
      })
      .catch((error) => {
        updateAiAnswerState({
          status: "error",
          answer: null,
          confidence: null,
          actions: [],
          error: error instanceof Error ? error.message : currentT("quiz.menu.empty")
        });
      });
  });

  shadowRoot.addEventListener("click", (event) => {
    const target = event.target;
    const option = target instanceof Element
      ? target.closest<HTMLElement>('[data-ai-answer-action="apply"]')
      : null;

    if (!option) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const questionNode = findQuestionNodeForTrigger(trigger);
    const aiState = getAiAnswerState(aiQuestionKey);

    if (questionNode && aiState.status === "success" && applyAiAnswerForQuestion(questionNode, aiState)) {
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
    const option = target instanceof Element
      ? target.closest<HTMLElement>('[data-ai-answer-action="apply"]')
      : null;

    if (!option) {
      return;
    }

    option.click();
  });

  document.body.append(menuPortal);
  positionAnswerMenuPortal(menuPortal, trigger);

  const flyoutOptions = shadowRoot.querySelectorAll<HTMLElement>(".flyout-option[data-answer-label]");
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
          sourceKey
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
    trigger.setAttribute("aria-expanded", "false");
    menuPortal.remove();

    if (activeCloseAnswerWidgetMenu === closePortal) {
      activeCloseAnswerWidgetMenu = null;
    }
  };

  activeCloseAnswerWidgetMenu = closePortal;
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
  isInline = false
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
  shadowRoot.innerHTML = getAnswerTriggerMarkup();
  answerWidgetStates.set(host, {
    questionId,
    variantCounts,
    answerData,
    slotIndex
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
      state?.questionId ?? questionId
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

function getQuestionAnswerNode(questionNode: Element) {
  const answerNode = questionNode.querySelector(".answer");

  if (isHTMLElement(answerNode)) {
    return answerNode;
  }

  const fallbackNode = questionNode.querySelector(".content, .formulation, .answercontainer, .ddarea");

  if (isHTMLElement(fallbackNode)) {
    return fallbackNode;
  }

  return isHTMLElement(questionNode) ? questionNode : null;
}

function getAnswerEntries(): AnswerEntry[] {
  const answerEntries = Array.from(document.querySelectorAll(".que"))
    .map((questionNode) => {
      const answerNode = getQuestionAnswerNode(questionNode);

      if (!isHTMLElement(answerNode)) {
        return null;
      }

      return {
        answerNode,
        questionId: getQuestionId(questionNode),
        questionNode
      };
    })
    .filter((entry): entry is AnswerEntry => entry !== null);

  if (answerEntries.length > 0) {
    return answerEntries;
  }

  return Array.from(document.querySelectorAll(".answer"))
    .filter(isHTMLElement)
    .map((answerNode): AnswerEntry | null => {
      const questionNode = answerNode.closest(".que");

      if (!questionNode) {
        return null;
      }

      return {
        answerNode,
        questionId: null,
        questionNode
      };
    })
    .filter((entry): entry is AnswerEntry => entry !== null);
}

function setAnswerWidgetAccent(accentColor: string) {
  for (const host of answerWidgetCleanups.keys()) {
    host.style.setProperty("--reduxshare-accent", accentColor);
  }

  const menuPortal = document.querySelector(`[${ANSWER_MENU_PORTAL_ATTR}="true"]`);

  if (menuPortal instanceof HTMLElement) {
    menuPortal.style.setProperty("--reduxshare-accent", accentColor);
  }
}

function getVariantCountsForQuestion(questionId: string | null) {
  return questionId ? (variantCountsByQuestionId.get(questionId) ?? createEmptyVariantCounts()) : createEmptyVariantCounts();
}

function getAnswerDataForQuestion(questionId: string | null): SourceAnswerData {
  return questionId ? (answerDataByQuestionId.get(questionId) ?? createEmptySourceAnswerData()) : createEmptySourceAnswerData();
}

function hasSourceAnswerData(answerData: SourceAnswerData) {
  return hasAnswerData(answerData.reduxshare) || hasAnswerData(answerData.external);
}

function isUnsupportedDragDropQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);

  return questionType !== null && UNSUPPORTED_DRAG_DROP_QUESTION_TYPES.has(questionType);
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
  const hosts = Array.from(questionNode.querySelectorAll<HTMLElement>(`[${ANSWER_WIDGET_ATTR}="true"]`));

  for (const host of hosts) {
    answerWidgetCleanups.get(host)?.();
    host.remove();
  }
}

function scopeSourceAnswerDataToChoice(answerData: SourceAnswerData, input: HTMLInputElement, label: string) {
  const scopedReduxShare = scopeAnswerDataToChoice(answerData.reduxshare, input, label);
  const scopedExternal = scopeAnswerDataToChoice(answerData.external, input, label);

  return {
    answerData: {
      reduxshare: scopedReduxShare.answerData,
      external: scopedExternal.answerData
    },
    slotIndex: scopedReduxShare.slotIndex ?? scopedExternal.slotIndex
  };
}

function scopeSourceAnswerDataToSelect(answerData: SourceAnswerData, select: HTMLSelectElement) {
  const reduxShareSlot = getAnswerSlotForSelect(answerData.reduxshare, select);
  const externalSlot = getAnswerSlotForSelect(answerData.external, select);
  const fallbackSlotIndex = getSelectPlaceIndex(select);

  return {
    answerData: {
      reduxshare: reduxShareSlot
        ? {
            anchors: reduxShareSlot.anchors,
            suggestions: reduxShareSlot.suggestions,
            submissions: reduxShareSlot.submissions,
            slots: [reduxShareSlot]
          }
        : createEmptyAnswerData(),
      external: externalSlot
        ? {
            anchors: externalSlot.anchors,
            suggestions: externalSlot.suggestions,
            submissions: externalSlot.submissions,
            slots: [externalSlot]
          }
        : createEmptyAnswerData()
    },
    slotIndex: reduxShareSlot?.index ?? externalSlot?.index ?? fallbackSlotIndex
  };
}

function getAnswerSlotForControl(answerData: AnswerData, control: HTMLInputElement | HTMLTextAreaElement) {
  for (const slotIndex of getAnswerControlSlotIndexCandidates(control, answerData)) {
    const slot = getAnswerSlotByIndex(answerData, slotIndex);

    if (slot) {
      return slot;
    }
  }

  return null;
}

function createAnswerDataFromSlot(slot: AnswerSlotData) {
  return {
    anchors: slot.anchors,
    suggestions: slot.suggestions,
    submissions: slot.submissions,
    slots: [slot]
  };
}

function shouldUseQuestionLevelTextAnswerData(answerData: AnswerData, control: HTMLInputElement | HTMLTextAreaElement) {
  if (!hasAnswerData(answerData) || getAnswerControlSlotIndex(control) !== null || control.closest(".que.multianswer")) {
    return false;
  }

  const questionNode = control.closest(".que");

  if (!questionNode) {
    return answerData.slots.length <= 1;
  }

  return getTextAnswerInputs(questionNode).length <= 1;
}

function scopeAnswerDataToTextControl(answerData: AnswerData, control: HTMLInputElement | HTMLTextAreaElement) {
  const slot = getAnswerSlotForControl(answerData, control);

  if (slot) {
    return {
      answerData: createAnswerDataFromSlot(slot),
      slotIndex: slot.index
    };
  }

  return {
    answerData: shouldUseQuestionLevelTextAnswerData(answerData, control) ? answerData : createEmptyAnswerData(),
    slotIndex: getAnswerControlSlotIndex(control)
  };
}

function scopeSourceAnswerDataToTextControl(answerData: SourceAnswerData, control: HTMLInputElement | HTMLTextAreaElement) {
  const scopedReduxShare = scopeAnswerDataToTextControl(answerData.reduxshare, control);
  const scopedExternal = scopeAnswerDataToTextControl(answerData.external, control);

  return {
    answerData: {
      reduxshare: scopedReduxShare.answerData,
      external: scopedExternal.answerData
    },
    slotIndex: scopedReduxShare.slotIndex ?? scopedExternal.slotIndex
  };
}

function scopeSourceAnswerDataToSlot(answerData: SourceAnswerData, slotIndex: number | null) {
  const reduxShareSlot = getAnswerSlotByIndex(answerData.reduxshare, slotIndex);
  const externalSlot = getAnswerSlotByIndex(answerData.external, slotIndex);

  return {
    answerData: {
      reduxshare: reduxShareSlot
        ? {
            anchors: reduxShareSlot.anchors,
            suggestions: reduxShareSlot.suggestions,
            submissions: reduxShareSlot.submissions,
            slots: [reduxShareSlot]
          }
        : createEmptyAnswerData(),
      external: externalSlot
        ? {
            anchors: externalSlot.anchors,
            suggestions: externalSlot.suggestions,
            submissions: externalSlot.submissions,
            slots: [externalSlot]
          }
        : createEmptyAnswerData()
    },
    slotIndex
  };
}

function mapSuggestionToOrderingPosition(suggestion: SuggestionItem, position: number): SuggestionItem {
  const positionLabel = getOrderingPositionLabel(position);

  return {
    ...suggestion,
    label: positionLabel,
    displayLabel: positionLabel,
    actionSlotIndex: position
  };
}

function mapSubmissionToOrderingPosition(submission: SubmissionItem, position: number): SubmissionItem {
  const positionLabel = getOrderingPositionLabel(position);

  return {
    ...submission,
    label: positionLabel,
    displayLabel: positionLabel,
    actionSlotIndex: position
  };
}

function scopeAnswerDataToOrderingItem(answerData: AnswerData, itemLabel: string, itemCount: number) {
  const scopedAnswerData = createEmptyAnswerData();
  const hasZeroBasedSlots = answerDataHasZeroBasedOrderingSlots(answerData);

  for (const slot of answerData.slots) {
    const position = getOrderingSlotPosition(slot, itemCount, hasZeroBasedSlots);

    if (position === null) {
      continue;
    }

    const suggestions = slot.suggestions
      .filter((suggestion) => itemLabelMatches(suggestion, itemLabel))
      .map((suggestion) => mapSuggestionToOrderingPosition(suggestion, position));
    const submissions = slot.submissions
      .filter((submission) => itemLabelMatches(submission, itemLabel))
      .map((submission) => mapSubmissionToOrderingPosition(submission, position));

    if (suggestions.length === 0 && submissions.length === 0) {
      continue;
    }

    const anchor = getOrderingPositionLabel(position);
    scopedAnswerData.anchors.push(anchor);
    scopedAnswerData.suggestions.push(...suggestions);
    scopedAnswerData.submissions.push(...submissions);
    scopedAnswerData.slots.push({
      index: position,
      hasExplicitIndex: true,
      anchors: [anchor],
      suggestions,
      submissions
    });
  }

  if (hasAnswerData(scopedAnswerData) || answerData.slots.length > 0) {
    return scopedAnswerData;
  }

  answerData.suggestions.forEach((suggestion, index) => {
    const position = index + 1;

    if (position <= itemCount && itemLabelMatches(suggestion, itemLabel)) {
      scopedAnswerData.suggestions.push(mapSuggestionToOrderingPosition(suggestion, position));
    }
  });

  answerData.submissions.forEach((submission, index) => {
    const position = index + 1;

    if (position <= itemCount && itemLabelMatches(submission, itemLabel)) {
      scopedAnswerData.submissions.push(mapSubmissionToOrderingPosition(submission, position));
    }
  });

  if (scopedAnswerData.suggestions.length === 0) {
    const sequentialLabels = splitSequentialAnswerLabels(getPreferredSuggestionLabels(answerData.suggestions), itemCount);
    const fallbackSuggestion = answerData.suggestions.find((suggestion) => suggestion.label.trim());

    if (fallbackSuggestion && sequentialLabels.length === itemCount) {
      sequentialLabels.forEach((label, index) => {
        if (labelsMatch(label, itemLabel)) {
          scopedAnswerData.suggestions.push(
            mapSuggestionToOrderingPosition(
              {
                ...fallbackSuggestion,
                label
              },
              index + 1
            )
          );
        }
      });
    }
  }

  return scopedAnswerData;
}

function scopeSourceAnswerDataToOrderingItem(answerData: SourceAnswerData, itemLabel: string, itemCount: number) {
  const reduxshare = scopeAnswerDataToOrderingItem(answerData.reduxshare, itemLabel, itemCount);
  const external = scopeAnswerDataToOrderingItem(answerData.external, itemLabel, itemCount);
  const slotIndex =
    reduxshare.slots[0]?.index ??
    reduxshare.suggestions[0]?.actionSlotIndex ??
    reduxshare.submissions[0]?.actionSlotIndex ??
    external.slots[0]?.index ??
    external.suggestions[0]?.actionSlotIndex ??
    external.submissions[0]?.actionSlotIndex ??
    null;

  return {
    answerData: {
      reduxshare,
      external
    },
    slotIndex
  };
}

function getAnswerDataForQuestionSelect(questionId: string | null, select: HTMLSelectElement) {
  return scopeSourceAnswerDataToSelect(getAnswerDataForQuestion(questionId), select);
}

function getAnswerDataForQuestionTextControl(questionId: string | null, control: HTMLInputElement | HTMLTextAreaElement) {
  return scopeSourceAnswerDataToTextControl(getAnswerDataForQuestion(questionId), control);
}

function getAnswerDataForQuestionChoice(questionId: string | null, questionNode: Element, input: HTMLInputElement) {
  const fullAnswerData = getAnswerDataForQuestion(questionId);
  const label = getInputAnswerLabelText(questionNode, input);

  return scopeSourceAnswerDataToChoice(fullAnswerData, input, label);
}

function getAnswerDataForDdwtosDrop(questionId: string | null, drop: Element) {
  return scopeSourceAnswerDataToSlot(getAnswerDataForQuestion(questionId), getDdwtosDropSlotIndex(drop));
}

function getAnswerDataForDdmarkerChoice(questionId: string | null, choiceIndex: number) {
  return scopeSourceAnswerDataToSlot(getAnswerDataForQuestion(questionId), choiceIndex);
}

function getAnswerDataForDdimageOrTextDrop(questionId: string | null, drop: Element) {
  return scopeSourceAnswerDataToSlot(getAnswerDataForQuestion(questionId), getDdimageOrTextDropSlotIndex(drop));
}

function getAnswerDataForOrderingItem(questionId: string | null, item: Element, itemCount: number) {
  return scopeSourceAnswerDataToOrderingItem(getAnswerDataForQuestion(questionId), getOrderingItemLabel(item), itemCount);
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
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`
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
        slotIndex
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true
    );
    host.hidden = !answerWidgetsVisible;
    targetNode.append(host);
  }
}

function mountMultiChoiceAnswerWidgets(entry: AnswerEntry, accentColor: string) {
  const { questionId, questionNode, answerNode } = entry;
  const questionLevelHost = answerNode.querySelector(
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`
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

    const { answerData, slotIndex } = getAnswerDataForQuestionChoice(questionId, questionNode, input);
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
        slotIndex
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true
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
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`
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
    const existingHost = Array.from(targetNode.querySelectorAll<HTMLElement>(`[${ANSWER_WIDGET_ATTR}="true"]`)).find((host) => {
      if (input.id && host.getAttribute("data-reduxshare-text-input-id") === input.id) {
        return true;
      }

      return slotIndex !== null && host.getAttribute("data-reduxshare-text-slot") === String(slotIndex);
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
        slotIndex
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true
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
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`
  );

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  for (const drop of getDdwtosDrops(questionNode)) {
    const slotIndex = getDdwtosDropSlotIndex(drop);
    const existingHost = slotIndex === null
      ? null
      : questionNode.querySelector<HTMLElement>(
          `[${ANSWER_WIDGET_ATTR}="true"][data-reduxshare-ddwtos-slot="${slotIndex}"]`
        );
    const { answerData } = getAnswerDataForDdwtosDrop(questionId, drop);

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;
      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true
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
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`
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
      questionNode.querySelector<HTMLElement>(`.draghomes .marker.choice${choice.choiceIndex}:not(.dragplaceholder)`) ??
      questionNode.querySelector<HTMLElement>(`.draghomes .marker.choice${choice.choiceIndex}.dragplaceholder`) ??
      questionNode.querySelector<HTMLElement>(`.draghomes .marker.choice${choice.choiceIndex}`);

    if (!targetNode) {
      continue;
    }

    const existingHost = questionNode.querySelector<HTMLElement>(
      `[${ANSWER_WIDGET_ATTR}="true"][data-reduxshare-ddmarker-choice="${choice.choiceIndex}"]`
    );
    const { answerData, slotIndex } = getAnswerDataForDdmarkerChoice(questionId, choice.choiceIndex);

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
        slotIndex
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true
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
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`
  );

  if (questionLevelHost instanceof HTMLElement) {
    answerWidgetCleanups.get(questionLevelHost)?.();
    questionLevelHost.remove();
  }

  for (const drop of getDdimageOrTextDrops(questionNode)) {
    const slotIndex = getDdimageOrTextDropSlotIndex(drop);
    const existingHost = slotIndex === null
      ? null
      : questionNode.querySelector<HTMLElement>(
          `[${ANSWER_WIDGET_ATTR}="true"][data-reduxshare-ddimageortext-slot="${slotIndex}"]`
        );
    const { answerData } = getAnswerDataForDdimageOrTextDrop(questionId, drop);

    if (existingHost instanceof HTMLElement) {
      existingHost.style.setProperty("--reduxshare-accent", accentColor);
      existingHost.hidden = !answerWidgetsVisible;
      answerWidgetStates.set(existingHost, {
        questionId,
        variantCounts: getVariantCountsForQuestion(questionId),
        answerData,
        slotIndex
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true
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
    `[${ANSWER_WIDGET_ATTR}="true"]:not([data-reduxshare-inline-widget="true"])`
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
        slotIndex
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      answerData,
      slotIndex,
      true
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
    getAnswerDataForQuestion(questionId)
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
        slotIndex: null
      });
      continue;
    }

    const host = createAnswerWidgetHost(
      accentColor,
      questionId,
      getVariantCountsForQuestion(questionId),
      getAnswerDataForQuestion(questionId)
    );
    host.hidden = !answerWidgetsVisible;
    answerNode.append(host);
  }
}

function autoSelectExactAnswers(settings: StoredStateLike["settings"] | undefined) {
  if (!isAutoSelectEnabled(settings)) {
    return;
  }

  const changedQuestionIds: string[] = [];

  for (const { questionId, questionNode } of getAnswerEntries()) {
    if (!questionNode) {
      continue;
    }

    if (
      autoSelectQuestionAnswers(
        questionNode,
        getPreferredAutoSelectAnswerDataForQuestion(questionNode, getAnswerDataForQuestion(questionId))
      )
    ) {
      changedQuestionIds.push(getQuestionProgressId(questionNode, questionId));
    }
  }

  if (changedQuestionIds.length > 0) {
    logReduxShareInfo("ReduxShare: auto-selected exact answers", changedQuestionIds.length);
    void reportSolvedQuestions(changedQuestionIds);
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
  currentQuizAttemptContext = null;
}

function watchStoredSettingsChanges() {
  if (storageWatcherInstalled) {
    return;
  }

  storageWatcherInstalled = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[APP_STORAGE_KEY]) {
      return;
    }

    const nextState = changes[APP_STORAGE_KEY].newValue as StoredStateLike | undefined;
    currentStoredState = nextState;
    syncLanguage(nextState);
    syncStealthMode(nextState);
    syncAnswerWidgetHotkey(nextState);

    if (!canUseQuizFeatures(nextState)) {
      resetRestrictedQuizState();
      return;
    }

    if (!currentQuizAttemptContext) {
      void initializeQuizAttemptFeatures();
      return;
    }

    const accentColor = getAccentColor(nextState?.settings);
    setAnswerWidgetAccent(accentColor);
    mountAnswerWidgets(accentColor);
    autoSelectExactAnswers(nextState?.settings);
  });
}

function requestQuizAnswers(context: QuizAttemptContext): Promise<QuizAnswersResponse> {
  const sourceQuestions = context.questions.filter((question) => !isAiOnlyQuestionTypeName(question.questionType));

  if (sourceQuestions.length === 0) {
    return Promise.resolve({
      ok: true,
      reduxshareResults: [],
      externalResults: []
    });
  }

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: FETCH_QUIZ_ANSWERS_MESSAGE,
        payload: {
          domain: context.domain,
          courseId: context.courseId,
          quizId: context.contextInstanceId,
          questions: sourceQuestions
        }
      },
      (response: QuizAnswersResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      }
    );
  });
}

function addVariantCounts(left: AnswerVariantCounts, right: AnswerVariantCounts): AnswerVariantCounts {
  return {
    anchors: left.anchors + right.anchors,
    suggestions: left.suggestions + right.suggestions,
    submissions: left.submissions + right.submissions
  };
}

function setSourceAnswerData(questionId: string | null, source: keyof SourceAnswerData, data: AnswerData) {
  if (!questionId) {
    return;
  }

  const currentAnswerData = answerDataByQuestionId.get(questionId) ?? createEmptySourceAnswerData();

  answerDataByQuestionId.set(questionId, {
    ...currentAnswerData,
    [source]: data
  });
}

function applyQuizAnswerResults(results: QuizVariantResult[] | undefined, source: keyof SourceAnswerData) {
  for (const result of results ?? []) {
    const counts = getVariantCounts(result);
    const data = getAnswerData(result);

    if (result.questionId) {
      variantCountsByQuestionId.set(
        result.questionId,
        addVariantCounts(variantCountsByQuestionId.get(result.questionId) ?? createEmptyVariantCounts(), counts)
      );
      setSourceAnswerData(result.questionId, source, data);
    }
  }
}

async function loadQuizAnswers(context: QuizAttemptContext) {
  if (context.questions.length === 0) {
    return;
  }

  try {
    const response = await requestQuizAnswers(context);

    if (!response.ok) {
      logReduxShareWarning("ReduxShare: quiz answers request failed", response.error);
      return;
    }

    const currentState = await loadStoredState();
    syncLanguage(currentState);

    if (!canUseQuizFeatures(currentState)) {
      resetRestrictedQuizState();
      return;
    }

    variantCountsByQuestionId.clear();
    answerDataByQuestionId.clear();
    applyQuizAnswerResults(response.reduxshareResults, "reduxshare");
    applyQuizAnswerResults(response.externalResults, "external");

    mountAnswerWidgets(getAccentColor(currentState.settings));
    autoSelectExactAnswers(currentState.settings);
  } catch (error) {
    logReduxShareWarning("ReduxShare: quiz answers request failed", error);
  }
}

async function initializeQuizAttemptFeatures() {
  let storedState = await loadStoredState();
  syncLanguage(storedState);
  syncStealthMode(storedState);
  syncAnswerWidgetHotkey(storedState);

  if (!canUseQuizFeatures(storedState)) {
    resetRestrictedQuizState();
    return;
  }

  const pageFullyLoaded = await waitForFullPageLoad();

  if (!pageFullyLoaded) {
    logReduxShareInfo("ReduxShare: continuing after page load wait timeout");
  }

  storedState = await loadStoredState();
  syncLanguage(storedState);
  syncStealthMode(storedState);
  syncAnswerWidgetHotkey(storedState);

  if (!canUseQuizFeatures(storedState)) {
    resetRestrictedQuizState();
    return;
  }

  const accentColor = getAccentColor(storedState.settings);

  const context = await waitForQuizAttemptContext();
  storedState = await loadStoredState();
  syncLanguage(storedState);
  syncStealthMode(storedState);
  syncAnswerWidgetHotkey(storedState);

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
  syncLanguage(storedState);
  syncStealthMode(storedState);

  if (!canUseQuizFeatures(storedState)) {
    await saveQuizReviewSaveDiagnostics("content-blocked-before-load", {
      reason: "quiz features unavailable",
      hasAuthSession: Boolean(storedState?.authSession?.user?.id),
      extensionEnabled: storedState?.settings?.extensionEnabled !== false
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
    createdAt: new Date().toISOString()
  });

  logReduxShareInfo("ReduxShare: quiz summary page detected, waiting for review page");
}

async function initializeQuizReviewSave() {
  let storedState = await loadStoredState();
  syncLanguage(storedState);
  syncStealthMode(storedState);

  if (!canUseQuizFeatures(storedState)) {
    await saveQuizReviewSaveDiagnostics("content-blocked-after-load", {
      reason: "quiz features unavailable",
      hasAuthSession: Boolean(storedState?.authSession?.user?.id),
      extensionEnabled: storedState?.settings?.extensionEnabled !== false
    });
    return;
  }

  const pageFullyLoaded = await waitForFullPageLoad();

  if (!pageFullyLoaded) {
    logReduxShareInfo("ReduxShare: continuing review parse after page load wait timeout");
  }

  storedState = await loadStoredState();
  syncLanguage(storedState);
  syncStealthMode(storedState);

  if (!canUseQuizFeatures(storedState)) {
    return;
  }

  const identity = getQuizReviewUrlIdentity(window.location.href);
  const savePayload = buildReviewSaveRequestPayload(storedState);

  if (!savePayload) {
    await saveQuizReviewSaveDiagnostics("content-no-payload", {
      questionCount: document.querySelectorAll(".que").length
    });
    logReduxShareInfo("ReduxShare: review page detected, no supported answers found");
    await clearQuizReviewPendingMarker(identity.attemptKey);
    return;
  }

  try {
    await saveQuizReviewSaveDiagnostics("content-sending", {
      courseId: savePayload.courseId,
      quizId: savePayload.quizId,
      attemptKey: savePayload.attemptKey,
      questions: savePayload.questions.map((question) => ({
        questionId: question.questionId,
        questionType: question.questionType,
        questionHash: question.questionHash,
        answerCount: question.answers.length,
        answers: question.answers.map((answer) => ({
          label: answer.label,
          slotKey: answer.slotKey,
          correctness: answer.correctness,
          isCorrect: answer.isCorrect,
          wasSelected: answer.wasSelected
        }))
      }))
    });
    const response = await requestSaveReviewAnswers(savePayload);

    if (!response.ok) {
      await saveQuizReviewSaveDiagnostics("content-response-error", {
        response
      });
      logReduxShareWarning("ReduxShare: review answers save failed", response.error);
      return;
    }

    await saveQuizReviewSaveDiagnostics("content-response-ok", {
      response,
      courseId: savePayload.courseId,
      quizId: savePayload.quizId,
      attemptKey: savePayload.attemptKey
    });
    await clearQuizReviewPendingMarker(identity.attemptKey);
    logReduxShareInfo(
      "ReduxShare: review answers processed",
      response.imported ? response.savedCount ?? 0 : 0,
      response.imported === false ? "duplicate" : "saved"
    );
  } catch (error) {
    await saveQuizReviewSaveDiagnostics("content-exception", {
      error: error instanceof Error ? error.message : String(error)
    });
    logReduxShareWarning("ReduxShare: review answers save failed", error);
  }
}

async function bootstrapQuizPageDetection() {
  if (isQuizAttemptUrl(window.location)) {
    watchStoredSettingsChanges();
    await initializeQuizAttemptFeatures();
    return;
  }

  if (isQuizSummaryUrl(window.location)) {
    await initializeQuizSummaryTracking();
    return;
  }

  if (isQuizReviewUrl(window.location)) {
    await initializeQuizReviewSave();
  }
}

function resetQuizAttemptTestState() {
  closeActiveAnswerWidgetMenu();
  removeAnswerWidgets();
  variantCountsByQuestionId.clear();
  answerDataByQuestionId.clear();
  aiAnswerStatesByQuestionKey.clear();
  currentQuizAttemptContext = null;
  currentStoredState = {
    settings: {
      extensionEnabled: true,
      stealthMode: true,
      language: "ru",
      ai: {
        provider: "google",
        model: "gemini-test",
        apiKey: "test-api-key",
        connectionVerified: true
      }
    },
    authSession: {
      user: {
        id: "test-user"
      }
    }
  };
  syncLanguage(currentStoredState);
  answerWidgetsVisible = true;
}

function installQuizAttemptTestApi() {
  globalThis.__reduxshareQuizAttemptTestApi = {
    reset: resetQuizAttemptTestState,
    setStoredState: (state) => {
      currentStoredState = state;
      syncLanguage(state);
    },
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
    createEmptySourceAnswerData,
    createEmptyVariantCounts
  };
  resetQuizAttemptTestState();
}

if (globalThis.__REDUXSHARE_TEST_MODE__) {
  installQuizAttemptTestApi();
} else {
  void bootstrapQuizPageDetection();
}

export {};
