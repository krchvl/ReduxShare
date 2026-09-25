import { describe, expect, it } from "vitest";
import type { LegacyStoredSettings, LegacyTheme } from "../src/types";
import {
  AUTO_SELECT_TEMPO_PRESETS,
  DEFAULT_SETTINGS,
  normalizeAutoSelectAvgSeconds,
  normalizeOpacity,
  normalizeSettings,
  resolveColorScheme,
} from "../src/types";

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
    expect(DEFAULT_SETTINGS.copyUnlock).toBe(false);

    const normalized = normalizeSettings({ popupOpacity: 0.5, pageOverlayOpacity: 0.7 });

    expect(normalized.popupOpacity).toBe(0.5);
    expect(normalized.pageOverlayOpacity).toBe(0.7);
    expect(normalizeSettings({}).popupOpacity).toBe(1);
    expect(normalizeSettings({ copyUnlock: true }).copyUnlock).toBe(true);
  });

  it("normalizes the color scheme with a system default", () => {
    expect(DEFAULT_SETTINGS.colorScheme).toBe("system");
    expect(normalizeSettings({}).colorScheme).toBe("system");
    expect(normalizeSettings({ colorScheme: "light" }).colorScheme).toBe("light");
    expect(normalizeSettings({ colorScheme: "Night" as "dark" }).colorScheme).toBe("system");
    expect(resolveColorScheme("light")).toBe("light");
    expect(resolveColorScheme("dark")).toBe("dark");
  });

  it("clamps the average auto-select time", () => {
    expect(DEFAULT_SETTINGS.autoSelectAvgSeconds).toBe(4);
    expect(normalizeAutoSelectAvgSeconds(4)).toBe(4);
    expect(normalizeAutoSelectAvgSeconds(0.2)).toBe(1);
    expect(normalizeAutoSelectAvgSeconds(99)).toBe(30);
    expect(normalizeAutoSelectAvgSeconds(Number.NaN)).toBe(4);
    expect(normalizeSettings({ autoSelectAvgSeconds: 7.5 }).autoSelectAvgSeconds).toBe(7.5);
    expect(normalizeSettings({}).autoSelectAvgSeconds).toBe(4);
  });

  it("keeps the realistic preset within the clamped range", () => {
    expect(AUTO_SELECT_TEMPO_PRESETS.realistic).toBe(12);
    expect(normalizeAutoSelectAvgSeconds(AUTO_SELECT_TEMPO_PRESETS.realistic)).toBe(12);
    expect(normalizeAutoSelectAvgSeconds(13.333)).toBe(13.3);
  });
});

describe("legacy theme migration", () => {
  it("migrates legacy theme settings to accent colors", () => {
    expect(normalizeSettings({ theme: "Night" }).accentColor).toBe("#9cb9f6");
    expect(normalizeSettings({ theme: "Devil" }).accentColor).toBe("#ff6b6f");
    expect(normalizeSettings({ theme: "Peace" }).accentColor).toBe("#76d982");
  });

  it("prefers explicit accentColor over legacy theme", () => {
    expect(normalizeSettings({ theme: "Night", accentColor: "#ff0000" }).accentColor).toBe(
      "#ff0000",
    );
    expect(normalizeSettings({ theme: "Devil", accentColor: "#00ff00" }).accentColor).toBe(
      "#00ff00",
    );
  });

  it("handles unknown legacy theme values", () => {
    expect(normalizeSettings({ theme: "Unknown" as LegacyTheme }).accentColor).toBe("#9cb9f6");
  });

  it("works with partial legacy settings", () => {
    const legacySettings: Partial<LegacyStoredSettings> = { theme: "Night" };
    expect(normalizeSettings(legacySettings).accentColor).toBe("#9cb9f6");
  });
});
