import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/attempt.php"),
  isQuizViewUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/view.php"),
  isQuizSummaryUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/summary.php"),
  isQuizStartAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/startattempt.php"),
}));

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { AUTO_PASS_SESSION_STORAGE_KEY } from "../src/shared/storageKeys";
import { setCurrentStoredState } from "../src/state";
import { syncStealthMode } from "../src/logic/runtime";
import type { AutoPassSession } from "../src/lib/autoPassSession";

const PANEL_HOST_ID = "reduxshare-attempt-status-panel";

function getPanelShadow(): ShadowRoot {
  const host = document.getElementById(PANEL_HOST_ID);
  expect(host).toBeInstanceOf(HTMLDivElement);
  expect(host?.shadowRoot).toBeTruthy();
  return host!.shadowRoot!;
}

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

async function applySession(session: AutoPassSession | null) {
  if (session === null) {
    await chrome.storage.local.remove(AUTO_PASS_SESSION_STORAGE_KEY);
    return;
  }

  await chrome.storage.local.set({ [AUTO_PASS_SESSION_STORAGE_KEY]: session });
}

function mountAttemptPageWithQuestions() {
  document.body.innerHTML = `
    <div class="que multichoice deferredfeedback" data-questionid="101">
      <div class="info"><h3 class="no">Question <span class="qno">1</span></h3><div class="state">Not yet answered</div></div>
      <div class="content"><div class="formulation"><div class="qtext">Capital of France?</div>
        <div class="answer">
          <div class="r0"><input type="radio" name="q101:1_answer" value="0"><div data-region="answer-label"><p>Paris</p></div></div>
          <div class="r1"><input type="radio" name="q101:1_answer" value="1"><div data-region="answer-label"><p>London</p></div></div>
        </div>
      </div></div>
    </div>
    <div class="que multichoice deferredfeedback" data-questionid="102">
      <div class="info"><h3 class="no">Question <span class="qno">2</span></h3><div class="state">Not yet answered</div></div>
      <div class="content"><div class="formulation"><div class="qtext">Capital of Japan?</div>
        <div class="answer">
          <div class="r0"><input type="radio" name="q102:1_answer" value="0"><div data-region="answer-label"><p>Tokyo</p></div></div>
          <div class="r1"><input type="radio" name="q102:1_answer" value="1"><div data-region="answer-label"><p>Osaka</p></div></div>
        </div>
      </div></div>
    </div>
    <form id="responseform" action="/mod/quiz/attempt.php">
      <input type="hidden" name="nextpage" value="1">
      <input type="submit" name="next" value="Next page" id="mod_quiz-next-nav">
    </form>
  `;
}

async function mountPanel() {
  window.history.pushState({}, "", "/mod/quiz/attempt.php?attempt=91&cmid=978");

  const api = await getQuizAttemptTestApi();
  api.reset();

  const state = baseState();
  api.setStoredState(state);
  setCurrentStoredState(state);
  syncStealthMode(state);

  return api;
}

describe("auto pass tray controls", () => {
  it("starts auto pass from the tray and pauses on the unsolvable question", async () => {
    const api = await mountPanel();
    mountAttemptPageWithQuestions();

    api.setSourceAnswerData("101", "reduxshare", {
      anchors: [],
      submissions: [],
      slots: [],
      suggestions: [{ label: "Paris", correctness: 2, confidence: 1 }],
    });

    const shadow = getPanelShadow();
    const tray = shadow.querySelector<HTMLElement>(".settings-tray")!;
    const autoPassAction = shadow.querySelector<HTMLButtonElement>(
      '[data-tray-action="autoPass"]',
    )!;

    expect(tray.dataset.mode).toBe("idle");
    expect(autoPassAction.getAttribute("title")).toBe("Пройти автоматически");

    const setMock = chrome.storage.local.set as unknown as Mock;
    setMock.mockClear();

    autoPassAction.click();

    await vi.waitFor(() => {
      expect(api.getAutoPassSessionState()?.status).toBe("paused");
    });

    expect(setMock).toHaveBeenCalledWith({
      [AUTO_PASS_SESSION_STORAGE_KEY]: expect.objectContaining({
        status: "running",
        cmid: 978,
        domain: window.location.hostname,
      }),
    });
    expect(setMock).toHaveBeenCalledWith({
      [AUTO_PASS_SESSION_STORAGE_KEY]: expect.objectContaining({
        status: "paused",
        pausedQuestionNo: "2",
        pausedQuestionText: "Capital of Japan?",
      }),
    });

    const firstQuestionInput = document.querySelector<HTMLInputElement>(
      '.que[data-questionid="101"] input[type="radio"]',
    )!;
    expect(firstQuestionInput.checked).toBe(true);

    expect(tray.dataset.mode).toBe("paused");
    expect(tray.dataset.open).toBe("true");

    const ear = shadow.querySelector<HTMLButtonElement>(".settings-ear")!;
    expect(ear.hasAttribute("data-attention")).toBe(true);

    const pauseTitle = shadow.querySelector<HTMLElement>(".tray-pause__title")!;
    expect(pauseTitle.textContent).toBe("Не могу решить задание №2");

    const pauseQuestion = shadow.querySelector<HTMLElement>(".tray-pause__question")!;
    expect(pauseQuestion.textContent).toBe("Capital of Japan?");

    const pauseHint = shadow.querySelector<HTMLElement>(".tray-pause__hint")!;
    expect(pauseHint.textContent).toBe("Выберите правильный ответ сами");
  });

  it("continues after the user answers the paused question and navigates to the next page", async () => {
    const api = await mountPanel();
    mountAttemptPageWithQuestions();

    const pausedSession = makeSession({
      status: "paused",
      pausedQuestionNo: "2",
      pausedQuestionText: "Capital of Japan?",
    });
    await applySession(pausedSession);
    api.applyAutoPassStorageChanges({
      [AUTO_PASS_SESSION_STORAGE_KEY]: { newValue: pausedSession },
    });

    const shadow = getPanelShadow();
    const continueButton = shadow.querySelector<HTMLButtonElement>(".tray-pause__continue")!;

    expect(continueButton.textContent).toBe("Продолжить");

    const firstQuestionFirstInput = document.querySelector<HTMLInputElement>(
      '.que[data-questionid="101"] input[type="radio"]',
    )!;
    const secondQuestionSecondInput = document.querySelectorAll<HTMLInputElement>(
      '.que[data-questionid="102"] input[type="radio"]',
    )[1];
    firstQuestionFirstInput.click();
    secondQuestionSecondInput.click();

    const nextSubmit = document.querySelector<HTMLInputElement>("#mod_quiz-next-nav")!;
    const nextClickSpy = vi.spyOn(nextSubmit, "click");

    continueButton.click();

    await vi.waitFor(() => {
      expect(nextClickSpy).toHaveBeenCalledTimes(1);
    });

    expect(api.getAutoPassSessionState()).toEqual(
      expect.objectContaining({ status: "running", page: 1 }),
    );
  });

  it("stops auto pass from the tray pause card and clears the session", async () => {
    const api = await mountPanel();
    mountAttemptPageWithQuestions();

    const runningSession = makeSession({ status: "running" });
    await applySession(runningSession);
    api.applyAutoPassStorageChanges({
      [AUTO_PASS_SESSION_STORAGE_KEY]: { newValue: runningSession },
    });

    const shadow = getPanelShadow();
    const tray = shadow.querySelector<HTMLElement>(".settings-tray")!;
    const autoPassAction = shadow.querySelector<HTMLButtonElement>(
      '[data-tray-action="autoPass"]',
    )!;

    expect(tray.dataset.mode).toBe("running");
    expect(autoPassAction.getAttribute("title")).toBe("Остановить");

    const removeMock = chrome.storage.local.remove as unknown as Mock;
    removeMock.mockClear();

    autoPassAction.click();
    await vi.waitFor(() => {
      expect(api.getAutoPassSessionState()).toBeNull();
      expect(tray.dataset.mode).toBe("idle");
    });

    expect(removeMock).toHaveBeenCalledWith(AUTO_PASS_SESSION_STORAGE_KEY);
    expect(tray.dataset.mode).toBe("idle");

    const ear = shadow.querySelector<HTMLButtonElement>(".settings-ear")!;
    expect(ear.hasAttribute("data-attention")).toBe(false);
  });

  it("replays the paused state with the tray open when the attempt page is reloaded", async () => {
    const api = await mountPanel();
    mountAttemptPageWithQuestions();

    const pausedSession = makeSession({
      status: "paused",
      pausedQuestionNo: "2",
      pausedQuestionText: "Capital of Japan?",
    });
    await applySession(pausedSession);

    await api.resumeAutoPassOnAttemptPage();

    const shadow = getPanelShadow();
    const tray = shadow.querySelector<HTMLElement>(".settings-tray")!;

    expect(tray.dataset.mode).toBe("paused");
    expect(tray.dataset.open).toBe("true");

    const pauseTitle = shadow.querySelector<HTMLElement>(".tray-pause__title")!;
    expect(pauseTitle.textContent).toBe("Не могу решить задание №2");
  });
});
