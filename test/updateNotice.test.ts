import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateState } from "../src/types";
import type { StoredStateLike } from "../src/model";
import {
  applyUpdateNoticeStorageChanges,
  dismissUpdateNotice,
  loadUpdateNoticeDismissedState,
  removeUpdateNotice,
  renderUpdateNotice,
  resetUpdateNoticeState,
  shouldShowUpdateNotice,
  UPDATE_NOTICE_HOST_ID,
} from "../src/content/quizAttempt/updateNotice";
import { UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY } from "../src/shared/storageKeys";
import { setCurrentStoredState } from "../src/state";
import { syncStealthMode } from "../src/logic/runtime";

function availableState(overrides: Partial<UpdateState> = {}): UpdateState {
  return {
    status: "available",
    source: "github",
    currentVersion: "1.0.0",
    latestVersion: "1.1.0",
    checkedAt: "2026-09-25T10:00:00.000Z",
    nextCheckAt: "2026-09-26T10:00:00.000Z",
    releaseUrl: "https://github.com/krchvl/ReduxShare/releases/latest",
    error: null,
    ...overrides,
  };
}

function enabledState(updateState: UpdateState | null): StoredStateLike {
  return {
    settings: {
      extensionEnabled: true,
      stealthMode: false,
      language: "ru",
    },
    updateState,
  };
}

function getNoticeShadow(): ShadowRoot {
  const host = document.getElementById(UPDATE_NOTICE_HOST_ID);
  expect(host).toBeInstanceOf(HTMLDivElement);
  expect(host?.shadowRoot).toBeTruthy();
  return host!.shadowRoot!;
}

describe("shouldShowUpdateNotice", () => {
  it("shows a fresh available update", () => {
    expect(shouldShowUpdateNotice(availableState(), null)).toBe(true);
  });

  it("hides non-available states", () => {
    for (const status of ["idle", "checking", "up-to-date", "error"] as const) {
      expect(shouldShowUpdateNotice(availableState({ status }), null)).toBe(false);
    }

    expect(shouldShowUpdateNotice(null, null)).toBe(false);
    expect(shouldShowUpdateNotice(undefined, null)).toBe(false);
  });

  it("hides when there is nothing newer", () => {
    expect(shouldShowUpdateNotice(availableState({ latestVersion: null }), null)).toBe(false);
    expect(shouldShowUpdateNotice(availableState({ latestVersion: "1.0.0" }), null)).toBe(false);
    expect(shouldShowUpdateNotice(availableState({ latestVersion: "0.9.0" }), null)).toBe(false);
  });

  it("snoozes exactly the dismissed check", () => {
    const state = availableState();
    expect(shouldShowUpdateNotice(state, state.checkedAt)).toBe(false);
    expect(shouldShowUpdateNotice(state, "2026-09-24T10:00:00.000Z")).toBe(true);
    expect(
      shouldShowUpdateNotice(
        availableState({ checkedAt: "2026-09-26T10:00:00.000Z" }),
        state.checkedAt,
      ),
    ).toBe(true);
  });
});

describe("update notice toast", () => {
  beforeEach(() => {
    resetUpdateNoticeState();
  });

  it("renders title, versions and actions on quiz pages", () => {
    const state = enabledState(availableState());
    setCurrentStoredState(state);
    syncStealthMode(state);
    renderUpdateNotice();

    const shadow = getNoticeShadow();
    expect(shadow.querySelector(".title")?.textContent).toBe("Доступно обновление");
    expect(shadow.querySelector(".body")?.textContent).toContain("1.1.0");
    expect(shadow.querySelector(".body")?.textContent).toContain("1.0.0");
    expect(shadow.querySelector(".open")?.textContent).toBe("Скачать");
    expect(shadow.querySelector(".later")?.textContent).toBe("Позже");
  });

  it("opens the release page on primary action", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const state = enabledState(availableState());
    setCurrentStoredState(state);
    syncStealthMode(state);
    renderUpdateNotice();

    getNoticeShadow().querySelector<HTMLButtonElement>(".open")!.click();

    expect(openSpy).toHaveBeenCalledWith(
      "https://github.com/krchvl/ReduxShare/releases/latest",
      "_blank",
      "noopener",
    );
    openSpy.mockRestore();
  });

  it("hides the open button without a release URL", () => {
    const state = enabledState(availableState({ releaseUrl: null }));
    setCurrentStoredState(state);
    syncStealthMode(state);
    renderUpdateNotice();

    const openButton = getNoticeShadow().querySelector<HTMLElement>(".open");
    expect(openButton?.style.display).toBe("none");
  });

  it("stays hidden in stealth mode, when disabled or up to date", () => {
    const state = enabledState(availableState());
    setCurrentStoredState(state);
    syncStealthMode({ settings: { extensionEnabled: true, stealthMode: true } });
    renderUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).toBeNull();

    const disabled = enabledState(availableState());
    disabled.settings = { extensionEnabled: false, stealthMode: false, language: "ru" };
    setCurrentStoredState(disabled);
    syncStealthMode(disabled);
    renderUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).toBeNull();

    const upToDate = enabledState(availableState({ status: "up-to-date" }));
    setCurrentStoredState(upToDate);
    syncStealthMode(upToDate);
    renderUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).toBeNull();
  });

  it("dismiss persists the check id and re-arms on the next check", async () => {
    const first = availableState();
    const state = enabledState(first);
    setCurrentStoredState(state);
    syncStealthMode(state);
    renderUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).not.toBeNull();

    getNoticeShadow().querySelector<HTMLButtonElement>(".later")!.click();
    await Promise.resolve();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).toBeNull();

    const stored = await chrome.storage.local.get(UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY);
    expect(stored[UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY]).toBe(first.checkedAt);

    // Same check again: stays hidden.
    renderUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).toBeNull();

    // A new check re-arms the notice.
    const second = availableState({ checkedAt: "2026-09-26T10:00:00.000Z" });
    const nextState = enabledState(second);
    setCurrentStoredState(nextState);
    syncStealthMode(nextState);
    renderUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).not.toBeNull();
  });

  it("restores and validates the persisted position", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    await chrome.storage.local.set({
      reduxshareUpdateNoticePosition: { left: 111, top: 222 },
    });
    await loadUpdateNoticeDismissedState();

    const state = enabledState(availableState());
    setCurrentStoredState(state);
    syncStealthMode(state);
    renderUpdateNotice();

    const host = document.getElementById(UPDATE_NOTICE_HOST_ID) as HTMLDivElement;
    // happy-dom has no layout engine: rects are zeros, so feed a plausible one.
    host.getBoundingClientRect = () =>
      ({
        left: 111,
        top: 222,
        width: 320,
        height: 120,
        right: 431,
        bottom: 342,
        x: 111,
        y: 222,
      }) as DOMRect;
    renderUpdateNotice();
    expect(host.style.left).toBe("111px");
    expect(host.style.top).toBe("222px");

    removeUpdateNotice();
    await chrome.storage.local.set({ reduxshareUpdateNoticePosition: { left: "NaN" } });
    await loadUpdateNoticeDismissedState();
    renderUpdateNotice();

    const fallback = document.getElementById(UPDATE_NOTICE_HOST_ID) as HTMLDivElement;
    expect(fallback.style.right).toBe("16px");
    expect(fallback.style.bottom).toBe("16px");
  });

  it("reacts to dismissed-check storage changes", async () => {
    const state = enabledState(availableState());
    setCurrentStoredState(state);
    syncStealthMode(state);
    renderUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).not.toBeNull();

    await chrome.storage.local.set({
      [UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY]: state.updateState!.checkedAt,
    });
    applyUpdateNoticeStorageChanges({
      [UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY]: {
        newValue: state.updateState!.checkedAt,
      },
    });
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).toBeNull();
  });

  it("drags the toast by its header", () => {
    const state = enabledState(availableState());
    setCurrentStoredState(state);
    syncStealthMode(state);
    renderUpdateNotice();

    const host = document.getElementById(UPDATE_NOTICE_HOST_ID) as HTMLDivElement;
    const header = getNoticeShadow().querySelector<HTMLElement>(".header")!;
    header.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        pointerId: 7,
        clientX: 50,
        clientY: 60,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new window.PointerEvent("pointermove", {
        pointerId: 7,
        clientX: 80,
        clientY: 100,
        bubbles: true,
      }),
    );

    expect(host.style.left).not.toBe("");
    expect(host.style.left).not.toBe("auto");

    document.dispatchEvent(new window.PointerEvent("pointerup", { pointerId: 7, bubbles: true }));
  });

  it("dismisses directly without a click", async () => {
    const state = enabledState(availableState());
    setCurrentStoredState(state);
    syncStealthMode(state);
    renderUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).not.toBeNull();

    await dismissUpdateNotice();
    expect(document.getElementById(UPDATE_NOTICE_HOST_ID)).toBeNull();
  });
});
