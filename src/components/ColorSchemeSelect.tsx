import type { ReactNode } from "react";
import { type TranslationKey } from "../i18n";
import { useI18n } from "../i18n/react";
import type { ColorSchemeSetting } from "../types";
import { TabCard, TabCardGroup } from "./TabCard";

interface ColorSchemeSelectProps {
  value: ColorSchemeSetting;
  onChange: (colorScheme: ColorSchemeSetting) => void;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4.4" />
      <path
        strokeLinecap="round"
        d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4.5" width="18" height="12.5" rx="1.6" />
      <path strokeLinecap="round" d="M8.5 20.5h7M12 17v3.5" />
    </svg>
  );
}

const COLOR_SCHEME_OPTIONS: Array<{
  value: ColorSchemeSetting;
  labelKey: TranslationKey;
  icon: ReactNode;
}> = [
  { value: "light", labelKey: "settings.theme.light", icon: <SunIcon /> },
  { value: "dark", labelKey: "settings.theme.dark", icon: <MoonIcon /> },
  { value: "system", labelKey: "settings.theme.system", icon: <SystemIcon /> },
];

export function ColorSchemeSelect({ value, onChange }: ColorSchemeSelectProps) {
  const { t } = useI18n();

  return (
    <TabCardGroup label={t("settings.theme.title")} columns={3}>
      {COLOR_SCHEME_OPTIONS.map((option) => (
        <TabCard
          key={option.value}
          icon={option.icon}
          label={t(option.labelKey)}
          role="radio"
          active={option.value === value}
          onClick={() => onChange(option.value)}
        />
      ))}
    </TabCardGroup>
  );
}
