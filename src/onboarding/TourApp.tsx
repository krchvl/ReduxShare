import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "../i18n/react";
import { MENU_PORTAL_SELECTOR, TOUR_STEPS, type TourPlacement, type TourStepId } from "./tourSteps";

const HOLE_PADDING = 12;
const CARD_WIDTH = 380;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 10;
const TOAST_EVENT = "reduxshare-tour-toast";
const TOAST_VISIBLE_MS = 2600;
const PREVIEW_MODAL_SELECTOR = "#reduxshare-quiz-preview-modal";
const MEASURE_SETTLE_DELAY = 320;

export const dispatchTourToast = (message: string) => {
  document.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
};

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export interface TourAppProps {
  openAnswerMenu: (questionId: string, tab?: "internal" | "external" | "ai") => boolean;
  openPreviewPanel: () => void;
  setAnswerMenuSticky: (sticky: boolean) => void;
  setPanelCollapsed: (collapsed: boolean) => void;
  onFinish: () => void;
}

function getMenuPortal(): HTMLElement | null {
  return document.querySelector(MENU_PORTAL_SELECTOR);
}

function closeAnswerMenu() {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

function openMenuFlyout(itemSelector: string) {
  getMenuPortal()
    ?.shadowRoot?.querySelector<HTMLElement>(itemSelector)
    ?.dispatchEvent(new MouseEvent("mouseenter"));
}

function clickAiSendButton() {
  getMenuPortal()
    ?.shadowRoot?.querySelector<HTMLButtonElement>('button[data-ai-action="send"]')
    ?.click();
}

function closePreviewPanel() {
  document
    .getElementById("reduxshare-quiz-preview-modal")
    ?.shadowRoot?.querySelector<HTMLButtonElement>(".reduxshare-preview-close")
    ?.click();
}

function moveTourRootAfter(host: Element | null) {
  const tourContainer = document.getElementById("root");

  if (host && tourContainer) {
    host.after(tourContainer);
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(max, min));

function toRect(box: DOMRect): Rect {
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    bottom: box.bottom,
    right: box.right,
  };
}

function unionRects(current: Rect, extra: DOMRect): Rect {
  return {
    left: Math.min(current.left, extra.left),
    top: Math.min(current.top, extra.top),
    width: Math.max(current.right, extra.right) - Math.min(current.left, extra.left),
    height: Math.max(current.bottom, extra.bottom) - Math.min(current.top, extra.top),
    bottom: Math.max(current.bottom, extra.bottom),
    right: Math.max(current.right, extra.right),
  };
}

function resolveTargetRect(target: Element): Rect {
  const shadow = target.shadowRoot;

  if (shadow) {
    const menu = shadow.querySelector<HTMLElement>(".menu");

    if (menu) {
      const menuBox = menu.getBoundingClientRect();

      if (menuBox.width > 0 || menuBox.height > 0) {
        let result = toRect(menuBox);

        for (const flyout of menu.querySelectorAll(".flyout")) {
          const flyoutBox = flyout.getBoundingClientRect();

          if (flyoutBox.width > 0 || flyoutBox.height > 0) {
            result = unionRects(result, flyoutBox);
          }
        }

        return result;
      }
    }

    const dialog = shadow.querySelector<HTMLElement>(".rpx-dialog");

    if (dialog) {
      const dialogBox = dialog.getBoundingClientRect();

      if (dialogBox.width > 0 || dialogBox.height > 0) {
        return toRect(dialogBox);
      }
    }
  }

  return toRect(target.getBoundingClientRect());
}

function placeCard(
  placement: TourPlacement | undefined,
  rect: Rect,
  cardHeight: number,
): CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxLeft = viewportWidth - CARD_WIDTH - VIEWPORT_MARGIN;
  const maxTop = viewportHeight - cardHeight - VIEWPORT_MARGIN;
  const fitsLeft = rect.left - CARD_GAP - CARD_WIDTH >= VIEWPORT_MARGIN;
  const fitsRight = rect.right + CARD_GAP + CARD_WIDTH <= maxLeft;
  const fitsTop = rect.top - CARD_GAP - cardHeight >= VIEWPORT_MARGIN;
  const fitsBottom = rect.bottom + CARD_GAP + cardHeight <= viewportHeight - VIEWPORT_MARGIN;
  const centeredLeft = rect.left + rect.width / 2 - CARD_WIDTH / 2;
  let left: number;
  let top: number;

  if (placement === "left" && fitsLeft) {
    left = rect.left - CARD_GAP - CARD_WIDTH;
    top = rect.top + rect.height / 2 - cardHeight / 2;
  } else if (placement === "right" && fitsRight) {
    left = rect.right + CARD_GAP;
    top = rect.top + rect.height / 2 - cardHeight / 2;
  } else if (placement === "top" ? fitsTop : !fitsBottom && fitsTop) {
    left = centeredLeft;
    top = rect.top - CARD_GAP - cardHeight;
  } else if (fitsTop || fitsBottom) {
    left = centeredLeft;
    top = rect.bottom + CARD_GAP;
  } else {
    const freeSpace = {
      left: rect.left - VIEWPORT_MARGIN,
      right: viewportWidth - VIEWPORT_MARGIN - rect.right,
      top: rect.top - VIEWPORT_MARGIN,
      bottom: viewportHeight - VIEWPORT_MARGIN - rect.bottom,
    };
    const best = (["left", "right", "top", "bottom"] as const).reduce((a, b) =>
      freeSpace[a] >= freeSpace[b] ? a : b,
    );

    if (best === "left") {
      left = rect.left - CARD_GAP - CARD_WIDTH;
      top = rect.top + rect.height / 2 - cardHeight / 2;
    } else if (best === "right") {
      left = rect.right + CARD_GAP;
      top = rect.top + rect.height / 2 - cardHeight / 2;
    } else if (best === "top") {
      left = centeredLeft;
      top = rect.top - CARD_GAP - cardHeight;
    } else {
      left = centeredLeft;
      top = rect.bottom + CARD_GAP;
    }
  }

  return { left: clamp(left, VIEWPORT_MARGIN, maxLeft), top: clamp(top, VIEWPORT_MARGIN, maxTop) };
}

export function TourApp({
  openAnswerMenu,
  openPreviewPanel,
  setAnswerMenuSticky,
  setPanelCollapsed,
  onFinish,
}: TourAppProps) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(200);
  const [toast, setToast] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const step = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  const stepActions: Partial<Record<TourStepId, () => void>> = {
    menu: () => {
      openAnswerMenu("1385", "internal");
      moveTourRootAfter(getMenuPortal());
      setAnswerMenuSticky(true);
    },
    stats: () => {
      openAnswerMenu("2011", "internal");
      openMenuFlyout('[data-answer-menu$="-stats"]');
      moveTourRootAfter(getMenuPortal());
      setAnswerMenuSticky(true);
    },
    ai: () => {
      openAnswerMenu("1385", "ai");
      clickAiSendButton();
      openMenuFlyout('[data-answer-menu="ai-answer"]');
      moveTourRootAfter(getMenuPortal());
      setAnswerMenuSticky(true);
    },
    essay: () => {
      openAnswerMenu("2101", "internal");
      openMenuFlyout('[data-answer-menu="essay-examples"]');
      moveTourRootAfter(getMenuPortal());
      setAnswerMenuSticky(true);
    },
    preview: () => {
      openPreviewPanel();
      moveTourRootAfter(document.getElementById("reduxshare-quiz-preview-modal"));
    },
    statusPanel: () => {
      setPanelCollapsed(false);
    },
  };

  const closeTourAnswerMenu = () => {
    setAnswerMenuSticky(false);
    closeAnswerMenu();
  };

  const stepCleanups: Partial<Record<TourStepId, () => void>> = {
    menu: closeTourAnswerMenu,
    stats: closeTourAnswerMenu,
    ai: closeTourAnswerMenu,
    essay: closeTourAnswerMenu,
    preview: closePreviewPanel,
  };

  useLayoutEffect(() => {
    const action = stepActions[step.id];
    const cleanup = stepCleanups[step.id];
    const observedRoots = new Set<ShadowRoot>();
    const settleTimeouts = new Set<number>();

    const scheduleSettledMeasure = () => {
      const timeout = window.setTimeout(() => {
        settleTimeouts.delete(timeout);
        measure();
      }, MEASURE_SETTLE_DELAY);
      settleTimeouts.add(timeout);
    };

    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(() => {
        measure();
        observeHosts();
      });
      scheduleSettledMeasure();
    });

    const observeHosts = () => {
      for (const hostSelector of [MENU_PORTAL_SELECTOR, PREVIEW_MODAL_SELECTOR]) {
        const root = document.querySelector<HTMLElement>(hostSelector)?.shadowRoot;

        if (root && !observedRoots.has(root)) {
          observedRoots.add(root);
          observer.observe(root, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["class", "hidden", "style"],
          });
        }
      }
    };

    const scrollSelector = step.scrollSelector ?? step.targetSelector;

    if (scrollSelector) {
      document
        .querySelector(scrollSelector)
        ?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    }

    const measure = () => {
      if (!step.targetSelector) {
        setRect(null);
      } else {
        const target = document.querySelector(step.targetSelector);

        if (!target) {
          setRect(null);
        } else {
          setRect(resolveTargetRect(target));
        }
      }

      setCardHeight(cardRef.current?.offsetHeight ?? 200);
    };

    const frame = window.requestAnimationFrame(() => {
      action?.();
      measure();
      observeHosts();
      scheduleSettledMeasure();
    });

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();

      for (const timeout of settleTimeouts) {
        window.clearTimeout(timeout);
      }

      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const cardStyle: CSSProperties = rect
    ? placeCard(step.placement, rect, cardHeight)
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  useEffect(() => {
    const handler = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;

      setToast(message);

      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }

      toastTimeoutRef.current = window.setTimeout(() => setToast(null), TOAST_VISIBLE_MS);
    };

    document.addEventListener(TOAST_EVENT, handler);

    return () => document.removeEventListener(TOAST_EVENT, handler);
  }, []);

  const goNext = () => setIndex((value) => Math.min(value + 1, TOUR_STEPS.length - 1));
  const goBack = () => setIndex((value) => Math.max(value - 1, 0));

  const holeStyle: CSSProperties | null = rect
    ? {
        left: rect.left - HOLE_PADDING,
        top: rect.top - HOLE_PADDING,
        width: rect.width + HOLE_PADDING * 2,
        height: rect.height + HOLE_PADDING * 2,
      }
    : null;

  const primaryLabel = isLast
    ? t("tour.finish.done")
    : step.id === "welcome"
      ? t("tour.welcome.start")
      : t("tour.nav.next");

  return (
    <div className="reduxshare-tour-root">
      {holeStyle ? (
        <div className="reduxshare-tour-hole" style={holeStyle} />
      ) : (
        <div className="reduxshare-tour-scrim" />
      )}
      <div
        className="reduxshare-tour-card"
        ref={cardRef}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
      >
        <div className="reduxshare-tour-card__progress">
          <span className="reduxshare-tour-card__brand">
            <span className="reduxshare-tour-card__mark" aria-hidden="true">
              R
            </span>
            ReduxShare
          </span>
          <span>{t("tour.nav.stepOf", { current: index + 1, total: TOUR_STEPS.length })}</span>
        </div>
        <h2 className="reduxshare-tour-card__title">{t(step.titleKey)}</h2>
        <p className="reduxshare-tour-card__text">{t(step.textKey)}</p>
        <div className="reduxshare-tour-card__actions">
          <button
            type="button"
            className="reduxshare-tour-button reduxshare-tour-button--ghost"
            onClick={onFinish}
          >
            {t("tour.nav.skip")}
          </button>
          <span className="reduxshare-tour-card__spacer" />
          {index > 0 && (
            <button type="button" className="reduxshare-tour-button" onClick={goBack}>
              {t("tour.nav.back")}
            </button>
          )}
          <button
            type="button"
            className="reduxshare-tour-button reduxshare-tour-button--primary"
            onClick={isLast ? onFinish : goNext}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
      {toast && <div className="reduxshare-tour-toast">{toast}</div>}
    </div>
  );
}
