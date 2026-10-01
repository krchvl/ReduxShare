import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__REDUXSHARE_TEST_MODE__", true);

vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizViewUrl: () => true,
}));

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { AUTO_PASS_SESSION_STORAGE_KEY } from "../src/shared/storageKeys";
import type { AutoPassSession } from "../src/lib/autoPassSession";

function mountStartForm() {
  document.body.innerHTML = `
    <form action="https://moodle.example/mod/quiz/startattempt.php" method="post" id="start-form">
      <input type="hidden" name="cmid" value="1150" />
      <button type="submit" id="start-trigger">Attempt quiz now</button>
    </form>
  `;
}

function installPreflightModalBehavior() {
  const form = document.getElementById("start-form") as HTMLFormElement;
  let confirmed = false;
  let cancelled = false;

  form.addEventListener("submit", (event) => event.preventDefault());

  document.getElementById("start-trigger")?.addEventListener("click", () => {
    const modal = document.createElement("div");
    modal.className = "mod_quiz_preflight_popup moodle-dialogue";
    modal.innerHTML = `
      <form>
        <input type="submit" id="id_submitbutton" value="Start attempt" />
        <input type="submit" id="id_cancel" value="Cancel" />
      </form>
    `;
    document.body.append(modal);
    modal.querySelector("#id_submitbutton")?.addEventListener("click", () => {
      confirmed = true;
    });
    modal.querySelector("#id_cancel")?.addEventListener("click", () => {
      cancelled = true;
    });
  });

  return { wasConfirmed: () => confirmed, wasCancelled: () => cancelled };
}

function installDismissablePreflightModal() {
  document.getElementById("start-trigger")?.addEventListener("click", () => {
    const modal = document.createElement("div");
    modal.className = "mod_quiz_preflight_popup moodle-dialogue";
    document.body.append(modal);
    window.setTimeout(() => modal.remove(), 50);
  });
}

async function getStoredSession(): Promise<AutoPassSession | undefined> {
  return (await chrome.storage.local.get(AUTO_PASS_SESSION_STORAGE_KEY))[
    AUTO_PASS_SESSION_STORAGE_KEY
  ] as AutoPassSession | undefined;
}

async function waitForStoredSession(expected: boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const session = await getStoredSession();

    if (Boolean(session) === expected) {
      return;
    }

    if (Date.now() > deadline) {
      throw new Error(`timeout waiting for stored session (expected present: ${expected})`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe("auto-pass preflight dialog", () => {
  it("confirms the Moodle time-limit dialog after clicking the start form", async () => {
    mountStartForm();
    const modal = installPreflightModalBehavior();
    const api = await getQuizAttemptTestApi();
    api.reset();

    await api.startAutoPassFromViewPage();

    expect(modal.wasConfirmed()).toBe(true);
    expect(modal.wasCancelled()).toBe(false);
  });

  it("keeps the session stopped when the dialog is dismissed without confirming", async () => {
    mountStartForm();
    const api = await getQuizAttemptTestApi();
    api.reset();
    installDismissablePreflightModal();

    await api.startAutoPassFromViewPage();
    await waitForStoredSession(false);

    expect(await getStoredSession()).toBeUndefined();
  });

  it("restarts the session when the start button is pressed while one is already running", async () => {
    mountStartForm();
    const api = await getQuizAttemptTestApi();
    api.reset();

    const staleSession: AutoPassSession = {
      version: 1,
      status: "running",
      domain: window.location.hostname,
      cmid: 1150,
      attemptId: null,
      quizId: 1150,
      courseId: null,
      page: 0,
      pausedQuestionNo: null,
      pausedQuestionText: null,
      startedAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    await chrome.storage.local.set({ [AUTO_PASS_SESSION_STORAGE_KEY]: staleSession });
    api.applyAutoPassStorageChanges({
      [AUTO_PASS_SESSION_STORAGE_KEY]: { newValue: staleSession },
    });

    await api.startAutoPassFromViewPage();
    const restarted = await getStoredSession();

    expect(restarted?.status).toBe("running");
    expect(restarted?.startedAt).not.toBe(staleSession.startedAt);
  });

  it("clears a stale running session for the same quiz when the view page loads", async () => {
    mountStartForm();
    const api = await getQuizAttemptTestApi();
    api.reset();

    await api.startAutoPassFromViewPage();
    await waitForStoredSession(true);

    await api.syncAutoPassViewFeatures();
    await waitForStoredSession(false);

    expect(await getStoredSession()).toBeUndefined();
  });
});
