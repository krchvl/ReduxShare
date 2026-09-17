(() => {
  const STEALTH_MODE_MESSAGE = "REDUXSHARE_STEALTH_MODE";
  const COPY_UNLOCK_MESSAGE = "REDUXSHARE_COPY_UNLOCK";
  const STEALTH_MESSAGE_SOURCE = "ReduxShare";

  const SUPPRESSED_CONSOLE_PATTERNS = [
    /^ReduxShare\b/i,
    /^Starting Moodle session\b/i,
    /\bMoodle session\b.*\b(?:keep-alive|timeout|warning)\b/i
  ];

  let stealthModeEnabled = false;
  let consolePatched = false;

  const originalConsole = {
    debug: console.debug.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    log: console.log.bind(console),
    warn: console.warn.bind(console)
  };

  type ConsoleMethodName = keyof typeof originalConsole;

  function stringifyConsoleArg(value: unknown) {
    if (typeof value === "string") {
      return value;
    }

    if (value instanceof Error) {
      return `${value.name}: ${value.message}`;
    }

    try {
      return String(value);
    } catch {
      return "";
    }
  }

  function shouldSuppressConsoleCall(args: unknown[]) {
    if (!stealthModeEnabled) {
      return false;
    }

    const message = args.map(stringifyConsoleArg).join(" ");
    return SUPPRESSED_CONSOLE_PATTERNS.some((pattern) => pattern.test(message));
  }

  function patchConsoleMethod(methodName: ConsoleMethodName) {
    console[methodName] = (...args: unknown[]) => {
      if (shouldSuppressConsoleCall(args)) {
        return;
      }

      originalConsole[methodName](...args);
    };
  }

  function patchConsole() {
    if (consolePatched) {
      return;
    }

    patchConsoleMethod("debug");
    patchConsoleMethod("error");
    patchConsoleMethod("info");
    patchConsoleMethod("log");
    patchConsoleMethod("warn");
    consolePatched = true;
  }

  function restoreConsole() {
    if (!consolePatched) {
      return;
    }

    console.debug = originalConsole.debug;
    console.error = originalConsole.error;
    console.info = originalConsole.info;
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    consolePatched = false;
  }

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
    "dragstart"
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
    // Keyboard handler is narrowly scoped: any other key must reach the page.
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

    if (message.source !== STEALTH_MESSAGE_SOURCE) {
      return;
    }

    if (message.type === COPY_UNLOCK_MESSAGE) {
      setCopyUnlockEnabled(message.enabled === true);
      return;
    }

    if (message.type !== STEALTH_MODE_MESSAGE) {
      return;
    }

    stealthModeEnabled = message.enabled === true;

    if (stealthModeEnabled) {
      patchConsole();
    } else {
      restoreConsole();
    }
  });
})();

export {};
