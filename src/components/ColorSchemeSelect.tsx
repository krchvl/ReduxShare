import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { type TranslationKey } from "../i18n";
import { useI18n } from "../i18n/react";
import type { ColorSchemeSetting } from "../types";

interface ColorSchemeSelectProps {
  value: ColorSchemeSetting;
  onChange: (colorScheme: ColorSchemeSetting) => void;
}

const COLOR_SCHEME_OPTIONS: Array<{ value: ColorSchemeSetting; labelKey: TranslationKey }> = [
  { value: "light", labelKey: "settings.theme.light" },
  { value: "dark", labelKey: "settings.theme.dark" },
  { value: "system", labelKey: "settings.theme.system" }
];

const CLOSE_ANIMATION_MS = 160;

function getOptionIndex(value: ColorSchemeSetting) {
  const index = COLOR_SCHEME_OPTIONS.findIndex((option) => option.value === value);
  return index >= 0 ? index : 2;
}

export function ColorSchemeSelect({ value, onChange }: ColorSchemeSelectProps) {
  const { t } = useI18n();
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => getOptionIndex(value));
  const selectedOption = COLOR_SCHEME_OPTIONS[getOptionIndex(value)];

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function openListbox() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setActiveIndex(getOptionIndex(value));
    setIsClosing(false);
    setIsOpen(true);
  }

  function closeListbox(focusTrigger = false) {
    if (!isOpen) {
      return;
    }

    setIsOpen(false);
    setIsClosing(true);

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false);
      closeTimerRef.current = null;
    }, CLOSE_ANIMATION_MS);

    if (focusTrigger) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function selectOption(option: ColorSchemeSetting) {
    onChange(option);
    closeListbox();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openListbox();
    }
  }

  function handleListboxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeListbox(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % COLOR_SCHEME_OPTIONS.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + COLOR_SCHEME_OPTIONS.length) % COLOR_SCHEME_OPTIONS.length);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(COLOR_SCHEME_OPTIONS[activeIndex].value);
    }
  }

  return (
    <div className="theme-select">
      <button
        ref={triggerRef}
        className="theme-trigger"
        type="button"
        aria-label={t("settings.theme.title")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen || isClosing ? listboxId : undefined}
        onClick={() => (isOpen ? closeListbox() : openListbox())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{t(selectedOption.labelKey)}</span>
      </button>
      {(isOpen || isClosing) && (
        <>
          <div className="theme-select-backdrop" aria-hidden="true" onClick={() => closeListbox()} />
          <div
            id={listboxId}
            className={`theme-listbox ${isOpen ? "theme-listbox--open" : "theme-listbox--closing"}`}
            role="listbox"
            tabIndex={-1}
            aria-label={t("settings.theme.title")}
            aria-activedescendant={`${listboxId}-${COLOR_SCHEME_OPTIONS[activeIndex].value}`}
            onKeyDown={handleListboxKeyDown}
          >
            {COLOR_SCHEME_OPTIONS.map((option, index) => (
              <div
                key={option.value}
                id={`${listboxId}-${option.value}`}
                className={`theme-option ${index === activeIndex ? "theme-option--active" : ""}`}
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option.value)}
              >
                <span>{t(option.labelKey)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
