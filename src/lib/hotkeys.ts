export const DEFAULT_HOTKEY = "R";
export const DEFAULT_HOTKEY_CODE = "KeyR";

const NON_BINDABLE_KEYS = new Set([
  "Alt",
  "CapsLock",
  "Control",
  "Dead",
  "Escape",
  "Meta",
  "Process",
  "Shift",
  "Tab",
  "Unidentified"
]);

const NON_BINDABLE_CODES = new Set([
  "AltLeft",
  "AltRight",
  "CapsLock",
  "ControlLeft",
  "ControlRight",
  "Escape",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
  "Tab",
  "Unidentified"
]);

const CODE_LABELS: Record<string, string> = {
  Backquote: "`",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Equal: "=",
  Minus: "-",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Space: "Space"
};

export interface HotkeyBinding {
  label: string;
  code: string;
}

function normalizeNamedHotkey(value: string) {
  const lowerValue = value.toLowerCase();

  if (lowerValue === " ") {
    return "Space";
  }

  if (lowerValue === "space" || lowerValue === "spacebar") {
    return "Space";
  }

  if (/^f\d{1,2}$/i.test(value)) {
    return value.toUpperCase();
  }

  if (lowerValue.startsWith("arrow")) {
    const direction = lowerValue.slice("arrow".length);
    return `Arrow${direction.charAt(0).toUpperCase()}${direction.slice(1)}`;
  }

  return value;
}

function inferCodeFromHotkey(hotkey: string) {
  if (/^[A-Z]$/.test(hotkey)) {
    return `Key${hotkey}`;
  }

  if (/^[0-9]$/.test(hotkey)) {
    return `Digit${hotkey}`;
  }

  if (hotkey === "Space" || hotkey.startsWith("Arrow") || /^F\d{1,2}$/.test(hotkey)) {
    return hotkey;
  }

  const matchingCode = Object.entries(CODE_LABELS).find(([, label]) => label === hotkey)?.[0];
  return matchingCode ?? null;
}

function getLabelFromCode(code: string) {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice("Key".length);
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice("Digit".length);
  }

  if (/^Numpad[0-9]$/.test(code)) {
    return `Num${code.slice("Numpad".length)}`;
  }

  if (/^F\d{1,2}$/.test(code)) {
    return code;
  }

  if (code.startsWith("Arrow")) {
    return code;
  }

  return CODE_LABELS[code] ?? null;
}

export function normalizeHotkeyValue(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_HOTKEY;
  }

  if (value === " ") {
    return "Space";
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return DEFAULT_HOTKEY;
  }

  if (trimmedValue.length === 1) {
    return trimmedValue.toUpperCase();
  }

  return normalizeNamedHotkey(trimmedValue);
}

export function normalizeHotkeyCode(value: unknown, hotkey: unknown = DEFAULT_HOTKEY) {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (trimmedValue && trimmedValue !== "Unidentified") {
      return trimmedValue;
    }
  }

  return inferCodeFromHotkey(normalizeHotkeyValue(hotkey)) ?? DEFAULT_HOTKEY_CODE;
}

export function formatHotkeyBindingFromKeyboardEvent(event: KeyboardEvent): HotkeyBinding | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  if (event.code && !NON_BINDABLE_CODES.has(event.code)) {
    const codeLabel = getLabelFromCode(event.code);

    if (codeLabel) {
      return {
        label: codeLabel,
        code: event.code
      };
    }
  }

  if (!event.key.trim()) {
    return null;
  }

  const hotkey = normalizeHotkeyValue(event.key);

  if (NON_BINDABLE_KEYS.has(hotkey)) {
    return null;
  }

  return {
    label: hotkey,
    code: (inferCodeFromHotkey(hotkey) ?? event.code) || hotkey
  };
}

export function hotkeyMatchesEvent(hotkey: string, hotkeyCode: string | undefined, event: KeyboardEvent) {
  if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  const eventBinding = formatHotkeyBindingFromKeyboardEvent(event);

  if (!eventBinding) {
    return false;
  }

  return eventBinding.code === normalizeHotkeyCode(hotkeyCode, hotkey);
}
