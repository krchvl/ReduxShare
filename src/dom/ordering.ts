import { getPreferredSuggestionLabels } from "../data/answerData";
import type {
  AnswerData,
  AnswerSlotData,
  ReviewObservation,
  SubmissionItem,
  SuggestionItem,
} from "../model";
import { getMoodleAnswerLabelText, labelsMatch, splitSequentialAnswerLabels } from "./questionDom";
import { currentT } from "../state";

export function getOrderingList(questionNode: Element) {
  const list = questionNode.querySelector(".answer.ordering .sortablelist");
  return list instanceof HTMLUListElement || list instanceof HTMLOListElement ? list : null;
}

export function getOrderingItems(questionNode: Element) {
  const list = getOrderingList(questionNode);

  if (!list) {
    return [];
  }

  return Array.from(list.querySelectorAll<HTMLLIElement>("li"));
}

export function getOrderingItemLabel(item: Element) {
  const content = item.querySelector("[data-itemcontent]") ?? item;
  return getMoodleAnswerLabelText(content).replace(/\s+/g, " ").trim();
}

export function getOrderingPositionLabel(position: number) {
  return currentT("quiz.ordering.position", { position });
}

export function getOrderingPositionObservation(position: number, label: string): ReviewObservation {
  return {
    label,
    slotKey: `position:${position}`,
    slotIndex: position,
  };
}

function getOrderingItemForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const item = root.host.closest(".answer.ordering li");
  return item instanceof HTMLLIElement ? item : null;
}

export function getOrderingResponseInput(questionNode: Element) {
  const itemIds = getOrderingItems(questionNode)
    .map((item) => item.id)
    .filter(Boolean);
  const inputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
  );

  return (
    inputs.find((input) => {
      const nameOrId = `${input.name} ${input.id}`;
      return (
        nameOrId.includes("_response") && itemIds.some((itemId) => input.value.includes(itemId))
      );
    }) ??
    inputs.find((input) => `${input.name} ${input.id}`.includes("_response")) ??
    null
  );
}

export function syncOrderingResponseInput(questionNode: Element) {
  const input = getOrderingResponseInput(questionNode);
  const itemIds = getOrderingItems(questionNode)
    .map((item) => item.id)
    .filter(Boolean);

  if (!input || itemIds.length === 0) {
    return false;
  }

  const nextValue = itemIds.join(",");
  const changed = input.value !== nextValue;

  input.value = nextValue;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  getOrderingList(questionNode)?.dispatchEvent(new Event("change", { bubbles: true }));

  return changed;
}

function moveOrderingItemToPosition(questionNode: Element, item: HTMLLIElement, position: number) {
  const list = getOrderingList(questionNode);
  const items = getOrderingItems(questionNode);

  if (!list || !items.includes(item) || !Number.isFinite(position)) {
    return false;
  }

  const previousOrder = items.map((currentItem) => currentItem.id).join(",");
  const clampedIndex = Math.max(0, Math.min(items.length - 1, Math.trunc(position) - 1));
  const remainingItems = items.filter((currentItem) => currentItem !== item);
  const referenceItem = remainingItems[clampedIndex] ?? null;

  list.insertBefore(item, referenceItem);
  const changed =
    previousOrder !==
    getOrderingItems(questionNode)
      .map((currentItem) => currentItem.id)
      .join(",");
  const inputChanged = syncOrderingResponseInput(questionNode);
  return changed || inputChanged;
}

function getOrderingPositionFromLabel(label: string) {
  const match = /(?:^|\s)(?:позиция|position)\s*(\d+)(?:\s|$)/iu.exec(label);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function selectOrderingPositionByTrigger(
  trigger: HTMLButtonElement,
  questionNode: Element,
  label: string,
  actionSlotIndex: number | null,
) {
  const item = getOrderingItemForTrigger(trigger);
  const position = actionSlotIndex ?? getOrderingPositionFromLabel(label);

  if (!item || position === null) {
    return false;
  }

  return moveOrderingItemToPosition(questionNode, item, position);
}

export function mapSuggestionToOrderingPosition(
  suggestion: SuggestionItem,
  position: number,
): SuggestionItem {
  const positionLabel = getOrderingPositionLabel(position);

  return {
    ...suggestion,
    label: positionLabel,
    displayLabel: positionLabel,
    actionSlotIndex: position,
  };
}

export function mapSubmissionToOrderingPosition(
  submission: SubmissionItem,
  position: number,
): SubmissionItem {
  const positionLabel = getOrderingPositionLabel(position);

  return {
    ...submission,
    label: positionLabel,
    displayLabel: positionLabel,
    actionSlotIndex: position,
  };
}

export function answerDataHasZeroBasedOrderingSlots(answerData: AnswerData) {
  return answerData.slots.some((slot) => slot.index === 0);
}

export function getOrderingSlotPosition(
  slot: AnswerSlotData,
  itemCount: number,
  hasZeroBasedSlots = false,
) {
  if (hasZeroBasedSlots && slot.index >= 0 && slot.index < itemCount) {
    return slot.index + 1;
  }

  if (slot.index >= 1 && slot.index <= itemCount) {
    return slot.index;
  }

  return null;
}

export function getOrderingExactOrder(answerData: AnswerData, questionNode: Element) {
  const itemCount = getOrderingItems(questionNode).length;

  if (itemCount === 0) {
    return [];
  }

  const labelsByPosition = new Map<number, string>();
  const hasZeroBasedSlots = answerDataHasZeroBasedOrderingSlots(answerData);

  for (const slot of answerData.slots) {
    const position = getOrderingSlotPosition(slot, itemCount, hasZeroBasedSlots);
    const labels = getPreferredSuggestionLabels(slot.suggestions);

    if (position === null || labels.length !== 1) {
      continue;
    }

    labelsByPosition.set(position, labels[0]);
  }

  if (labelsByPosition.size === itemCount) {
    const slottedLabels = Array.from(
      { length: itemCount },
      (_, index) => labelsByPosition.get(index + 1) ?? "",
    );

    if (slottedLabels.every(Boolean)) {
      return slottedLabels;
    }
  }

  const sequentialLabels = splitSequentialAnswerLabels(
    getPreferredSuggestionLabels(answerData.suggestions),
    itemCount,
  );
  return sequentialLabels.length === itemCount ? sequentialLabels : [];
}

export function applyOrderingOrder(questionNode: Element, orderedLabels: string[]) {
  const list = getOrderingList(questionNode);
  const items = getOrderingItems(questionNode);

  if (!list || items.length === 0 || orderedLabels.length !== items.length) {
    return false;
  }

  const usedItems = new Set<HTMLLIElement>();
  const orderedItems: HTMLLIElement[] = [];

  for (const label of orderedLabels) {
    const item = items.find(
      (candidate) =>
        !usedItems.has(candidate) && labelsMatch(getOrderingItemLabel(candidate), label),
    );

    if (!item) {
      return false;
    }

    usedItems.add(item);
    orderedItems.push(item);
  }

  if (orderedItems.length !== items.length) {
    return false;
  }

  const previousOrder = items.map((item) => item.id).join(",");

  for (const item of orderedItems) {
    list.append(item);
  }

  const changed =
    previousOrder !==
    getOrderingItems(questionNode)
      .map((item) => item.id)
      .join(",");
  const inputChanged = syncOrderingResponseInput(questionNode);
  return changed || inputChanged;
}
