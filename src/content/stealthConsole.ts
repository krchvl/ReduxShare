import { installConsoleFilter } from "../shared/consoleFilter";
import { CONTENT_MESSAGE_SOURCE, COPY_UNLOCK_MESSAGE } from "../shared/messages";

(() => {
  installConsoleFilter();

  const COPY_UNLOCK_STYLE_ID = "reduxshare-copy-unlock-style";
  const COPY_UNLOCK_EVENTS = [
    "copy",
    "cut",
    "paste",
    "beforecopy",
    "beforecut",
    "beforepaste",
    "contextmenu",
    "selectstart",
    "dragstart",
  ] as const;
  const COPY_UNLOCK_SHORTCUTS = ["c", "x", "v", "a", "insert"];

  let copyUnlockEnabled = false;
  let copyUnlockListenersInstalled = false;

  function isCopyUnlockShortcut(event: Event) {
    if (event.type !== "keydown" && event.type !== "keyup" && event.type !== "keypress") {
      return false;
    }

    const keyboardEvent = event as KeyboardEvent;
    const key = (keyboardEvent.key ?? "").toLowerCase();

    if (!key || !(keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
      return false;
    }

    return COPY_UNLOCK_SHORTCUTS.includes(key);
  }

  function allowCopyPasteEvent(event: Event) {
    if (
      (event.type === "keydown" || event.type === "keyup" || event.type === "keypress") &&
      !isCopyUnlockShortcut(event)
    ) {
      return;
    }

    event.stopImmediatePropagation();
  }

  function setCopyUnlockStyle(enabled: boolean) {
    let style = document.getElementById(COPY_UNLOCK_STYLE_ID);

    if (!enabled) {
      style?.remove();
      return;
    }

    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement("style");
      style.id = COPY_UNLOCK_STYLE_ID;
      (document.head ?? document.documentElement).append(style);
    }

    style.textContent =
      "*,*::before,*::after{-webkit-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important;}";
  }

  function installCopyUnlockListeners() {
    if (copyUnlockListenersInstalled) {
      return;
    }

    copyUnlockListenersInstalled = true;

    for (const type of [...COPY_UNLOCK_EVENTS, "keydown", "keyup", "keypress"]) {
      window.addEventListener(type, allowCopyPasteEvent, true);
      document.addEventListener(type, allowCopyPasteEvent, true);
    }
  }

  function removeCopyUnlockListeners() {
    if (!copyUnlockListenersInstalled) {
      return;
    }

    copyUnlockListenersInstalled = false;

    for (const type of [...COPY_UNLOCK_EVENTS, "keydown", "keyup", "keypress"]) {
      window.removeEventListener(type, allowCopyPasteEvent, true);
      document.removeEventListener(type, allowCopyPasteEvent, true);
    }
  }

  function setCopyUnlockEnabled(enabled: boolean) {
    copyUnlockEnabled = enabled;

    if (copyUnlockEnabled) {
      installCopyUnlockListeners();
    } else {
      removeCopyUnlockListeners();
    }

    setCopyUnlockStyle(copyUnlockEnabled);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || typeof event.data !== "object") {
      return;
    }

    const message = event.data as Partial<{
      source: string;
      type: string;
      enabled: boolean;
    }>;

    if (message.source !== CONTENT_MESSAGE_SOURCE || message.type !== COPY_UNLOCK_MESSAGE) {
      return;
    }

    setCopyUnlockEnabled(message.enabled === true);
  });
})();

export {};
