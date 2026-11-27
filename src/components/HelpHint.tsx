import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

const POPOVER_WIDTH = 280;
const POPOVER_EDGE_PADDING = 12;
const CURSOR_GAP = 14;
const CLOSE_DELAY_MS = 150;
const ANIMATION_MS = 160;
const UNMOUNT_DELAY_MS = ANIMATION_MS + 20;

interface HelpHintProps {
  text: string;
  media?: string;
  label: string;
}

export function HelpHint({ text, media, label }: HelpHintProps) {
  const popoverId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);
  const triggerHoveredRef = useRef(false);
  const triggerFocusedRef = useRef(false);
  const popoverHoveredRef = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const cancelUnmount = useCallback(() => {
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  }, []);

  const hideNow = useCallback(() => {
    cancelClose();
    cancelUnmount();
    triggerHoveredRef.current = false;
    triggerFocusedRef.current = false;
    popoverHoveredRef.current = false;
    setIsVisible(false);
    setIsOpen(false);
    setAnchor(null);
  }, [cancelClose, cancelUnmount]);

  const mountAndShow = useCallback(() => {
    cancelUnmount();
    setIsOpen(true);
    requestAnimationFrame(() => setIsVisible(true));
  }, [cancelUnmount]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (triggerHoveredRef.current || triggerFocusedRef.current || popoverHoveredRef.current) {
        return;
      }
      setIsVisible(false);
      unmountTimerRef.current = window.setTimeout(() => {
        unmountTimerRef.current = null;
        setIsOpen(false);
        setAnchor(null);
      }, UNMOUNT_DELAY_MS);
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

  const releaseInteraction = useCallback(() => {
    if (triggerHoveredRef.current || triggerFocusedRef.current || popoverHoveredRef.current) {
      return;
    }
    scheduleClose();
  }, [scheduleClose]);

  const openAt = useCallback(
    (x: number, y: number) => {
      cancelClose();
      cancelUnmount();
      setAnchor({ x, y });
      if (!isOpen) {
        mountAndShow();
      } else {
        setIsVisible(true);
      }
    },
    [cancelClose, cancelUnmount, isOpen, mountAndShow],
  );

  useLayoutEffect(() => {
    if (!isOpen || !anchor) {
      return;
    }

    const height = popoverRef.current?.offsetHeight ?? 0;
    const right = anchor.x + CURSOR_GAP + POPOVER_WIDTH;
    const fitsRight = right <= window.innerWidth - POPOVER_EDGE_PADDING;
    const left = fitsRight
      ? anchor.x + CURSOR_GAP
      : Math.max(POPOVER_EDGE_PADDING, anchor.x - CURSOR_GAP - POPOVER_WIDTH);
    const belowTop = anchor.y + CURSOR_GAP;
    const top =
      height > 0 && belowTop + height <= window.innerHeight - POPOVER_EDGE_PADDING
        ? belowTop
        : Math.max(POPOVER_EDGE_PADDING, anchor.y - height - CURSOR_GAP);

    setPopoverStyle({ position: "fixed", top, left, width: POPOVER_WIDTH });
  }, [isOpen, anchor]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideNow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, hideNow]);

  useEffect(
    () => () => {
      cancelClose();
      cancelUnmount();
    },
    [cancelClose, cancelUnmount],
  );

  return (
    <>
      <button
        type="button"
        className="help-hint__trigger"
        aria-label={label}
        aria-describedby={isOpen ? popoverId : undefined}
        onMouseEnter={(event) => {
          triggerHoveredRef.current = true;
          openAt(event.clientX, event.clientY);
        }}
        onMouseLeave={() => {
          triggerHoveredRef.current = false;
          releaseInteraction();
        }}
        onFocus={(event) => {
          triggerFocusedRef.current = true;
          const rect = event.currentTarget.getBoundingClientRect();
          openAt(rect.right, rect.top);
        }}
        onBlur={() => {
          triggerFocusedRef.current = false;
          releaseInteraction();
        }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8.4" />
          <path d="M8 8.1a2 2 0 1 1 2.7 1.9c-.5.2-.7.5-.7 1v.4" />
          <circle className="help-hint__dot" cx="10" cy="14.2" r="0.9" />
        </svg>
      </button>
      {isOpen &&
        anchor &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            className={
              isVisible ? "help-hint__popover help-hint__popover--visible" : "help-hint__popover"
            }
            style={popoverStyle}
            role="tooltip"
            onMouseEnter={() => {
              popoverHoveredRef.current = true;
              cancelClose();
              cancelUnmount();
              setIsVisible(true);
            }}
            onMouseLeave={() => {
              popoverHoveredRef.current = false;
              releaseInteraction();
            }}
          >
            {media && (
              <img
                className="help-hint__media"
                src={media}
                alt=""
                onLoad={() => setAnchor((current) => (current ? { ...current } : current))}
              />
            )}
            <p>{text}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
