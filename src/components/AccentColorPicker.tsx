import { useId } from "react";
import type { CSSProperties } from "react";
import { useI18n } from "../i18n/react";

interface AccentColorPickerProps {
  value: string;
  onChange: (accentColor: string) => void;
}

const PRESET_COLORS = ["#9cb9f6", "#ff6b6f", "#78dc8b", "#f4c76b", "#c084fc", "#5eead4"] as const;

export function AccentColorPicker({ value, onChange }: AccentColorPickerProps) {
  const { t } = useI18n();
  const colorInputId = useId();

  return (
    <div className="accent-picker">
      <label className="accent-picker__trigger" htmlFor={colorInputId}>
        <span className="accent-picker__swatch" style={{ "--picked-color": value } as CSSProperties} />
        <span>{value.toUpperCase()}</span>
        <input
          id={colorInputId}
          className="accent-picker__native"
          type="color"
          value={value}
          aria-label={t("settings.accent.aria")}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
        />
      </label>
      <div className="accent-picker__presets" aria-label={t("settings.accent.presets")}>
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            className={`accent-picker__preset ${color === value ? "accent-picker__preset--active" : ""}`}
            type="button"
            style={{ "--picked-color": color } as CSSProperties}
            aria-label={color}
            aria-pressed={color === value}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}
