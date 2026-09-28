import { describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../src/content/quizAttempt/quizUrl", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isQuizAttemptUrl: (url: Location) => url.pathname.endsWith("/mod/quiz/attempt.php"),
}));

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { APP_STORAGE_KEY } from "../src/shared/storageKeys";
import { setCurrentStoredState } from "../src/state";
import { syncStealthMode } from "../src/logic/runtime";

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
      stealthMode: false,
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
  syncStealthMode(state);

  return api;
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
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

    const action = shadow.querySelector<HTMLButtonElement>('[data-tray-action="copyUnlock"]')!;
    expect(action.getAttribute("aria-pressed")).toBe("false");
    expect(action.getAttribute("title")).toBe("Разблокировать копирование");

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));

    expect(tray.dataset.open).toBe("false");
    expect(ear.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles the copy unlock setting and persists it", async () => {
    await mountPanel(false);

    const shadow = getPanelShadow();
    shadow.querySelector<HTMLButtonElement>(".settings-ear")!.click();

    const action = shadow.querySelector<HTMLButtonElement>('[data-tray-action="copyUnlock"]')!;
    expect(action.getAttribute("aria-pressed")).toBe("false");

    const setMock = chrome.storage.local.set as unknown as Mock;
    setMock.mockClear();

    action.click();
    await flushMicrotasks();

    expect(setMock).toHaveBeenCalledWith({
      [APP_STORAGE_KEY]: expect.objectContaining({
        settings: expect.objectContaining({ copyUnlock: true }),
      }),
    });
    expect(action.getAttribute("aria-pressed")).toBe("true");

    action.click();
    await flushMicrotasks();

    expect(setMock).toHaveBeenLastCalledWith({
      [APP_STORAGE_KEY]: expect.objectContaining({
        settings: expect.objectContaining({ copyUnlock: false }),
      }),
    });
    expect(action.getAttribute("aria-pressed")).toBe("false");
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
