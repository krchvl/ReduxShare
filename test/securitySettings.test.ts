import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainScreen } from "../src/components/MainScreen";
import { I18nProvider } from "../src/i18n/react";
import { DEFAULT_SETTINGS, DEFAULT_UPDATE_STATE } from "../src/types";

let root: Root | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
  container = null;
});

function renderMainScreen() {
  const onSettingsChange = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      createElement(
        I18nProvider,
        { language: "ru" },
        createElement(MainScreen, {
          settings: DEFAULT_SETTINGS,
          updateState: DEFAULT_UPDATE_STATE,
          isCheckingUpdates: false,
          onSettingsChange,
          onCheckUpdates: () => {},
          onResetSettings: () => {},
          onLogout: () => {},
        }),
      ),
    );
  });

  return onSettingsChange;
}

function clickExtraTab() {
  const extraTab = Array.from(container!.querySelectorAll<HTMLButtonElement>(".settings-tab")).find(
    (tab) => tab.querySelector(".settings-tab__label")?.textContent === "Прочее",
  );

  if (!extraTab) {
    throw new Error("Extra tab is not rendered");
  }

  act(() => {
    extraTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("MainScreen extra tab", () => {
  it("renders the hotkey row without a copy unlock switch", () => {
    renderMainScreen();
    clickExtraTab();

    const switchLabels = Array.from(
      container!.querySelectorAll<HTMLButtonElement>('[role="switch"]'),
    ).map((element) => element.getAttribute("aria-label"));

    expect(switchLabels).not.toContain("Разблокировка копирования");
    expect(container!.textContent).toContain("Горячая клавиша");
  });

  it("keeps the hotkey binding button interactive", () => {
    renderMainScreen();
    clickExtraTab();

    const hotkeyButton = container!.querySelector<HTMLButtonElement>(".hotkey-button");

    expect(hotkeyButton).toBeInstanceOf(HTMLButtonElement);
  });
});
