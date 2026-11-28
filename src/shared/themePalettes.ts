export type ThemeId =
  "standard" | "daylight" | "ocean" | "devil" | "forest" | "monochrome" | "pearl" | "custom";

export type ThemeKind = "dark" | "light";

export const DEFAULT_THEME_ID: ThemeId = "standard";
export const DEFAULT_ACCENT_COLOR = "#9cb9f6";

export const THEME_PRESET_IDS = [
  "standard",
  "daylight",
  "ocean",
  "devil",
  "forest",
  "monochrome",
  "pearl",
] as const satisfies readonly Exclude<ThemeId, "custom">[];

const LEGACY_THEME_ID_ALIASES = {
  violet: "monochrome",
} as const satisfies Record<string, ThemeId>;

const THEME_ID_SET = new Set<string>([...THEME_PRESET_IDS, "custom"]);

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_ID_SET.has(value);
}

export interface ThemePalette {
  accent: string;
  accentSoft: string;
  accentStrong: string;
  backgroundMain: string;
  backgroundPanel: string;
  backgroundPanelSoft: string;
  inputColor: string;
  border: string;
  borderStrong: string;
  muted: string;
  disabled: string;
  textPrimary: string;
  textOnAccent: string;
  beta: string;
  danger: string;
  success: string;
  warning: string;
}

export interface ThemeDefinition {
  kind: ThemeKind;
  palette: ThemePalette;
}

const DARK_STATUS_COLORS = {
  beta: "#ff9aa0",
  danger: "#ff8589",
  success: "#4ade80",
  warning: "#ffd166",
} as const;

const LIGHT_STATUS_COLORS = {
  beta: "#ff9aa0",
  danger: "#d9484f",
  success: "#1f9d4d",
  warning: "#b7791f",
} as const;

const darkPalette = (
  palette: Omit<ThemePalette, keyof typeof DARK_STATUS_COLORS>,
): ThemePalette => ({
  ...palette,
  ...DARK_STATUS_COLORS,
});

const lightPalette = (
  palette: Omit<ThemePalette, keyof typeof LIGHT_STATUS_COLORS>,
): ThemePalette => ({
  ...palette,
  ...LIGHT_STATUS_COLORS,
});

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  standard: {
    kind: "dark",
    palette: darkPalette({
      accent: "#9cb9f6",
      accentSoft: "#bed0fb",
      accentStrong: "#64779f",
      backgroundMain: "#222322",
      backgroundPanel: "#242525",
      backgroundPanelSoft: "#292a2a",
      inputColor: "#1e1f1f",
      border: "rgba(255, 255, 255, 0.13)",
      borderStrong: "rgba(255, 255, 255, 0.19)",
      muted: "#aaa9a9",
      disabled: "#898989",
      textPrimary: "#ffffff",
      textOnAccent: "#070707",
    }),
  },
  daylight: {
    kind: "light",
    palette: lightPalette({
      accent: "#9cb9f6",
      accentSoft: "#bed0fb",
      accentStrong: "#6880b4",
      backgroundMain: "#e9ecf1",
      backgroundPanel: "#ffffff",
      backgroundPanelSoft: "#eff1f6",
      inputColor: "#ffffff",
      border: "rgba(15, 20, 35, 0.12)",
      borderStrong: "rgba(15, 20, 35, 0.22)",
      muted: "#5d6675",
      disabled: "#9aa1ad",
      textPrimary: "#14171d",
      textOnAccent: "#070707",
    }),
  },
  ocean: {
    kind: "dark",
    palette: darkPalette({
      accent: "#5eead4",
      accentSoft: "#8bf0e0",
      accentStrong: "#3e978e",
      backgroundMain: "#16202b",
      backgroundPanel: "#192430",
      backgroundPanelSoft: "#1e2b39",
      inputColor: "#131c26",
      border: "rgba(191, 219, 254, 0.13)",
      borderStrong: "rgba(191, 219, 254, 0.19)",
      muted: "#9fb4c8",
      disabled: "#7a8da0",
      textPrimary: "#eaf2f9",
      textOnAccent: "#06201d",
    }),
  },
  devil: {
    kind: "dark",
    palette: darkPalette({
      accent: "#ff6b6f",
      accentSoft: "#ff9497",
      accentStrong: "#a44649",
      backgroundMain: "#0f0d0d",
      backgroundPanel: "#161213",
      backgroundPanelSoft: "#1c1617",
      inputColor: "#120e0f",
      border: "rgba(255, 130, 135, 0.13)",
      borderStrong: "rgba(255, 130, 135, 0.19)",
      muted: "#a89899",
      disabled: "#7c6f70",
      textPrimary: "#f9eff0",
      textOnAccent: "#1a0507",
    }),
  },
  forest: {
    kind: "dark",
    palette: darkPalette({
      accent: "#76d982",
      accentSoft: "#9ce4a5",
      accentStrong: "#4c8b54",
      backgroundMain: "#17201a",
      backgroundPanel: "#19231d",
      backgroundPanelSoft: "#1e2a23",
      inputColor: "#121a15",
      border: "rgba(199, 240, 206, 0.13)",
      borderStrong: "rgba(199, 240, 206, 0.19)",
      muted: "#a2b3a6",
      disabled: "#7c8b80",
      textPrimary: "#edf6ee",
      textOnAccent: "#071608",
    }),
  },
  monochrome: {
    kind: "dark",
    palette: darkPalette({
      accent: "#f5f5f5",
      accentSoft: "#f8f8f8",
      accentStrong: "#999b9e",
      backgroundMain: "#0b0b0b",
      backgroundPanel: "#131313",
      backgroundPanelSoft: "#191919",
      inputColor: "#0e0e0e",
      border: "rgba(255, 255, 255, 0.12)",
      borderStrong: "rgba(255, 255, 255, 0.18)",
      muted: "#a3a3a3",
      disabled: "#757575",
      textPrimary: "#fafafa",
      textOnAccent: "#0d0d0d",
    }),
  },
  pearl: {
    kind: "light",
    palette: lightPalette({
      accent: "#14b8a6",
      accentSoft: "#56ccbf",
      accentStrong: "#118078",
      backgroundMain: "#edf3f2",
      backgroundPanel: "#ffffff",
      backgroundPanelSoft: "#e4eeec",
      inputColor: "#ffffff",
      border: "rgba(13, 42, 53, 0.12)",
      borderStrong: "rgba(13, 42, 53, 0.22)",
      muted: "#52646b",
      disabled: "#97a7ab",
      textPrimary: "#101d21",
      textOnAccent: "#06201d",
    }),
  },
  custom: {
    kind: "dark",
    palette: darkPalette({
      accent: "#9cb9f6",
      accentSoft: "#bed0fb",
      accentStrong: "#64779f",
      backgroundMain: "#222322",
      backgroundPanel: "#242525",
      backgroundPanelSoft: "#292a2a",
      inputColor: "#1e1f1f",
      border: "rgba(255, 255, 255, 0.13)",
      borderStrong: "rgba(255, 255, 255, 0.19)",
      muted: "#aaa9a9",
      disabled: "#898989",
      textPrimary: "#ffffff",
      textOnAccent: "#070707",
    }),
  },
};

export interface CustomThemePalette {
  accent: string;
  backgroundMain: string;
  backgroundPanel: string;
  backgroundPanelSoft: string;
  inputColor: string;
  textPrimary: string;
  textMuted: string;
}

export const CUSTOM_THEME_DEFAULTS: CustomThemePalette = {
  accent: "#9cb9f6",
  backgroundMain: "#222322",
  backgroundPanel: "#242525",
  backgroundPanelSoft: "#292a2a",
  inputColor: "#1e1f1f",
  textPrimary: "#ffffff",
  textMuted: "#aaa9a9",
};

export interface ThemeSettingsLike {
  themeId?: unknown;
  theme?: unknown;
  accentColor?: unknown;
  colorScheme?: unknown;
  customTheme?: unknown;
}

function parseHexColor(hexColor: string) {
  const normalizedColor = /^#[0-9a-f]{6}$/i.test(hexColor)
    ? hexColor.slice(1)
    : DEFAULT_ACCENT_COLOR.slice(1);

  return {
    red: Number.parseInt(normalizedColor.slice(0, 2), 16),
    green: Number.parseInt(normalizedColor.slice(2, 4), 16),
    blue: Number.parseInt(normalizedColor.slice(4, 6), 16),
  };
}

export function getRgbCssValue(hexColor: string) {
  const { red, green, blue } = parseHexColor(hexColor);
  return `${red}, ${green}, ${blue}`;
}

export function mixHexColors(baseHexColor: string, targetHexColor: string, amount: number) {
  const base = parseHexColor(baseHexColor);
  const target = parseHexColor(targetHexColor);
  const channel = (baseValue: number, targetValue: number) => {
    return Math.round(baseValue + (targetValue - baseValue) * amount);
  };

  return `#${[
    channel(base.red, target.red),
    channel(base.green, target.green),
    channel(base.blue, target.blue),
  ]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function normalizeHexColor(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim().toLowerCase();

  return /^#[0-9a-f]{6}$/.test(trimmedValue) ? trimmedValue : fallback;
}

function isLightHex(hexColor: string) {
  const { red, green, blue } = parseHexColor(hexColor);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.55;
}

function isNearWhiteHex(hexColor: string) {
  const { red, green, blue } = parseHexColor(hexColor);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255 > 0.85;
}

export function getSwitchHandleColor(accentHex: string, onAccentColor: string): string {
  return isNearWhiteHex(accentHex) ? onAccentColor : "#ffffff";
}

export function normalizeCustomThemePalette(value: unknown): CustomThemePalette {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<CustomThemePalette>;

  return {
    accent: normalizeHexColor(raw.accent, CUSTOM_THEME_DEFAULTS.accent),
    backgroundMain: normalizeHexColor(raw.backgroundMain, CUSTOM_THEME_DEFAULTS.backgroundMain),
    backgroundPanel: normalizeHexColor(raw.backgroundPanel, CUSTOM_THEME_DEFAULTS.backgroundPanel),
    backgroundPanelSoft: normalizeHexColor(
      raw.backgroundPanelSoft,
      CUSTOM_THEME_DEFAULTS.backgroundPanelSoft,
    ),
    inputColor: normalizeHexColor(raw.inputColor, CUSTOM_THEME_DEFAULTS.inputColor),
    textPrimary: normalizeHexColor(raw.textPrimary, CUSTOM_THEME_DEFAULTS.textPrimary),
    textMuted: normalizeHexColor(raw.textMuted, CUSTOM_THEME_DEFAULTS.textMuted),
  };
}

export function customPaletteFromPalette(palette: ThemePalette): CustomThemePalette {
  return {
    accent: palette.accent,
    backgroundMain: palette.backgroundMain,
    backgroundPanel: palette.backgroundPanel,
    backgroundPanelSoft: palette.backgroundPanelSoft,
    inputColor: palette.inputColor,
    textPrimary: palette.textPrimary,
    textMuted: palette.muted,
  };
}

export function deriveCustomPalette(custom: CustomThemePalette): ThemePalette {
  const kind: ThemeKind = isLightHex(custom.backgroundMain) ? "light" : "dark";
  const status = kind === "light" ? LIGHT_STATUS_COLORS : DARK_STATUS_COLORS;
  const textRgb = getRgbCssValue(custom.textPrimary);
  const ink = kind === "light" ? "#1b2a52" : "#10131c";

  return {
    accent: custom.accent,
    accentSoft: mixHexColors(custom.accent, "#ffffff", 0.28),
    accentStrong: mixHexColors(custom.accent, ink, 0.4),
    backgroundMain: custom.backgroundMain,
    backgroundPanel: custom.backgroundPanel,
    backgroundPanelSoft: custom.backgroundPanelSoft,
    inputColor: custom.inputColor,
    border: kind === "light" ? `rgba(${textRgb}, 0.12)` : `rgba(${textRgb}, 0.13)`,
    borderStrong: kind === "light" ? `rgba(${textRgb}, 0.22)` : `rgba(${textRgb}, 0.19)`,
    muted: custom.textMuted,
    disabled: mixHexColors(custom.textMuted, custom.backgroundMain, 0.3),
    textPrimary: custom.textPrimary,
    textOnAccent: isLightHex(custom.accent) ? "#14171d" : "#ffffff",
    ...status,
  };
}

export function resolveThemeId(settings: ThemeSettingsLike | undefined): ThemeId {
  if (isThemeId(settings?.themeId)) {
    return settings.themeId;
  }

  const rawThemeId = typeof settings?.themeId === "string" ? settings.themeId : "";
  const aliasedThemeId =
    LEGACY_THEME_ID_ALIASES[rawThemeId as keyof typeof LEGACY_THEME_ID_ALIASES];

  if (aliasedThemeId) {
    return aliasedThemeId;
  }

  const legacyAccent = normalizeHexColor(settings?.accentColor, "");

  if (legacyAccent && legacyAccent !== DEFAULT_ACCENT_COLOR) {
    return "custom";
  }

  const legacyTheme = typeof settings?.theme === "string" ? settings.theme : "";

  if (legacyTheme === "Devil") {
    return "devil";
  }

  if (legacyTheme === "Peace") {
    return "forest";
  }

  return DEFAULT_THEME_ID;
}

export function resolveLegacyColorSchemeKind(colorScheme: unknown): ThemeKind {
  if (colorScheme === "light") {
    return "light";
  }

  if (
    colorScheme === "system" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  return "dark";
}

function resolveLegacyCustomPalette(settings: ThemeSettingsLike | undefined): CustomThemePalette {
  const palette =
    resolveLegacyColorSchemeKind(settings?.colorScheme) === "light"
      ? THEMES.daylight.palette
      : THEMES.standard.palette;
  const base = customPaletteFromPalette(palette);
  const legacyAccent = normalizeHexColor(settings?.accentColor, "");

  return legacyAccent ? { ...base, accent: legacyAccent } : base;
}

export function resolveThemePalette(settings: ThemeSettingsLike | undefined): ThemePalette {
  const themeId = resolveThemeId(settings);

  if (themeId !== "custom") {
    return THEMES[themeId].palette;
  }

  if (!settings?.customTheme) {
    return deriveCustomPalette(resolveLegacyCustomPalette(settings));
  }

  return deriveCustomPalette(normalizeCustomThemePalette(settings.customTheme));
}

export function getThemeKind(settings: ThemeSettingsLike | undefined): ThemeKind {
  const themeId = resolveThemeId(settings);

  if (themeId !== "custom") {
    return THEMES[themeId].kind;
  }

  const custom = settings?.customTheme
    ? normalizeCustomThemePalette(settings.customTheme)
    : resolveLegacyCustomPalette(settings);

  return isLightHex(custom.backgroundMain) ? "light" : "dark";
}
