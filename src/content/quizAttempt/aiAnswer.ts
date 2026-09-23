// AI answer requests and application of the generated answers to the page.
// Moved out of src/content/quizAttempt.ts.
import {
  CHOICE_QUESTION_TYPES,
  TEXT_INPUT_QUESTION_TYPES,
  type AiAnswerAction,
  type AiAnswerResponse,
  type AiAnswerState,
  type AiQuestionControl,
  type AiQuestionImage,
  type AiQuestionOption,
  type AnswerData,
  type StoredStateLike
} from "../../model";
import { GENERATE_AI_ANSWER_MESSAGE } from "../../shared/messages";
import { getVariantCounts, getPreferredSuggestionLabels } from "../../data/answerData";
import {
  getAnswerLabelMatchKeys,
  getMoodleAnswerLabelText,
  getQuestionText,
  getSelectOptionLabel,
  getUniqueTexts,
  hashQuestionImage,
  isPlaceholderSelectOption,
  labelsMatch,
  normalizeAnswerLabel,
  normalizeFingerprintText,
  splitSequentialAnswerLabels,
  stableHashText,
  stripMoodleAnswerPrefix
} from "../../dom/questionDom";
import { getQuestionId, getQuestionPostData } from "../../dom/questionIdentity";
import {
  getSecondQuestionClass,
  getSupportedAutoSelectQuestionType,
  isAiDisabledQuestionTypeName,
  isAiOnlyQuestionTypeName,
  isChoiceQuestionType,
  isDragImageOrTextQuestionType,
  isDragMarkerQuestionType,
  isMatchingQuestionNode,
  isMatchingQuestionTypeName,
  isOrderingQuestionType,
  isTextInputQuestionType
} from "../../dom/questionTypes";
import { answerDataByQuestionId, aiAnswerStatesByQuestionKey, variantCountsByQuestionId } from "../../state";
import {
  applyOrderingOrder,
  getOrderingItemLabel,
  getOrderingItems,
  selectOrderingPositionByTrigger,
  syncOrderingResponseInput
} from "../../dom/ordering";
import { createIdleAiAnswerState } from "../../ui/answerMenu";
import { autoSelectChoiceQuestionAnswers, selectAnswerByLabel } from "./autoSelect";
import {
  findInputForAnswerLabel,
  findSelectOptionByLabel,
  getAnswerDataForQuestion,
  getChoiceAnswerInputs,
  getAnswerControlSlotIndex,
  getChoiceInputIndex,
  getEssayAnswerTextareas,
  getInputAnswerLabelText,
  getQuestionAnswerLabels,
  getQuestionHash,
  getSelectPlaceIndex,
  getSelectSlotIndexCandidates,
  getSelectControlLabel,
  getSelectableAnswerControls,
  getTextAnswerInputs,
  selectTextAnswerByLabel,
  setAnswerInputChecked,
  setSelectValue
} from "./answerControls";
import { autoSelectOrderingAnswers } from "./ordering";
import { applyDdmarkerExactCoordinateSet, getDdmarkerChoices, getDdmarkerDropArea, setDdmarkerChoiceAnswer } from "./ddmarker";
import { getDdwtosChoices, getDdwtosDropGroupIndex, getDdwtosDrops, getDdwtosDropSlotIndex, getDdwtosPlaceInput, getDdwtosSelectedLabelForDrop, setDdwtosDropAnswer } from "./ddwtos";
import { getDdimageOrTextChoices, getDdimageOrTextDropGroupIndex, getDdimageOrTextDrops, getDdimageOrTextDropSlotIndex, setDdimageOrTextDropAnswer } from "./ddimageortext";
import { setTextAnswerValue, setTextareaAnswerValue } from "./textControls";

export function getAiQuestionAnswerLabels(questionNode: Element) {
  return getQuestionAnswerLabels(questionNode, { includePlaceholderSelectOptions: false });
}



export function getAiActionLabel(action: AiAnswerAction) {
  return (action.coordinate ?? action.label ?? "").trim();
}


export function getAiActionForSlot(actions: AiAnswerAction[], slotIndex: number | null, fallbackIndex: number) {
  if (slotIndex !== null) {
    const slottedAction = actions.find((action) => action.slotIndex === slotIndex);

    if (slottedAction) {
      return slottedAction;
    }
  }

  return actions[fallbackIndex] ?? null;
}


export function extractAiAnswerFieldText(text: string) {
  const trimmedText = text.trim();

  if (!trimmedText.includes('"answer"')) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmedText);
    return parsed && typeof parsed === "object" && typeof (parsed as { answer?: unknown }).answer === "string"
      ? (parsed as { answer: string }).answer.trim()
      : "";
  } catch {
    const match = /"answer"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"|\s*})/i.exec(trimmedText);
    return match
      ? match[1]
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\\\/g, "\\")
          .trim()
      : "";
  }
}


import { parseAiMatchPairs, splitAiMatchPairText } from "../../shared/answerParsing";

export { parseAiMatchPairs, splitAiMatchPairText };


export function getAiMatchMappedSelectLabel(
  questionNode: Element,
  select: HTMLSelectElement,
  actions: AiAnswerAction[],
  fallbackAnswer: string | null | undefined,
  selectIndex: number
) {
  if (!isMatchingQuestionNode(questionNode)) {
    return "";
  }

  const promptLabel = getSelectControlLabel(questionNode, select, selectIndex);
  const candidateTexts = [
    fallbackAnswer ?? "",
    extractAiAnswerFieldText(fallbackAnswer ?? ""),
    ...actions.flatMap((action) => {
      const label = getAiActionLabel(action);
      return [label, extractAiAnswerFieldText(label)];
    })
  ].filter((text) => text.trim() !== "");

  for (const text of candidateTexts) {
    for (const pair of parseAiMatchPairs(text)) {
      if (!labelsMatch(pair.prompt, promptLabel)) {
        continue;
      }

      const option = findSelectOptionByLabel(select, pair.answer);
      if (option) {
        return option.textContent?.trim() || option.label || pair.answer;
      }
    }
  }

  return "";
}


export function applyAiSelectAnswers(questionNode: Element, actions: AiAnswerAction[], fallbackAnswer?: string | null) {
  const selects = getSelectableAnswerControls(questionNode);
  let changed = false;

  selects.forEach((select, index) => {
    const slotCandidates = isMatchingQuestionNode(questionNode) ? [index + 1] : getSelectSlotIndexCandidates(select);
    const action =
      actions.find((candidate) => slotCandidates.some((slotIndex) => candidate.slotIndex === slotIndex)) ??
      actions[index] ??
      null;
    const directLabel = action ? getAiActionLabel(action) : "";
    const label = directLabel && findSelectOptionByLabel(select, directLabel)
      ? directLabel
      : getAiMatchMappedSelectLabel(questionNode, select, actions, fallbackAnswer, index);
    const option = label ? findSelectOptionByLabel(select, label) : null;

    if (option) {
      changed = setSelectValue(select, option.value) || changed;
    }
  });

  return changed;
}


export function applyAiTextAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  const inputs = getTextAnswerInputs(questionNode);
  let changed = false;

  inputs.forEach((input, index) => {
    const action = getAiActionForSlot(actions, getAnswerControlSlotIndex(input), index);
    const label = action ? getAiActionLabel(action) : "";

    if (label) {
      changed = setTextAnswerValue(input, label) || changed;
    }
  });

  return changed;
}


export function applyAiEssayAnswer(questionNode: Element, actions: AiAnswerAction[], fallbackAnswer: string | null) {
  const textarea = getEssayAnswerTextareas(questionNode)[0];
  const label = getAiActionLabel(actions[0] ?? { label: fallbackAnswer ?? "" });

  return textarea && label ? setTextareaAnswerValue(textarea, label) : false;
}


export function applyAiChoiceAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  const labels = actions.map(getAiActionLabel).filter(Boolean);
  return labels.length > 0 ? autoSelectChoiceQuestionAnswers(questionNode, labels) : false;
}


export function applyAiDdwtosAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  let changed = false;

  getDdwtosDrops(questionNode).forEach((drop, index) => {
    const action = getAiActionForSlot(actions, getDdwtosDropSlotIndex(drop), index);
    const label = action ? getAiActionLabel(action) : "";

    if (label) {
      changed = setDdwtosDropAnswer(questionNode, drop, label) || changed;
    }
  });

  return changed;
}


export function applyAiDdmarkerAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  let changed = false;

  getDdmarkerChoices(questionNode).forEach((choice, index) => {
    const action = getAiActionForSlot(actions, choice.choiceIndex, index);
    const coordinate = action ? getAiActionLabel(action) : "";

    if (coordinate) {
      changed = setDdmarkerChoiceAnswer(questionNode, choice.choiceIndex, coordinate) || changed;
    }
  });

  return changed;
}


export function applyAiDdimageOrTextAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  let changed = false;

  getDdimageOrTextDrops(questionNode).forEach((drop, index) => {
    const action = getAiActionForSlot(actions, getDdimageOrTextDropSlotIndex(drop), index);
    const label = action ? getAiActionLabel(action) : "";

    if (label) {
      changed = setDdimageOrTextDropAnswer(questionNode, drop, label) || changed;
    }
  });

  return changed;
}


export function applyAiOrderingAnswers(questionNode: Element, state: AiAnswerState) {
  const itemCount = getOrderingItems(questionNode).length;
  const positionedActions = state.actions
    .filter((action) => typeof action.position === "number" && Number.isFinite(action.position))
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  const orderedLabels = positionedActions.length === itemCount
    ? positionedActions.map((action) => action.label)
    : splitSequentialAnswerLabels(state.actions.map(getAiActionLabel).filter(Boolean), itemCount);

  if (orderedLabels.length === itemCount) {
    return applyOrderingOrder(questionNode, orderedLabels);
  }

  return state.answer ? applyOrderingOrder(questionNode, splitSequentialAnswerLabels([state.answer], itemCount)) : false;
}


export function applyAiCompoundAnswers(questionNode: Element, actions: AiAnswerAction[]) {
  let changed = false;

  changed = applyAiSelectAnswers(questionNode, actions) || changed;
  changed = applyAiTextAnswers(questionNode, actions) || changed;

  const choiceGroups = new Map<string, HTMLInputElement[]>();

  for (const input of getChoiceAnswerInputs(questionNode)) {
    const key = input.name || input.id;
    const inputs = choiceGroups.get(key) ?? [];
    inputs.push(input);
    choiceGroups.set(key, inputs);
  }

  let groupIndex = 0;
  for (const inputs of choiceGroups.values()) {
    const action = getAiActionForSlot(actions, getAnswerControlSlotIndex(inputs[0]), groupIndex);
    const label = action ? getAiActionLabel(action) : "";

    if (!label) {
      groupIndex += 1;
      continue;
    }

    if (inputs.some((input) => input.type === "checkbox")) {
      const exactKeys = new Set(getAnswerLabelMatchKeys(label));

      for (const input of inputs) {
        const labelKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));
        changed = setAnswerInputChecked(input, [...labelKeys].some((key) => exactKeys.has(key))) || changed;
      }
    } else {
      const targetInput = inputs.find((input) => labelsMatch(getInputAnswerLabelText(questionNode, input), label));
      if (targetInput) {
        changed = setAnswerInputChecked(targetInput, true) || changed;
      }
    }

    groupIndex += 1;
  }

  return changed;
}


export function applyAiAnswerForQuestion(questionNode: Element, state: AiAnswerState) {
  const questionType = getSecondQuestionClass(questionNode);
  const actions = state.actions.length > 0
    ? state.actions
    : state.answer
      ? [{ label: state.answer }]
      : [];

  if (actions.length === 0 && !state.answer) {
    return false;
  }

  if (questionType === "essay") {
    return applyAiEssayAnswer(questionNode, actions, state.answer);
  }

  if (questionType === "ordering") {
    return applyAiOrderingAnswers(questionNode, state);
  }

  if (questionType === "ddwtos") {
    return applyAiDdwtosAnswers(questionNode, actions);
  }

  if (questionType === "ddmarker") {
    return applyAiDdmarkerAnswers(questionNode, actions);
  }

  if (questionType === "ddimageortext") {
    return applyAiDdimageOrTextAnswers(questionNode, actions);
  }

  if (questionType === "gapselect" || questionType === "gapfill") {
    return applyAiSelectAnswers(questionNode, actions);
  }

  if (isMatchingQuestionTypeName(questionType)) {
    return applyAiSelectAnswers(questionNode, actions, state.answer);
  }

  if (questionType === "multianswer") {
    return applyAiCompoundAnswers(questionNode, actions);
  }

  if (questionType && TEXT_INPUT_QUESTION_TYPES.has(questionType)) {
    return applyAiTextAnswers(questionNode, actions);
  }

  if (questionType && CHOICE_QUESTION_TYPES.has(questionType)) {
    return applyAiChoiceAnswers(questionNode, actions);
  }

  return state.answer ? selectAnswerByLabel(questionNode, state.answer) : false;
}


export function getAiQuestionKey(questionNode: Element | null, questionId: string | null) {
  if (questionId) {
    return `qid:${questionId}`;
  }

  if (!questionNode) {
    return "unknown";
  }

  const questionType = getSecondQuestionClass(questionNode);
  const questionHash = getQuestionHash(questionNode, questionType);

  return questionHash ? `hash:${questionHash}` : `text:${stableHashText(getQuestionText(questionNode))}`;
}


export function getAiAnswerState(questionKey: string) {
  return aiAnswerStatesByQuestionKey.get(questionKey) ?? createIdleAiAnswerState();
}


export function requestAiGeneratedAnswer(payload: {
  questionId: string | null;
  questionType: string | null;
  questionText: string;
  answerLabels: string[];
  controls: AiQuestionControl[];
  images: AiQuestionImage[];
  pageUrl: string;
}): Promise<AiAnswerResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: GENERATE_AI_ANSWER_MESSAGE,
        payload
      },
      (response: AiAnswerResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      }
    );
  });
}


export function buildAiQuestionControls(questionNode: Element): AiQuestionControl[] {
  const controls: AiQuestionControl[] = [];

  for (const [index, input] of getChoiceAnswerInputs(questionNode).entries()) {
    controls.push({
      kind: "choice",
      label: getInputAnswerLabelText(questionNode, input),
      slotIndex: getAnswerControlSlotIndex(input) ?? getChoiceInputIndex(input),
      index
    });
  }

  for (const [index, select] of getSelectableAnswerControls(questionNode).entries()) {
    controls.push({
      kind: "select",
      label: getSelectControlLabel(questionNode, select, index),
      slotIndex: isMatchingQuestionNode(questionNode) ? index + 1 : getSelectPlaceIndex(select) ?? index + 1,
      index,
      options: Array.from(select.options)
        .filter((option) => !isPlaceholderSelectOption(option))
        .map((option, optionIndex) => ({
          label: getSelectOptionLabel(option),
          value: option.value,
          index: optionIndex
        }))
    });
  }

  for (const [index, input] of getTextAnswerInputs(questionNode).entries()) {
    controls.push({
      kind: "text",
      label: input.getAttribute("aria-label")?.trim() || input.placeholder.trim() || input.name || `Text input ${index + 1}`,
      slotIndex: getAnswerControlSlotIndex(input) ?? index + 1,
      index
    });
  }

  for (const [index, textarea] of getEssayAnswerTextareas(questionNode).entries()) {
    controls.push({
      kind: "textarea",
      label:
        textarea.getAttribute("aria-label")?.trim() ||
        textarea.placeholder.trim() ||
        textarea.name ||
        `Essay response ${index + 1}`,
      slotIndex: getAnswerControlSlotIndex(textarea) ?? index + 1,
      index
    });
  }

  if (questionNode.classList.contains("ordering")) {
    getOrderingItems(questionNode).forEach((item, index) => {
      controls.push({
        kind: "ordering-item",
        label: getOrderingItemLabel(item),
        slotIndex: index + 1,
        index
      });
    });
  }

  if (questionNode.classList.contains("ddwtos")) {
    const choices = getDdwtosChoices(questionNode);

    for (const drop of getDdwtosDrops(questionNode)) {
      const slotIndex = getDdwtosDropSlotIndex(drop);
      const groupIndex = getDdwtosDropGroupIndex(drop);
      controls.push({
        kind: "drop",
        label: `Blank ${slotIndex ?? controls.length + 1}`,
        slotIndex,
        groupIndex,
        options: choices
          .filter((choice) => groupIndex === null || choice.groupIndex === null || choice.groupIndex === groupIndex)
          .map((choice) => ({
            label: choice.label,
            index: choice.choiceIndex,
            groupIndex: choice.groupIndex
          }))
      });
    }
  }

  if (questionNode.classList.contains("ddmarker")) {
    for (const choice of getDdmarkerChoices(questionNode)) {
      controls.push({
        kind: "marker",
        label: choice.label,
        slotIndex: choice.choiceIndex,
        index: choice.choiceIndex
      });
    }
  }

  if (questionNode.classList.contains("ddimageortext")) {
    const choices = getDdimageOrTextChoices(questionNode);

    for (const drop of getDdimageOrTextDrops(questionNode)) {
      const slotIndex = getDdimageOrTextDropSlotIndex(drop);
      const groupIndex = getDdimageOrTextDropGroupIndex(drop);
      controls.push({
        kind: "drop",
        label: `Dropzone ${slotIndex ?? controls.length + 1}`,
        slotIndex,
        groupIndex,
        options: choices
          .filter((choice) => groupIndex === null || choice.groupIndex === null || choice.groupIndex === groupIndex)
          .map((choice) => ({
            label: choice.label,
            index: choice.choiceIndex,
            groupIndex: choice.groupIndex
          }))
      });
    }
  }

  return controls.filter((control) => control.label.trim() !== "");
}


export function getImageDimension(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

// The background service worker no longer holds blanket host permissions, so it
// cannot fetch the ddmarker background from the arbitrary quiz origin. The content
// script is same-origin here: inline the bytes into a data URL before messaging.
async function toDataUrl(imageElement: HTMLImageElement): Promise<string | null> {
  try {
    const response = await fetch(imageElement.src, { credentials: "include" });

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();

    if (!blob.type.startsWith("image/")) {
      return null;
    }

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();

      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildAiQuestionImages(questionNode: Element): Promise<AiQuestionImage[]> {
  if (!questionNode.classList.contains("ddmarker")) {
    return [];
  }

  const backgroundImage = questionNode.querySelector<HTMLImageElement>(".ddarea .dropbackground");

  if (!backgroundImage?.src) {
    return [];
  }

  const imageRect = backgroundImage.getBoundingClientRect();
  const dropAreaRect = getDdmarkerDropArea(questionNode)?.getBoundingClientRect();
  const dataUrl = await toDataUrl(backgroundImage);

  return [
    {
      label: "ddmarker background image",
      url: backgroundImage.src,
      width: getImageDimension(imageRect.width || backgroundImage.clientWidth || dropAreaRect?.width || backgroundImage.naturalWidth),
      height: getImageDimension(imageRect.height || backgroundImage.clientHeight || dropAreaRect?.height || backgroundImage.naturalHeight),
      naturalWidth: getImageDimension(backgroundImage.naturalWidth),
      naturalHeight: getImageDimension(backgroundImage.naturalHeight),
      dataUrl
    }
  ];
}


export async function buildAiAnswerRequestPayload(questionNode: Element, questionId: string | null) {
  return {
    questionId,
    questionType: getSecondQuestionClass(questionNode),
    questionText: getQuestionText(questionNode),
    answerLabels: getAiQuestionAnswerLabels(questionNode),
    controls: buildAiQuestionControls(questionNode),
    images: await buildAiQuestionImages(questionNode),
    pageUrl: window.location.href
  };
}

