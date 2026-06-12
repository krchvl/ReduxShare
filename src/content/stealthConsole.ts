(() => {
  const STEALTH_MODE_MESSAGE = "REDUXSHARE_STEALTH_MODE";
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

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || typeof event.data !== "object") {
      return;
    }

    const message = event.data as Partial<{
      source: string;
      type: string;
      enabled: boolean;
    }>;

    if (message.source !== STEALTH_MESSAGE_SOURCE || message.type !== STEALTH_MODE_MESSAGE) {
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
