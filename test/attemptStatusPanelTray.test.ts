import { describe, expect, it, vi } from "vitest";

vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/attempt.php"),
}));

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { setCurrentStoredState } from "../src/state";
import { syncContentUi } from "../src/logic/runtime";

const PANEL_HOST_ID = "reduxshare-attempt-status-panel";

function getPanelShadow(): ShadowRoot {
  const host = document.getElementById(PANEL_HOST_ID);
  expect(host).toBeInstanceOf(HTMLDivElement);
  expect(host?.shadowRoot).toBeTruthy();
  return host!.shadowRoot!;
}

function baseState(copyUnlock: boolean) {
  return {
    settings: {
      extensionEnabled: true,
      language: "ru",
      copyUnlock,
    },
    authSession: { user: { id: "u1" } },
  };
}

async function mountPanel(copyUnlock: boolean) {
  window.history.pushState({}, "", "/mod/quiz/attempt.php?attempt=91&cmid=978");

  const api = await getQuizAttemptTestApi();
  api.reset();

  const state = baseState(copyUnlock);
  api.setStoredState(state);
  setCurrentStoredState(state);
  syncContentUi();

  return api;
}

describe("attempt status panel settings tray", () => {
  it("opens the tray from the side ear and reflects copy unlock state", async () => {
    await mountPanel(false);

    const shadow = getPanelShadow();
    const ear = shadow.querySelector<HTMLButtonElement>(".settings-ear")!;
    const tray = shadow.querySelector<HTMLElement>(".settings-tray")!;

    expect(ear.dataset.side).toBe("right");
    expect(tray.dataset.side).toBe("right");
    expect(tray.dataset.open).toBe("false");
    expect(ear.getAttribute("aria-expanded")).toBe("false");
    expect(ear.getAttribute("aria-label")).toBe("Настройки ReduxShare");

    ear.click();

    expect(tray.dataset.open).toBe("true");
    expect(ear.getAttribute("aria-expanded")).toBe("true");

    const action = shadow.querySelector<HTMLButtonElement>('[data-tray-action="autoPass"]')!;
    expect(action.dataset.mode).toBe("idle");

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));

    expect(tray.dataset.open).toBe("false");
    expect(ear.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the auto-pass action in the tray instead of copy unlock", async () => {
    await mountPanel(false);

    const shadow = getPanelShadow();
    shadow.querySelector<HTMLButtonElement>(".settings-ear")!.click();

    expect(shadow.querySelector('[data-tray-action="copyUnlock"]')).toBeNull();
    expect(shadow.querySelector('[data-tray-action="autoPass"]')).toBeInstanceOf(HTMLButtonElement);
  });

  it("flips the tray to the left side when the panel is anchored to the right", async () => {
    const api = await mountPanel(false);
    api.watchStoredSettingsChanges();

    const shadow = getPanelShadow();
    const ear = shadow.querySelector<HTMLButtonElement>(".settings-ear")!;
    const tray = shadow.querySelector<HTMLElement>(".settings-tray")!;
    expect(ear.dataset.side).toBe("right");

    await chrome.storage.local.set({
      reduxshareAttemptStatusPanelPosition: {
        anchor: "right",
        offset: 16,
        verticalAnchor: "bottom",
        verticalOffset: 16,
      },
    });

    expect(ear.dataset.side).toBe("left");
    expect(tray.dataset.side).toBe("left");
  });
});
