import { describe, expect, it } from "vitest";
import {
  CUSTOM_THEME_DEFAULTS,
  DEFAULT_THEME_ID,
  THEME_PRESET_IDS,
  THEMES,
  deriveCustomPalette,
  getThemeKind,
  isThemeId,
  normalizeCustomThemePalette,
  resolveThemeId,
  resolveThemePalette,
} from "../src/shared/themePalettes";

const PALETTE_KEYS = [
  "accent",
  "accentSoft",
  "accentStrong",
  "backgroundMain",
  "backgroundPanel",
  "backgroundPanelSoft",
  "inputColor",
  "border",
  "borderStrong",
  "muted",
  "disabled",
  "textPrimary",
  "textOnAccent",
  "beta",
  "danger",
  "success",
  "warning",
] as const;

describe("theme presets", () => {
  it("exposes a complete palette for every preset in both kinds", () => {
    for (const id of THEME_PRESET_IDS) {
      const theme = THEMES[id];

      expect(["dark", "light"]).toContain(theme.kind);

      for (const key of PALETTE_KEYS) {
        expect(typeof theme.palette[key], `${id}.${key}`).toBe("string");
        expect(theme.palette[key].length, `${id}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("covers both interface kinds across the preset list", () => {
    const kinds = THEME_PRESET_IDS.map((id) => THEMES[id].kind);

    expect(kinds).toContain("dark");
    expect(kinds).toContain("light");
  });

  it("keeps the standard preset equal to the previous default palette", () => {
    expect(THEMES.standard.kind).toBe("dark");
    expect(THEMES.standard.palette.accent).toBe("#9cb9f6");
    expect(THEMES.standard.palette.backgroundMain).toBe("#222322");
    expect(THEMES.daylight.kind).toBe("light");
    expect(THEMES.daylight.palette.backgroundMain).toBe("#e9ecf1");
  });

  it("validates theme ids", () => {
    expect(isThemeId("ocean")).toBe(true);
    expect(isThemeId("custom")).toBe(true);
    expect(isThemeId("Night")).toBe(false);
    expect(isThemeId(42)).toBe(false);
    expect(DEFAULT_THEME_ID).toBe("standard");
  });
});

describe("resolveThemePalette", () => {
  it("returns the preset palette for a valid theme id", () => {
    expect(resolveThemePalette({ themeId: "ocean" })).toBe(THEMES.ocean.palette);
    expect(resolveThemePalette({ themeId: "pearl" })).toBe(THEMES.pearl.palette);
  });

  it("falls back to standard for missing or invalid ids", () => {
    expect(resolveThemePalette(undefined)).toBe(THEMES.standard.palette);
    expect(resolveThemePalette({ themeId: "broken" })).toBe(THEMES.standard.palette);
  });

  it("derives a custom palette from the stored fields", () => {
    const palette = resolveThemePalette({
      themeId: "custom",
      customTheme: {
        ...CUSTOM_THEME_DEFAULTS,
        accent: "#ff0000",
        backgroundMain: "#101418",
      },
    });

    expect(palette.accent).toBe("#ff0000");
    expect(palette.backgroundMain).toBe("#101418");
    expect(palette.border).toBe("rgba(255, 255, 255, 0.13)");
  });

  it("derives light borders and on-accent text from the palette kind", () => {
    const palette = deriveCustomPalette({
      ...CUSTOM_THEME_DEFAULTS,
      backgroundMain: "#f4f4f4",
      textPrimary: "#111111",
    });

    expect(palette.border).toBe("rgba(17, 17, 17, 0.12)");
    expect(palette.borderStrong).toBe("rgba(17, 17, 17, 0.22)");
    expect(palette.textOnAccent).toBe("#14171d");
    expect(palette.success).toBe("#1f9d4d");
  });

  it("normalizes custom palette colors", () => {
    const normalized = normalizeCustomThemePalette({
      accent: "#ABCDEF",
      backgroundMain: "junk",
      backgroundPanel: "#101010",
    });

    expect(normalized.accent).toBe("#abcdef");
    expect(normalized.backgroundMain).toBe(CUSTOM_THEME_DEFAULTS.backgroundMain);
    expect(normalized.backgroundPanel).toBe("#101010");
    expect(normalized.textPrimary).toBe(CUSTOM_THEME_DEFAULTS.textPrimary);
    expect(normalizeCustomThemePalette(undefined)).toEqual(CUSTOM_THEME_DEFAULTS);
  });
});

describe("getThemeKind", () => {
  it("returns the preset kind", () => {
    expect(getThemeKind({ themeId: "standard" })).toBe("dark");
    expect(getThemeKind({ themeId: "daylight" })).toBe("light");
  });

  it("derives the custom kind from the background luminance", () => {
    expect(getThemeKind({ themeId: "custom", customTheme: CUSTOM_THEME_DEFAULTS })).toBe("dark");
    expect(
      getThemeKind({
        themeId: "custom",
        customTheme: { ...CUSTOM_THEME_DEFAULTS, backgroundMain: "#f0f0f0" },
      }),
    ).toBe("light");
  });
});

describe("legacy theme resolution", () => {
  it("maps legacy theme names to presets", () => {
    expect(resolveThemeId({ theme: "Night" })).toBe("standard");
    expect(resolveThemeId({ theme: "Devil" })).toBe("devil");
    expect(resolveThemeId({ theme: "Peace" })).toBe("forest");
  });

  it("prefers an explicit legacy accent over the legacy theme name", () => {
    expect(resolveThemeId({ theme: "Devil", accentColor: "#ff0000" })).toBe("custom");
    expect(resolveThemeId({ accentColor: "#FF0000" })).toBe("custom");
    expect(resolveThemeId({ theme: "Night", accentColor: "#9cb9f6" })).toBe("standard");
  });
});
