import { CustomSelect, type CustomSelectOption } from "./CustomSelect";
import { LANGUAGE_OPTIONS, isLanguageSetting, type TranslationKey } from "../i18n";
import { useI18n } from "../i18n/react";
import type { LanguageSetting } from "../types";

interface LanguageSelectProps {
  value: LanguageSetting;
  onChange: (language: LanguageSetting) => void;
}

function LanguageCode({ value }: { value: LanguageSetting }) {
  return (
    <span className="language-code" aria-hidden="true">
      {value === "auto" ? <span>A</span> : value === "ru" ? "🇷🇺" : "🇺🇸"}
    </span>
  );
}

export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
  const { t } = useI18n();

  const options: CustomSelectOption[] = LANGUAGE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.labelKey as TranslationKey),
    icon: <LanguageCode value={option.value} />,
  }));

  return (
    <CustomSelect
      className="language-select"
      value={value}
      options={options}
      onChange={(next) => {
        if (isLanguageSetting(next)) {
          onChange(next);
        }
      }}
      ariaLabel={t("language.select.label")}
      listLabel={t("language.select.list")}
    />
  );
}
