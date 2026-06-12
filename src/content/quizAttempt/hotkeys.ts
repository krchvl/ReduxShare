import { DEFAULT_HOTKEY, DEFAULT_HOTKEY_CODE } from "./model";

const NON_BINDABLE_HOTKEYS = new Set([
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

const NON_BINDABLE_HOTKEY_CODES = new Set([
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

const HOTKEY_CODE_LABELS: Record<string, string> = {
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

  const lowerValue = trimmedValue.toLowerCase();

  if (lowerValue === "space" || lowerValue === "spacebar") {
    return "Space";
  }

  if (/^f\d{1,2}$/i.test(trimmedValue)) {
    return trimmedValue.toUpperCase();
  }

  if (lowerValue.startsWith("arrow")) {
    const direction = lowerValue.slice("arrow".length);
    return `Arrow${direction.charAt(0).toUpperCase()}${direction.slice(1)}`;
  }

  return trimmedValue;
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

  return Object.entries(HOTKEY_CODE_LABELS).find(([, label]) => label === hotkey)?.[0] ?? null;
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

  if (/^F\d{1,2}$/.test(code) || code.startsWith("Arrow")) {
    return code;
  }

  return HOTKEY_CODE_LABELS[code] ?? null;
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

function formatHotkeyBindingFromKeyboardEvent(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }

  if (event.code && !NON_BINDABLE_HOTKEY_CODES.has(event.code)) {
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

  if (NON_BINDABLE_HOTKEYS.has(hotkey)) {
    return null;
  }

  return {
    label: hotkey,
    code: (inferCodeFromHotkey(hotkey) ?? event.code) || hotkey
  };
}

export function hotkeyMatchesEvent(hotkey: string, hotkeyCode: string, event: KeyboardEvent) {
  if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }

  return formatHotkeyBindingFromKeyboardEvent(event)?.code === normalizeHotkeyCode(hotkeyCode, hotkey);
}
