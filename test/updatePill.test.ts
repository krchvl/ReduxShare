import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainScreen } from "../src/components/MainScreen";
import { I18nProvider } from "../src/i18n/react";
import { DEFAULT_SETTINGS, DEFAULT_UPDATE_STATE, type UpdateState } from "../src/types";
import type { PopupState } from "../src/types";
import { UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY } from "../src/shared/storageKeys";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  container = null;
  document.body.innerHTML = "";
});

function renderPill(
  updateState: UpdateState,
  isCheckingUpdates = false,
  activeTab: PopupState["activeTab"] = "main",
) {
  const onCheckUpdates = vi.fn();
  const element = createElement(MainScreen, {
    settings: DEFAULT_SETTINGS,
    updateState,
    isCheckingUpdates,
    popupState: { activeTab },
    onSettingsChange: () => {},
    onCheckUpdates,
    onResetSettings: () => {},
    onLogout: () => {},
  });

  act(() => {
    root?.render(createElement(I18nProvider, { language: "ru" }, element));
  });

  return onCheckUpdates;
}

function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  return container;
}

function pressCheckButton(element: HTMLElement) {
  act(() => {
    Array.from(element.querySelectorAll<HTMLButtonElement>(".settings-panel__action-row button"))
      .find((button) => button.textContent === "Проверить обновления")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const availableState: UpdateState = {
  ...DEFAULT_UPDATE_STATE,
  status: "available",
  latestVersion: "9.9.9-dev",
  releaseUrl: null,
  checkedAt: "2026-11-28T10:00:00.000Z",
};

describe("update pill", () => {
  it("stays hidden until a check is started", () => {
    const element = mount();
    renderPill(availableState);

    expect(element.querySelector(".update-pill")).toBeNull();
  });

  it("shows the available version once the check is started", () => {
    const element = mount();
    const onCheckUpdates = renderPill(availableState, false, "extra");

    pressCheckButton(element);

    const pill = element.querySelector(".update-pill");
    expect(onCheckUpdates).toHaveBeenCalledTimes(1);
    expect(pill?.classList.contains("update-pill--available")).toBe(true);
    expect(pill?.textContent).toContain("9.9.9-dev");
  });

  it("disappears once dismissed and comes back for a newer check result", async () => {
    const element = mount();
    renderPill(availableState, false, "extra");
    pressCheckButton(element);

    await act(async () => {
      element
        .querySelector<HTMLButtonElement>(".update-pill__close")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(element.querySelector(".update-pill")).toBeNull();
    const stored = await chrome.storage.local.get(UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY);
    expect(stored[UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY]).toBe(availableState.checkedAt);

    renderPill({ ...availableState, checkedAt: "2026-11-28T11:00:00.000Z" }, false, "extra");
    pressCheckButton(element);

    expect(element.querySelector(".update-pill")).not.toBeNull();
  });

  it("shows the searching pill while the check runs", () => {
    const element = mount();
    renderPill(DEFAULT_UPDATE_STATE, false, "extra");
    pressCheckButton(element);
    renderPill(DEFAULT_UPDATE_STATE, true, "extra");

    const pill = element.querySelector(".update-pill");
    expect(pill?.classList.contains("update-pill--checking")).toBe(true);
    expect(pill?.textContent).toContain("Ищу новые обновления");
    expect(pill?.querySelector(".update-pill__action")).toBeNull();
  });

  it("keeps the pill in the checking state reported by the update state", () => {
    const element = mount();
    renderPill(DEFAULT_UPDATE_STATE, false, "extra");
    pressCheckButton(element);
    renderPill(
      {
        ...DEFAULT_UPDATE_STATE,
        status: "checking",
        checkedAt: "2026-11-28T10:00:00.000Z",
      },
      false,
      "extra",
    );

    expect(element.querySelector(".update-pill")).not.toBeNull();
    expect(element.querySelector(".update-pill__action")).toBeNull();
  });

  it("disables the extra section check button while the check runs", () => {
    const element = mount();
    renderPill(DEFAULT_UPDATE_STATE, true, "extra");

    const buttons = Array.from(
      element.querySelectorAll<HTMLButtonElement>(".settings-panel__action-row button"),
    );
    const checkButton = buttons.find((button) => button.textContent === "Проверяю…");
    expect(checkButton?.disabled).toBe(true);
  });
});
