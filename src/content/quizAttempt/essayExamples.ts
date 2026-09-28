import { getEssayAnswerTextareas } from "./answerControls";
import {
  hasRichTextEditorForTextarea,
  setTextareaAnswerValue,
  typeTextHumanLike,
} from "./textControls";

const ESSAY_RESPONSE_SELECTOR = ".qtype_essay_response";

export interface EssayExampleQuestionRef {
  questionId: string | null;
  questionHash: string | null;
}

// Ключ примеров в essayExamplesByQuestionId: вопрос без ID (старый Moodle)
// индексируется по хешу вопроса.
export function getEssayExampleMapKey(question: EssayExampleQuestionRef) {
  return question.questionId ? question.questionId : `hash:${question.questionHash ?? ""}`;
}

// Rich-редакторы и показанный на review ответ хранят HTML — превращаем его
// обратно в plain text с сохранением абзацев.
export function htmlToPlainText(html: string) {
  const trimmed = html.trim();

  if (!trimmed || !/[<&]/.test(trimmed)) {
    return trimmed;
  }

  const doc = new DOMParser().parseFromString(trimmed, "text/html");

  doc.body.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.body.querySelectorAll("p, div, li").forEach((node) => node.append("\n"));

  return (doc.body.textContent ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Текущий текст эссе: на attempt-странице — из редактора/textarea,
// на review — из показанного сохранённого ответа.
export function getCurrentEssayText(questionNode: Element) {
  const textarea = getEssayAnswerTextareas(questionNode)[0];
  const editorValue = textarea && textarea.value.trim() ? textarea.value : "";
  const responseValue = questionNode.querySelector(ESSAY_RESPONSE_SELECTOR)?.textContent ?? "";

  return htmlToPlainText(editorValue || responseValue);
}

export async function applyEssayExampleToQuestion(
  questionNode: Element,
  body: string,
  options: { humanTyping: boolean },
) {
  const textarea = getEssayAnswerTextareas(questionNode)[0];

  if (!textarea || !body.trim()) {
    return false;
  }

  if (options.humanTyping && !hasRichTextEditorForTextarea(textarea)) {
    const typed = await typeTextHumanLike(textarea, body);

    if (typed) {
      return true;
    }
  }

  return setTextareaAnswerValue(textarea, body);
}
