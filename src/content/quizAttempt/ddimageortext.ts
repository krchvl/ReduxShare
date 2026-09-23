// ddimageortext drag-and-drop helpers plus the auto-select entry point.
// Moved out of src/content/quizAttempt.ts.
import { ANSWER_WIDGET_ATTR, type AnswerData } from "../../model";
import { getPreferredSuggestionLabels } from "../../data/answerData";
import { getClassNumber, getMoodleAnswerLabelText, labelsMatch } from "../../dom/questionDom";
import { isDragImageOrTextQuestionType } from "../../dom/questionTypes";
import { getAnswerSlotByIndex, isHTMLElement } from "./answerControls";

export function getDdimageOrTextDrops(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLElement>(".dropzones .dropzone"))
    .filter((drop) => getClassNumber(drop, "place") !== null);
}


export function getDdimageOrTextDropSlotIndex(drop: Element) {
  return getClassNumber(drop, "place");
}


export function getDdimageOrTextDropGroupIndex(drop: Element) {
  return getClassNumber(drop, "group");
}


export function getDdimageOrTextChoiceIndex(choice: Element) {
  return getClassNumber(choice, "choice");
}


export function getDdimageOrTextChoiceGroupIndex(choice: Element) {
  return getClassNumber(choice, "group");
}


export function getDdimageOrTextChoiceLabel(choice: Element) {
  if (choice instanceof HTMLImageElement) {
    return (choice.alt || choice.title || choice.src.split("/").pop() || "").replace(/\s+/g, " ").trim();
  }

  return getMoodleAnswerLabelText(choice).replace(/\s+/g, " ").trim();
}


export function getDdimageOrTextChoices(questionNode: Element) {
  const choicesByKey = new Map<
    string,
    {
      element: HTMLElement;
      choiceIndex: number | null;
      groupIndex: number | null;
      label: string;
      isPlaceholder: boolean;
    }
  >();

  for (const choice of Array.from(
    questionNode.querySelectorAll<HTMLElement>(
      ".draghomes .draghome, .dropzones .draghome, .droparea .draghome, [data-reduxshare-ddimageortext-choice]"
    )
  )) {
    const choiceIndex = getDdimageOrTextChoiceIndex(choice);
    const groupIndex = getDdimageOrTextChoiceGroupIndex(choice);
    const label = getDdimageOrTextChoiceLabel(choice);
    const isPlaceholder = choice.classList.contains("dragplaceholder");

    if (choiceIndex === null || label === "") {
      continue;
    }

    const key = `${groupIndex ?? "any"}:${choiceIndex}`;
    const existingChoice = choicesByKey.get(key);

    if (existingChoice && !existingChoice.isPlaceholder) {
      continue;
    }

    choicesByKey.set(key, {
      element: choice,
      choiceIndex,
      groupIndex,
      label,
      isPlaceholder
    });
  }

  return Array.from(choicesByKey.values()).map(({ isPlaceholder: _isPlaceholder, ...choice }) => choice);
}


export function getDdimageOrTextPlaceInput(questionNode: Element, slotIndex: number) {
  return (
    questionNode.querySelector<HTMLInputElement>(
      `input.placeinput.place${slotIndex}, input[type="hidden"].place${slotIndex}, input[type="hidden"][name$="_p${slotIndex}"]`
    ) ?? null
  );
}


export function findDdimageOrTextChoiceForLabel(questionNode: Element, drop: Element, label: string) {
  const dropGroupIndex = getDdimageOrTextDropGroupIndex(drop);

  return (
    getDdimageOrTextChoices(questionNode).find((choice) => {
      const groupMatches = dropGroupIndex === null || choice.groupIndex === null || choice.groupIndex === dropGroupIndex;
      return groupMatches && labelsMatch(choice.label, label);
    }) ?? null
  );
}


export function getDdimageOrTextSelectedLabelForDrop(questionNode: Element, drop: Element) {
  const slotIndex = getDdimageOrTextDropSlotIndex(drop);

  if (slotIndex === null) {
    return "";
  }

  const input = getDdimageOrTextPlaceInput(questionNode, slotIndex);
  const selectedChoiceIndex = input?.value && input.value !== "0" ? Number.parseInt(input.value, 10) : null;
  const visualChoiceIndex = getDdimageOrTextVisualChoiceIndex(questionNode, drop);

  if (!Number.isFinite(selectedChoiceIndex) && visualChoiceIndex === null) {
    const visualLabel = getDdimageOrTextVisualChoiceLabel(questionNode, drop);
    const matchingChoice = getDdimageOrTextChoices(questionNode).find((candidate) => labelsMatch(candidate.label, visualLabel));

    return matchingChoice?.label ?? visualLabel;
  }

  const selectedIndex = Number.isFinite(selectedChoiceIndex) ? selectedChoiceIndex : visualChoiceIndex;

  if (selectedIndex === null) {
    return "";
  }

  const groupIndex = getDdimageOrTextDropGroupIndex(drop);
  const choice = getDdimageOrTextChoices(questionNode).find((candidate) => {
    const groupMatches = groupIndex === null || candidate.groupIndex === null || candidate.groupIndex === groupIndex;
    return groupMatches && candidate.choiceIndex === selectedIndex;
  });

  return choice?.label ?? "";
}


export function getDdimageOrTextVisualChoiceForDrop(questionNode: Element, drop: Element) {
  const slotIndex = getDdimageOrTextDropSlotIndex(drop);
  const candidates = slotIndex === null
    ? Array.from(drop.querySelectorAll<HTMLElement>(".draghome, .drag, .dragitem, [class*='choice']"))
    : [
        ...Array.from(drop.querySelectorAll<HTMLElement>(".draghome, .drag, .dragitem, [class*='choice']")),
        ...Array.from(questionNode.querySelectorAll<HTMLElement>(`.dropzones .inplace${slotIndex}`))
      ];

  return (
    candidates.find((candidate) => {
      return !candidate.hasAttribute(ANSWER_WIDGET_ATTR) && !candidate.closest(`[${ANSWER_WIDGET_ATTR}="true"]`);
    }) ?? null
  );
}


export function getDdimageOrTextVisualChoiceIndex(questionNode: Element, drop: Element) {
  const visualChoice = getDdimageOrTextVisualChoiceForDrop(questionNode, drop);

  if (visualChoice) {
    return getDdimageOrTextChoiceIndex(visualChoice);
  }

  for (const candidate of Array.from(drop.querySelectorAll<HTMLElement>(".draghome, .drag, .dragitem, [class*='choice']"))) {
    if (candidate.hasAttribute(ANSWER_WIDGET_ATTR) || candidate.closest(`[${ANSWER_WIDGET_ATTR}="true"]`)) {
      continue;
    }

    const choiceIndex = getDdimageOrTextChoiceIndex(candidate);

    if (choiceIndex !== null) {
      return choiceIndex;
    }
  }

  return null;
}


export function getDdimageOrTextVisualChoiceLabel(questionNode: Element, drop: Element) {
  const candidate = getDdimageOrTextVisualChoiceForDrop(questionNode, drop);

  if (!candidate) {
    return "";
  }

  return getDdimageOrTextChoiceLabel(candidate);
}


export function setDdimageOrTextDropVisibleChoice(questionNode: Element, drop: HTMLElement, choice: { element: HTMLElement; label: string }) {
  const slotIndex = getDdimageOrTextDropSlotIndex(drop);
  const choiceIndex = getDdimageOrTextChoiceIndex(choice.element);
  const existingDropChoice = getDdimageOrTextVisualChoiceForDrop(questionNode, drop);
  let placedChoice = choice.element;

  if (!isHTMLElement(placedChoice) || placedChoice.closest(".dd-original")) {
    placedChoice = choice.element.cloneNode(true) as HTMLElement;
  }

  if (existingDropChoice && existingDropChoice !== placedChoice) {
    existingDropChoice.remove();
  }

  if (choiceIndex !== null) {
    for (const duplicate of Array.from(
      questionNode.querySelectorAll<HTMLElement>(`.draghomes .choice${choiceIndex}:not(.dragplaceholder)`)
    )) {
      if (duplicate !== placedChoice) {
        duplicate.remove();
      }
    }
  }

  placedChoice.classList.remove("unplaced", "dragplaceholder");
  placedChoice.classList.add("placed");

  if (slotIndex !== null) {
    placedChoice.setAttribute("data-reduxshare-ddimageortext-choice", String(slotIndex));
  }

  drop.append(placedChoice);

  if (placedChoice instanceof HTMLImageElement && choice.element instanceof HTMLImageElement) {
    placedChoice.src = choice.element.src;
    placedChoice.alt = choice.element.alt;
    placedChoice.title = choice.element.title;
  } else {
    placedChoice.textContent = choice.label;
  }
}


export function setDdimageOrTextDropAnswer(questionNode: Element, drop: HTMLElement, label: string) {
  const slotIndex = getDdimageOrTextDropSlotIndex(drop);

  if (slotIndex === null) {
    return false;
  }

  const choice = findDdimageOrTextChoiceForLabel(questionNode, drop, label);
  const input = getDdimageOrTextPlaceInput(questionNode, slotIndex);

  if (!choice || !input || choice.choiceIndex === null) {
    return false;
  }

  const nextValue = String(choice.choiceIndex);
  const changed = input.value !== nextValue;

  input.value = nextValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  setDdimageOrTextDropVisibleChoice(questionNode, drop, { element: choice.element, label: choice.label });
  drop.dispatchEvent(new Event("change", { bubbles: true }));

  return changed;
}


export function getDdimageOrTextDropForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const slotIndex = root.host.getAttribute("data-reduxshare-ddimageortext-slot");

  if (!slotIndex) {
    return null;
  }

  const questionNode = root.host.closest(".que");
  return questionNode?.querySelector<HTMLElement>(`.dropzone.place${slotIndex}`) ?? null;
}


export function autoSelectDdimageOrTextAnswers(questionNode: Element, answerData: AnswerData): boolean {
  if (!isDragImageOrTextQuestionType(questionNode)) {
    return false;
  }

  let changed = false;

  for (const drop of getDdimageOrTextDrops(questionNode)) {
    const slotIndex = getDdimageOrTextDropSlotIndex(drop);
    const slot = getAnswerSlotByIndex(answerData, slotIndex);
    const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];

    if (labels.length !== 1) {
      continue;
    }

    changed = setDdimageOrTextDropAnswer(questionNode, drop, labels[0]) || changed;
  }

  return changed;
}
