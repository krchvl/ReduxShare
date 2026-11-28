import type { StoredStateLike } from "../model";
import { currentStoredState } from "../state";
import {
  getRgbCssValue,
  getThemeKind,
  mixHexColors,
  resolveThemePalette,
  THEMES,
  type ThemePalette,
} from "../shared/themePalettes";

export { getRgbCssValue, mixHexColors };

type ThemeSettings = StoredStateLike["settings"];

export function getThemePalette(settings: ThemeSettings | undefined) {
  return resolveThemePalette(settings);
}

export function getAccentColor(settings: ThemeSettings | undefined) {
  return resolveThemePalette(settings).accent;
}

export function getContentThemeKind() {
  return getThemeKind(currentStoredState?.settings);
}

const CONTENT_VAR_KEYS = {
  "--reduxshare-accent": "accent",
  "--reduxshare-accent-soft": "accentSoft",
  "--reduxshare-accent-strong": "accentStrong",
  "--reduxshare-bg": "backgroundMain",
  "--reduxshare-panel": "backgroundPanel",
  "--reduxshare-panel-soft": "backgroundPanelSoft",
  "--reduxshare-input": "inputColor",
  "--reduxshare-border": "border",
  "--reduxshare-border-strong": "borderStrong",
  "--reduxshare-text": "textPrimary",
  "--reduxshare-text-on-accent": "textOnAccent",
  "--reduxshare-muted": "muted",
  "--reduxshare-disabled": "disabled",
  "--reduxshare-beta": "beta",
  "--reduxshare-danger": "danger",
  "--reduxshare-success": "success",
  "--reduxshare-warning": "warning",
} as const satisfies Record<string, keyof ThemePalette>;

export function applyContentThemeToHost(host: HTMLElement) {
  const settings = currentStoredState?.settings;
  const palette = resolveThemePalette(settings);

  for (const [cssVar, paletteKey] of Object.entries(CONTENT_VAR_KEYS)) {
    host.style.setProperty(cssVar, palette[paletteKey]);
  }

  host.style.setProperty("--reduxshare-accent-rgb", getRgbCssValue(palette.accent));
  host.dataset.theme = getThemeKind(settings);
}

export const CONTENT_THEME_HOST_DEFAULTS = [
  ...Object.entries(CONTENT_VAR_KEYS).map(
    ([cssVar, paletteKey]) => `${cssVar}: ${THEMES.standard.palette[paletteKey]};`,
  ),
  `--reduxshare-accent-rgb: ${getRgbCssValue(THEMES.standard.palette.accent)};`,
].join("\n");
