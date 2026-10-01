import type { UpdateState } from "../../types";
import { compareVersions } from "../../lib/updates";
import {
  UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY,
  UPDATE_NOTICE_POSITION_STORAGE_KEY,
} from "../../shared/storageKeys";
import { canUseQuizFeatures } from "../../logic/settings";
import { applyContentColorSchemeToHost, getAccentColor, getRgbCssValue } from "../../logic/theme";
import { currentStoredState, currentT, stealthModeEnabled } from "../../state";

export const UPDATE_NOTICE_HOST_ID = "reduxshare-update-notice";

interface UpdateNoticePosition {
  left: number;
  top: number;
}

interface UpdateNoticeDragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

let updateNoticeDismissedCheck: string | null = null;
let updateNoticePosition: UpdateNoticePosition | null = null;
let updateNoticeDragState: UpdateNoticeDragState | null = null;
let updateNoticeDragListenersInstalled = false;
let updateNoticeResizeListenerInstalled = false;

export function shouldShowUpdateNotice(
  updateState: UpdateState | null | undefined,
  dismissedCheckId: string | null,
): boolean {
  if (!updateState || updateState.status !== "available") {
    return false;
  }

  if (!updateState.latestVersion) {
    return false;
  }

  if (compareVersions(updateState.latestVersion, updateState.currentVersion) <= 0) {
    return false;
  }

  if (dismissedCheckId !== null && dismissedCheckId === updateState.checkedAt) {
    return false;
  }

  return true;
}

function isValidUpdateNoticePosition(value: unknown): value is UpdateNoticePosition {
  if (!value || typeof value !== "object") {
    return false;
  }

  const position = value as Partial<UpdateNoticePosition>;
  return (
    typeof position.left === "number" &&
    Number.isFinite(position.left) &&
    typeof position.top === "number" &&
    Number.isFinite(position.top)
  );
}

export async function loadUpdateNoticeDismissedState(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY);
    const value = result[UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY];
    updateNoticeDismissedCheck = typeof value === "string" ? value : null;
  } catch {
    updateNoticeDismissedCheck = null;
  }

  try {
    const result = await chrome.storage.local.get(UPDATE_NOTICE_POSITION_STORAGE_KEY);
    const value = result[UPDATE_NOTICE_POSITION_STORAGE_KEY];
    updateNoticePosition = isValidUpdateNoticePosition(value) ? value : null;
  } catch {
    updateNoticePosition = null;
  }
}

export function applyUpdateNoticeStorageChanges(
  changes: Record<string, { newValue?: unknown } | undefined>,
): void {
  if (UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY in changes) {
    const value = changes[UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY]?.newValue;
    updateNoticeDismissedCheck = typeof value === "string" ? value : null;
  }

  if (UPDATE_NOTICE_POSITION_STORAGE_KEY in changes) {
    const value = changes[UPDATE_NOTICE_POSITION_STORAGE_KEY]?.newValue;
    updateNoticePosition = isValidUpdateNoticePosition(value) ? value : null;
  }

  renderUpdateNotice();
}

export async function dismissUpdateNotice(): Promise<void> {
  const checkedAt = currentStoredState?.updateState?.checkedAt ?? null;
  updateNoticeDismissedCheck = checkedAt;
  removeUpdateNotice();

  try {
    await chrome.storage.local.set({
      [UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY]: checkedAt,
    });
  } catch {}
}

function clampUpdateNoticeToViewport(host: HTMLDivElement): void {
  const rect = host.getBoundingClientRect();
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - rect.width - 8));
  const top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - rect.height - 8));

  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.right = "auto";
  host.style.bottom = "auto";
}

function applyUpdateNoticePosition(host: HTMLDivElement): void {
  if (!updateNoticePosition) {
    host.style.left = "auto";
    host.style.top = "auto";
    host.style.right = "16px";
    host.style.bottom = "16px";
    return;
  }

  host.style.left = `${updateNoticePosition.left}px`;
  host.style.top = `${updateNoticePosition.top}px`;
  host.style.right = "auto";
  host.style.bottom = "auto";
  clampUpdateNoticeToViewport(host);
}

function finishUpdateNoticeDrag(event: PointerEvent | null): void {
  if (!updateNoticeDragState) {
    return;
  }

  if (event && event.pointerId !== updateNoticeDragState.pointerId) {
    return;
  }

  const host = document.getElementById(UPDATE_NOTICE_HOST_ID);

  if (updateNoticeDragState.moved && host instanceof HTMLDivElement) {
    const rect = host.getBoundingClientRect();

    if (Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
      updateNoticePosition = { left: rect.left, top: rect.top };

      try {
        void chrome.storage.local.set({
          [UPDATE_NOTICE_POSITION_STORAGE_KEY]: updateNoticePosition,
        });
      } catch {}
    }
  }

  updateNoticeDragState = null;
}

function handleUpdateNoticeDragMove(event: PointerEvent): void {
  if (!updateNoticeDragState || event.pointerId !== updateNoticeDragState.pointerId) {
    return;
  }

  const host = document.getElementById(UPDATE_NOTICE_HOST_ID);

  if (!(host instanceof HTMLDivElement)) {
    finishUpdateNoticeDrag(event);
    return;
  }

  host.style.left = `${event.clientX - updateNoticeDragState.offsetX}px`;
  host.style.top = `${event.clientY - updateNoticeDragState.offsetY}px`;
  host.style.right = "auto";
  host.style.bottom = "auto";

  if (!updateNoticeDragState.moved) {
    const rect = host.getBoundingClientRect();
    updateNoticeDragState.moved =
      Math.abs(event.clientX - updateNoticeDragState.offsetX - rect.left) > 2 ||
      Math.abs(event.clientY - updateNoticeDragState.offsetY - rect.top) > 2;
  }

  event.preventDefault();
}

function handleUpdateNoticeDragEnd(event: PointerEvent): void {
  finishUpdateNoticeDrag(event);
}

function ensureUpdateNoticeDragListeners(): void {
  if (updateNoticeDragListenersInstalled) {
    return;
  }

  updateNoticeDragListenersInstalled = true;
  document.addEventListener("pointermove", handleUpdateNoticeDragMove, true);
  document.addEventListener("pointerup", handleUpdateNoticeDragEnd, true);
  document.addEventListener("pointercancel", handleUpdateNoticeDragEnd, true);
}

function ensureUpdateNoticeResizeListener(): void {
  if (updateNoticeResizeListenerInstalled) {
    return;
  }

  updateNoticeResizeListenerInstalled = true;
  window.addEventListener("resize", () => {
    const host = document.getElementById(UPDATE_NOTICE_HOST_ID);

    if (host instanceof HTMLDivElement) {
      clampUpdateNoticeToViewport(host);
    }
  });
}

export function removeUpdateNotice(): void {
  document.getElementById(UPDATE_NOTICE_HOST_ID)?.remove();
  updateNoticeDragState = null;
}

export function resetUpdateNoticeState(): void {
  updateNoticeDismissedCheck = null;
  updateNoticePosition = null;
  removeUpdateNotice();
}

function ensureUpdateNotice(): HTMLDivElement | null {
  let host = document.getElementById(UPDATE_NOTICE_HOST_ID) as HTMLDivElement | null;

  if (!(host instanceof HTMLDivElement)) {
    host = document.createElement("div");
    host.id = UPDATE_NOTICE_HOST_ID;
    host.style.position = "fixed";
    host.style.right = "16px";
    host.style.bottom = "16px";
    host.style.zIndex = "2147483645";
    host.style.pointerEvents = "none";
    host.style.width = "320px";
    host.style.maxWidth = "calc(100vw - 32px)";
    host.attachShadow({ mode: "open" });
    document.documentElement.append(host);
  }

  if (host.shadowRoot && host.shadowRoot.childElementCount === 0) {
    ensureUpdateNoticeDragListeners();
    ensureUpdateNoticeResizeListener();
    host.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .notice {
          box-sizing: border-box;
          width: 100%;
          border: 1px solid rgba(var(--reduxshare-notice-accent-rgb), 0.24);
          border-radius: 16px;
          background:
            radial-gradient(circle at top right, rgba(var(--reduxshare-notice-accent-rgb), 0.18), transparent 54%),
            linear-gradient(180deg, rgba(19, 20, 27, 0.95), rgba(15, 16, 22, 0.91)),
            rgba(15, 16, 22, 0.92);
          backdrop-filter: blur(16px) saturate(120%);
          color: #f6f7fb;
          box-shadow:
            0 20px 44px rgba(0, 0, 0, 0.28),
            0 0 0 1px rgba(var(--reduxshare-notice-accent-rgb), 0.05) inset;
          padding: 14px;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          pointer-events: auto;
          transform-origin: bottom right;
          animation: notice-enter 240ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes notice-enter {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .header {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: grab;
          user-select: none;
          touch-action: none;
        }

        .header:active {
          cursor: grabbing;
        }

        .brand-mark {
          width: 22px;
          height: 22px;
        }

        .title {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          font-weight: 700;
        }

        .close {
          all: unset;
          display: grid;
          width: 22px;
          height: 22px;
          place-items: center;
          border-radius: 6px;
          color: rgba(246, 247, 251, 0.6);
          cursor: pointer;
          font-size: 15px;
          line-height: 1;
        }

        .close:hover,
        .close:focus-visible {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          outline: 0;
        }

        .body {
          margin: 8px 0 12px;
          font-size: 12.5px;
          line-height: 1.45;
          color: rgba(246, 247, 251, 0.82);
        }

        .actions {
          display: flex;
          gap: 8px;
        }

        .button {
          all: unset;
          box-sizing: border-box;
          flex: 1;
          padding: 7px 10px;
          border-radius: 8px;
          font-family: inherit;
          font-size: 12.5px;
          font-weight: 600;
          text-align: center;
          cursor: pointer;
        }

        .button--primary {
          background: var(--reduxshare-notice-accent);
          color: #14151b;
        }

        .button--primary:hover,
        .button--primary:focus-visible {
          filter: brightness(1.08);
          outline: 0;
        }

        .button--ghost {
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: #f6f7fb;
        }

        .button--ghost:hover,
        .button--ghost:focus-visible {
          background: rgba(255, 255, 255, 0.06);
          outline: 0;
        }

        :host([data-theme="light"]) .notice {
          background:
            radial-gradient(circle at top right, rgba(var(--reduxshare-notice-accent-rgb), 0.14), transparent 54%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(244, 245, 248, 0.95));
          color: #14151b;
          border-color: rgba(20, 21, 27, 0.1);
          box-shadow:
            0 20px 44px rgba(20, 24, 40, 0.18),
            0 0 0 1px rgba(20, 21, 27, 0.04) inset;
        }

        :host([data-theme="light"]) .close {
          color: rgba(20, 21, 27, 0.55);
        }

        :host([data-theme="light"]) .close:hover,
        :host([data-theme="light"]) .close:focus-visible {
          background: rgba(20, 21, 27, 0.07);
          color: #14151b;
        }

        :host([data-theme="light"]) .body {
          color: rgba(20, 21, 27, 0.75);
        }

        :host([data-theme="light"]) .button--ghost {
          border-color: rgba(20, 21, 27, 0.16);
          color: #14151b;
        }

        :host([data-theme="light"]) .button--ghost:hover,
        :host([data-theme="light"]) .button--ghost:focus-visible {
          background: rgba(20, 21, 27, 0.05);
        }
      </style>
      <div class="notice" role="dialog" aria-live="polite">
        <div class="header">
          <img class="brand-mark" alt="" />
          <div class="title"></div>
          <button class="close" type="button"><span aria-hidden="true">&times;</span></button>
        </div>
        <div class="body"></div>
        <div class="actions">
          <button class="button button--primary open" type="button"></button>
          <button class="button button--ghost later" type="button"></button>
        </div>
      </div>
    `;
  }

  return host;
}

export function renderUpdateNotice(): void {
  const storedState = currentStoredState;

  if (stealthModeEnabled || !canUseQuizFeatures(storedState)) {
    removeUpdateNotice();
    return;
  }

  const updateState = storedState?.updateState ?? null;

  if (!shouldShowUpdateNotice(updateState, updateNoticeDismissedCheck)) {
    removeUpdateNotice();
    return;
  }

  const host = ensureUpdateNotice();
  const shadowRoot = host?.shadowRoot;

  if (!host || !shadowRoot) {
    return;
  }

  const accentColor = getAccentColor(storedState?.settings);
  const logoUrl = chrome.runtime.getURL("icons/reduxshare-icon-48.png");

  host.style.setProperty("--reduxshare-notice-accent", accentColor);
  host.style.setProperty("--reduxshare-notice-accent-rgb", getRgbCssValue(accentColor));
  applyContentColorSchemeToHost(host);

  const title = shadowRoot.querySelector<HTMLElement>(".title");
  const body = shadowRoot.querySelector<HTMLElement>(".body");
  const openButton = shadowRoot.querySelector<HTMLButtonElement>(".open");
  const laterButton = shadowRoot.querySelector<HTMLButtonElement>(".later");
  const closeButton = shadowRoot.querySelector<HTMLButtonElement>(".close");
  const header = shadowRoot.querySelector<HTMLElement>(".header");
  const brandMark = shadowRoot.querySelector<HTMLImageElement>(".brand-mark");

  if (brandMark) {
    brandMark.src = logoUrl;
  }

  if (title) {
    title.textContent = currentT("quiz.updateNotice.title");
  }

  if (body) {
    body.textContent = currentT("quiz.updateNotice.body", {
      version: updateState?.latestVersion ?? "",
      currentVersion: updateState?.currentVersion ?? "",
    });
  }

  if (openButton) {
    openButton.textContent = currentT("quiz.updateNotice.open");
    openButton.style.display = updateState?.releaseUrl ? "" : "none";
    openButton.onclick = () => {
      if (updateState?.releaseUrl) {
        window.open(updateState.releaseUrl, "_blank", "noopener");
      }
    };
  }

  if (laterButton) {
    laterButton.textContent = currentT("quiz.updateNotice.later");
    laterButton.onclick = () => {
      void dismissUpdateNotice();
    };
  }

  if (closeButton) {
    closeButton.setAttribute("aria-label", currentT("quiz.updateNotice.later"));
    closeButton.setAttribute("title", currentT("quiz.updateNotice.later"));
    closeButton.onclick = () => {
      void dismissUpdateNotice();
    };
  }

  if (header) {
    header.onpointerdown = handleUpdateNoticePointerDown;
  }

  applyUpdateNoticePosition(host);
}

export function handleUpdateNoticePointerDown(event: PointerEvent): void {
  const host = document.getElementById(UPDATE_NOTICE_HOST_ID);

  if (!(host instanceof HTMLDivElement)) {
    return;
  }

  const rect = host.getBoundingClientRect();
  updateNoticeDragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false,
  };
}
