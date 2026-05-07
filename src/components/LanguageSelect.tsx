import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { LANGUAGE_OPTIONS, type TranslationKey } from "../i18n";
import { useI18n } from "../i18n/react";
import type { LanguageSetting } from "../types";

interface LanguageSelectProps {
  value: LanguageSetting;
  onChange: (language: LanguageSetting) => void;
}

function getLanguageIndex(language: LanguageSetting) {
  return LANGUAGE_OPTIONS.findIndex((option) => option.value === language);
}

function getNextIndex(index: number, direction: 1 | -1) {
  return (index + direction + LANGUAGE_OPTIONS.length) % LANGUAGE_OPTIONS.length;
}

const LANGUAGE_LISTBOX_ANIMATION_MS = 180;
const LANGUAGE_LISTBOX_WIDTH = 166;
const LANGUAGE_LISTBOX_HEIGHT = 146;
const LANGUAGE_LISTBOX_GAP = 10;
const LANGUAGE_LISTBOX_EDGE_PADDING = 10;

function LanguageCode({ value }: { value: LanguageSetting }) {
  return (
    <span className="language-code" aria-hidden="true">
      {value === "auto" ? <span>A</span> : value === "ru" ? "🇷🇺" : "🇺🇸"}
    </span>
  );
}

export function LanguageSelect({ value, onChange }: LanguageSelectProps) {
  const { t } = useI18n();
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isListboxMounted, setIsListboxMounted] = useState(false);
  const [listboxPortalTarget, setListboxPortalTarget] = useState<Element | null>(null);
  const [listboxStyle, setListboxStyle] = useState<CSSProperties | undefined>(undefined);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, getLanguageIndex(value)));
  const selectedLanguage = LANGUAGE_OPTIONS[Math.max(0, getLanguageIndex(value))];
  const activeLanguage = LANGUAGE_OPTIONS[activeIndex];

  function getFloatingListboxStyle(): CSSProperties | undefined {
    const triggerRect = triggerRef.current?.getBoundingClientRect();

    if (!triggerRect) {
      return undefined;
    }

    const listboxRect = listboxRef.current?.getBoundingClientRect();
    const width = listboxRect?.width ?? LANGUAGE_LISTBOX_WIDTH;
    const height = listboxRect?.height ?? LANGUAGE_LISTBOX_HEIGHT;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxLeft = viewportWidth - width - LANGUAGE_LISTBOX_EDGE_PADDING;
    const left = Math.max(
      LANGUAGE_LISTBOX_EDGE_PADDING,
      Math.min(triggerRect.right - width, Math.max(LANGUAGE_LISTBOX_EDGE_PADDING, maxLeft))
    );
    const belowTop = triggerRect.bottom + LANGUAGE_LISTBOX_GAP;
    const aboveTop = triggerRect.top - height - LANGUAGE_LISTBOX_GAP;
    const top =
      belowTop + height <= viewportHeight - LANGUAGE_LISTBOX_EDGE_PADDING
        ? belowTop
        : Math.max(LANGUAGE_LISTBOX_EDGE_PADDING, aboveTop);

    return {
      position: "fixed",
      top,
      left,
      right: "auto"
    };
  }

  function updateFloatingListboxPosition() {
    setListboxStyle(getFloatingListboxStyle());
  }

  useEffect(() => {
    if (isOpen) {
      listboxRef.current?.focus();
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isListboxMounted) {
      return;
    }

    updateFloatingListboxPosition();
  }, [isListboxMounted, isOpen, value]);

  useEffect(() => {
    if (!isListboxMounted) {
      return undefined;
    }

    window.addEventListener("resize", updateFloatingListboxPosition);

    return () => {
      window.removeEventListener("resize", updateFloatingListboxPosition);
    };
  }, [isListboxMounted]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(Math.max(0, getLanguageIndex(value)));
    }
  }, [isOpen, value]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function closeAndFocusTrigger() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    setIsOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      setIsListboxMounted(false);
      closeTimerRef.current = null;
    }, LANGUAGE_LISTBOX_ANIMATION_MS);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function selectLanguage(language: LanguageSetting) {
    onChange(language);
    closeAndFocusTrigger();
  }

  function openListbox(nextIndex = Math.max(0, getLanguageIndex(value))) {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setActiveIndex(nextIndex);
    setListboxPortalTarget(triggerRef.current?.closest(".popup-shell") ?? document.body);
    setListboxStyle(getFloatingListboxStyle());
    setIsListboxMounted(true);
    setIsOpen(true);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openListbox(getNextIndex(Math.max(0, getLanguageIndex(value)), 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openListbox(getNextIndex(Math.max(0, getLanguageIndex(value)), -1));
    }
  }

  function handleListboxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocusTrigger();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => getNextIndex(index, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => getNextIndex(index, -1));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(LANGUAGE_OPTIONS.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectLanguage(activeLanguage.value);
    }
  }

  const floatingListbox = isListboxMounted ? (
    <>
      <div className="theme-select-backdrop" aria-hidden="true" onClick={closeAndFocusTrigger} />
      <div
        ref={listboxRef}
        id={listboxId}
        className={`theme-listbox ${isOpen ? "theme-listbox--open" : "theme-listbox--closing"}`}
        style={listboxStyle}
        role="listbox"
        tabIndex={-1}
        aria-label={t("language.select.list")}
        aria-activedescendant={`${listboxId}-${activeLanguage.value}`}
        onKeyDown={handleListboxKeyDown}
      >
        {LANGUAGE_OPTIONS.map((language, index) => (
          <div
            key={language.value}
            id={`${listboxId}-${language.value}`}
            className={`theme-option ${index === activeIndex ? "theme-option--active" : ""}`}
            role="option"
            aria-selected={language.value === value}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectLanguage(language.value)}
          >
            <LanguageCode value={language.value} />
            <span>{t(language.labelKey as TranslationKey)}</span>
          </div>
        ))}
      </div>
    </>
  ) : null;

  return (
    <div className="theme-select">
      <button
        ref={triggerRef}
        className="theme-trigger"
        type="button"
        aria-label={t("language.select.label")}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isListboxMounted ? listboxId : undefined}
        onClick={() => (isOpen ? closeAndFocusTrigger() : openListbox())}
        onKeyDown={handleTriggerKeyDown}
      >
        <LanguageCode value={selectedLanguage.value} />
        <span>{t(selectedLanguage.labelKey as TranslationKey)}</span>
      </button>
      {listboxPortalTarget ? createPortal(floatingListbox, listboxPortalTarget) : floatingListbox}
    </div>
  );
}
