import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../src/i18n/react";
import { createRestoredAiDraft, MainScreen } from "../src/components/MainScreen";
import { DEFAULT_SETTINGS, type PopupState, type Settings } from "../src/types";
import { APP_STORAGE_KEY } from "../src/shared/storageKeys";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  ai: { ...DEFAULT_SETTINGS.ai, provider: "google", apiKey: "test-key" },
};

function renderMainScreen(
  initialSettings: Settings = baseSettings,
  overrides: {
    onSettingsChange?: (settings: Settings) => void;
    popupState?: PopupState | null;
    onPopupStateChange?: (popupState: PopupState) => void;
    stateful?: boolean;
  } = {},
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  const render = (settings: Settings) => {
    root!.render(
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
          popupState: overrides.popupState ?? null,
          onPopupStateChange: overrides.onPopupStateChange,
          onSettingsChange: (next) => {
            overrides.onSettingsChange?.(next);
            if (overrides.stateful) {
              render(next);
            }
          },
          onCheckUpdates: vi.fn(),
          onResetSettings: vi.fn(),
          onLogout: vi.fn(),
        }),
      ),
    );
  };

  act(() => {
    render(initialSettings);
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

    const planCards = Array.from(
      official!.querySelectorAll<HTMLElement>(".ai-official__plan-card"),
    );
    expect(
      planCards.map((card) => card.querySelector(".ai-official__plan-name")?.textContent),
    ).toEqual(["Free", "Low", "Medium", "High"]);
    const activePlan = official!.querySelector(".ai-official__plan-card--active");
    expect(activePlan?.querySelector(".ai-official__plan-name")?.textContent).toBe("Free");
    expect(activePlan?.querySelector(".ai-official__plan-limits")?.textContent).toBe(
      "5/min · 30/day",
    );
    expect(activePlan?.querySelector(".ai-official__plan-current")?.textContent).toBe("Current");

    expect(container!.querySelector(".ai-official__models-title")?.textContent).toBe(
      "Selected models",
    );
    expect(container!.querySelector(".ai-official__model-item")).toBeNull();
    expect(container!.querySelector(".ai-official__model-add")).toBeNull();
    expect(container!.querySelector(".ai-official__models-empty")).toBeTruthy();

    const buttons = Array.from(official!.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["Test"]);
    for (const button of buttons) {
      expect(button.disabled).toBe(false);
    }
  });

  it("tests the official gateway in the official mode", async () => {
    const sentPayloads: Array<{ accessMode?: string }> = [];
    const originalSendMessage = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = ((
      message: { type?: string; payload?: { accessMode?: string } },
      callback?: (response: unknown) => void,
    ) => {
      if (message?.type === "REDUXSHARE_TEST_AI_CONNECTION") {
        sentPayloads.push(message.payload ?? {});
        callback?.({ ok: true, answer: "OK" });
      }
    }) as typeof chrome.runtime.sendMessage;

    try {
      renderMainScreen();
      openAiTab();
      clickModeTab("Official");

      const testButton = Array.from(
        container!.querySelectorAll<HTMLButtonElement>(".ai-official button"),
      ).find((button) => button.textContent === "Test");
      expect(testButton).toBeTruthy();

      act(() => {
        testButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(sentPayloads).toHaveLength(1);
      expect(sentPayloads[0]!.accessMode).toBe("official");
      expect(container!.querySelector(".ai-status")?.className).toContain("success");
    } finally {
      chrome.runtime.sendMessage = originalSendMessage;
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
    expect(container!.querySelector(".ai-official__models")).toBeNull();
  });

  it("edits selected official models in the anchored popover", async () => {
    const onSettingsChange = vi.fn();
    const usageSettings: Settings = {
      ...baseSettings,
      ai: {
        ...baseSettings.ai,
        accessMode: "official",
        officialModels: ["model-a", "model-b"],
      },
    };
    const usage = {
      ok: true,
      usage: {
        plan: "free",
        models: [
          { model: "model-a", label: "Model A" },
          { model: "model-b", label: "Model B" },
          { model: "model-c", label: "Model C" },
        ],
        minuteUsed: 0,
        minuteLimit: 5,
        dayUsed: 0,
        dayLimit: 30,
      },
    };

    const originalSendMessage = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = ((
      message: { type?: string },
      callback?: (response: unknown) => void,
    ) => {
      if (message?.type === "REDUXSHARE_FETCH_AI_USAGE") {
        callback?.(usage);
      }
    }) as typeof chrome.runtime.sendMessage;

    try {
      renderMainScreen(usageSettings, { onSettingsChange, stateful: true });
      openAiTab();
      clickModeTab("Official");

      await act(async () => {});

      expect(container!.querySelector(".ai-official__models-title")?.textContent).toBe(
        "Selected models",
      );
      const visibleCards = Array.from(
        container!.querySelectorAll<HTMLButtonElement>(".ai-official__model-item"),
      );
      expect(visibleCards).toHaveLength(2);
      expect(visibleCards[0]!.tagName).toBe("BUTTON");
      expect(visibleCards[0]!.querySelector(".ai-official__model-name")?.textContent).toBe(
        "Model A",
      );
      expect(visibleCards[0]!.querySelector(".ai-official__model-icon svg")).toBeTruthy();
      expect(visibleCards[0]!.querySelector(".ai-official__model-trash svg")).toBeTruthy();
      expect(visibleCards[0]!.getAttribute("aria-label")).toBe("Remove model “Model A”");
      expect(visibleCards[0]!.disabled).toBe(false);

      const settingsChange = onSettingsChange.mock.calls.length;
      act(() => {
        visibleCards[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(onSettingsChange.mock.calls.length).toBe(settingsChange + 1);
      const afterRemove = onSettingsChange.mock.calls.at(-1)?.[0] as Settings | undefined;
      expect(afterRemove?.ai.officialModels).toEqual(["model-a"]);
      expect(container!.querySelectorAll(".ai-official__model-item")).toHaveLength(1);

      const addButton = container!.querySelector<HTMLButtonElement>(".ai-official__model-add");
      expect(addButton?.getAttribute("aria-haspopup")).toBe("dialog");
      expect(addButton?.getAttribute("aria-expanded")).toBe("false");
      expect(addButton?.closest(".ai-official__model-list")).toBeNull();
      expect(addButton?.parentElement?.classList.contains("ai-official__models")).toBe(true);

      act(() => {
        addButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const popover = document.querySelector("#reduxshare-official-models-popover");
      expect(popover).toBeTruthy();
      expect(popover!.getAttribute("role")).toBe("dialog");
      expect(addButton?.getAttribute("aria-expanded")).toBe("true");
      expect(popover!.querySelectorAll("input[type='checkbox']")).toHaveLength(3);

      const checkboxes = Array.from(
        popover!.querySelectorAll<HTMLInputElement>("input[type='checkbox']"),
      );
      expect(checkboxes.map((box) => box.checked)).toEqual([true, false, false]);
      expect(checkboxes[0]!.disabled).toBe(false);

      act(() => {
        checkboxes[2]!.click();
      });

      const lastCall = onSettingsChange.mock.calls.at(-1)?.[0] as Settings | undefined;
      expect(lastCall?.ai.officialModels).toEqual(["model-a", "model-c"]);
      expect(popover!.querySelectorAll("input[type='checkbox']")).toHaveLength(3);

      const popoverKey = (key: string) =>
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      const focusedCheckboxIndex = () =>
        checkboxes.indexOf(document.activeElement as HTMLInputElement);

      expect(popover!.querySelectorAll(".ai-official__model-option--active")).toHaveLength(1);

      act(() => {
        checkboxes[0]!.focus();
      });

      act(() => {
        popover!.dispatchEvent(popoverKey("ArrowDown"));
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(focusedCheckboxIndex()).toBe(1);

      act(() => {
        popover!.dispatchEvent(popoverKey("End"));
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(focusedCheckboxIndex()).toBe(2);

      act(() => {
        popover!.dispatchEvent(popoverKey("ArrowDown"));
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(focusedCheckboxIndex()).toBe(2);

      act(() => {
        popover!.dispatchEvent(popoverKey("Home"));
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(focusedCheckboxIndex()).toBe(0);

      act(() => {
        popover!.dispatchEvent(popoverKey("ArrowUp"));
      });

      act(() => {
        vi.runAllTimers();
      });

      expect(focusedCheckboxIndex()).toBe(0);

      act(() => {
        checkboxes[0]!.focus();
      });

      const spaceEvent = popoverKey(" ");
      act(() => {
        checkboxes[1]!.dispatchEvent(spaceEvent);
      });

      expect(spaceEvent.defaultPrevented).toBe(false);

      act(() => {
        checkboxes[0]!.focus();
      });

      act(() => {
        popover!.dispatchEvent(popoverKey("Escape"));
      });

      expect(document.querySelector("#reduxshare-official-models-popover")).toBeNull();
      expect(document.activeElement === addButton || addButton?.matches(":focus")).toBe(true);
      expect(addButton?.getAttribute("aria-expanded")).toBe("false");
    } finally {
      chrome.runtime.sendMessage = originalSendMessage;
    }
  });

  it("allows removing the last selected model and shows the empty selection state", async () => {
    const onSettingsChange = vi.fn();
    const singleModelSettings: Settings = {
      ...baseSettings,
      ai: {
        ...baseSettings.ai,
        accessMode: "official",
        officialModels: ["model-a"],
      },
    };
    const usage = {
      ok: true,
      usage: {
        plan: "free",
        models: [
          { model: "model-a", label: "Model A" },
          { model: "model-b", label: "Model B" },
        ],
        minuteUsed: 0,
        minuteLimit: 5,
        dayUsed: 0,
        dayLimit: 30,
      },
    };
    const originalSendMessage = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = ((
      message: { type?: string },
      callback?: (response: unknown) => void,
    ) => {
      if (message?.type === "REDUXSHARE_FETCH_AI_USAGE") {
        callback?.(usage);
      }
    }) as typeof chrome.runtime.sendMessage;

    try {
      renderMainScreen(singleModelSettings, { onSettingsChange });
      openAiTab();
      clickModeTab("Official");

      await act(async () => {});

      const cards = Array.from(
        container!.querySelectorAll<HTMLButtonElement>(".ai-official__model-item"),
      );
      expect(cards).toHaveLength(1);
      expect(cards[0]!.disabled).toBe(false);
      expect(cards[0]!.getAttribute("aria-label")).toBe("Remove model “Model A”");

      act(() => {
        cards[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(onSettingsChange).toHaveBeenCalledTimes(1);
      const afterRemove = onSettingsChange.mock.calls.at(-1)?.[0] as Settings | undefined;
      expect(afterRemove?.ai.officialModels).toEqual([]);
    } finally {
      chrome.runtime.sendMessage = originalSendMessage;
    }
  });

  it("restores the active tab from the stored popup state", () => {
    renderMainScreen(baseSettings, { popupState: { activeTab: "ui", aiDraft: null } });

    expect(container!.querySelector(".settings-tabs")?.getAttribute("data-active-tab")).toBe("ui");
    expect(container!.querySelectorAll(".settings-tab")[2]!.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("reports tab switches through onPopupStateChange", () => {
    const onPopupStateChange = vi.fn();
    renderMainScreen(baseSettings, { onPopupStateChange });

    act(() => {
      container!
        .querySelectorAll<HTMLButtonElement>(".settings-tab")[2]!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onPopupStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeTab: "ui" }),
    );
  });

  it("restores an unsaved AI draft from the stored popup state", () => {
    const onPopupStateChange = vi.fn();
    renderMainScreen(
      { ...baseSettings, ai: { ...baseSettings.ai, accessMode: "custom" } },
      {
        onPopupStateChange,
        popupState: {
          activeTab: "ai",
          aiDraft: {
            provider: "custom",
            model: "draft-model",
            apiKey: "draft-key",
            customEndpoint: "https://api.example.com/v1/chat/completions",
            customModelName: "draft-model-name",
          },
        },
      },
    );

    expect(
      container!
        .querySelector<HTMLButtonElement>(".ai-provider-tab[aria-label='Custom']")
        ?.getAttribute("aria-checked"),
    ).toBe("true");

    const endpointInput = container!.querySelector<HTMLInputElement>(
      ".ai-input[placeholder='https://api.example.com/v1/chat/completions']",
    );
    const modelNameInput = container!.querySelector<HTMLInputElement>(
      ".ai-input[placeholder='gpt-4o...']",
    );

    expect(endpointInput?.value).toBe("https://api.example.com/v1/chat/completions");
    expect(modelNameInput?.value).toBe("draft-model-name");
    expect(container!.querySelector<HTMLInputElement>(".ai-input[type='password']")?.value).toBe(
      "draft-key",
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onPopupStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeTab: "ai",
        aiDraft: {
          provider: "custom",
          model: "draft-model",
          apiKey: "draft-key",
          customEndpoint: "https://api.example.com/v1/chat/completions",
          customModelName: "draft-model-name",
        },
      }),
    );
  });

  it("persists typed AI draft values without pressing save", () => {
    const onPopupStateChange = vi.fn();
    const onSettingsChange = vi.fn();
    renderMainScreen(
      { ...baseSettings, ai: { ...baseSettings.ai, accessMode: "custom" } },
      { onPopupStateChange, onSettingsChange },
    );
    openAiTab();

    const keyInput = container!.querySelector<HTMLInputElement>(".ai-input[type='password']");
    expect(keyInput).toBeTruthy();

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(keyInput, "unsaved-key");
      keyInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onPopupStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        aiDraft: expect.objectContaining({
          provider: baseSettings.ai.provider,
          model: baseSettings.ai.model,
          apiKey: "unsaved-key",
          customEndpoint: "",
          customModelName: "",
        }),
      }),
    );
    expect(onSettingsChange).not.toHaveBeenCalled();
  });

  it("shows the custom panel when an unsaved draft is restored", () => {
    renderMainScreen(
      { ...baseSettings, ai: { ...baseSettings.ai, accessMode: "official" } },
      {
        popupState: {
          activeTab: "ai",
          aiDraft: {
            provider: "openai",
            model: "gpt-4o",
            apiKey: "draft-key",
            customEndpoint: "",
            customModelName: "",
          },
        },
      },
    );

    expect(
      container!
        .querySelector<HTMLButtonElement>(`.tab-card[aria-label="Custom"]`)
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(container!.querySelector<HTMLInputElement>(".ai-input[type='password']")?.value).toBe(
      "draft-key",
    );
  });

  it("keeps a restored draft when the saved settings change", () => {
    renderMainScreen(
      { ...baseSettings, ai: { ...baseSettings.ai, accessMode: "custom" } },
      {
        stateful: true,
        popupState: {
          activeTab: "ai",
          aiDraft: {
            provider: "openai",
            model: "gpt-4o",
            apiKey: "draft-key",
            customEndpoint: "",
            customModelName: "",
          },
        },
      },
    );

    clickModeTab("Official");
    clickModeTab("Custom");

    expect(container!.querySelector<HTMLInputElement>(".ai-input[type='password']")?.value).toBe(
      "draft-key",
    );
  });

  it("flushes the latest draft to storage on unmount", async () => {
    renderMainScreen({ ...baseSettings, ai: { ...baseSettings.ai, accessMode: "custom" } });
    openAiTab();

    const keyInput = container!.querySelector<HTMLInputElement>(".ai-input[type='password']")!;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(keyInput, "flushed-key");
      keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      root!.unmount();
      root = null;
    });

    await act(async () => {});

    const stored = await chrome.storage.local.get(APP_STORAGE_KEY);
    expect(stored[APP_STORAGE_KEY]?.popupState?.aiDraft?.apiKey).toBe("flushed-key");
  });
});

describe("createRestoredAiDraft", () => {
  const verifiedSettings: Settings = {
    ...baseSettings,
    ai: {
      ...DEFAULT_SETTINGS.ai,
      provider: "openai",
      model: "gpt-4o",
      apiKey: "verified-key",
      connectionVerified: true,
      verifiedAt: "2026-01-01T00:00:00.000Z",
    },
  };

  const draft = {
    provider: "openai" as const,
    model: "gpt-4o",
    apiKey: "verified-key",
    customEndpoint: "",
    customModelName: "",
  };

  it("keeps verification for the verified connection target", () => {
    const restored = createRestoredAiDraft(verifiedSettings, draft);

    expect(restored.connectionVerified).toBe(true);
    expect(restored.verifiedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("drops verification when the restored model differs", () => {
    const restored = createRestoredAiDraft(verifiedSettings, { ...draft, model: "gpt-4.1" });

    expect(restored.connectionVerified).toBe(false);
    expect(restored.verifiedAt).toBeNull();
  });

  it("drops verification when the restored endpoint differs", () => {
    const customSettings: Settings = {
      ...verifiedSettings,
      ai: {
        ...verifiedSettings.ai,
        provider: "custom",
        customEndpoint: "https://api.example.com/v1/chat/completions",
        customModelName: "verified-model",
      },
    };

    const restored = createRestoredAiDraft(customSettings, {
      ...draft,
      provider: "custom",
      customEndpoint: "https://api.other.example.com/v1/chat/completions",
      customModelName: "verified-model",
    });

    expect(restored.connectionVerified).toBe(false);
    expect(restored.verifiedAt).toBeNull();
  });
});
