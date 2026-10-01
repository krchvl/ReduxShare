import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizViewUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/view.php"),
  isQuizAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/attempt.php"),
  isQuizSummaryUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/summary.php"),
  isQuizStartAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/startattempt.php"),
}));

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { AUTO_PASS_SESSION_STORAGE_KEY } from "../src/shared/storageKeys";
import { setCurrentStoredState } from "../src/state";
import { syncStealthMode } from "../src/logic/runtime";
import type { AutoPassSession } from "../src/lib/autoPassSession";

const START_BUTTON_HOST_ID = "reduxshare-auto-pass-button";

function baseState() {
  return {
    settings: {
      extensionEnabled: true,
      stealthMode: false,
      language: "ru",
    },
    authSession: { user: { id: "u1" } },
  };
}

function makeSession(overrides: Partial<AutoPassSession> = {}): AutoPassSession {
  const nowIso = new Date().toISOString();

  return {
    version: 1,
    status: "running",
    domain: window.location.hostname,
    cmid: 978,
    attemptId: null,
    quizId: 978,
    courseId: 7,
    page: 0,
    pausedQuestionNo: null,
    pausedQuestionText: null,
    startedAt: nowIso,
    updatedAt: nowIso,
    ...overrides,
  };
}

function mountViewPage() {
  document.body.innerHTML = `
    <div class="quizstartbuttondiv">
      <form action="/mod/quiz/startattempt.php" method="post">
        <input type="hidden" name="cmid" value="978">
        <input type="submit" value="Попытаться пройти тест" id="moodle-start-button">
      </form>
    </div>
  `;
}

async function setupViewPage() {
  window.history.pushState({}, "", "/mod/quiz/view.php?id=978");

  const api = await getQuizAttemptTestApi();
  api.reset();

  const state = baseState();
  api.setStoredState(state);
  setCurrentStoredState(state);
  syncStealthMode(state);
  mountViewPage();

  return api;
}

function getStartButtonHost(): HTMLElement {
  const host = document.getElementById(START_BUTTON_HOST_ID);
  expect(host).toBeInstanceOf(HTMLElement);
  return host!;
}

describe("auto pass start button on the quiz view page", () => {
  it("mounts next to the quiz start button and starts the attempt on click", async () => {
    const api = await setupViewPage();

    expect(api.ensureAutoPassStartButton()).toBe(true);

    const host = getStartButtonHost();
    expect(host.hidden).toBe(false);

    const label = host.shadowRoot!.querySelector<HTMLElement>(".apx-trigger-label")!;
    expect(label.textContent).toBe("Автоматически решить весь тест");

    const moodleSubmit = document.querySelector<HTMLInputElement>("#moodle-start-button")!;
    const submitClickSpy = vi.spyOn(moodleSubmit, "click");

    const setMock = chrome.storage.local.set as unknown as Mock;
    setMock.mockClear();

    host.click();

    await vi.waitFor(() => {
      expect(submitClickSpy).toHaveBeenCalledTimes(1);
    });

    expect(setMock).toHaveBeenCalledWith({
      [AUTO_PASS_SESSION_STORAGE_KEY]: expect.objectContaining({
        status: "running",
        cmid: 978,
        domain: window.location.hostname,
      }),
    });
  });

  it("hides the start button while a session is already active for this quiz", async () => {
    const api = await setupViewPage();

    expect(api.ensureAutoPassStartButton()).toBe(true);
    expect(getStartButtonHost().hidden).toBe(false);

    const session = makeSession({ status: "running" });
    await chrome.storage.local.set({ [AUTO_PASS_SESSION_STORAGE_KEY]: session });

    api.applyAutoPassStorageChanges({
      [AUTO_PASS_SESSION_STORAGE_KEY]: { newValue: session },
    });

    expect(api.ensureAutoPassStartButton()).toBe(true);
    expect(getStartButtonHost().hidden).toBe(true);
  });

  it("restarts the session when the start button is clicked while a session is already active", async () => {
    const api = await setupViewPage();

    expect(api.ensureAutoPassStartButton()).toBe(true);

    const session = makeSession({
      status: "running",
      startedAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    await chrome.storage.local.set({ [AUTO_PASS_SESSION_STORAGE_KEY]: session });
    api.applyAutoPassStorageChanges({
      [AUTO_PASS_SESSION_STORAGE_KEY]: { newValue: session },
    });

    const moodleSubmit = document.querySelector<HTMLInputElement>("#moodle-start-button")!;
    const submitClickSpy = vi.spyOn(moodleSubmit, "click");

    getStartButtonHost().click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(submitClickSpy).toHaveBeenCalledTimes(1);

    const stored = (await chrome.storage.local.get(AUTO_PASS_SESSION_STORAGE_KEY))[
      AUTO_PASS_SESSION_STORAGE_KEY
    ] as AutoPassSession;

    expect(stored.status).toBe("running");
    expect(stored.startedAt).not.toBe(session.startedAt);
  });
});

describe("auto pass on confirmation and summary pages", () => {
  it("auto-submits the startattempt confirmation page for a running session", async () => {
    window.history.pushState({}, "", "/mod/quiz/startattempt.php?cmid=978");

    const api = await getQuizAttemptTestApi();
    api.reset();

    const state = baseState();
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncStealthMode(state);

    document.body.innerHTML = `
      <form action="/mod/quiz/startattempt.php" method="post">
        <input type="hidden" name="cmid" value="978">
        <input type="hidden" name="sesskey" value="test">
        <input type="submit" value="Начать попытку" id="confirm-start-button">
      </form>
    `;

    const confirmSubmit = document.querySelector<HTMLInputElement>("#confirm-start-button")!;
    const confirmClickSpy = vi.spyOn(confirmSubmit, "click");

    await api.runAutoPassOnConfirmationPage();
    expect(confirmClickSpy).not.toHaveBeenCalled();

    const session = makeSession({ status: "running" });
    await chrome.storage.local.set({ [AUTO_PASS_SESSION_STORAGE_KEY]: session });
    api.applyAutoPassStorageChanges({
      [AUTO_PASS_SESSION_STORAGE_KEY]: { newValue: session },
    });

    await api.runAutoPassOnConfirmationPage();

    expect(confirmClickSpy).toHaveBeenCalledTimes(1);
  });

  it("finishes the session with a summary notice when all pages are answered", async () => {
    window.history.pushState({}, "", "/mod/quiz/summary.php?attempt=91&cmid=978");

    const api = await getQuizAttemptTestApi();
    api.reset();

    const state = baseState();
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncStealthMode(state);

    const session = makeSession({ status: "running" });
    await chrome.storage.local.set({ [AUTO_PASS_SESSION_STORAGE_KEY]: session });
    api.applyAutoPassStorageChanges({
      [AUTO_PASS_SESSION_STORAGE_KEY]: { newValue: session },
    });

    await api.handleAutoPassSummaryPage();

    expect(api.getAutoPassSessionState()).toEqual(
      expect.objectContaining({ status: "done", page: null }),
    );

    const noticeHost = document.getElementById("reduxshare-auto-pass-notice");
    expect(noticeHost).toBeInstanceOf(HTMLDivElement);

    const noticeText = noticeHost!.shadowRoot!.querySelector<HTMLElement>(".notice__text")!;
    expect(noticeText.textContent).toBe("Все вопросы решены — проверьте и завершите попытку");
  });

  it("ignores a session that belongs to another quiz on the summary page", async () => {
    window.history.pushState({}, "", "/mod/quiz/summary.php?attempt=91&cmid=978");

    const api = await getQuizAttemptTestApi();
    api.reset();

    const state = baseState();
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncStealthMode(state);

    const session = makeSession({ status: "running", cmid: 999 });
    await chrome.storage.local.set({ [AUTO_PASS_SESSION_STORAGE_KEY]: session });
    api.applyAutoPassStorageChanges({
      [AUTO_PASS_SESSION_STORAGE_KEY]: { newValue: session },
    });

    await api.handleAutoPassSummaryPage();

    expect(api.getAutoPassSessionState()).toEqual(
      expect.objectContaining({ status: "running", cmid: 999 }),
    );
    expect(document.getElementById("reduxshare-auto-pass-notice")).toBeNull();
  });
});
