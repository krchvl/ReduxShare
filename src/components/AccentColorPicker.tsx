import { useEffect, useId, useState } from "react";
import type { CSSProperties } from "react";
import { useI18n } from "../i18n/react";

interface AccentColorPickerProps {
  value: string;
  onChange: (accentColor: string) => void;
}

const PRESET_COLORS = ["#9cb9f6", "#ff6b6f", "#78dc8b", "#f4c76b", "#c084fc", "#5eead4"] as const;

function normalizeColorInput(value: string) {
  const trimmedValue = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmedValue)) {
    return trimmedValue.toLowerCase();
  }

  if (/^[0-9a-f]{6}$/i.test(trimmedValue)) {
    return `#${trimmedValue.toLowerCase()}`;
  }

  return null;
}

export function AccentColorPicker({ value, onChange }: AccentColorPickerProps) {
  const { t } = useI18n();
  const colorInputId = useId();
  const [draftValue, setDraftValue] = useState(value.toUpperCase());

  useEffect(() => {
    setDraftValue(value.toUpperCase());
  }, [value]);

  function commitTextColor(textValue: string) {
    const normalizedColor = normalizeColorInput(textValue);

    if (normalizedColor) {
      onChange(normalizedColor);
    }

    return normalizedColor;
  }

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
      <input
        className="accent-picker__hex"
        value={draftValue}
        aria-label={t("settings.accent.hex")}
        spellCheck={false}
        maxLength={7}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (/^#?[0-9a-f]{0,6}$/i.test(nextValue)) {
            setDraftValue(nextValue.startsWith("#") ? nextValue.toUpperCase() : `#${nextValue.toUpperCase()}`);
            commitTextColor(nextValue);
          }
        }}
        onBlur={(event) => {
          const normalizedColor = commitTextColor(event.target.value);
          setDraftValue((normalizedColor ?? value).toUpperCase());
        }}
      />
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
