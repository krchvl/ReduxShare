import { ANSWER_WIDGET_ATTR } from "../../model";

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const InputConstructor =
    input.ownerDocument.defaultView?.HTMLInputElement ?? window.HTMLInputElement;
  const ownSetter = Object.getOwnPropertyDescriptor(input, "value")?.set;
  const prototypeSetter = Object.getOwnPropertyDescriptor(InputConstructor.prototype, "value")?.set;
  const setter = prototypeSetter && ownSetter !== prototypeSetter ? prototypeSetter : ownSetter;

  if (setter) {
    setter.call(input, value);
    return;
  }

  input.value = value;
}

function createControlEvent(control: HTMLElement, type: string) {
  const EventConstructor = control.ownerDocument.defaultView?.Event ?? Event;
  return new EventConstructor(type, { bubbles: true });
}

function dispatchTextControlEvents(control: HTMLElement) {
  control.dispatchEvent(createControlEvent(control, "input"));
  control.dispatchEvent(createControlEvent(control, "change"));
}

export interface HumanTypingOptions {
  minIntervalMs?: number;
  maxIntervalMs?: number;
  random?: () => number;
}

const HUMAN_TYPING_MIN_INTERVAL_MS = 45;
const HUMAN_TYPING_MAX_INTERVAL_MS = 190;

function dispatchKeyEvent(control: HTMLElement, type: string, key: string): void {
  const EventConstructor = control.ownerDocument.defaultView?.KeyboardEvent ?? window.KeyboardEvent;
  control.dispatchEvent(new EventConstructor(type, { key, bubbles: true, cancelable: true }));
}

function sleepTyping(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function typeTextHumanLike(
  control: HTMLInputElement | HTMLTextAreaElement,
  label: string,
  options: HumanTypingOptions = {},
): Promise<boolean> {
  const nextValue = label.trim();

  if (!nextValue) {
    return false;
  }

  const random = options.random ?? Math.random;
  const minInterval = options.minIntervalMs ?? HUMAN_TYPING_MIN_INTERVAL_MS;
  const maxInterval = Math.max(minInterval, options.maxIntervalMs ?? HUMAN_TYPING_MAX_INTERVAL_MS);

  try {
    if (typeof control.focus === "function") {
      control.focus({ preventScroll: true });
    }
  } catch {}

  const previousValue = control.value;
  const InputConstructor =
    control.ownerDocument.defaultView?.HTMLInputElement ?? window.HTMLInputElement;
  const setValue =
    control instanceof InputConstructor
      ? (value: string) => setNativeInputValue(control, value)
      : (value: string) => {
          control.value = value;
        };
  setValue("");

  for (const char of nextValue) {
    dispatchKeyEvent(control, "keydown", char);
    dispatchKeyEvent(control, "keypress", char);
    setValue(control.value + char);
    control.dispatchEvent(createControlEvent(control, "input"));
    dispatchKeyEvent(control, "keyup", char);
    await sleepTyping(minInterval + random() * (maxInterval - minInterval));
  }

  if (control.getAttribute("value") !== nextValue) {
    control.setAttribute("value", nextValue);
  }

  control.dispatchEvent(createControlEvent(control, "change"));
  return previousValue !== nextValue;
}

export function setTextAnswerValue(input: HTMLInputElement, label: string) {
  const nextValue = label.trim();

  if (!nextValue) {
    return false;
  }

  const previousValue = input.value;
  setNativeInputValue(input, nextValue);

  if (input.getAttribute("value") !== nextValue) {
    input.setAttribute("value", nextValue);
  }

  dispatchTextControlEvents(input);
  return previousValue !== nextValue;
}

function escapeEditorHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextToEditorHtml(value: string) {
  const paragraphs = value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return "";
  }

  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split(/\n/).map((line) => escapeEditorHtml(line.trim()));
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

function getTextareaEditorContainer(textarea: HTMLTextAreaElement) {
  return (
    textarea.closest(".qtype_essay_editor, .qtype_essay_response, .editor_atto, .editor_tiny") ??
    textarea.parentElement
  );
}

export function hasRichTextEditorForTextarea(textarea: HTMLTextAreaElement) {
  return (
    textarea.dataset.fieldtype === "editor" ||
    Boolean(getTinyMceBodyForTextarea(textarea) || getContentEditableForTextarea(textarea))
  );
}

function getTinyMceIframeForTextarea(textarea: HTMLTextAreaElement) {
  if (textarea.id) {
    const iframe = document.getElementById(`${textarea.id}_ifr`);

    if (iframe instanceof HTMLIFrameElement) {
      return iframe;
    }
  }

  const container = getTextareaEditorContainer(textarea);
  return (
    container?.querySelector<HTMLIFrameElement>(
      "iframe.tox-edit-area__iframe, iframe[id$='_ifr']",
    ) ?? null
  );
}

function getTinyMceBodyForTextarea(textarea: HTMLTextAreaElement) {
  const iframe = getTinyMceIframeForTextarea(textarea);

  if (!iframe) {
    return null;
  }

  try {
    const body = iframe.contentDocument?.body ?? iframe.contentWindow?.document.body ?? null;

    if (!body) {
      return null;
    }

    if (textarea.id && body.dataset.id && body.dataset.id !== textarea.id) {
      return null;
    }

    return body;
  } catch {
    return null;
  }
}

function getContentEditableForTextarea(textarea: HTMLTextAreaElement) {
  if (textarea.id) {
    const attoEditable = document.getElementById(`${textarea.id}editable`);

    if (attoEditable instanceof HTMLElement && attoEditable.isContentEditable) {
      return attoEditable;
    }
  }

  const container = getTextareaEditorContainer(textarea);

  if (!container) {
    return null;
  }

  return (
    Array.from(container.querySelectorAll<HTMLElement>("[contenteditable='true']")).find((node) => {
      return node.isContentEditable && node.closest(`[${ANSWER_WIDGET_ATTR}="true"]`) === null;
    }) ?? null
  );
}

function setRichEditorContent(editorElement: HTMLElement, html: string) {
  if (editorElement.innerHTML === html) {
    return false;
  }

  editorElement.innerHTML = html;
  dispatchTextControlEvents(editorElement);
  return true;
}

export function setTextareaAnswerValue(textarea: HTMLTextAreaElement, label: string) {
  const nextValue = label.trim();

  if (!nextValue) {
    return false;
  }

  const tinyMceBody = getTinyMceBodyForTextarea(textarea);
  const contentEditable = tinyMceBody ? null : getContentEditableForTextarea(textarea);
  const usesRichEditor =
    textarea.dataset.fieldtype === "editor" || Boolean(tinyMceBody || contentEditable);
  const textareaValue = usesRichEditor ? plainTextToEditorHtml(nextValue) : nextValue;
  let changed = false;

  if (tinyMceBody) {
    changed = setRichEditorContent(tinyMceBody, textareaValue) || changed;
  }

  if (contentEditable) {
    changed = setRichEditorContent(contentEditable, textareaValue) || changed;
  }

  if (textarea.value !== textareaValue) {
    textarea.value = textareaValue;
    changed = true;
  }

  if (changed) {
    dispatchTextControlEvents(textarea);
  }

  return changed;
}
