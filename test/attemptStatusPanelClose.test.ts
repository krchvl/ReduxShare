import { describe, expect, it, vi } from "vitest";

vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/attempt.php"),
}));

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { setCurrentStoredState } from "../src/state";
import { syncStealthMode } from "../src/logic/runtime";

const PANEL_HOST_ID = "reduxshare-attempt-status-panel";

function getPanelShadow(): ShadowRoot {
  const host = document.getElementById(PANEL_HOST_ID);
  expect(host).toBeInstanceOf(HTMLDivElement);
  expect(host?.shadowRoot).toBeTruthy();
  return host!.shadowRoot!;
}

describe("attempt status panel close button", () => {
  it("mounts on an attempt URL, closes on ✕ and restores via the popup setting", async () => {
    window.history.pushState({}, "", "/mod/quiz/attempt.php?attempt=91&cmid=978");

    const api = await getQuizAttemptTestApi();
    const state = {
      settings: {
        extensionEnabled: true,
        stealthMode: false,
        language: "ru",
        attemptStatusPanelClosed: false,
      },
      authSession: { user: { id: "u1" } },
    };

    api.reset();
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncStealthMode(state);

    const closeButton = getPanelShadow().querySelector<HTMLButtonElement>(".close");
    expect(closeButton).toBeInstanceOf(HTMLButtonElement);
    expect(closeButton.getAttribute("aria-label")).toBe("Закрыть панель");

    closeButton.click();
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();

    await api.setAttemptStatusPanelClosedInSession(false);
    expect(getPanelShadow().querySelector<HTMLButtonElement>(".close")).toBeInstanceOf(
      HTMLButtonElement,
    );
  });
});
