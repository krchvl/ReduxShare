const SUPPRESSED_CONSOLE_PATTERNS = [
  /^ReduxShare\b/i,
  /^Starting Moodle session\b/i,
  /\bMoodle session\b.*\b(?:keep-alive|timeout|warning)\b/i,
];

const originalConsole = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
};

type ConsoleMethodName = keyof typeof originalConsole;

let installed = false;

function stringifyConsoleArg(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  return "";
}

function shouldSuppressConsoleCall(args: unknown[]) {
  const message = args.map(stringifyConsoleArg).filter(Boolean).join(" ");

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

export function installConsoleFilter() {
  if (installed) {
    return;
  }

  installed = true;

  for (const methodName of Object.keys(originalConsole) as ConsoleMethodName[]) {
    patchConsoleMethod(methodName);
  }
}
