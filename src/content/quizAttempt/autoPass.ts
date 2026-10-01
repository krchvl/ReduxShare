import { findMoodleConfig } from "../../moodleContext";
import {
  clearAutoPassSession,
  createAutoPassSession,
  doesAutoPassSessionMatchPage,
  loadAutoPassSession,
  normalizeAutoPassSession,
  patchAutoPassSession,
  saveAutoPassSession,
  type AutoPassSession,
} from "../../lib/autoPassSession";
import { AUTO_PASS_SESSION_STORAGE_KEY } from "../../shared/storageKeys";
import { canUseQuizFeatures, isLoggedInToExtension } from "../../logic/settings";
import { logReduxShareInfo, logReduxShareWarning } from "../../logic/runtime";
import { applyContentColorSchemeToHost, getAccentColor, getRgbCssValue } from "../../logic/theme";
import {
  answerDataByQuestionId,
  currentQuizAttemptContext,
  currentStoredState,
  currentT,
  stealthModeEnabled,
} from "../../state";
import type { AnswerEntry, StoredStateLike } from "../../model";
import { getAnswerDataForQuestion, getAnswerEntries } from "./answerControls";
import {
  cancelAllAutoSelectSchedules,
  countPendingAutoSelectSchedules,
  getPreferredAutoSelectAnswerDataForQuestion,
  hasExactAutoSelectData,
  scheduleAutoSelectAnswer,
} from "./autoSelect";
import {
  getAttemptStatusPanelQuestionNavButtons,
  getAttemptStatusPanelQuestionNumberFromQuestionNode,
  isAttemptStatusPanelClosedInSession,
  isAttemptStatusPanelQuestionAnswered,
  renderAttemptStatusPanel,
  setAttemptStatusPanelClosedInSession,
  setAttemptStatusPanelTrayOpen,
} from "./attemptStatusPanel";
import {
  isQuizAttemptUrl,
  isQuizStartAttemptUrl,
  isQuizSummaryUrl,
  isQuizViewUrl,
} from "./quizUrl";

export const AUTO_PASS_START_BUTTON_ID = "reduxshare-auto-pass-button";
export const AUTO_PASS_SUMMARY_NOTICE_HOST_ID = "reduxshare-auto-pass-notice";

const AUTO_PASS_START_FORM_SELECTOR = 'form[action*="mod/quiz/startattempt.php"]';
const AUTO_PASS_RESPONSE_FORM_SELECTOR = 'form#responseform, form[action*="mod/quiz/attempt.php"]';
const AUTO_PASS_PAGE_POLL_MS = 400;
const AUTO_PASS_READY_TIMEOUT_MS = 8000;
const AUTO_PASS_PAGE_TIMEOUT_MS = 600000;
const AUTO_PASS_CONFIRM_SUBMIT_DELAY_MS = 800;
const AUTO_PASS_PREFLIGHT_MODAL_SELECTOR = ".mod_quiz_preflight_popup";
const AUTO_PASS_PREFLIGHT_CONFIRM_SELECTOR = "#id_submitbutton";
const AUTO_PASS_PREFLIGHT_TIMEOUT_MS = 8000;
const AUTO_PASS_PREFLIGHT_POLL_MS = 200;
const AUTO_PASS_SUMMARY_NOTICE_VISIBLE_MS = 12000;
const AUTO_PASS_QUESTION_EXCERPT_MAX_LENGTH = 160;

const IS_TEST_MODE = Boolean(globalThis.__REDUXSHARE_TEST_MODE__);
const AUTO_PASS_TEST_POLL_MS = 0;

let autoPassSession: AutoPassSession | null = null;
let autoPassPageRunActive = false;
let autoPassSummaryNoticeTimeoutId: number | null = null;
let autoPassViewMountObserverInstalled = false;

function getPollMs(): number {
  return IS_TEST_MODE ? AUTO_PASS_TEST_POLL_MS : AUTO_PASS_PAGE_POLL_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function getAutoPassSessionState(): AutoPassSession | null {
  return autoPassSession;
}

export async function loadAutoPassSessionState(): Promise<void> {
  autoPassSession = await loadAutoPassSession();
}

export function resetAutoPassState(): void {
  autoPassSession = null;
  autoPassPageRunActive = false;
  removeAutoPassSummaryNotice();
}

export function parseAutoPassCmidFromUrl(): number | null {
  try {
    const params = new URL(window.location.href).searchParams;
    const raw = params.get("cmid") ?? params.get("id");
    const parsed = raw === null ? null : Number.parseInt(raw, 10);
    return parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function getCurrentPageCmid(): number | null {
  return currentQuizAttemptContext?.contextInstanceId ?? parseAutoPassCmidFromUrl();
}

function getCurrentAttemptPage(): number {
  try {
    const raw = new URL(window.location.href).searchParams.get("page");
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function doesAutoPassSessionMatchCurrentPage(session: AutoPassSession): boolean {
  return doesAutoPassSessionMatchPage(session, window.location.hostname, getCurrentPageCmid());
}

export type AutoPassTrayMode = "idle" | "running" | "paused";

export function getAutoPassTrayMode(): AutoPassTrayMode {
  if (!autoPassSession || autoPassSession.status === "done") {
    return "idle";
  }

  if (!isQuizAttemptUrl(window.location) || !doesAutoPassSessionMatchCurrentPage(autoPassSession)) {
    return "idle";
  }

  return autoPassSession.status;
}

export function getAutoPassPauseInfo(): {
  questionNo: string | null;
  questionText: string | null;
} | null {
  if (getAutoPassTrayMode() !== "paused" || !autoPassSession) {
    return null;
  }

  return {
    questionNo: autoPassSession.pausedQuestionNo,
    questionText: autoPassSession.pausedQuestionText,
  };
}

export function applyAutoPassStorageChanges(
  changes: Record<string, { newValue?: unknown } | undefined>,
): void {
  if (!(AUTO_PASS_SESSION_STORAGE_KEY in changes)) {
    return;
  }

  autoPassSession = normalizeAutoPassSession(changes[AUTO_PASS_SESSION_STORAGE_KEY]?.newValue);

  if (isQuizAttemptUrl(window.location)) {
    renderAttemptStatusPanel();
    return;
  }

  if (isQuizViewUrl(window.location)) {
    const host = document.getElementById(AUTO_PASS_START_BUTTON_ID);

    if (host instanceof HTMLElement) {
      updateAutoPassStartButton(host);
    }
  }
}

export async function startAutoPassForCurrentAttempt(): Promise<void> {
  if (!isQuizAttemptUrl(window.location) || autoPassPageRunActive) {
    return;
  }

  if (autoPassSession && autoPassSession.status !== "done") {
    return;
  }

  const cmid = getCurrentPageCmid();

  if (cmid === null) {
    logReduxShareWarning("ReduxShare auto-pass: attempt context is missing cmid");
    return;
  }

  const attemptIdRaw = currentQuizAttemptContext?.attemptId ?? null;
  const attemptId =
    attemptIdRaw !== null && Number.isFinite(Number.parseInt(attemptIdRaw, 10))
      ? Number.parseInt(attemptIdRaw, 10)
      : null;
  const session = createAutoPassSession({
    domain: window.location.hostname,
    cmid,
    attemptId,
    quizId: currentQuizAttemptContext?.contextInstanceId ?? cmid,
    courseId: currentQuizAttemptContext?.courseId ?? null,
    page: getCurrentAttemptPage(),
  });

  await saveAutoPassSession(session);
  autoPassSession = session;
  renderAttemptStatusPanel();
  logReduxShareInfo("ReduxShare auto-pass: started from attempt page");
  void runAutoPassPage();
}

export async function continueAutoPass(): Promise<void> {
  if (autoPassSession?.status !== "paused") {
    return;
  }

  autoPassSession = await patchAutoPassSession({
    status: "running",
    pausedQuestionNo: null,
    pausedQuestionText: null,
  });
  renderAttemptStatusPanel();

  if (autoPassSession) {
    void runAutoPassPage();
  }
}

export async function stopAutoPass(): Promise<void> {
  cancelAllAutoSelectSchedules();
  autoPassSession = null;
  await clearAutoPassSession();
  renderAttemptStatusPanel();
  logReduxShareInfo("ReduxShare auto-pass: stopped");
}

export function handleAutoPassTrayAction(): void {
  if (getAutoPassTrayMode() === "idle") {
    void startAutoPassForCurrentAttempt();
    return;
  }

  void stopAutoPass();
}

function getQuestionExcerpt(questionNode: Element): string | null {
  const raw = questionNode.querySelector(".qtext")?.textContent ?? "";
  const collapsed = raw.replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return null;
  }

  return collapsed.length > AUTO_PASS_QUESTION_EXCERPT_MAX_LENGTH
    ? `${collapsed.slice(0, AUTO_PASS_QUESTION_EXCERPT_MAX_LENGTH - 1)}…`
    : collapsed;
}

async function pauseAtQuestion(entry: AnswerEntry | null, fallbackNumber: number): Promise<void> {
  if (!autoPassSession) {
    return;
  }

  const questionNumber = entry
    ? getAttemptStatusPanelQuestionNumberFromQuestionNode(entry.questionNode, fallbackNumber)
    : null;
  const pausedQuestionNo = questionNumber !== null ? String(questionNumber) : null;

  autoPassSession = await patchAutoPassSession({
    status: "paused",
    pausedQuestionNo,
    pausedQuestionText: entry ? getQuestionExcerpt(entry.questionNode) : null,
  });

  if (!stealthModeEnabled) {
    if (isAttemptStatusPanelClosedInSession()) {
      await setAttemptStatusPanelClosedInSession(false);
    }

    setAttemptStatusPanelTrayOpen(true);
  }

  renderAttemptStatusPanel();
  logReduxShareWarning(
    `ReduxShare auto-pass: paused on unsolved question${pausedQuestionNo ? ` #${pausedQuestionNo}` : ""}`,
  );
}

async function waitForAutoPassPageReady(): Promise<boolean> {
  const deadline = Date.now() + (IS_TEST_MODE ? 0 : AUTO_PASS_READY_TIMEOUT_MS);

  for (;;) {
    const hasEntries = getAnswerEntries().some((entry) => entry.questionNode);
    const hasAnswerData = answerDataByQuestionId.size > 0;

    if (hasEntries && (hasAnswerData || Date.now() >= deadline)) {
      return true;
    }

    if (Date.now() >= deadline) {
      return hasEntries;
    }

    await sleep(getPollMs());
  }
}

export function navigateToNextPage(): void {
  cancelAllAutoSelectSchedules();

  const form = document.querySelector<HTMLFormElement>(AUTO_PASS_RESPONSE_FORM_SELECTOR);
  const nextSubmit = form?.querySelector<HTMLInputElement | HTMLButtonElement>(
    'input[type="submit"][name="next"], button[type="submit"][name="next"]',
  );

  if (form instanceof HTMLFormElement) {
    const submitter = nextSubmit ?? null;

    if (submitter) {
      submitter.click();
      return;
    }

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return;
    }
  }

  const targetPage = getCurrentAttemptPage() + 1;
  const navButton = findNavButtonForPage(targetPage);

  if (navButton) {
    navButton.click();
    return;
  }

  logReduxShareWarning("ReduxShare auto-pass: no navigation target found");
}

function findNavButtonForPage(targetPage: number): HTMLElement | null {
  const navButtons = getAttemptStatusPanelQuestionNavButtons();

  for (const button of navButtons) {
    if (!(button instanceof HTMLAnchorElement)) {
      continue;
    }

    try {
      const pageParam = new URL(button.href, window.location.href).searchParams.get("page");
      const parsed = pageParam === null ? null : Number.parseInt(pageParam, 10);

      if (parsed !== null && Number.isFinite(parsed) && parsed === targetPage) {
        return button;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getAutoPassScheduleState(storedState: StoredStateLike | undefined): StoredStateLike {
  return {
    ...(storedState as StoredStateLike),
    settings: {
      ...(storedState?.settings as Record<string, unknown>),
      autoSelect: true,
    },
  } as StoredStateLike;
}

export async function runAutoPassPage(): Promise<void> {
  if (autoPassPageRunActive || !isQuizAttemptUrl(window.location)) {
    return;
  }

  if (
    autoPassSession?.status !== "running" ||
    !doesAutoPassSessionMatchCurrentPage(autoPassSession)
  ) {
    return;
  }

  autoPassPageRunActive = true;

  try {
    const ready = await waitForAutoPassPageReady();

    if (!ready) {
      logReduxShareWarning("ReduxShare auto-pass: no questions found on the page");
      return;
    }

    const scheduleState = getAutoPassScheduleState(currentStoredState);
    const deadline =
      Date.now() + (IS_TEST_MODE ? Number.MAX_SAFE_INTEGER : AUTO_PASS_PAGE_TIMEOUT_MS);

    for (;;) {
      if (autoPassSession?.status !== "running") {
        return;
      }

      const entries = getAnswerEntries().filter((entry) => entry.questionNode);

      if (entries.length === 0) {
        return;
      }

      let unsolvedEntry: AnswerEntry | null = null;
      let unsolvedIndex = 0;

      for (const [index, entry] of entries.entries()) {
        if (isAttemptStatusPanelQuestionAnswered(entry)) {
          continue;
        }

        const answerData = getPreferredAutoSelectAnswerDataForQuestion(
          entry.questionNode,
          getAnswerDataForQuestion(entry.questionId),
          isLoggedInToExtension(scheduleState),
        );

        if (hasExactAutoSelectData(answerData)) {
          scheduleAutoSelectAnswer(entry.questionId, entry.questionNode, scheduleState);
          continue;
        }

        if (unsolvedEntry === null) {
          unsolvedEntry = entry;
          unsolvedIndex = index;
        }
      }

      const pendingCount = countPendingAutoSelectSchedules();

      if (unsolvedEntry && pendingCount === 0) {
        await pauseAtQuestion(unsolvedEntry, unsolvedIndex + 1);
        return;
      }

      if (!unsolvedEntry && pendingCount === 0) {
        autoPassSession = await patchAutoPassSession({ page: getCurrentAttemptPage() + 1 });
        navigateToNextPage();
        return;
      }

      if (!IS_TEST_MODE && Date.now() >= deadline) {
        await pauseAtQuestion(null, 0);
        return;
      }

      await sleep(getPollMs());
    }
  } finally {
    autoPassPageRunActive = false;
  }
}

export async function resumeAutoPassOnAttemptPage(): Promise<void> {
  if (!isQuizAttemptUrl(window.location)) {
    return;
  }

  if (!autoPassSession) {
    await loadAutoPassSessionState();
  }

  if (!autoPassSession || !doesAutoPassSessionMatchCurrentPage(autoPassSession)) {
    return;
  }

  const attemptIdRaw = currentQuizAttemptContext?.attemptId ?? null;
  const attemptIdParsed =
    attemptIdRaw !== null && Number.isFinite(Number.parseInt(attemptIdRaw, 10))
      ? Number.parseInt(attemptIdRaw, 10)
      : null;

  if (attemptIdParsed !== null && autoPassSession.attemptId !== attemptIdParsed) {
    autoPassSession = await patchAutoPassSession({
      attemptId: attemptIdParsed,
      page: getCurrentAttemptPage(),
    });
  }

  if (autoPassSession?.status === "running") {
    void runAutoPassPage();
    return;
  }

  if (autoPassSession?.status === "paused" && !stealthModeEnabled) {
    if (isAttemptStatusPanelClosedInSession()) {
      await setAttemptStatusPanelClosedInSession(false);
    }

    setAttemptStatusPanelTrayOpen(true);
    renderAttemptStatusPanel();
  }
}

function parseStartFormCmid(): number | null {
  const form = document.querySelector<HTMLFormElement>(AUTO_PASS_START_FORM_SELECTOR);
  const raw = form?.querySelector<HTMLInputElement>('input[name="cmid"]')?.value;

  if (raw) {
    const parsed = Number.parseInt(raw, 10);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return findMoodleConfig()?.contextInstanceId ?? parseAutoPassCmidFromUrl();
}

export async function startAutoPassFromViewPage(): Promise<void> {
  const form = document.querySelector<HTMLFormElement>(AUTO_PASS_START_FORM_SELECTOR);

  if (!form) {
    return;
  }

  if (autoPassSession?.status === "running" || autoPassSession?.status === "paused") {
    await stopAutoPass();
  }

  const cmid = parseStartFormCmid();

  if (cmid === null) {
    logReduxShareWarning("ReduxShare auto-pass: start form is missing cmid");
    return;
  }

  const session = createAutoPassSession({
    domain: window.location.hostname,
    cmid,
    quizId: cmid,
    courseId: findMoodleConfig()?.courseId ?? null,
    page: 0,
  });

  await saveAutoPassSession(session);
  autoPassSession = session;
  logReduxShareInfo("ReduxShare auto-pass: quiz start requested");

  const submitButton = form.querySelector<HTMLInputElement | HTMLButtonElement>(
    'input[type="submit"], button[type="submit"]',
  );

  if (submitButton) {
    submitButton.click();
    void confirmAutoPassPreflightModal();
    return;
  }

  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    void confirmAutoPassPreflightModal();
  }
}

async function confirmAutoPassPreflightModal(): Promise<void> {
  const deadline =
    Date.now() + (IS_TEST_MODE ? AUTO_PASS_PREFLIGHT_POLL_MS * 3 : AUTO_PASS_PREFLIGHT_TIMEOUT_MS);
  let modalSeen = false;

  for (;;) {
    if (autoPassSession?.status !== "running") {
      return;
    }

    const modal = document.querySelector<HTMLElement>(AUTO_PASS_PREFLIGHT_MODAL_SELECTOR);
    const confirmButton = modal?.querySelector<HTMLElement>(AUTO_PASS_PREFLIGHT_CONFIRM_SELECTOR);

    if (modal && confirmButton) {
      confirmButton.click();
      logReduxShareInfo("ReduxShare auto-pass: confirmed the quiz preflight dialog");
      return;
    }

    if (modal) {
      modalSeen = true;
    } else if (modalSeen) {
      void stopAutoPass();
      return;
    }

    if (Date.now() >= deadline) {
      return;
    }

    await sleep(AUTO_PASS_PREFLIGHT_POLL_MS);
  }
}

const AUTO_PASS_START_BUTTON_MARKUP = `
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

    .apx-trigger {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      border: 1px solid rgba(var(--reduxshare-accent-rgb), 0.6);
      border-radius: 999px;
      background: rgba(var(--reduxshare-accent-rgb), 0.26);
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

    .apx-trigger:hover {
      background: rgba(var(--reduxshare-accent-rgb), 0.34);
      box-shadow: 0 8px 22px rgba(var(--reduxshare-accent-rgb), 0.28);
      transform: translateY(-1px);
    }

    :host([data-theme="dark"]) .apx-trigger {
      border-color: rgba(var(--reduxshare-accent-rgb), 0.65);
      background: color-mix(in srgb, var(--reduxshare-accent) 30%, #171923);
      color: color-mix(in srgb, var(--reduxshare-accent) 45%, #f6f7fb);
    }

    :host([data-theme="dark"]) .apx-trigger:hover {
      border-color: rgba(var(--reduxshare-accent-rgb), 0.8);
      background: color-mix(in srgb, var(--reduxshare-accent) 40%, #171923);
    }

    .apx-trigger:active {
      transform: translateY(0) scale(0.98);
    }

    .apx-trigger:focus-visible {
      outline: 2px solid var(--reduxshare-accent);
      outline-offset: 2px;
    }

    .apx-trigger svg {
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
  <button type="button" class="apx-trigger">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6.5v11l9-5.5-9-5.5Z" />
      <path d="M5 5v14" />
    </svg>
    <span class="apx-trigger-label"></span>
  </button>
`;

export function updateAutoPassStartButton(button: HTMLElement): void {
  const shadow = button.shadowRoot ?? button.attachShadow({ mode: "open" });

  if (shadow.childElementCount === 0) {
    shadow.innerHTML = AUTO_PASS_START_BUTTON_MARKUP;
  }

  const accentColor = getAccentColor(currentStoredState?.settings);

  button.style.setProperty("--reduxshare-accent", accentColor);
  button.style.setProperty("--reduxshare-accent-rgb", getRgbCssValue(accentColor));
  applyContentColorSchemeToHost(button);

  const labelNode = shadow.querySelector<HTMLElement>(".apx-trigger-label");
  const label = currentT("quiz.autoPass.buttonStart");

  if (labelNode && labelNode.textContent !== label) {
    labelNode.textContent = label;
  }

  const trigger = shadow.querySelector<HTMLButtonElement>(".apx-trigger");

  if (trigger && trigger.title !== label) {
    trigger.title = label;
  }

  const cmid = parseStartFormCmid();
  const sessionActive =
    autoPassSession !== null &&
    autoPassSession.status !== "done" &&
    doesAutoPassSessionMatchPage(autoPassSession, window.location.hostname, cmid);
  const hidden = !canUseQuizFeatures(currentStoredState) || sessionActive;

  if (button.hidden !== hidden) {
    button.hidden = hidden;
  }
}

export function ensureAutoPassStartButton(): boolean {
  const existingButton = document.getElementById(AUTO_PASS_START_BUTTON_ID);

  if (existingButton instanceof HTMLElement) {
    updateAutoPassStartButton(existingButton);
    return true;
  }

  const startButtonDiv = document.querySelector(".quizstartbuttondiv");

  if (!startButtonDiv?.parentElement) {
    return false;
  }

  const createdButton = document.createElement("span");

  createdButton.id = AUTO_PASS_START_BUTTON_ID;
  createdButton.addEventListener("click", () => {
    void startAutoPassFromViewPage();
  });

  const wrapper = document.createElement("div");

  wrapper.className = "singlebutton";
  wrapper.style.display = "inline-block";
  wrapper.style.marginLeft = "8px";
  wrapper.appendChild(createdButton);

  startButtonDiv.parentElement.insertBefore(wrapper, startButtonDiv.nextSibling);
  updateAutoPassStartButton(createdButton);

  return true;
}

export function watchAutoPassStartButtonMount(): void {
  if (autoPassViewMountObserverInstalled || typeof MutationObserver !== "function") {
    return;
  }

  autoPassViewMountObserverInstalled = true;

  const observer = new MutationObserver(() => {
    if (!isQuizViewUrl(window.location)) {
      observer.disconnect();
      return;
    }

    ensureAutoPassStartButton();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function syncAutoPassViewFeatures(): void {
  if (!isQuizViewUrl(window.location)) {
    return;
  }

  if (!autoPassSession) {
    void loadAutoPassSessionState().then(async () => {
      await resetStaleAutoPassSessionOnViewPage();
      updateAutoPassStartButtonHost();
    });
    return;
  }

  void resetStaleAutoPassSessionOnViewPage().then(() => {
    updateAutoPassStartButtonHost();
  });
}

async function resetStaleAutoPassSessionOnViewPage(): Promise<void> {
  const cmid = parseStartFormCmid();

  if (
    autoPassSession?.status === "running" &&
    cmid !== null &&
    doesAutoPassSessionMatchPage(autoPassSession, window.location.hostname, cmid)
  ) {
    await stopAutoPass();
  }
}

function updateAutoPassStartButtonHost(): void {
  const host = document.getElementById(AUTO_PASS_START_BUTTON_ID);

  if (host instanceof HTMLElement) {
    updateAutoPassStartButton(host);
  }
}

export async function runAutoPassOnConfirmationPage(): Promise<void> {
  if (!isQuizStartAttemptUrl(window.location)) {
    return;
  }

  if (!autoPassSession) {
    await loadAutoPassSessionState();
  }

  if (autoPassSession?.status !== "running") {
    return;
  }

  const form = document.querySelector<HTMLFormElement>(AUTO_PASS_START_FORM_SELECTOR);

  if (!form) {
    return;
  }

  const submitConfirmation = () => {
    if (autoPassSession?.status !== "running") {
      return;
    }

    const submitButton = form.querySelector<HTMLInputElement | HTMLButtonElement>(
      'input[type="submit"], button[type="submit"]',
    );

    if (submitButton) {
      submitButton.click();
      return;
    }

    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    }
  };

  if (IS_TEST_MODE) {
    submitConfirmation();
    return;
  }

  window.setTimeout(submitConfirmation, AUTO_PASS_CONFIRM_SUBMIT_DELAY_MS);
}

const AUTO_PASS_SUMMARY_NOTICE_MARKUP = `
  <style>
    :host {
      all: initial;
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483646;
      pointer-events: none;
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    .notice {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      max-width: 320px;
      padding: 14px 16px;
      border: 1px solid rgba(var(--reduxshare-accent-rgb), 0.35);
      border-radius: 14px;
      background:
        radial-gradient(circle at top right, rgba(var(--reduxshare-accent-rgb), 0.14), transparent 60%),
        linear-gradient(180deg, rgba(19, 20, 27, 0.97), rgba(15, 16, 22, 0.94));
      box-shadow: 0 18px 36px rgba(0, 0, 0, 0.32);
      color: #f6f7fb;
      font-size: 13px;
      line-height: 1.45;
      pointer-events: auto;
      animation: notice-enter 220ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    :host([data-theme="light"]) .notice {
      background:
        radial-gradient(circle at top right, rgba(var(--reduxshare-accent-rgb), 0.12), transparent 60%),
        linear-gradient(180deg, rgba(252, 252, 255, 0.98), rgba(244, 245, 250, 0.96));
      color: #1c2233;
    }

    .notice__icon {
      flex: none;
      display: grid;
      width: 22px;
      height: 22px;
      place-items: center;
      border-radius: 999px;
      background: rgba(var(--reduxshare-accent-rgb), 0.2);
      color: var(--reduxshare-accent);
    }

    .notice__icon svg {
      width: 12px;
      height: 12px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.6;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    @keyframes notice-enter {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  </style>
  <div class="notice" role="status">
    <span class="notice__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M4.5 12.75 9.75 18 19.5 6.75" /></svg>
    </span>
    <span class="notice__text"></span>
  </div>
`;

function showAutoPassSummaryNotice(): void {
  removeAutoPassSummaryNotice();

  const host = document.createElement("div");

  host.id = AUTO_PASS_SUMMARY_NOTICE_HOST_ID;
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = AUTO_PASS_SUMMARY_NOTICE_MARKUP;

  const accentColor = getAccentColor(currentStoredState?.settings);

  host.style.setProperty("--reduxshare-accent", accentColor);
  host.style.setProperty("--reduxshare-accent-rgb", getRgbCssValue(accentColor));
  applyContentColorSchemeToHost(host);

  const textNode = shadow.querySelector<HTMLElement>(".notice__text");

  if (textNode) {
    textNode.textContent = currentT("quiz.autoPass.summaryDone");
  }

  autoPassSummaryNoticeTimeoutId = window.setTimeout(() => {
    autoPassSummaryNoticeTimeoutId = null;
    removeAutoPassSummaryNotice();
  }, AUTO_PASS_SUMMARY_NOTICE_VISIBLE_MS);
}

function removeAutoPassSummaryNotice(): void {
  if (autoPassSummaryNoticeTimeoutId !== null) {
    window.clearTimeout(autoPassSummaryNoticeTimeoutId);
    autoPassSummaryNoticeTimeoutId = null;
  }

  document.getElementById(AUTO_PASS_SUMMARY_NOTICE_HOST_ID)?.remove();
}

export async function handleAutoPassSummaryPage(): Promise<void> {
  if (!isQuizSummaryUrl(window.location)) {
    return;
  }

  if (!autoPassSession) {
    await loadAutoPassSessionState();
  }

  if (!autoPassSession || autoPassSession.status !== "running") {
    return;
  }

  if (!doesAutoPassSessionMatchCurrentPage(autoPassSession)) {
    return;
  }

  autoPassSession = await patchAutoPassSession({ status: "done", page: null });

  if (!stealthModeEnabled) {
    showAutoPassSummaryNotice();
  }

  logReduxShareInfo("ReduxShare auto-pass: all answered pages processed, waiting on summary");
}
