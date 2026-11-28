export interface ThemeSplashTrigger {
  (themeId: string, hydrated: boolean): boolean;
}

export function createThemeSplashTrigger(): ThemeSplashTrigger {
  let baselineThemeId: string | null = null;

  return (themeId, hydrated) => {
    if (!hydrated) {
      return false;
    }

    const previousThemeId = baselineThemeId;
    baselineThemeId = themeId;

    return previousThemeId !== null && previousThemeId !== themeId;
  };
}
