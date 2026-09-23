import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestAiModelsMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/ai")>();
  return {
    ...original,
    requestAiModels: requestAiModelsMock
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
    connectionVerified: true
  }
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
            error: null
          },
          isCheckingUpdates: false,
          onSettingsChange: vi.fn(),
          onCheckUpdates: vi.fn(),
          onResetSettings: vi.fn(),
          onLogout: vi.fn()
        })
      )
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
    requestAiModelsMock.mockResolvedValue({ ok: true, models: [{ value: "m-1", label: "Model 1" }] });
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

    // The provider select is the first .ai-select in the AI tab.
    const providerSelect = container!.querySelector<HTMLSelectElement>("select.ai-select");
    expect(providerSelect).not.toBeNull();

    // Gate the FIRST request (google): it will resolve late, after the switch.
    let resolveFirst: (value: { ok: boolean; models: { value: string; label: string }[] }) => void = () => {};
    requestAiModelsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );

    // First provider request goes out after the debounce.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(requestAiModelsMock).toHaveBeenCalledTimes(1);
    expect(providerSelect!.value).toBe("google");

    // Switch provider while the first request is in flight.
    act(() => {
      providerSelect!.value = "openrouter";
      providerSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(requestAiModelsMock).toHaveBeenCalledTimes(2);

    // The second (current) request resolves first.
    await act(async () => {
      requestAiModelsMock.mock.results[1]!.value as Promise<unknown>;
    });
    // Resolve the stale (first) response last.
    await act(async () => {
      resolveFirst({ ok: true, models: [{ value: "stale-model", label: "Stale model" }] });
    });

    // The stale success must not overwrite the newer request's state: the stale
    // payload must not appear as a model option for the new provider, and the
    // draft model must not be reset to the stale value.
    const statusText = container!.querySelector(".ai-status")?.textContent ?? "";
    expect(statusText).not.toContain("Stale model");
    expect(container!.querySelector('option[value="stale-model"]')).toBeNull();
    expect(container!.querySelector<HTMLInputElement>("select")?.value).not.toBe("stale-model");

    // Critically, the stale response must not clobber aiModelsState.requestKey:
    // if it did, the auto-request effect would see a mismatched key and fire a
    // duplicate request for the current provider.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(requestAiModelsMock).toHaveBeenCalledTimes(2);
  });
});
