import { findMoodleConfig, parseMoodleNumericId } from "../moodleContext";
import { canUseQuizFeatures } from "../logic/settings";
import {
  isExtensionContextValid,
  loadStoredState,
  logReduxShareInfo,
  logReduxShareWarning,
  syncLanguage,
} from "../logic/runtime";
import { FETCH_QUIZ_PREVIEW_MESSAGE } from "../shared/messages";
import { DEFAULT_HOTKEY, DEFAULT_HOTKEY_CODE, type StoredStateLike } from "../model";
import { currentStoredState, setCurrentStoredState } from "../state";
import {
  beginQuizPreviewLoading,
  getQuizPreviewPanelState,
  hideQuizPreviewPanel,
  isQuizPreviewPanelVisible,
  refreshQuizPreviewPanelTheme,
  resetQuizPreviewPanelState,
  setQuizPreviewPanelQuizTitle,
  setQuizPreviewRefreshHandler,
  setQuizPreviewScanHandlers,
  setQuizPreviewScanRunning,
  showQuizPreviewError,
  showQuizPreviewQuestions,
  updateQuizPreviewScanProgress,
} from "../ui/quizPreviewPanel";
import { applyContentColorSchemeToHost, getAccentColor, getRgbCssValue } from "../logic/theme";
import {
  normalizeQuizIdScanRange,
  QUIZ_ID_SCAN_DEFAULT_FROM,
  QUIZ_ID_SCAN_DEFAULT_TO,
  scanExternalQuestionIds,
  type QuizIdScanHit,
} from "../lib/quizIdScan";
import { preloadQuizQuestions, type PreloadQuizQuestionsPayload } from "../lib/quizAttemptPreload";
import {
  hotkeyMatchesEvent,
  isEditableHotkeyTarget,
  normalizeHotkeyCode,
  normalizeHotkeyValue,
} from "./quizAttempt/hotkeys";
import { isQuizViewUrl } from "./quizAttempt/quizUrl";
import type { QuizPreviewQuestion, QuizPreviewRequestPayload, QuizPreviewResponse } from "../model";
import { createEmptyAnswerData, getAnswerData } from "../data/answerData";
import { getContentTranslator } from "../i18n/contentI18n";

const QUIZ_PREVIEW_BUTTON_ID = "reduxshare-quiz-preview-button";

const QUIZ_START_FORM_SELECTOR = 'form[action*="mod/quiz/startattempt.php"]';

const QUIZ_PREVIEW_BUTTON_MARKUP = `
  <style>
    :host {
      all: initial;
      display: inline-block;
      vertical-align: middle;
      --reduxshare-accent-soft: color-mix(in srgb, var(--reduxshare-accent) 70%, #ffffff);
    }

    :host([data-theme="light"]) {
      --reduxshare-accent-soft: color-mix(in srgb, var(--reduxshare-accent) 62%, #16213c);
    }

    .rpx-trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      border: 1px solid rgba(var(--reduxshare-accent-rgb), 0.45);
      border-radius: 999px;
      background: rgba(var(--reduxshare-accent-rgb), 0.14);
      color: var(--reduxshare-accent-soft);
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
      font-size: 13px;
      font-weight: 650;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition:
        background-color 140ms ease,
        border-color 140ms ease,
        box-shadow 160ms ease,
        transform 120ms ease;
    }

    .rpx-trigger:hover {
      background: rgba(var(--reduxshare-accent-rgb), 0.22);
      box-shadow: 0 8px 22px rgba(var(--reduxshare-accent-rgb), 0.28);
      transform: translateY(-1px);
    }

    .rpx-trigger:active {
      transform: translateY(0) scale(0.98);
    }

    .rpx-trigger:focus-visible {
      outline: 2px solid var(--reduxshare-accent);
      outline-offset: 2px;
    }

    .rpx-trigger svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentColor;
      stroke-width: 3.4;
      stroke-linecap: round;
      stroke-linejoin: round;
      flex: none;
    }
  </style>
  <button type="button" class="rpx-trigger">
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M4 24c5.2-8.4 11.9-12.6 20-12.6S38.8 15.6 44 24c-5.2 8.4-11.9 12.6-20 12.6S9.2 32.4 4 24Z" />
      <circle cx="24" cy="24" r="7" />
    </svg>
    <span class="rpx-trigger-label"></span>
  </button>
`;

let quizPreviewHotkey = DEFAULT_HOTKEY;
let quizPreviewHotkeyCode = DEFAULT_HOTKEY_CODE;
let quizPreviewHotkeyEnabled = true;
let quizPreviewHotkeyListenerInstalled = false;
let quizPreviewMountObserverInstalled = false;

let quizPreviewCache: { key: string; response: QuizPreviewResponse } | null = null;

export function shouldCacheQuizPreviewResponse(response: QuizPreviewResponse) {
  return response.ok && response.authRequired !== true && (response.questions?.length ?? 0) > 0;
}

function getQuizPreviewCacheKey(payload: QuizPreviewRequestPayload) {
  return `${payload.domain}/${payload.courseId}/${payload.quizId}`;
}

let scannedPreviewCacheKey: string | null = null;
let scannedPreviewQuestions: QuizPreviewQuestion[] = [];
let quizIdScanToken: { cancelled: boolean } | null = null;

function getMergedPreviewQuestions(baseQuestions: QuizPreviewQuestion[], cacheKey: string) {
  if (scannedPreviewCacheKey !== cacheKey || scannedPreviewQuestions.length === 0) {
    return baseQuestions;
  }

  const knownIds = new Set(
    baseQuestions.map((question) => question.questionId).filter((id): id is string => id !== null),
  );

  return [
    ...baseQuestions,
    ...scannedPreviewQuestions.filter(
      (question) => question.questionId === null || !knownIds.has(question.questionId),
    ),
  ];
}

function showMergedPreviewQuestions(
  baseQuestions: QuizPreviewQuestion[],
  authRequired: boolean,
  cacheKey: string,
) {
  showQuizPreviewQuestions(getMergedPreviewQuestions(baseQuestions, cacheKey), authRequired);
}

function cancelQuizIdScan() {
  if (quizIdScanToken) {
    quizIdScanToken.cancelled = true;
    quizIdScanToken = null;
  }
}

function scannedHitToPreviewQuestion(hit: QuizIdScanHit): QuizPreviewQuestion {
  return {
    questionId: hit.questionId,
    questionType: hit.questionType,
    questionHash: null,
    questionText: null,
    answerOptions: [],
    reduxshare: createEmptyAnswerData(),
    external: getAnswerData({
      questionId: hit.questionId,
      questionType: hit.questionType,
      questionHash: null,
      ok: true,
      data: hit.data,
    }),
  };
}

async function startQuizIdScan(
  cacheKey: string,
  fromRaw: unknown,
  toRaw: unknown,
  questionTypes?: string[],
) {
  const payload = collectQuizPreviewPayload();

  if (!payload || payload.courseId === null || payload.quizId === null) {
    return;
  }

  if (getQuizPreviewCacheKey(payload) !== cacheKey) {
    return;
  }

  const range = normalizeQuizIdScanRange(fromRaw, toRaw) ?? {
    from: QUIZ_ID_SCAN_DEFAULT_FROM,
    to: QUIZ_ID_SCAN_DEFAULT_TO,
  };

  cancelQuizIdScan();

  const token = { cancelled: false };
  quizIdScanToken = token;
  setQuizPreviewScanRunning(true);

  const reshowScanned = () => {
    const panelState = getQuizPreviewPanelState();
    showMergedPreviewQuestions(panelState.questions, panelState.authRequired, cacheKey);
  };

  try {
    await scanExternalQuestionIds(
      payload.domain,
      payload.courseId,
      payload.quizId,
      range.from,
      range.to,
      {
        language: currentStoredState?.settings?.language,
        questionTypes,
        isCancelled: () => token.cancelled,
        onProgress: (progress) => {
          updateQuizPreviewScanProgress(progress);
        },
        onHit: (hit) => {
          if (scannedPreviewCacheKey !== cacheKey) {
            scannedPreviewCacheKey = cacheKey;
            scannedPreviewQuestions = [];
          }

          if (!scannedPreviewQuestions.some((question) => question.questionId === hit.questionId)) {
            scannedPreviewQuestions.push(scannedHitToPreviewQuestion(hit));

            reshowScanned();
          }
        },
      },
    );
  } finally {
    if (quizIdScanToken === token) {
      quizIdScanToken = null;
    }

    setQuizPreviewScanRunning(false);
  }

  reshowScanned();
}

function findQuizIdFromPageUrl() {
  try {
    const url = new URL(window.location.href);

    return (
      parseMoodleNumericId(url.searchParams.get("id")) ??
      parseMoodleNumericId(url.searchParams.get("cmid"))
    );
  } catch {
    return null;
  }
}

function findCourseIdFromPage() {
  for (const link of Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/course/view.php"]'),
  )) {
    try {
      const courseId = parseMoodleNumericId(
        new URL(link.href, window.location.href).searchParams.get("id"),
      );

      if (courseId !== null) {
        return courseId;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function collectQuizPreviewPayload(): QuizPreviewRequestPayload | null {
  const moodleConfig = findMoodleConfig();
  const startForm = document.querySelector<HTMLFormElement>(QUIZ_START_FORM_SELECTOR);
  const startFormCmid = startForm?.querySelector<HTMLInputElement>('input[name="cmid"]')?.value;

  const quizId =
    moodleConfig?.contextInstanceId ??
    parseMoodleNumericId(startFormCmid) ??
    findQuizIdFromPageUrl();
  const courseId =
    moodleConfig?.courseId ??
    findCourseIdFromPage() ??
    currentStoredState?.latestQuizAttemptContext?.courseId ??
    null;

  if (courseId === null || quizId === null) {
    return null;
  }

  return {
    domain: window.location.hostname,
    courseId,
    quizId,
  };
}

function requestQuizPreview(payload: QuizPreviewRequestPayload): Promise<QuizPreviewResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: FETCH_QUIZ_PREVIEW_MESSAGE,
          payload,
        },
        (response: QuizPreviewResponse | undefined) => {
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

function findQuizTitleFromPage() {
  // Порядок приоритета важен: querySelector с union-селектором вернул бы первый
  // h1 в порядке документа, а не самый специфичный.
  for (const selector of [".page-header-headings h1", "#region-main h1", "#region-main h2", "h1"]) {
    const heading = document.querySelector<HTMLElement>(selector);
    const title = heading?.textContent?.trim();

    if (title) {
      return title;
    }
  }

  return null;
}

async function openQuizPreview(forceRefresh = false) {
  const payload = collectQuizPreviewPayload();
  const translator = getContentTranslator(currentStoredState?.settings?.language);

  setQuizPreviewPanelQuizTitle(findQuizTitleFromPage());

  if (!payload) {
    showQuizPreviewError(translator("quiz.preview.error"));
    return;
  }

  const cacheKey = getQuizPreviewCacheKey(payload);

  if (!forceRefresh && quizPreviewCache?.key === cacheKey) {
    showMergedPreviewQuestions(
      quizPreviewCache.response.questions ?? [],
      quizPreviewCache.response.authRequired === true,
      cacheKey,
    );
    return;
  }

  beginQuizPreviewLoading();

  try {
    const response = await requestQuizPreview({ ...payload, forceRefresh });

    if (!response.ok) {
      showQuizPreviewError(response.error ?? translator("quiz.preview.error"));
      return;
    }

    if (shouldCacheQuizPreviewResponse(response)) {
      quizPreviewCache = { key: cacheKey, response };
    }

    showMergedPreviewQuestions(response.questions ?? [], response.authRequired === true, cacheKey);
    logReduxShareInfo(
      `ReduxShare: quiz preview loaded, ${response.questions?.length ?? 0} questions`,
    );

    if (!response.questions || response.questions.length === 0) {
      if (forceRefresh && scannedPreviewCacheKey !== cacheKey) {
        await startQuizIdScan(cacheKey, QUIZ_ID_SCAN_DEFAULT_FROM, QUIZ_ID_SCAN_DEFAULT_TO);
      } else {
        logReduxShareWarning("ReduxShare: no questions to preload");
      }

      return;
    }

    logReduxShareInfo(`ReduxShare: starting preload for ${response.questions.length} questions`);

    const preloadPayload: PreloadQuizQuestionsPayload = {
      domain: payload.domain,
      courseId: payload.courseId,
      quizId: payload.quizId,
      questions: response.questions.map((q) => ({
        questionId: q.questionId,
        questionType: q.questionType,
        questionHash: q.questionHash,
        questionText: q.questionText,
      })),
    };

    logReduxShareInfo(`ReduxShare: preload payload prepared:`, preloadPayload);

    try {
      const result = await preloadQuizQuestions(
        preloadPayload,
        currentStoredState?.settings?.language,
      );
      logReduxShareInfo(`ReduxShare: preload completed:`, result);
      if (result.found > 0) {
        logReduxShareInfo(
          `ReduxShare: preloaded ${result.found}/${result.total} questions from external sources`,
        );
      }
    } catch (error) {
      logReduxShareWarning("ReduxShare: quiz preview preloading failed", error);

      if (error instanceof Error && error.message.includes("Extension context invalidated")) {
        logReduxShareWarning("ReduxShare: extension context invalidated, preload skipped");
      }
    }
  } catch (error) {
    showQuizPreviewError(translator("quiz.preview.error"));
    logReduxShareWarning("ReduxShare: quiz preview request failed", error);
  }
}

async function toggleQuizPreview() {
  if (isQuizPreviewPanelVisible()) {
    hideQuizPreviewPanel();
    return;
  }

  await openQuizPreview();
}

function handleQuizPreviewHotkey(event: KeyboardEvent) {
  if (
    !quizPreviewHotkeyEnabled ||
    event.defaultPrevented ||
    isEditableHotkeyTarget(event) ||
    !hotkeyMatchesEvent(quizPreviewHotkey, quizPreviewHotkeyCode, event)
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  void toggleQuizPreview();
}

function syncQuizPreviewHotkey(storedState: StoredStateLike | undefined) {
  if (!isQuizViewUrl(window.location)) {
    return;
  }

  const settings = storedState?.settings;
  quizPreviewHotkey = normalizeHotkeyValue(settings?.hotkey);
  quizPreviewHotkeyCode = normalizeHotkeyCode(settings?.hotkeyCode, settings?.hotkey);
  quizPreviewHotkeyEnabled = canUseQuizFeatures(storedState);

  if (quizPreviewHotkeyListenerInstalled) {
    return;
  }

  quizPreviewHotkeyListenerInstalled = true;
  document.addEventListener("keydown", handleQuizPreviewHotkey, true);
}

function applyQuizPreviewButtonTheme(button: HTMLElement) {
  const accentColor = getAccentColor(currentStoredState?.settings);

  button.style.setProperty("--reduxshare-accent", accentColor);
  button.style.setProperty("--reduxshare-accent-rgb", getRgbCssValue(accentColor));
  applyContentColorSchemeToHost(button);
}

function updateQuizPreviewButton(button: HTMLElement) {
  const label = getContentTranslator(currentStoredState?.settings?.language)("quiz.preview.button");
  const shadow = button.shadowRoot ?? button.attachShadow({ mode: "open" });

  if (shadow.childElementCount === 0) {
    shadow.innerHTML = QUIZ_PREVIEW_BUTTON_MARKUP;
  }

  applyQuizPreviewButtonTheme(button);

  const trigger = shadow.querySelector<HTMLButtonElement>(".rpx-trigger");
  const labelNode = shadow.querySelector<HTMLElement>(".rpx-trigger-label");

  if (labelNode && labelNode.textContent !== label) {
    labelNode.textContent = label;
  }

  const title = `${label} (${quizPreviewHotkey})`;

  if (trigger && trigger.title !== title) {
    trigger.title = title;
  }

  const hidden = !canUseQuizFeatures(currentStoredState);

  if (button.hidden !== hidden) {
    button.hidden = hidden;
  }
}

function ensureQuizPreviewButton(): boolean {
  const existingButton = document.getElementById(QUIZ_PREVIEW_BUTTON_ID);

  if (existingButton instanceof HTMLElement) {
    updateQuizPreviewButton(existingButton);
    return true;
  }

  const startButtonDiv = document.querySelector(".quizstartbuttondiv");

  if (!startButtonDiv?.parentElement) {
    return false;
  }

  const createdButton = document.createElement("span");
  createdButton.id = QUIZ_PREVIEW_BUTTON_ID;
  createdButton.addEventListener("click", () => {
    void toggleQuizPreview();
  });

  const wrapper = document.createElement("div");
  wrapper.className = "singlebutton";
  wrapper.style.display = "inline-block";
  wrapper.style.marginLeft = "8px";
  wrapper.appendChild(createdButton);

  startButtonDiv.parentElement.insertBefore(wrapper, startButtonDiv.nextSibling);
  updateQuizPreviewButton(createdButton);

  return true;
}

function watchQuizPreviewButtonMount() {
  if (quizPreviewMountObserverInstalled || typeof MutationObserver !== "function") {
    return;
  }

  quizPreviewMountObserverInstalled = true;

  const observer = new MutationObserver(() => {
    if (!isExtensionContextValid()) {
      observer.disconnect();
      return;
    }

    ensureQuizPreviewButton();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export async function initializeQuizPreviewFeatures() {
  const storedState = await loadStoredState();
  setCurrentStoredState(storedState);
  syncLanguage(storedState);
  syncQuizPreviewHotkey(storedState);
  resetQuizPreviewPanelState();
  setQuizPreviewRefreshHandler(() => {
    void openQuizPreview(true);
  });
  setQuizPreviewScanHandlers({
    onStartScan: (from, to, questionTypes) => {
      const payload = collectQuizPreviewPayload();

      if (!payload) {
        return;
      }

      void startQuizIdScan(getQuizPreviewCacheKey(payload), from, to, questionTypes);
    },
    onCancelScan: () => {
      cancelQuizIdScan();
    },
  });
  watchQuizPreviewButtonMount();

  if (!ensureQuizPreviewButton()) {
    logReduxShareInfo("ReduxShare: quiz view detected, start button not found yet");
  }
}

export function syncQuizPreviewFeatures(storedState: StoredStateLike | undefined) {
  syncQuizPreviewHotkey(storedState);

  if (!canUseQuizFeatures(storedState)) {
    hideQuizPreviewPanel();
  }

  refreshQuizPreviewPanelTheme();
  ensureQuizPreviewButton();
}

export function isQuizPreviewButtonMounted() {
  return document.getElementById(QUIZ_PREVIEW_BUTTON_ID) !== null;
}
