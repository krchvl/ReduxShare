import {
  useCallback,
  useEffect,
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
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);

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

  const mountAndShow = useCallback(() => {
    cancelUnmount();
    setIsOpen(true);
    requestAnimationFrame(() => setIsVisible(true));
  }, [cancelUnmount]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setIsVisible(false);
      unmountTimerRef.current = window.setTimeout(() => {
        unmountTimerRef.current = null;
        setIsOpen(false);
        setAnchor(null);
      }, UNMOUNT_DELAY_MS);
    }, CLOSE_DELAY_MS);
  }, [cancelClose]);

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
        cancelClose();
        cancelUnmount();
        setIsVisible(false);
        setIsOpen(false);
        setAnchor(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, cancelClose, cancelUnmount]);

  useEffect(
    () => () => {
      cancelUnmount();
    },
    [cancelUnmount],
  );

  useEffect(() => cancelClose, [cancelClose]);

  return (
    <>
      <button
        type="button"
        className="help-hint__trigger"
        aria-label={label}
        onMouseEnter={(event) => openAt(event.clientX, event.clientY)}
        onMouseLeave={scheduleClose}
        onFocus={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          openAt(rect.right, rect.top);
        }}
        onBlur={() => {
          setIsVisible(false);
          setIsOpen(false);
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
            className={
              isVisible ? "help-hint__popover help-hint__popover--visible" : "help-hint__popover"
            }
            style={popoverStyle}
            role="tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
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
