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

function clickSecurityTab() {
  const securityTab = Array.from(
    container!.querySelectorAll<HTMLButtonElement>(".settings-tab"),
  ).find((tab) => tab.textContent === "Безопасность");

  if (!securityTab) {
    throw new Error("Security tab is not rendered");
  }

  act(() => {
    securityTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function getCopyUnlockSwitch() {
  return container!.querySelector<HTMLButtonElement>(
    '.switch[role="switch"][aria-label="Разблокировка копирования"]',
  );
}

describe("MainScreen security tab", () => {
  it("renders the copy unlock switch and reports changes", () => {
    const onSettingsChange = renderMainScreen();
    clickSecurityTab();

    const copyUnlockSwitch = getCopyUnlockSwitch();
    expect(copyUnlockSwitch).toBeInstanceOf(HTMLButtonElement);
    expect(copyUnlockSwitch!.getAttribute("aria-checked")).toBe("true");

    act(() => {
      copyUnlockSwitch!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onSettingsChange).toHaveBeenCalledTimes(1);
    expect(onSettingsChange.mock.calls[0][0]).toMatchObject({ copyUnlock: false });
  });

  it("reflects the enabled copy unlock state", () => {
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
            settings: { ...DEFAULT_SETTINGS, copyUnlock: true },
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
    clickSecurityTab();

    expect(getCopyUnlockSwitch()!.getAttribute("aria-checked")).toBe("true");
  });
});
