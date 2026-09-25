import { DEFAULT_ACCENT_COLOR, LEGACY_THEME_ACCENTS, type StoredStateLike } from "../model";
import { currentStoredState } from "../state";

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

export function getAccentColor(settings: StoredStateLike["settings"] | undefined) {
  const accentColor = settings?.accentColor;

  if (typeof accentColor === "string" && /^#[0-9a-f]{6}$/i.test(accentColor.trim())) {
    return accentColor.trim().toLowerCase();
  }

  const legacyTheme = settings?.theme;

  if (
    typeof legacyTheme === "string" &&
    Object.prototype.hasOwnProperty.call(LEGACY_THEME_ACCENTS, legacyTheme)
  ) {
    return LEGACY_THEME_ACCENTS[legacyTheme as keyof typeof LEGACY_THEME_ACCENTS];
  }

  return DEFAULT_ACCENT_COLOR;
}

export function applyContentColorSchemeToHost(host: HTMLElement) {
  host.dataset.theme = getContentColorScheme();
}

export type ContentColorScheme = "light" | "dark";

export function resolveContentColorScheme(colorScheme: string | undefined): ContentColorScheme {
  if (colorScheme === "light" || colorScheme === "dark") {
    return colorScheme;
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  return "dark";
}

export function getContentColorScheme() {
  return resolveContentColorScheme(currentStoredState?.settings?.colorScheme);
}
