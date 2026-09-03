import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeOpacity, normalizeSettings, resolveColorScheme } from "../src/types";

describe("opacity settings", () => {
  it("clamps opacity values into the supported range", () => {
    expect(normalizeOpacity(1)).toBe(1);
    expect(normalizeOpacity(0.65)).toBe(0.65);
    expect(normalizeOpacity(0.4)).toBe(0.4);
    expect(normalizeOpacity(0.2)).toBe(0.4);
    expect(normalizeOpacity(1.5)).toBe(1);
    expect(normalizeOpacity(Number.NaN)).toBe(1);
    expect(normalizeOpacity("0.8")).toBe(1);
    expect(normalizeOpacity(undefined)).toBe(1);
  });

  it("keeps stored opacity values with safe defaults", () => {
    expect(DEFAULT_SETTINGS.popupOpacity).toBe(1);
    expect(DEFAULT_SETTINGS.pageOverlayOpacity).toBe(1);

    const normalized = normalizeSettings({ popupOpacity: 0.5, pageOverlayOpacity: 0.7 });

    expect(normalized.popupOpacity).toBe(0.5);
    expect(normalized.pageOverlayOpacity).toBe(0.7);
    expect(normalizeSettings({}).popupOpacity).toBe(1);
  });

  it("normalizes the color scheme with a system default", () => {
    expect(DEFAULT_SETTINGS.colorScheme).toBe("system");
    expect(normalizeSettings({}).colorScheme).toBe("system");
    expect(normalizeSettings({ colorScheme: "light" }).colorScheme).toBe("light");
    expect(normalizeSettings({ colorScheme: "Night" as "dark" }).colorScheme).toBe("system");
    expect(resolveColorScheme("light")).toBe("light");
    expect(resolveColorScheme("dark")).toBe("dark");
  });
});
