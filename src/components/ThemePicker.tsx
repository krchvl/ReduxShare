import { useId, type CSSProperties } from "react";
import type { TranslationKey } from "../i18n";
import { useI18n } from "../i18n/react";
import {
  CUSTOM_THEME_DEFAULTS,
  THEME_PRESET_IDS,
  THEMES,
  deriveCustomPalette,
  normalizeCustomThemePalette,
  type CustomThemePalette,
  type ThemeId,
  type ThemePalette,
} from "../shared/themePalettes";

interface ThemePickerProps {
  themeId: ThemeId;
  customTheme: CustomThemePalette;
  onThemeChange: (themeId: ThemeId) => void;
  onCustomThemeChange: (customTheme: CustomThemePalette) => void;
}

const THEME_NAME_KEYS: Record<ThemeId, TranslationKey> = {
  standard: "settings.theme.preset.standard",
  daylight: "settings.theme.preset.daylight",
  devil: "settings.theme.preset.devil",
  rose: "settings.theme.preset.rose",
  forest: "settings.theme.preset.forest",
  mint: "settings.theme.preset.mint",
  monochrome: "settings.theme.preset.monochrome",
  pearl: "settings.theme.preset.pearl",
  custom: "settings.theme.preset.custom",
};

const CUSTOM_FIELDS: Array<{ key: keyof CustomThemePalette; labelKey: TranslationKey }> = [
  { key: "accent", labelKey: "settings.theme.custom.accent" },
  { key: "backgroundMain", labelKey: "settings.theme.custom.backgroundMain" },
  { key: "backgroundPanel", labelKey: "settings.theme.custom.backgroundPanel" },
  { key: "backgroundPanelSoft", labelKey: "settings.theme.custom.backgroundPanelSoft" },
  { key: "inputColor", labelKey: "settings.theme.custom.inputColor" },
  { key: "textPrimary", labelKey: "settings.theme.custom.textPrimary" },
  { key: "textMuted", labelKey: "settings.theme.custom.textMuted" },
];

function resolvePickerPalette(themeId: ThemeId, customTheme: CustomThemePalette): ThemePalette {
  return themeId === "custom"
    ? deriveCustomPalette(normalizeCustomThemePalette(customTheme))
    : THEMES[themeId].palette;
}

function ThemeCardPreview({ palette }: { palette: ThemePalette }) {
  return (
    <span
      className="theme-picker__preview"
      style={
        {
          "--theme-preview-bg": palette.backgroundMain,
          "--theme-preview-panel": palette.backgroundPanel,
          "--theme-preview-text": palette.textPrimary,
          "--theme-preview-accent": palette.accent,
        } as CSSProperties
      }
    >
      <span className="theme-picker__preview-lines">
        <span className="theme-picker__preview-line" />
        <span className="theme-picker__preview-line theme-picker__preview-line--short" />
      </span>
      <span className="theme-picker__preview-accent" />
    </span>
  );
}

export function ThemePicker({
  themeId,
  customTheme,
  onThemeChange,
  onCustomThemeChange,
}: ThemePickerProps) {
  const { t } = useI18n();
  const editorIdPrefix = useId();
  const pickerPalette = resolvePickerPalette(themeId, customTheme);
  const lightPresetIds = THEME_PRESET_IDS.filter((id) => THEMES[id].kind === "light");
  const darkPresetIds = THEME_PRESET_IDS.filter((id) => THEMES[id].kind === "dark");

  const renderThemeCard = (id: ThemeId, extraClassName = "") => (
    <button
      key={id}
      type="button"
      role="radio"
      aria-checked={id === themeId}
      className={`theme-picker__card ${extraClassName} ${id === themeId ? "theme-picker__card--active" : ""}`}
      onClick={() => onThemeChange(id)}
    >
      <ThemeCardPreview palette={resolvePickerPalette(id, customTheme)} />
      <span className="theme-picker__name">{t(THEME_NAME_KEYS[id])}</span>
    </button>
  );

  return (
    <div className="theme-picker">
      <div
        role="radiogroup"
        aria-label={t("settings.theme.title")}
        className="theme-picker__groups"
      >
        <span className="theme-picker__group-label">{t("settings.theme.group.light")}</span>
        <div className="theme-picker__grid theme-picker__grid--light">
          {lightPresetIds.map((id) => renderThemeCard(id))}
        </div>
        <span className="theme-picker__group-label">{t("settings.theme.group.dark")}</span>
        <div className="theme-picker__grid theme-picker__grid--dark">
          {darkPresetIds.map((id) => renderThemeCard(id))}
        </div>
        <div className="theme-picker__grid theme-picker__grid--custom">
          {renderThemeCard("custom", "theme-picker__card--wide")}
        </div>
      </div>
      {themeId === "custom" && (
        <div
          className="theme-picker__editor"
          style={
            {
              "--theme-preview-bg": pickerPalette.backgroundMain,
              "--theme-preview-panel": pickerPalette.backgroundPanel,
              "--theme-preview-text": pickerPalette.textPrimary,
              "--theme-preview-accent": pickerPalette.accent,
            } as CSSProperties
          }
        >
          <div className="theme-picker__fields">
            {CUSTOM_FIELDS.map(({ key, labelKey }) => {
              const fieldId = `${editorIdPrefix}-${key}`;
              const fieldValue = customTheme[key];

              return (
                <label key={key} className="theme-picker__field" htmlFor={fieldId}>
                  <span className="theme-picker__field-label">{t(labelKey)}</span>
                  <span
                    className="theme-picker__field-swatch"
                    style={{ "--picked-color": fieldValue } as CSSProperties}
                  >
                    <input
                      id={fieldId}
                      className="theme-picker__field-native"
                      type="color"
                      value={fieldValue}
                      aria-label={t(labelKey)}
                      onChange={(event) =>
                        onCustomThemeChange({
                          ...normalizeCustomThemePalette(customTheme),
                          [key]: event.target.value.toLowerCase(),
                        })
                      }
                    />
                  </span>
                  <span className="theme-picker__field-value">{fieldValue.toUpperCase()}</span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            className="theme-picker__reset"
            onClick={() => onCustomThemeChange({ ...CUSTOM_THEME_DEFAULTS })}
          >
            {t("settings.theme.custom.reset")}
          </button>
        </div>
      )}
    </div>
  );
}
