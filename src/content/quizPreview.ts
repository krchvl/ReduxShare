// Quiz view page (mod/quiz/view.php, no attempt started): renders a "show
// questions" button next to the start button and opens the floating preview
// panel backed by the answer database (questions act as the quiz's question
// list) plus the external provider queried per stored question id.
import { findMoodleConfig, parseMoodleNumericId } from "../moodleContext";
import { canUseQuizFeatures } from "../logic/settings";
import {
  loadStoredState,
  logReduxShareInfo,
  logReduxShareWarning,
  syncLanguage,
} from "../logic/runtime";
import { FETCH_QUIZ_PREVIEW_MESSAGE } from "../shared/messages";
import { DEFAULT_HOTKEY, DEFAULT_HOTKEY_CODE, type StoredStateLike } from "../model";
import {
  currentStoredState,
  setCurrentStoredState,
} from "../state";
import {
  beginQuizPreviewLoading,
  hideQuizPreviewPanel,
  isQuizPreviewPanelVisible,
  resetQuizPreviewPanelState,
  setQuizPreviewPanelQuizTitle,
  showQuizPreviewError,
  showQuizPreviewQuestions,
} from "../ui/quizPreviewPanel";
import {
  hotkeyMatchesEvent,
  isEditableHotkeyTarget,
  normalizeHotkeyCode,
  normalizeHotkeyValue,
} from "./quizAttempt/hotkeys";
import { isQuizViewUrl } from "./quizAttempt/quizUrl";
import type { QuizPreviewRequestPayload, QuizPreviewResponse } from "../model";
import { getContentTranslator } from "../i18n/contentI18n";

const QUIZ_PREVIEW_BUTTON_ID = "reduxshare-quiz-preview-button";
// The start form of moodle's "attempt quiz now" button carries cmid for themes
// whose M.cfg cannot be read.
const QUIZ_START_FORM_SELECTOR = 'form[action*="mod/quiz/startattempt.php"]';

let quizPreviewHotkey = DEFAULT_HOTKEY;
let quizPreviewHotkeyCode = DEFAULT_HOTKEY_CODE;
let quizPreviewHotkeyEnabled = true;
let quizPreviewHotkeyListenerInstalled = false;
let quizPreviewMountObserverInstalled = false;

// Successful preview responses are cached per quiz, so reopening the panel does
// not hit the answer database again. Auth-required and empty responses are not
// cached: signing in or a later data sync should get a fresh load.
let quizPreviewCache: { key: string; response: QuizPreviewResponse } | null = null;

export function shouldCacheQuizPreviewResponse(response: QuizPreviewResponse) {
  return response.ok && response.authRequired !== true && (response.questions?.length ?? 0) > 0;
}

function getQuizPreviewCacheKey(payload: QuizPreviewRequestPayload) {
  return `${payload.domain}/${payload.courseId}/${payload.quizId}`;
}

function findQuizIdFromPageUrl() {
  try {
    const url = new URL(window.location.href);
    // On view.php the `id` parameter is the course-module id of the quiz itself.
    return (
      parseMoodleNumericId(url.searchParams.get("id")) ??
      parseMoodleNumericId(url.searchParams.get("cmid"))
    );
  } catch {
    return null;
  }
}

function findCourseIdFromPage() {
  // The breadcrumb links back to the course, which is the only course id source
  // left when M.cfg is missing or does not carry courseId.
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/course/view.php"]'))) {
    try {
      const courseId = parseMoodleNumericId(new URL(link.href, window.location.href).searchParams.get("id"));

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
    quizId
  };
}

function requestQuizPreview(payload: QuizPreviewRequestPayload): Promise<QuizPreviewResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: FETCH_QUIZ_PREVIEW_MESSAGE,
        payload
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
            error: "Background script did not return a response."
          }
        );
      }
    );
  });
}

// The quiz name shown as the page heading on view.php; theme-dependent markup,
// so several Moodle variants are probed.
function findQuizTitleFromPage() {
  const heading = document.querySelector<HTMLElement>(
    ".page-header-headings h1, #region-main h1, #region-main h2, h1"
  );

  return heading?.textContent?.trim() || null;
}

async function openQuizPreview() {
  const payload = collectQuizPreviewPayload();
  const translator = getContentTranslator(currentStoredState?.settings?.language);

  setQuizPreviewPanelQuizTitle(findQuizTitleFromPage());

  if (!payload) {
    showQuizPreviewError(translator("quiz.preview.error"));
    return;
  }

  const cacheKey = getQuizPreviewCacheKey(payload);

  if (quizPreviewCache?.key === cacheKey) {
    showQuizPreviewQuestions(quizPreviewCache.response.questions ?? [], quizPreviewCache.response.authRequired === true);
    return;
  }

  beginQuizPreviewLoading();

  try {
    const response = await requestQuizPreview(payload);

    if (!response.ok) {
      showQuizPreviewError(response.error ?? translator("quiz.preview.error"));
      return;
    }

    if (shouldCacheQuizPreviewResponse(response)) {
      quizPreviewCache = { key: cacheKey, response };
    }

    showQuizPreviewQuestions(response.questions ?? [], response.authRequired === true);
    logReduxShareInfo(`ReduxShare: quiz preview loaded, ${response.questions?.length ?? 0} questions`);
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
  // Only the view page binds the preview hotkey: on an attempt page the same key
  // belongs to the answer widgets.
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

function updateQuizPreviewButton(button: HTMLButtonElement) {
  const label = getContentTranslator(currentStoredState?.settings?.language)("quiz.preview.button");

  // This runs from a MutationObserver, so every write must be conditional: an
  // unconditional textContent assignment would mutate the observed tree again.
  if (button.textContent !== label) {
    button.textContent = label;
  }

  const title = `${label} (${quizPreviewHotkey})`;

  if (button.title !== title) {
    button.title = title;
  }

  const hidden = !canUseQuizFeatures(currentStoredState);

  if (button.hidden !== hidden) {
    button.hidden = hidden;
  }
}

function ensureQuizPreviewButton(): boolean {
  const existingButton = document.getElementById(QUIZ_PREVIEW_BUTTON_ID);

  if (existingButton instanceof HTMLButtonElement) {
    updateQuizPreviewButton(existingButton);
    return true;
  }

  const startButtonDiv = document.querySelector(".quizstartbuttondiv");

  if (!startButtonDiv?.parentElement) {
    return false;
  }

  const createdButton = document.createElement("button");
  createdButton.id = QUIZ_PREVIEW_BUTTON_ID;
  createdButton.type = "button";
  createdButton.className = "btn btn-secondary";
  createdButton.addEventListener("click", () => {
    void toggleQuizPreview();
  });

  // The start button is wrapped in a single_button div; mirror its layout slot
  // so both buttons line up in the tertiary navigation row.
  const wrapper = document.createElement("div");
  wrapper.className = "singlebutton";
  wrapper.style.display = "inline-block";
  wrapper.style.marginLeft = "8px";
  wrapper.appendChild(createdButton);

  startButtonDiv.parentElement.insertBefore(wrapper, startButtonDiv.nextSibling);
  updateQuizPreviewButton(createdButton);

  return true;
}

// Moodle renders the start button late on some themes and re-renders the
// tertiary navigation on in-page (AJAX) navigation, so the button is re-ensured
// after every DOM change instead of only once at document_idle.
function watchQuizPreviewButtonMount() {
  if (quizPreviewMountObserverInstalled || typeof MutationObserver !== "function") {
    return;
  }

  quizPreviewMountObserverInstalled = true;

  const observer = new MutationObserver(() => {
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
  watchQuizPreviewButtonMount();

  if (!ensureQuizPreviewButton()) {
    logReduxShareInfo("ReduxShare: quiz view detected, start button not found yet");
  }
}

// Exported for the settings watcher.
export function syncQuizPreviewFeatures(storedState: StoredStateLike | undefined) {
  syncQuizPreviewHotkey(storedState);

  if (!canUseQuizFeatures(storedState)) {
    hideQuizPreviewPanel();
  }

  ensureQuizPreviewButton();
}

export function isQuizPreviewButtonMounted() {
  return document.getElementById(QUIZ_PREVIEW_BUTTON_ID) !== null;
}
