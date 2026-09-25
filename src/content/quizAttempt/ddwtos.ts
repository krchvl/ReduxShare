import { type AnswerData } from "../../model";
import { getPreferredSuggestionLabels } from "../../data/answerData";
import { isDragTextQuestionType } from "../../dom/questionTypes";
import { getAnswerSlotByIndex } from "./answerControls";
import { getClassNumber, getMoodleAnswerLabelText, labelsMatch } from "../../dom/questionDom";

export function getDdwtosDropGroupIndex(drop: Element) {
  return getClassNumber(drop, "group");
}

function getDdwtosChoiceGroupIndex(choice: Element) {
  return getClassNumber(choice, "group");
}

export function getDdwtosDrops(questionNode: Element) {
  return Array.from(
    questionNode.querySelectorAll<HTMLElement>(".qtext .drop, .drop.place1, .drop[class*='place']"),
  ).filter((drop) => getClassNumber(drop, "place") !== null);
}

export function getDdwtosDropSlotIndex(drop: Element) {
  return getClassNumber(drop, "place");
}

export function getDdwtosChoiceIndex(choice: Element) {
  return getClassNumber(choice, "choice");
}

export function getDdwtosChoices(questionNode: Element) {
  return Array.from(
    questionNode.querySelectorAll<HTMLElement>(".answercontainer .draghome, .draghome"),
  )
    .map((choice) => ({
      element: choice,
      choiceIndex: getDdwtosChoiceIndex(choice),
      groupIndex: getDdwtosChoiceGroupIndex(choice),
      label: getMoodleAnswerLabelText(choice).replace(/\s+/g, " ").trim(),
    }))
    .filter((choice) => choice.choiceIndex !== null && choice.label !== "");
}

export function getDdwtosPlaceInput(questionNode: Element, slotIndex: number) {
  const input = questionNode.querySelector<HTMLInputElement>(
    `input.placeinput.place${slotIndex}, input[type="hidden"].place${slotIndex}, input[type="hidden"][name$="_p${slotIndex}"]`,
  );

  return input ?? null;
}

export function findDdwtosChoiceForLabel(questionNode: Element, drop: Element, label: string) {
  const dropGroupIndex = getDdwtosDropGroupIndex(drop);
  const choices = getDdwtosChoices(questionNode);

  return (
    choices.find((choice) => {
      const groupMatches =
        dropGroupIndex === null ||
        choice.groupIndex === null ||
        choice.groupIndex === dropGroupIndex;
      return groupMatches && labelsMatch(choice.label, label);
    }) ?? null
  );
}

export function setDdwtosDropVisibleLabel(drop: HTMLElement, label: string) {
  let labelNode = drop.querySelector<HTMLElement>("[data-reduxshare-ddwtos-label]");

  if (!labelNode) {
    labelNode = document.createElement("span");
    labelNode.setAttribute("data-reduxshare-ddwtos-label", "true");
    drop.prepend(labelNode);
  }

  labelNode.textContent = label;
}

export function setDdwtosDropAnswer(questionNode: Element, drop: HTMLElement, label: string) {
  const slotIndex = getDdwtosDropSlotIndex(drop);

  if (slotIndex === null) {
    return false;
  }

  const choice = findDdwtosChoiceForLabel(questionNode, drop, label);
  const input = getDdwtosPlaceInput(questionNode, slotIndex);

  if (!choice || !input || choice.choiceIndex === null) {
    return false;
  }

  const nextValue = String(choice.choiceIndex);
  const changed = input.value !== nextValue;

  input.value = nextValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  setDdwtosDropVisibleLabel(drop, choice.label);
  drop.dispatchEvent(new Event("change", { bubbles: true }));

  return changed;
}

export function getDdwtosSelectedLabelForDrop(questionNode: Element, drop: Element) {
  const slotIndex = getDdwtosDropSlotIndex(drop);

  if (slotIndex === null) {
    return "";
  }

  const input = getDdwtosPlaceInput(questionNode, slotIndex);
  const selectedChoiceIndex =
    input?.value && input.value !== "0" ? Number.parseInt(input.value, 10) : null;

  if (!Number.isFinite(selectedChoiceIndex)) {
    return "";
  }

  const groupIndex = getDdwtosDropGroupIndex(drop);
  const selectedChoice = getDdwtosChoices(questionNode).find((choice) => {
    const groupMatches =
      groupIndex === null || choice.groupIndex === null || choice.groupIndex === groupIndex;
    return groupMatches && choice.choiceIndex === selectedChoiceIndex;
  });

  return selectedChoice?.label ?? "";
}

export function autoSelectDdwtosAnswers(questionNode: Element, answerData: AnswerData): boolean {
  if (!isDragTextQuestionType(questionNode)) {
    return false;
  }

  let changed = false;

  for (const drop of getDdwtosDrops(questionNode)) {
    const slotIndex = getDdwtosDropSlotIndex(drop);
    const slot = getAnswerSlotByIndex(answerData, slotIndex);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (labels.length !== 1) {
      continue;
    }

    changed = setDdwtosDropAnswer(questionNode, drop, labels[0]) || changed;
  }

  return changed;
}

export function getDdwtosDropForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const slotIndex = root.host.getAttribute("data-reduxshare-ddwtos-slot");

  if (!slotIndex) {
    return null;
  }

  const questionNode = root.host.closest(".que");
  const drop = questionNode?.querySelector<HTMLElement>(`.drop.place${slotIndex}`);
  return drop ?? null;
}
