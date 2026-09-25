import type { AnswerData } from "../../model";
import { getPreferredSuggestionLabels } from "../../data/answerData";
import { getAnswerLabelMatchKeys } from "../../dom/questionDom";
import { isCompoundQuestionType } from "../../dom/questionTypes";
import {
  findInputForAnswerLabel,
  findSelectOptionByLabel,
  getAnswerSlotForControl,
  getAnswerSlotForSelect,
  getChoiceAnswerInputs,
  getInputAnswerLabelText,
  getSelectableAnswerControls,
  getTextAnswerInputs,
  setAnswerInputChecked,
  setSelectValue,
} from "./answerControls";
import { setTextAnswerValue } from "./textControls";

export function autoSelectCompoundAnswers(questionNode: Element, answerData: AnswerData): boolean {
  if (!isCompoundQuestionType(questionNode)) {
    return false;
  }

  let changed = false;

  for (const select of getSelectableAnswerControls(questionNode)) {
    const slot = getAnswerSlotForSelect(answerData, select);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];
    const option = labels.length === 1 ? findSelectOptionByLabel(select, labels[0]) : null;

    if (option) {
      changed = setSelectValue(select, option.value) || changed;
    }
  }

  for (const input of getTextAnswerInputs(questionNode)) {
    const slot = getAnswerSlotForControl(answerData, input);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (labels.length === 1) {
      changed = setTextAnswerValue(input, labels[0]) || changed;
    }
  }

  const choiceInputsByName = new Map<string, HTMLInputElement[]>();

  for (const input of getChoiceAnswerInputs(questionNode)) {
    const key = input.name || input.id;
    const inputs = choiceInputsByName.get(key) ?? [];
    inputs.push(input);
    choiceInputsByName.set(key, inputs);
  }

  for (const inputs of choiceInputsByName.values()) {
    const slot = getAnswerSlotForControl(answerData, inputs[0]);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (labels.length === 0) {
      continue;
    }

    const exactKeys = new Set(labels.flatMap((label) => [...getAnswerLabelMatchKeys(label)]));

    if (inputs.some((input) => input.type === "checkbox")) {
      for (const input of inputs) {
        const labelKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));
        const shouldCheck = [...labelKeys].some((key) => exactKeys.has(key));
        changed = setAnswerInputChecked(input, shouldCheck) || changed;
      }
      continue;
    }

    const targetInput = inputs.find((input) => {
      const labelKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));
      return [...labelKeys].some((key) => exactKeys.has(key));
    });

    if (targetInput) {
      changed = setAnswerInputChecked(targetInput, true) || changed;
    }
  }

  return changed;
}

export {
  findInputForAnswerLabel,
  findSelectOptionByLabel,
  getAnswerSlotForControl,
  getAnswerSlotForSelect,
  getChoiceAnswerInputs,
  getPreferredSuggestionLabels,
  getSelectableAnswerControls,
  getTextAnswerInputs,
  setAnswerInputChecked,
  setSelectValue,
  setTextAnswerValue,
};
