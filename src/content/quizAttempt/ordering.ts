// Ordering questions: working out the expected order from answer data and writing it back into
// the response input Moodle reads on submit. The low-level list helpers live in src/dom/ordering.ts.
import type { AnswerData } from "../../model";
import { getPreferredSuggestionLabels } from "../../data/answerData";
import { isOrderingQuestionType } from "../../dom/questionTypes";
import {
  applyOrderingOrder,
  getOrderingExactOrder,
  getOrderingItemLabel,
  getOrderingItems,
  getOrderingList,
  getOrderingSlotPosition,
  syncOrderingResponseInput
} from "../../dom/ordering";
import { labelsMatch, splitSequentialAnswerLabels } from "../../dom/questionDom";

export function autoSelectOrderingAnswers(questionNode: Element, answerData: AnswerData): boolean {
  if (!isOrderingQuestionType(questionNode)) {
    return false;
  }

  const orderedLabels = getOrderingExactOrder(answerData, questionNode);
  return orderedLabels.length > 0 ? applyOrderingOrder(questionNode, orderedLabels) : false;
}

export {
  applyOrderingOrder,
  getOrderingExactOrder,
  getOrderingItemLabel,
  getOrderingItems,
  getOrderingList,
  getOrderingSlotPosition,
  getPreferredSuggestionLabels,
  labelsMatch,
  splitSequentialAnswerLabels,
  syncOrderingResponseInput
};
