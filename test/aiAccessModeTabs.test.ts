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

function renderMainScreen(
  initialSettings: Settings = baseSettings,
  overrides: {
    onSettingsChange?: (settings: Settings) => void;
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

  it("switches back to the custom mode and restores the provider form", () => {
    renderMainScreen(baseSettings, { stateful: true });
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
});
