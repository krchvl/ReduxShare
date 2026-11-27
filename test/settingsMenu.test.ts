import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../src/i18n/react";
import { MainScreen } from "../src/components/MainScreen";
import {
  DEFAULT_SETTINGS,
  DEFAULT_UPDATE_STATE,
  type PopupState,
  type Settings,
} from "../src/types";
import { APP_STORAGE_KEY } from "../src/shared/storageKeys";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderMainScreen(overrides: { settings?: Settings; popupState?: PopupState } = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      createElement(
        I18nProvider,
        { language: "ru" },
        createElement(MainScreen, {
          settings: overrides.settings ?? DEFAULT_SETTINGS,
          updateState: DEFAULT_UPDATE_STATE,
          isCheckingUpdates: false,
          popupState: overrides.popupState ?? null,
          onSettingsChange: vi.fn(),
          onCheckUpdates: vi.fn(),
          onResetSettings: vi.fn(),
          onLogout: vi.fn(),
        }),
      ),
    );
  });
}

function getContent() {
  const content = container!.querySelector<HTMLElement>(".main-content");

  if (!content) {
    throw new Error("Main content is not rendered");
  }

  return content;
}

function getTabs() {
  return Array.from(container!.querySelectorAll<HTMLButtonElement>(".settings-tab"));
}

function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }

  container?.remove();
  container = null;
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("settings menu", () => {
  it("starts on the section grid for a fresh popup", () => {
    renderMainScreen();

    expect(getContent().dataset.view).toBe("menu");
    expect(container!.querySelector(".settings-panel")).toBeNull();

    const tabs = getTabs();
    expect(tabs).toHaveLength(6);
    expect(tabs.map((tab) => tab.querySelector(".settings-tab__label")?.textContent)).toEqual([
      "Статистика",
      "Основные",
      "Интерфейс",
      "Безопасность",
      "ИИ",
      "Дополнительно",
    ]);
    expect(
      tabs.every((tab) => Boolean(tab.querySelector(".settings-tab__desc")?.textContent?.trim())),
    ).toBe(true);
  });

  it("opens a section from a card and returns to the grid through the back button", () => {
    renderMainScreen();
    const statsTab = getTabs()[0]!;

    click(statsTab);

    expect(getContent().dataset.view).toBe("panel");
    expect(statsTab.getAttribute("aria-pressed")).toBe("true");
    expect(statsTab.getAttribute("aria-current")).toBe("true");
    expect(container!.querySelector(".settings-panel__heading h1")?.textContent).toBe("Статистика");

    const back = container!.querySelector<HTMLButtonElement>(".settings-panel__back");
    expect(back?.getAttribute("aria-label")).toBe("К разделам");

    click(back!);

    expect(getContent().dataset.view).toBe("menu");
    expect(getTabs()[0]?.getAttribute("aria-current")).toBe("true");
    expect(getTabs()[0]?.getAttribute("title")).toBeNull();
  });

  it("switches sections without leaving the panel view", () => {
    renderMainScreen();
    const tabs = getTabs();

    click(tabs[2]!);
    click(tabs[4]!);

    expect(getContent().dataset.view).toBe("panel");
    expect(container!.querySelector(".settings-panel__heading h1")?.textContent).toBe("ИИ");
    expect(tabs[4]?.getAttribute("aria-pressed")).toBe("true");
    expect(tabs[2]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("restores the last section straight into the panel view", () => {
    renderMainScreen({ popupState: { activeTab: "security" } });

    expect(getContent().dataset.view).toBe("panel");
    expect(container!.querySelector(".settings-panel__heading h1")?.textContent).toBe(
      "Безопасность",
    );
    expect(getTabs()[3]?.getAttribute("aria-current")).toBe("true");
  });

  it("exposes a rail tooltip instead of descriptions in the panel view", () => {
    renderMainScreen({ popupState: { activeTab: "ui" } });
    const uiTab = getTabs()[2]!;

    expect(uiTab.getAttribute("title")).toBe("Интерфейс");
    expect(getTabs()[0]?.getAttribute("title")).toBe("Статистика");
  });

  it("keeps the selected section while the popup state is re-applied", () => {
    const popupState: PopupState = { activeTab: "extra" };
    renderMainScreen({ popupState });

    act(() => {
      root!.render(
        createElement(
          I18nProvider,
          { language: "ru" },
          createElement(MainScreen, {
            settings: DEFAULT_SETTINGS,
            updateState: DEFAULT_UPDATE_STATE,
            isCheckingUpdates: false,
            popupState: { ...popupState },
            onSettingsChange: vi.fn(),
            onCheckUpdates: vi.fn(),
            onResetSettings: vi.fn(),
            onLogout: vi.fn(),
          }),
        ),
      );
    });

    expect(getContent().dataset.view).toBe("panel");
    expect(container!.querySelector(".settings-panel__heading h1")?.textContent).toBe(
      "Дополнительно",
    );
    expect(window.localStorage.getItem(APP_STORAGE_KEY)).toBeNull();
  });
});
