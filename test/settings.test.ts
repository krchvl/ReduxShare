import { describe, expect, it } from "vitest";
import type { LegacyStoredSettings, LegacyTheme } from "../src/types";
import {
  AUTO_SELECT_TEMPO_PRESETS,
  DEFAULT_SETTINGS,
  normalizeAutoSelectAvgSeconds,
  normalizeOpacity,
  normalizeSettings,
} from "../src/types";
import { CUSTOM_THEME_DEFAULTS } from "../src/shared/themePalettes";
import {
  autoSelectTempoPositionToSeconds,
  autoSelectTempoSecondsToPosition,
} from "../src/logic/settings";

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

  it("drops the legacy copy unlock flag", () => {
    expect(normalizeSettings({ copyUnlock: false })).not.toHaveProperty("copyUnlock");
  });

  it("normalizes theme settings with a standard default", () => {
    expect(DEFAULT_SETTINGS.themeId).toBe("standard");
    expect(DEFAULT_SETTINGS.customTheme).toEqual(CUSTOM_THEME_DEFAULTS);
    expect(normalizeSettings({}).themeId).toBe("standard");
    expect(normalizeSettings({ themeId: "devil" }).themeId).toBe("devil");
    expect(normalizeSettings({ themeId: "Night" as "standard" }).themeId).toBe("standard");
    expect(normalizeSettings({ themeId: 42 as "standard" }).themeId).toBe("standard");
  });

  it("normalizes custom theme colors with safe fallbacks", () => {
    const custom = normalizeSettings({
      themeId: "custom",
      customTheme: {
        accent: "#FF0000",
        backgroundMain: "not-a-color",
        backgroundPanel: "#101010",
        backgroundPanelSoft: "#202020",
        inputColor: "#080808",
        textPrimary: "#eeeeee",
        textMuted: "#999999",
      },
    }).customTheme;

    expect(custom.accent).toBe("#ff0000");
    expect(custom.backgroundMain).toBe(CUSTOM_THEME_DEFAULTS.backgroundMain);
    expect(custom.backgroundPanel).toBe("#101010");
    expect(normalizeSettings({}).customTheme).toEqual(CUSTOM_THEME_DEFAULTS);
  });

  it("clamps the average auto-select time", () => {
    expect(DEFAULT_SETTINGS.autoSelectAvgSeconds).toBe(4);
    expect(normalizeAutoSelectAvgSeconds(4)).toBe(4);
    expect(normalizeAutoSelectAvgSeconds(0.2)).toBe(1.5);
    expect(normalizeAutoSelectAvgSeconds(99)).toBe(12);
    expect(normalizeAutoSelectAvgSeconds(Number.NaN)).toBe(4);
    expect(normalizeSettings({ autoSelectAvgSeconds: 7.5 }).autoSelectAvgSeconds).toBe(7.5);
    expect(normalizeSettings({}).autoSelectAvgSeconds).toBe(4);
  });

  it("keeps the realistic preset within the clamped range", () => {
    expect(AUTO_SELECT_TEMPO_PRESETS.realistic).toBe(12);
    expect(normalizeAutoSelectAvgSeconds(AUTO_SELECT_TEMPO_PRESETS.realistic)).toBe(12);
    expect(normalizeAutoSelectAvgSeconds(13.333)).toBe(12);
  });

  it("maps tempo presets onto the slider scale anchors", () => {
    expect(autoSelectTempoSecondsToPosition(AUTO_SELECT_TEMPO_PRESETS.brisk)).toBe(0);
    expect(autoSelectTempoSecondsToPosition(AUTO_SELECT_TEMPO_PRESETS.balanced)).toBe(50);
    expect(autoSelectTempoSecondsToPosition(AUTO_SELECT_TEMPO_PRESETS.realistic)).toBe(100);
    expect(autoSelectTempoSecondsToPosition(0.2)).toBe(0);
    expect(autoSelectTempoSecondsToPosition(99)).toBe(100);
  });

  it("maps slider positions back to seconds on a 0.5 step", () => {
    expect(autoSelectTempoPositionToSeconds(0)).toBe(1.5);
    expect(autoSelectTempoPositionToSeconds(50)).toBe(4);
    expect(autoSelectTempoPositionToSeconds(100)).toBe(12);
    expect(autoSelectTempoPositionToSeconds(-5)).toBe(1.5);
    expect(autoSelectTempoPositionToSeconds(105)).toBe(12);

    for (let position = 0; position <= 100; position += 1) {
      const seconds = autoSelectTempoPositionToSeconds(position);
      expect(seconds * 2).toBe(Math.round(seconds * 2));
    }
  });

  it("roundtrips slider positions through seconds", () => {
    for (const seconds of [1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 11, 12]) {
      expect(autoSelectTempoPositionToSeconds(autoSelectTempoSecondsToPosition(seconds))).toBe(
        seconds,
      );
    }
  });

  it("defaults humanization flags to on and preserves explicit choices", () => {
    expect(DEFAULT_SETTINGS.humanTyping).toBe(true);
    expect(DEFAULT_SETTINGS.humanPrecursors).toBe(true);

    const normalized = normalizeSettings({
      humanTyping: false,
      humanPrecursors: false,
    });
    expect(normalized.humanTyping).toBe(false);
    expect(normalized.humanPrecursors).toBe(false);

    const defaults = normalizeSettings({});
    expect(defaults.humanTyping).toBe(true);
    expect(defaults.humanPrecursors).toBe(true);
  });

  it("keeps humanization locale keys in sync between languages", async () => {
    const en = (await import("../src/i18n/locales/en.json")).default as Record<string, string>;
    const ru = (await import("../src/i18n/locales/ru.json")).default as Record<string, string>;
    const keys = [
      "settings.human.title",
      "settings.human.line1",
      "settings.human.line2",
      "settings.humanTyping.title",
      "settings.humanPrecursors.title",
    ];

    for (const key of keys) {
      expect(en[key], `en ${key}`).toBeTruthy();
      expect(ru[key], `ru ${key}`).toBeTruthy();
    }
  });
});

describe("legacy theme migration", () => {
  it("migrates legacy theme names to theme presets", () => {
    expect(normalizeSettings({ theme: "Night" }).themeId).toBe("standard");
    expect(normalizeSettings({ theme: "Devil" }).themeId).toBe("devil");
    expect(normalizeSettings({ theme: "Peace" }).themeId).toBe("forest");
  });

  it("keeps the legacy accent as a custom theme", () => {
    const custom = normalizeSettings({ theme: "Night", accentColor: "#ff0000" });

    expect(custom.themeId).toBe("custom");
    expect(custom.customTheme.accent).toBe("#ff0000");
    expect(normalizeSettings({ theme: "Devil", accentColor: "#00ff00" }).themeId).toBe("custom");
    expect(normalizeSettings({ accentColor: "#00ff00" }).customTheme.accent).toBe("#00ff00");
  });

  it("keeps the default legacy accent on the standard theme", () => {
    expect(normalizeSettings({ theme: "Unknown" as LegacyTheme }).themeId).toBe("standard");
    expect(normalizeSettings({ accentColor: "#9cb9f6" }).themeId).toBe("standard");
  });

  it("seeds the custom theme from the stored light scheme", () => {
    const custom = normalizeSettings({ colorScheme: "light", accentColor: "#123456" });

    expect(custom.themeId).toBe("custom");
    expect(custom.customTheme.backgroundMain).toBe("#e9ecf1");
    expect(custom.customTheme.accent).toBe("#123456");
    expect(normalizeSettings({ colorScheme: "light" }).themeId).toBe("daylight");
    expect(normalizeSettings({}).themeId).toBe("standard");
  });

  it("works with partial legacy settings", () => {
    const legacySettings: Partial<LegacyStoredSettings> = { theme: "Night" };
    expect(normalizeSettings(legacySettings).themeId).toBe("standard");
  });

  it("preserves an explicit theme id over legacy markers", () => {
    const migrated = normalizeSettings({
      themeId: "monochrome",
      theme: "Devil",
      accentColor: "#ff0000",
    });

    expect(migrated.themeId).toBe("monochrome");
    expect(migrated.customTheme).toEqual(CUSTOM_THEME_DEFAULTS);
  });

  it("aliases the removed violet theme to monochrome", () => {
    const migrated = normalizeSettings({ themeId: "violet" as "monochrome" });

    expect(migrated.themeId).toBe("monochrome");
  });
});
