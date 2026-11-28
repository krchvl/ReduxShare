import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { Header } from "./Header";
import type { UpdateState } from "../types";
import {
  deriveCustomPalette,
  getThemeKind,
  normalizeCustomThemePalette,
  resolveThemeId,
  THEMES,
  type CustomThemePalette,
  type ThemeId,
  type ThemePalette,
} from "../shared/themePalettes";

interface ShellProps {
  children: ReactNode;
  extensionEnabled: boolean;
  themeId: ThemeId;
  customTheme: CustomThemePalette;
  updateState: UpdateState;
  popupOpacity: number;
  showHeader?: boolean;
}

const DISABLED_ACCENT_COLOR = "#9ca3aa";
const DISABLED_ACCENT_SOFT_COLOR = "#c1c6cc";

const POPUP_PALETTE_VARS = {
  "--accent": "accent",
  "--accent-soft": "accentSoft",
  "--accent-strong": "accentStrong",
  "--background-main": "backgroundMain",
  "--background-panel": "backgroundPanel",
  "--background-panel-soft": "backgroundPanelSoft",
  "--input-color": "inputColor",
  "--border": "border",
  "--border-strong": "borderStrong",
  "--muted": "muted",
  "--disabled": "disabled",
  "--white": "textPrimary",
  "--black": "textOnAccent",
  "--beta": "beta",
  "--danger": "danger",
  "--success": "success",
  "--warning": "warning",
} as const satisfies Record<string, keyof ThemePalette>;

export function Shell({
  children,
  extensionEnabled,
  themeId,
  customTheme,
  updateState,
  popupOpacity,
  showHeader = true,
}: ShellProps) {
  const resolvedThemeId = resolveThemeId({ themeId });
  const palette = useMemo<ThemePalette>(
    () =>
      resolvedThemeId === "custom"
        ? deriveCustomPalette(normalizeCustomThemePalette(customTheme))
        : THEMES[resolvedThemeId].palette,
    [resolvedThemeId, customTheme],
  );
  const themeKind = useMemo(() => getThemeKind({ themeId, customTheme }), [themeId, customTheme]);
  const accentColor = extensionEnabled ? palette.accent : DISABLED_ACCENT_COLOR;
  const accentSoftColor = extensionEnabled ? palette.accentSoft : DISABLED_ACCENT_SOFT_COLOR;

  useEffect(() => {
    const root = document.documentElement;

    root.dataset.theme = themeKind;

    for (const [cssVar, paletteKey] of Object.entries(POPUP_PALETTE_VARS)) {
      root.style.setProperty(cssVar, palette[paletteKey]);
    }

    root.style.setProperty("--accent", accentColor);
    root.style.setProperty("--accent-soft", accentSoftColor);
  }, [palette, accentColor, accentSoftColor, themeKind]);

  const shellStyle = {
    "--accent": accentColor,
    "--accent-soft": accentSoftColor,
    opacity: popupOpacity,
  } as CSSProperties;

  return (
    <main
      className="popup-shell"
      data-extension-enabled={extensionEnabled ? "true" : "false"}
      style={shellStyle}
    >
      {showHeader && <Header updateState={updateState} />}
      {children}
    </main>
  );
}
