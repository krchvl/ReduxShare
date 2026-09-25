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
  syncOrderingResponseInput,
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
  syncOrderingResponseInput,
};
