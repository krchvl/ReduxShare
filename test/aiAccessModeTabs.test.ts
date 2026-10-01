import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../src/i18n/react";
import { MainScreen } from "../src/components/MainScreen";
import { DEFAULT_SETTINGS, type Settings } from "../src/types";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  ai: { ...DEFAULT_SETTINGS.ai, provider: "google", apiKey: "test-key" },
};

function renderMainScreen(settings: Settings = baseSettings) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      createElement(
        I18nProvider,
        { language: "en" },
        createElement(MainScreen, {
          settings,
          updateState: {
            status: "up-to-date",
            source: "github",
            currentVersion: "1.0.0",
            latestVersion: null,
            checkedAt: null,
            nextCheckAt: null,
            releaseUrl: null,
            error: null,
          },
          isCheckingUpdates: false,
          onSettingsChange: vi.fn(),
          onCheckUpdates: vi.fn(),
          onResetSettings: vi.fn(),
          onLogout: vi.fn(),
        }),
      ),
    );
  });
}

function openAiTab() {
  const aiTab = Array.from(container!.querySelectorAll<HTMLButtonElement>(".settings-tab")).find(
    (tab) => tab.textContent === "AI" || tab.textContent === "ИИ",
  );
  expect(aiTab).toBeTruthy();
  act(() => {
    aiTab!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function clickModeTab(label: string) {
  const tab = container!.querySelector<HTMLButtonElement>(`.tab-card[aria-label="${label}"]`);
  expect(tab).toBeTruthy();
  act(() => {
    tab!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("MainScreen AI access mode tabs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("defaults to the official mode with the official panel visible", () => {
    renderMainScreen();
    openAiTab();

    const official = container!.querySelector<HTMLButtonElement>(
      `.tab-card[aria-label="Official"]`,
    );
    const custom = container!.querySelector<HTMLButtonElement>(`.tab-card[aria-label="Custom"]`);
    expect(official?.getAttribute("aria-checked")).toBe("true");
    expect(custom?.getAttribute("aria-checked")).toBe("false");

    expect(container!.querySelector(".ai-provider-tab")).toBeNull();
    expect(container!.querySelector(".ai-input[type='password']")).toBeNull();
    expect(container!.querySelector(".ai-official")).toBeTruthy();
  });

  it("shows the working official panel when the official tab is selected", async () => {
    renderMainScreen();
    openAiTab();
    clickModeTab("Official");

    await act(async () => {});

    expect(
      container!.querySelector(".tab-card[aria-label='Official']")?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(container!.querySelector(".ai-provider-tab")).toBeNull();
    expect(container!.querySelector(".ai-input")).toBeNull();

    const official = container!.querySelector(".ai-official");
    expect(official).toBeTruthy();
    expect(official!.querySelector(".ai-official__badge")).toBeNull();
    expect(official!.querySelector(".ai-official__head h3")?.textContent).toBe("Official access");
    expect(official!.querySelector(".ai-official__quota-value")?.textContent).toBe("—");

    const buttons = Array.from(official!.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["Test"]);
    for (const button of buttons) {
      expect(button.disabled).toBe(false);
    }
  });

  it("switches back to the custom mode and restores the provider form", () => {
    renderMainScreen();
    openAiTab();
    clickModeTab("Official");
    expect(container!.querySelector(".ai-provider-tab")).toBeNull();

    clickModeTab("Custom");
    expect(
      container!.querySelector(".tab-card[aria-label='Custom']")?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(container!.querySelector(".ai-provider-tab")).toBeTruthy();
    expect(container!.querySelector(".ai-official")).toBeNull();
  });
});
