import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

const POPOVER_WIDTH = 280;
const POPOVER_EDGE_PADDING = 12;
const CURSOR_GAP = 14;

interface HelpHintProps {
  text: string;
  media?: string;
  label: string;
}

export function HelpHint({ text, media, label }: HelpHintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const openAt = useCallback((x: number, y: number) => {
    const height = popoverRef.current?.offsetHeight ?? 0;
    const maxLeft = window.innerWidth - POPOVER_WIDTH - POPOVER_EDGE_PADDING;
    const left = Math.max(
      POPOVER_EDGE_PADDING,
      Math.min(x + CURSOR_GAP, Math.max(POPOVER_EDGE_PADDING, maxLeft)),
    );
    const belowTop = y + CURSOR_GAP;
    const top =
      height > 0 && belowTop + height <= window.innerHeight - POPOVER_EDGE_PADDING
        ? belowTop
        : Math.max(POPOVER_EDGE_PADDING, y - height - CURSOR_GAP);

    setPopoverStyle({ position: "fixed", top, left, width: POPOVER_WIDTH });
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="help-hint__trigger"
        aria-label={label}
        onMouseEnter={(event) => openAt(event.clientX, event.clientY)}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openAt(rect.right, rect.top);
        }}
        onBlur={() => setIsOpen(false)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8.4" />
          <path d="M8 8.1a2 2 0 1 1 2.7 1.9c-.5.2-.7.5-.7 1v.4" />
          <circle className="help-hint__dot" cx="10" cy="14.2" r="0.9" />
        </svg>
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="help-hint__popover"
            style={popoverStyle}
            role="tooltip"
            onMouseLeave={() => setIsOpen(false)}
          >
            {media && <img className="help-hint__media" src={media} alt="" />}
            <p>{text}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
