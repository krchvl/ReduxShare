import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface CustomSelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  listLabel: string;
  className?: string;
  align?: "start" | "end";
  listboxMinWidth?: number;
  onOpen?: () => void;
  footer?: ReactNode;
  renderOptionTrailing?: (option: CustomSelectOption) => ReactNode;
}

const LISTBOX_ANIMATION_MS = 180;
const LISTBOX_GAP = 10;
const LISTBOX_EDGE_PADDING = 10;
const LISTBOX_MIN_WIDTH = 180;

function getSelectedIndex(options: CustomSelectOption[], value: string) {
  const index = options.findIndex((option) => option.value === value);
  return index === -1 ? 0 : index;
}

function isOptionSelectable(option: CustomSelectOption | undefined): boolean {
  return option !== undefined && option.disabled !== true;
}

function getNextIndex(options: CustomSelectOption[], from: number, direction: 1 | -1) {
  if (options.length === 0) {
    return 0;
  }

  let index = from;

  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length;

    if (isOptionSelectable(options[index])) {
      return index;
    }
  }

  return from;
}

function ChevronIcon() {
  return (
    <svg
      className="cselect__chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.25L6 7.75L9.5 4.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="cselect__check"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.8 7.4L5.6 10.2L11.2 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CustomSelect({
  value,
  options,
  onChange,
  ariaLabel,
  listLabel,
  className,
  align = "end",
  listboxMinWidth,
  onOpen,
  footer,
  renderOptionTrailing,
}: CustomSelectProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isListboxMounted, setIsListboxMounted] = useState(false);
  const [listboxPortalTarget, setListboxPortalTarget] = useState<Element | null>(null);
  const [listboxStyle, setListboxStyle] = useState<CSSProperties | undefined>(undefined);
  const [activeIndex, setActiveIndex] = useState(() => getSelectedIndex(options, value));
  const selectedOption = options[getSelectedIndex(options, value)];
  const activeOption = options[activeIndex];

  function getFloatingListboxStyle(): CSSProperties | undefined {
    const triggerRect = triggerRef.current?.getBoundingClientRect();

    if (!triggerRect) {
      return undefined;
    }

    const listboxRect = listboxRef.current?.getBoundingClientRect();
    const width = Math.max(
      triggerRect.width,
      listboxRect?.width ?? 0,
      listboxMinWidth ?? LISTBOX_MIN_WIDTH,
    );
    const height = listboxRect?.height ?? 0;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const alignedLeft = align === "end" ? triggerRect.right - width : triggerRect.left;
    const maxLeft = viewportWidth - width - LISTBOX_EDGE_PADDING;
    const left = Math.max(
      LISTBOX_EDGE_PADDING,
      Math.min(alignedLeft, Math.max(LISTBOX_EDGE_PADDING, maxLeft)),
    );
    const belowTop = triggerRect.bottom + LISTBOX_GAP;
    const aboveTop = triggerRect.top - height - LISTBOX_GAP;
    const top =
      height > 0 && belowTop + height <= viewportHeight - LISTBOX_EDGE_PADDING
        ? belowTop
        : Math.max(LISTBOX_EDGE_PADDING, aboveTop);

    return {
      position: "fixed",
      top,
      left,
      right: "auto",
      width,
    };
  }

  const updateFloatingListboxPosition = useEffectEvent(() => {
    setListboxStyle(getFloatingListboxStyle());
  });

  useEffect(() => {
    if (isOpen) {
      listboxRef.current?.focus();
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isListboxMounted) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-layout measurement for the floating listbox
    updateFloatingListboxPosition();
  }, [isListboxMounted, isOpen, value]);

  useEffect(() => {
    if (!isListboxMounted) {
      return undefined;
    }

    window.addEventListener("resize", updateFloatingListboxPosition);
    window.addEventListener("scroll", updateFloatingListboxPosition, true);

    return () => {
      window.removeEventListener("resize", updateFloatingListboxPosition);
      window.removeEventListener("scroll", updateFloatingListboxPosition, true);
    };
  }, [isListboxMounted]);

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

    setActiveIndex(getSelectedIndex(options, value));
    setIsOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      setIsListboxMounted(false);
      closeTimerRef.current = null;
    }, LISTBOX_ANIMATION_MS);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function selectOption(option: CustomSelectOption) {
    if (!isOptionSelectable(option)) {
      return;
    }

    onChange(option.value);
    closeAndFocusTrigger();
  }

  function openListbox(nextIndex = getSelectedIndex(options, value)) {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setActiveIndex(nextIndex);
    setListboxPortalTarget(triggerRef.current?.closest(".popup-shell") ?? document.body);
    setListboxStyle(getFloatingListboxStyle());
    setIsListboxMounted(true);
    setIsOpen(true);
    onOpen?.();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openListbox(getNextIndex(options, getSelectedIndex(options, value), 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openListbox(getNextIndex(options, getSelectedIndex(options, value), -1));
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
      setActiveIndex((index) => getNextIndex(options, index, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => getNextIndex(options, index, -1));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(getNextIndex(options, -1, 1));
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(getNextIndex(options, options.length, -1));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(activeOption);
    }
  }

  const floatingListbox = isListboxMounted ? (
    <>
      <div className="cselect-backdrop" aria-hidden="true" onClick={closeAndFocusTrigger} />
      <div
        ref={listboxRef}
        id={listboxId}
        className={`cselect__listbox cselect__listbox--${align} ${
          isOpen ? "cselect__listbox--open" : "cselect__listbox--closing"
        }`}
        style={listboxStyle}
        role="listbox"
        tabIndex={-1}
        aria-label={listLabel}
        aria-activedescendant={`${listboxId}-${activeOption?.value ?? ""}`}
        onKeyDown={handleListboxKeyDown}
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${listboxId}-${option.value}`}
            className={`cselect__option ${index === activeIndex ? "cselect__option--active" : ""} ${
              option.value === value ? "cselect__option--selected" : ""
            }`}
            role="option"
            aria-selected={option.value === value}
            aria-disabled={option.disabled || undefined}
            onMouseEnter={() => {
              if (isOptionSelectable(option)) {
                setActiveIndex(index);
              }
            }}
            onClick={() => selectOption(option)}
          >
            {option.icon}
            <span className="cselect__option-texts">
              <span className="cselect__option-label">{option.label}</span>
              {option.description ? (
                <span className="cselect__option-description">{option.description}</span>
              ) : null}
            </span>
            {option.meta ? <span className="cselect__option-meta">{option.meta}</span> : null}
            {option.value === value ? <CheckIcon /> : null}
            {renderOptionTrailing?.(option)}
          </div>
        ))}
        {footer ? (
          <div
            className="cselect__footer"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key !== "Escape") {
                event.stopPropagation();
              }
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </>
  ) : null;

  return (
    <div className={`cselect ${className ?? ""}`.trim()}>
      <button
        ref={triggerRef}
        className={`cselect__trigger ${selectedOption?.disabled ? "cselect__trigger--placeholder" : ""}`.trim()}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isListboxMounted ? listboxId : undefined}
        onClick={() => (isOpen ? closeAndFocusTrigger() : openListbox())}
        onKeyDown={handleTriggerKeyDown}
      >
        {selectedOption?.icon}
        <span className="cselect__label">{selectedOption?.label ?? ""}</span>
        {selectedOption?.meta ? (
          <span className="cselect__trigger-meta">{selectedOption.meta}</span>
        ) : null}
        <ChevronIcon />
      </button>
      {listboxPortalTarget ? createPortal(floatingListbox, listboxPortalTarget) : floatingListbox}
    </div>
  );
}
