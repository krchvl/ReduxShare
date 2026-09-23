import { ANSWER_WIDGET_ATTR, type AnswerData } from "../../model";
import { getClassNumber, getMoodleAnswerLabelText, splitSequentialAnswerLabels } from "../../dom/questionDom";
import { getPreferredSuggestionLabels } from "../../data/answerData";
import { isDragMarkerQuestionType } from "../../dom/questionTypes";
import { getAnswerSlotByIndex } from "./answerControls";

export function getDdmarkerChoiceIndex(element: Element) {
  return getClassNumber(element, "choice");
}

export function getDdmarkerChoiceInput(questionNode: Element, choiceIndex: number) {
  return (
    questionNode.querySelector<HTMLInputElement>(
      `input.choices.choice${choiceIndex}, input[type="hidden"].choice${choiceIndex}, input[type="hidden"][name$="_c${choiceIndex}"]`
    ) ?? null
  );
}

export function getDdmarkerChoiceInputs(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLInputElement>("input.choices"))
    .filter((input) => getDdmarkerChoiceIndex(input) !== null);
}

export function getDdmarkerMarkerLabel(marker: Element) {
  const markerText = marker.querySelector(".markertext");
  return getMoodleAnswerLabelText(markerText ?? marker).replace(/\s+/g, " ").trim();
}

export function getDdmarkerChoices(questionNode: Element) {
  return getDdmarkerChoiceInputs(questionNode)
    .map((input) => {
      const choiceIndex = getDdmarkerChoiceIndex(input);
      const marker =
        (choiceIndex === null
          ? null
          : questionNode.querySelector(
              `.dd-original .marker.choice${choiceIndex}, .draghomes .marker.choice${choiceIndex}.dragplaceholder, .draghomes .marker.choice${choiceIndex}`
            )) ?? null;

      return choiceIndex === null
        ? null
        : {
            input,
            choiceIndex,
            label: marker ? getDdmarkerMarkerLabel(marker) : `Marker ${choiceIndex}`
          };
    })
    .filter((choice): choice is { input: HTMLInputElement; choiceIndex: number; label: string } => {
      return choice !== null && choice.label.trim() !== "";
    });
}

export function normalizeDdmarkerCoordinate(value: string) {
  const match = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(value);

  if (!match) {
    return "";
  }

  return `${match[1]},${match[2]}`;
}

export function getDdmarkerCoordinateLabel(value: string) {
  return normalizeDdmarkerCoordinate(value);
}

export function getDdmarkerDropArea(questionNode: Element) {
  return questionNode.querySelector<HTMLElement>(".ddarea .droparea");
}

export function getDdmarkerVisualMarker(questionNode: Element, choiceIndex: number) {
  return questionNode.querySelector<HTMLElement>(
    `.droparea [data-reduxshare-ddmarker-marker="true"][data-reduxshare-ddmarker-choice="${choiceIndex}"]`
  );
}

export function setDdmarkerHomeMarkerHidden(questionNode: Element, choiceIndex: number, hidden: boolean) {
  for (const marker of Array.from(
    questionNode.querySelectorAll<HTMLElement>(`.draghomes .marker.choice${choiceIndex}`)
  )) {
    marker.style.display = hidden ? "none" : "";
    marker.dataset.reduxshareDdmarkerHomeHidden = hidden ? "true" : "false";
  }
}

export function getDdmarkerAnswerWidgetHost(questionNode: Element, choiceIndex: number) {
  return questionNode.querySelector<HTMLElement>(
    `[${ANSWER_WIDGET_ATTR}="true"][data-reduxshare-ddmarker-choice="${choiceIndex}"]`
  );
}

export function resetDdmarkerAnswerWidgetHostPlacement(host: HTMLElement) {
  host.style.removeProperty("position");
  host.style.removeProperty("left");
  host.style.removeProperty("top");
  host.style.removeProperty("z-index");
}

export function positionDdmarkerAnswerWidgetHost(
  questionNode: Element,
  choiceIndex: number,
  coordinate: string,
  marker: HTMLElement
) {
  const host = getDdmarkerAnswerWidgetHost(questionNode, choiceIndex);
  const coordinateMatch = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(normalizeDdmarkerCoordinate(coordinate));

  if (!host || !coordinateMatch) {
    return;
  }

  const dropArea = getDdmarkerDropArea(questionNode);

  if (!dropArea) {
    return;
  }

  dropArea.append(host);
  host.style.position = "absolute";
  host.style.left = `${Number.parseFloat(coordinateMatch[1]) + 18}px`;
  host.style.top = `${Math.max(0, Number.parseFloat(coordinateMatch[2]) - 16)}px`;
  host.style.zIndex = "30";
  marker.after(host);
}

export function getDdmarkerMarkerTemplate(questionNode: Element, choiceIndex: number) {
  return questionNode.querySelector<HTMLElement>(
    `.dd-original .marker.choice${choiceIndex}, .draghomes .marker.choice${choiceIndex}.dragplaceholder, .draghomes .marker.choice${choiceIndex}`
  );
}

export function getDdmarkerChoiceLabel(questionNode: Element, choiceIndex: number) {
  return getDdmarkerChoices(questionNode).find((choice) => choice.choiceIndex === choiceIndex)?.label ?? `Marker ${choiceIndex}`;
}

export function createDdmarkerVisualMarker(questionNode: Element, choiceIndex: number) {
  const template = getDdmarkerMarkerTemplate(questionNode, choiceIndex);
  const marker = template ? (template.cloneNode(true) as HTMLElement) : document.createElement("span");

  marker.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));
  marker.querySelectorAll<HTMLElement>("[tabindex]").forEach((element) => element.removeAttribute("tabindex"));
  marker.removeAttribute("id");
  marker.removeAttribute("tabindex");
  marker.removeAttribute("draggable");

  if (!marker.querySelector(".markertext")) {
    const markerText = document.createElement("span");
    markerText.className = "markertext";
    markerText.textContent = getDdmarkerChoiceLabel(questionNode, choiceIndex);
    marker.append(markerText);
  }

  marker.setAttribute("aria-hidden", "true");
  marker.setAttribute("data-reduxshare-ddmarker-marker", "true");
  marker.setAttribute("data-reduxshare-ddmarker-choice", String(choiceIndex));
  return marker;
}

export function setDdmarkerVisualMarker(questionNode: Element, choiceIndex: number, coordinateLabel: string) {
  const coordinate = normalizeDdmarkerCoordinate(coordinateLabel);
  const coordinateMatch = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(coordinate);
  const dropArea = getDdmarkerDropArea(questionNode);

  if (!dropArea || !coordinateMatch) {
    return;
  }

  dropArea.style.position = dropArea.style.position || "relative";

  let marker = getDdmarkerVisualMarker(questionNode, choiceIndex);

  if (!marker) {
    marker = createDdmarkerVisualMarker(questionNode, choiceIndex);
    dropArea.append(marker);
  }

  marker.classList.add("marker", "user-select-none", "active", `choice${choiceIndex}`);
  marker.classList.remove("dragplaceholder", "unneeded");
  marker.setAttribute("data-reduxshare-ddmarker-marker", "true");
  marker.setAttribute("data-reduxshare-ddmarker-choice", String(choiceIndex));
  marker.style.pointerEvents = "none";
  marker.style.removeProperty("display");
  marker.style.removeProperty("visibility");
  dropArea.append(marker);
  marker.style.position = "absolute";
  marker.style.left = `${coordinateMatch[1]}px`;
  marker.style.top = `${coordinateMatch[2]}px`;
  marker.style.transform = "scale(1)";
  marker.style.transformOrigin = "left top";
  marker.style.zIndex = "25";
  setDdmarkerHomeMarkerHidden(questionNode, choiceIndex, true);
  positionDdmarkerAnswerWidgetHost(questionNode, choiceIndex, coordinate, marker);
}

export function setDdmarkerChoiceAnswer(questionNode: Element, choiceIndex: number, coordinateLabel: string) {
  const coordinate = normalizeDdmarkerCoordinate(coordinateLabel);
  const input = getDdmarkerChoiceInput(questionNode, choiceIndex);

  if (!coordinate || !input) {
    return false;
  }

  const changed = input.value !== coordinate;
  input.value = coordinate;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  setDdmarkerVisualMarker(questionNode, choiceIndex, coordinate);
  getDdmarkerDropArea(questionNode)?.dispatchEvent(new Event("change", { bubbles: true }));

  return changed;
}

export function getDdmarkerExactCoordinateSet(questionNode: Element, answerData: AnswerData) {
  const choices = getDdmarkerChoices(questionNode);
  const slottedCoordinates = choices
    .map((choice, index) => {
      const slot = getAnswerSlotByIndex(answerData, choice.choiceIndex);
      const labels = slot ? getPreferredSuggestionLabels(slot.suggestions) : [];
      const coordinate = labels.map(normalizeDdmarkerCoordinate).find(Boolean) ?? "";

      return coordinate
        ? {
            choiceIndex: choice.choiceIndex,
            coordinate
          }
        : null;
    })
    .filter((entry): entry is { choiceIndex: number; coordinate: string } => entry !== null);

  if (slottedCoordinates.length === choices.length) {
    return slottedCoordinates;
  }

  const sequentialCoordinates = splitSequentialAnswerLabels(
    getPreferredSuggestionLabels(answerData.suggestions),
    choices.length
  )
    .map(normalizeDdmarkerCoordinate)
    .filter(Boolean);

  if (sequentialCoordinates.length !== choices.length) {
    return [];
  }

  return choices.map((choice, index) => ({
    choiceIndex: choice.choiceIndex,
    coordinate: sequentialCoordinates[index]
  }));
}

export function applyDdmarkerExactCoordinateSet(questionNode: Element, answerData: AnswerData) {
  const coordinateSet = getDdmarkerExactCoordinateSet(questionNode, answerData);

  if (coordinateSet.length === 0) {
    return false;
  }

  let changed = false;

  for (const { choiceIndex, coordinate } of coordinateSet) {
    changed = setDdmarkerChoiceAnswer(questionNode, choiceIndex, coordinate) || changed;
  }

  return changed;
}

export function autoSelectDdmarkerAnswers(questionNode: Element, answerData: AnswerData): boolean {
  if (!isDragMarkerQuestionType(questionNode)) {
    return false;
  }

  return applyDdmarkerExactCoordinateSet(questionNode, answerData);
}

export function getDdmarkerChoiceForTrigger(trigger: HTMLButtonElement) {
  const root = trigger.getRootNode();

  if (!(root instanceof ShadowRoot) || !(root.host instanceof Element)) {
    return null;
  }

  const choiceIndex = root.host.getAttribute("data-reduxshare-ddmarker-choice");
  return choiceIndex && /^\d+$/.test(choiceIndex) ? Number.parseInt(choiceIndex, 10) : null;
}
