import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemePicker } from "../src/components/ThemePicker";
import { I18nProvider } from "../src/i18n/react";
import { loadStoredState, saveStoredState } from "../src/lib/storage";
import { CUSTOM_THEME_DEFAULTS, DEFAULT_THEME_ID } from "../src/shared/themePalettes";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/types";

let root: Root | null = null;

function renderThemePicker(props: {
  themeId?: string;
  onThemeChange?: (themeId: string) => void;
  onCustomThemeChange?: (customTheme: Record<string, string>) => void;
  customTheme?: Record<string, string>;
}) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      createElement(
        I18nProvider,
        { language: "ru" },
        createElement(ThemePicker, {
          themeId: props.themeId ?? DEFAULT_THEME_ID,
          customTheme: { ...CUSTOM_THEME_DEFAULTS, ...props.customTheme },
          onThemeChange: props.onThemeChange ?? (() => undefined),
          onCustomThemeChange: props.onCustomThemeChange ?? (() => undefined),
        }),
      ),
    );
  });

  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
});

describe("theme picker", () => {
  it("renders all preset cards and the custom card", () => {
    const container = renderThemePicker({});
    const cards = container.querySelectorAll<HTMLButtonElement>(".theme-picker__card");

    expect(cards.length).toBe(8);
    expect(container.querySelector(".theme-picker__grid")?.getAttribute("role")).toBe("radiogroup");
  });

  it("reports preset clicks through onThemeChange", () => {
    const onThemeChange = vi.fn();
    const container = renderThemePicker({ onThemeChange });

    const oceanCard = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".theme-picker__card"),
    ).find((card) => card.textContent === "Океан");
    expect(oceanCard).toBeInstanceOf(HTMLButtonElement);

    act(() => {
      oceanCard!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onThemeChange).toHaveBeenCalledWith("ocean");
  });

  it("marks the active card with aria-checked", () => {
    const container = renderThemePicker({ themeId: "forest" });
    const activeCard = container.querySelector<HTMLButtonElement>(".theme-picker__card--active");

    expect(activeCard?.getAttribute("aria-checked")).toBe("true");
    expect(activeCard?.textContent).toBe("Лес");
  });

  it("reveals the custom editor only for the custom theme", () => {
    const presetContainer = renderThemePicker({ themeId: "standard" });
    expect(presetContainer.querySelector(".theme-picker__editor")).toBeNull();

    const customContainer = renderThemePicker({ themeId: "custom" });
    const fields = customContainer.querySelectorAll<HTMLInputElement>('input[type="color"]');

    expect(fields.length).toBe(7);
    expect(customContainer.querySelector(".theme-picker__reset")).toBeInstanceOf(HTMLButtonElement);
  });

  it("reports custom color edits through onCustomThemeChange", () => {
    const onCustomThemeChange = vi.fn();
    const container = renderThemePicker({ themeId: "custom", onCustomThemeChange });

    const input = container.querySelector<HTMLInputElement>('input[type="color"]');
    expect(input).toBeInstanceOf(HTMLInputElement);

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      expect(nativeSetter).toBeTypeOf("function");
      nativeSetter!.call(input, "#ff0000");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onCustomThemeChange).toHaveBeenCalledTimes(1);
    expect(onCustomThemeChange.mock.calls[0][0].accent).toBe("#ff0000");
  });

  it("resets the custom palette to the standard defaults", () => {
    const onCustomThemeChange = vi.fn();
    const container = renderThemePicker({
      themeId: "custom",
      onCustomThemeChange,
      customTheme: { accent: "#ff0000" },
    });

    const reset = container.querySelector<HTMLButtonElement>(".theme-picker__reset");
    act(() => {
      reset!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onCustomThemeChange).toHaveBeenCalledWith(CUSTOM_THEME_DEFAULTS);
  });

  it("persists theme settings to extension storage", async () => {
    const stored = {
      settings: normalizeSettings({ themeId: "ocean" }),
      authSession: null,
      userProfile: null,
    };

    await saveStoredState(stored);

    const loaded = await loadStoredState();
    expect(loaded.settings?.themeId).toBe("ocean");
    expect(DEFAULT_SETTINGS.themeId).toBe("standard");
  });
});
