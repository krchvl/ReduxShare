import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccentColorPicker } from "../src/components/AccentColorPicker";
import { I18nProvider } from "../src/i18n/react";
import { loadStoredState, saveStoredState } from "../src/lib/storage";
import { DEFAULT_SETTINGS } from "../src/types";

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
});

describe("accent color settings flow", () => {
  it("reports preset clicks through onChange immediately", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(
          I18nProvider,
          { language: "ru" },
          createElement(AccentColorPicker, { value: "#9cb9f6", onChange }),
        ),
      );
    });

    const preset = container.querySelector<HTMLButtonElement>(
      '.accent-picker__preset[aria-label="#ff6b6f"]',
    );
    expect(preset).toBeInstanceOf(HTMLButtonElement);

    act(() => {
      preset!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith("#ff6b6f");
  });

  it("reports native color input changes through onChange", () => {
    const onChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(
          I18nProvider,
          { language: "ru" },
          createElement(AccentColorPicker, { value: "#9cb9f6", onChange }),
        ),
      );
    });

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

    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("persists accent color changes to extension storage", async () => {
    await saveStoredState({
      settings: { ...DEFAULT_SETTINGS, accentColor: "#ff0000" },
      authSession: null,
      userProfile: null,
    });

    const stored = await loadStoredState();
    expect(stored.settings?.accentColor).toBe("#ff0000");
  });
});
