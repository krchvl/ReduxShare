import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_UPDATE_STATE } from "../src/types";

let root: Root | null = null;
let originalDev: unknown;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
  (import.meta.env as Record<string, unknown>).DEV = originalDev;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("update pill outside a dev build", () => {
  it("only reports an up-to-date version without a re-check button", async () => {
    const env = import.meta.env as Record<string, unknown>;
    originalDev = env.DEV;
    env.DEV = false;
    vi.stubGlobal("__REDUXSHARE_DEV_BUILD__", false);
    vi.resetModules();

    const { MainScreen } = await import("../src/components/MainScreen");
    const { I18nProvider } = await import("../src/i18n/react");

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
            updateState: {
              ...DEFAULT_UPDATE_STATE,
              status: "up-to-date",
              currentVersion: "0.1.0",
              checkedAt: "2026-11-28T10:00:00.000Z",
            },
            isCheckingUpdates: false,
            popupState: { activeTab: "main" },
            onSettingsChange: () => {},
            onCheckUpdates: () => {},
            onResetSettings: () => {},
            onLogout: () => {},
          }),
        ),
      );
    });

    const pill = container.querySelector(".update-pill");
    expect(pill?.classList.contains("update-pill--up-to-date")).toBe(true);
    expect(pill?.textContent).toContain("Версия 0.1.0 актуальна");
    expect(pill?.querySelector(".update-pill__action")).toBeNull();
  });
});
