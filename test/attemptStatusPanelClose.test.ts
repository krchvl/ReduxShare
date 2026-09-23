import { describe, expect, it, vi } from "vitest";

// The test environment origin is http://localhost:3000, while the panel only mounts
// on https attempt pages; relax the protocol check for this suite.
vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/attempt.php")
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
      settings: { extensionEnabled: true, stealthMode: false, language: "ru", attemptStatusPanelClosed: false },
      authSession: { user: { id: "u1" } }
    };

    api.reset();
    api.setStoredState(state);
    setCurrentStoredState(state);
    syncStealthMode(state);

    // The panel is mounted and the ✕ button exists next to the collapse toggle.
    const closeButton = getPanelShadow().querySelector<HTMLButtonElement>(".close");
    expect(closeButton).toBeInstanceOf(HTMLButtonElement);
    expect(closeButton.getAttribute("aria-label")).toBe("Закрыть панель");

    // Clicking ✕ hides the panel for this session...
    closeButton.click();
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();

    // ...and the popup toggle brings it back (the re-mount proves the session flag flipped).
    await api.setAttemptStatusPanelClosedInSession(false);
    expect(getPanelShadow().querySelector<HTMLButtonElement>(".close")).toBeInstanceOf(HTMLButtonElement);
  });
});
