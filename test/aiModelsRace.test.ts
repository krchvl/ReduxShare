import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as AiLib from "../src/lib/ai";

const requestAiModelsMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/ai", async (importOriginal) => {
  const original = await importOriginal<typeof AiLib>();
  return {
    ...original,
    requestAiModels: requestAiModelsMock,
  };
});

import { I18nProvider } from "../src/i18n/react";
import { MainScreen } from "../src/components/MainScreen";
import { DEFAULT_SETTINGS, getDefaultAiModelForProvider, type Settings } from "../src/types";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  ai: {
    ...DEFAULT_SETTINGS.ai,
    provider: "google",
    apiKey: "test-key",
    model: getDefaultAiModelForProvider("google"),
    connectionVerified: true,
  },
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

function clickProviderTab() {
  const aiTab = container!.querySelector<HTMLButtonElement>(".settings-tab:nth-child(4)");
  if (aiTab) {
    act(() => {
      aiTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    return true;
  }
  return false;
}

describe("MainScreen AI model auto-fetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requestAiModelsMock.mockReset();
    requestAiModelsMock.mockResolvedValue({
      ok: true,
      models: [{ value: "m-1", label: "Model 1" }],
    });
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

  it("a stale slow response must not overwrite the newer provider's state", async () => {
    renderMainScreen();
    expect(clickProviderTab()).toBe(true);

    const providerSelect = container!.querySelector<HTMLSelectElement>("select.ai-select");
    expect(providerSelect).not.toBeNull();

    let resolveFirst: (value: {
      ok: boolean;
      models: { value: string; label: string }[];
    }) => void = () => {};
    requestAiModelsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(requestAiModelsMock).toHaveBeenCalledTimes(1);
    expect(providerSelect!.value).toBe("google");

    act(() => {
      providerSelect!.value = "openrouter";
      providerSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(requestAiModelsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await (requestAiModelsMock.mock.results[1]!.value as Promise<unknown>);
    });

    await act(async () => {
      resolveFirst({ ok: true, models: [{ value: "stale-model", label: "Stale model" }] });
    });

    const statusText = container!.querySelector(".ai-status")?.textContent ?? "";
    expect(statusText).not.toContain("Stale model");
    expect(container!.querySelector('option[value="stale-model"]')).toBeNull();
    expect(container!.querySelector<HTMLInputElement>("select")?.value).not.toBe("stale-model");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(requestAiModelsMock).toHaveBeenCalledTimes(2);
  });
});
