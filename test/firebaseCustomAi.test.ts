import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../src/i18n/react";
import { MainScreen } from "../src/components/MainScreen";
import { DEFAULT_SETTINGS, type Settings } from "../src/types";
import { TEST_AI_CONNECTION_MESSAGE } from "../src/shared/messages";
import { hasUsableAiSettings } from "../src/lib/aiProvider";

vi.mock("../src/lib/envConfig", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, isFirebaseBackend: () => true, isOfficialAiAvailable: () => false };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  ai: { ...DEFAULT_SETTINGS.ai, provider: "google", model: "gemini-2.0-flash", apiKey: "test-key" },
};

function renderMainScreen(
  initialSettings: Settings = baseSettings,
  onSettingsChange: (settings: Settings) => void = vi.fn(),
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      createElement(
        I18nProvider,
        { language: "en" },
        createElement(MainScreen, {
          settings: initialSettings,
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
          popupState: null,
          onSettingsChange,
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

function clickTestButton() {
  const testButton = Array.from(container!.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === "Test",
  );
  expect(testButton).toBeTruthy();
  act(() => {
    testButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("MainScreen custom AI on the Firebase backend", () => {
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

  it("shows the custom panel without the official mode tabs", () => {
    renderMainScreen();
    openAiTab();

    expect(container!.querySelector(".tab-card[aria-label='Official']")).toBeNull();
    expect(container!.querySelector(".ai-official")).toBeNull();
    expect(
      container!.querySelector<HTMLButtonElement>(".ai-provider-tab[aria-label='Google']"),
    ).toBeTruthy();
  });

  it("tests the custom provider instead of the unavailable official mode", async () => {
    const onSettingsChange = vi.fn();
    const sendMessage = chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>;
    sendMessage.mockImplementation((_message: unknown, callback: (response: unknown) => void) => {
      callback({ ok: true, answer: "OK" });
    });
    renderMainScreen(baseSettings, onSettingsChange);
    openAiTab();
    clickTestButton();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const calls = sendMessage.mock.calls.map(
      (call) =>
        call[0] as {
          type: string;
          payload: Record<string, unknown>;
        },
    );
    const call = calls.find((entry) => entry.type === TEST_AI_CONNECTION_MESSAGE);
    expect(call).toBeTruthy();
    expect(call!.payload.accessMode).toBe("custom");
    expect(container!.querySelector(".ai-status")?.className).toContain("success");
  });

  it("keeps the custom mode for a stored official setting", () => {
    renderMainScreen({ ...baseSettings, ai: { ...baseSettings.ai, accessMode: "official" } });
    openAiTab();

    expect(container!.querySelector<HTMLInputElement>(".ai-input[type='password']")).toBeTruthy();
    expect(container!.querySelector(".ai-official")).toBeNull();
  });

  it("requires a test before the forced custom mode is saved", async () => {
    renderMainScreen({
      ...baseSettings,
      ai: {
        ...baseSettings.ai,
        accessMode: "official",
        connectionVerified: true,
        verifiedAt: "2026-11-01T10:00:00.000Z",
      },
    });
    openAiTab();

    const saveButton = Array.from(container!.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Save",
    );
    expect(saveButton?.disabled).toBe(true);
    expect(container!.querySelector(".ai-status")).toBeNull();
  });

  it("keeps AI usable for a stored official setting once its key is verified", () => {
    const verifiedOfficial = {
      ...baseSettings.ai,
      accessMode: "official" as const,
      connectionVerified: true,
      verifiedAt: "2026-11-01T10:00:00.000Z",
    };

    expect(hasUsableAiSettings(verifiedOfficial)).toBe(true);
    expect(hasUsableAiSettings({ ...verifiedOfficial, connectionVerified: false })).toBe(false);
    expect(hasUsableAiSettings({ ...verifiedOfficial, apiKey: "" })).toBe(false);
  });
});
