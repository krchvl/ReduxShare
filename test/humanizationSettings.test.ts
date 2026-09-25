import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainScreen } from "../src/components/MainScreen";
import { I18nProvider } from "../src/i18n/react";
import { DEFAULT_SETTINGS, DEFAULT_UPDATE_STATE } from "../src/types";

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
});

describe("humanization settings section", () => {
  it("renders four toggles and reports changes through onSettingsChange", () => {
    const onSettingsChange = vi.fn();
    const container = document.createElement("div");
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

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.ai-provider-tab[role="switch"]'),
    );
    expect(tabs).toHaveLength(4);

    const labels = tabs.map((tab) => tab.textContent?.trim());
    expect(labels).toEqual(["Живая печать", "Скролл и фокус", "Время чтения", "Случайный порядок"]);
    expect(tabs[0].querySelector(".ai-provider-tab__icon svg")).not.toBeNull();

    expect(tabs[0].getAttribute("aria-checked")).toBe("true");

    act(() => {
      tabs[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange.mock.calls[0][0]).toMatchObject({ humanTyping: false });
  });
});
