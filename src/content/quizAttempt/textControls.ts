import { ANSWER_WIDGET_ATTR } from "./model";

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const InputConstructor = input.ownerDocument.defaultView?.HTMLInputElement ?? window.HTMLInputElement;
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
  return textarea.closest(".qtype_essay_editor, .qtype_essay_response, .editor_atto, .editor_tiny") ?? textarea.parentElement;
}

function getTinyMceIframeForTextarea(textarea: HTMLTextAreaElement) {
  if (textarea.id) {
    const iframe = document.getElementById(`${textarea.id}_ifr`);

    if (iframe instanceof HTMLIFrameElement) {
      return iframe;
    }
  }

  const container = getTextareaEditorContainer(textarea);
  return container?.querySelector<HTMLIFrameElement>("iframe.tox-edit-area__iframe, iframe[id$='_ifr']") ?? null;
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

  return Array.from(container.querySelectorAll<HTMLElement>("[contenteditable='true']")).find((node) => {
    return node.isContentEditable && node.closest(`[${ANSWER_WIDGET_ATTR}="true"]`) === null;
  }) ?? null;
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
  const usesRichEditor = textarea.dataset.fieldtype === "editor" || Boolean(tinyMceBody || contentEditable);
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
