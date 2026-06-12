import {
  AI_DISABLED_QUESTION_TYPES,
  AI_ONLY_QUESTION_TYPES,
  CHOICE_QUESTION_TYPES,
  COMPOUND_QUESTION_TYPES,
  DRAG_IMAGE_OR_TEXT_QUESTION_TYPES,
  DRAG_MARKER_QUESTION_TYPES,
  DRAG_TEXT_QUESTION_TYPES,
  ESSAY_QUESTION_TYPES,
  MATCHING_QUESTION_TYPES,
  SELECTABLE_QUESTION_TYPES,
  SUPPORTED_AUTO_SELECT_QUESTION_TYPES,
  TEXT_INPUT_QUESTION_TYPES
} from "./model";

export function getSecondQuestionClass(questionNode: Element) {
  const classNames = Array.from(questionNode.classList);
  const queIndex = classNames.indexOf("que");

  if (queIndex >= 0) {
    return classNames[queIndex + 1] ?? null;
  }

  return classNames[1] ?? null;
}

export function isMatchingQuestionTypeName(questionType: string | null | undefined) {
  return questionType !== null && questionType !== undefined && MATCHING_QUESTION_TYPES.has(questionType);
}

export function isMatchingQuestionNode(questionNode: Element | null | undefined) {
  return isMatchingQuestionTypeName(questionNode ? getSecondQuestionClass(questionNode) : null);
}

export function isSelectableQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && SELECTABLE_QUESTION_TYPES.has(questionType);
}

export function isOrderingQuestionType(questionNode: Element) {
  return questionNode.classList.contains("ordering");
}

export function isCompoundQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && COMPOUND_QUESTION_TYPES.has(questionType);
}

export function isDragTextQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && DRAG_TEXT_QUESTION_TYPES.has(questionType);
}

export function isDragMarkerQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && DRAG_MARKER_QUESTION_TYPES.has(questionType);
}

export function isDragImageOrTextQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && DRAG_IMAGE_OR_TEXT_QUESTION_TYPES.has(questionType);
}

export function isTextInputQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && TEXT_INPUT_QUESTION_TYPES.has(questionType);
}

export function isEssayQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && ESSAY_QUESTION_TYPES.has(questionType);
}

export function isAiOnlyQuestionTypeName(questionType: string | null | undefined) {
  return questionType !== null && questionType !== undefined && AI_ONLY_QUESTION_TYPES.has(questionType);
}

export function isAiDisabledQuestionTypeName(questionType: string | null | undefined) {
  return questionType !== null && questionType !== undefined && AI_DISABLED_QUESTION_TYPES.has(questionType);
}

export function isChoiceQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType !== null && CHOICE_QUESTION_TYPES.has(questionType);
}

export function getSupportedAutoSelectQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);
  return questionType && SUPPORTED_AUTO_SELECT_QUESTION_TYPES.has(questionType) ? questionType : null;
}
