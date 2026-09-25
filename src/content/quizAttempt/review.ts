// Moved out of src/content/quizAttempt.ts.
import {
  getAnswerControlSlotIndex,
  getChoiceAnswerInputs,
  getChoiceInputIndex,
  getInputAnswerLabelText,
  getQuestionAnswerLabels,
  getQuestionHash,
  getSelectControlLabel,
  getSelectPlaceIndex,
  getSelectQuestionNode,
  getTextAnswerInputs,
} from "./answerControls";
import {
  getDdimageOrTextChoices,
  getDdimageOrTextDropSlotIndex,
  getDdimageOrTextDrops,
  getDdimageOrTextSelectedLabelForDrop,
} from "./ddimageortext";
import { getDdmarkerChoices, getDdmarkerCoordinateLabel } from "./ddmarker";
import {
  getDdwtosChoices,
  getDdwtosDropSlotIndex,
  getDdwtosDrops,
  getDdwtosSelectedLabelForDrop,
} from "./ddwtos";
import {
  ANSWER_WIDGET_ATTR,
  type QuizReviewPendingMarker,
  type ReviewAnswerPayload,
  type ReviewObservation,
  type ReviewQuestionPayload,
  SUPPORTED_REVIEW_QUESTION_TYPES,
  type SaveReviewAnswersResponse,
  type StoredStateLike,
  TEXT_INPUT_QUESTION_TYPES,
} from "../../model";
import { QUIZ_REVIEW_PENDING_STORAGE_KEY, QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY } from "../../shared/storageKeys";
import { SAVE_REVIEW_ANSWERS_MESSAGE } from "../../shared/messages";
import { getReviewSaveMoodleConfig } from "../../moodleContext";
import { getOrderingItemLabel, getOrderingItems, getOrderingPositionObservation } from "../../dom/ordering";
import {
  getAnswerLabelMatchKeys,
  getImageIdentityLabel,
  getMoodleAnswerLabelText,
  getQuestionText,
  getSelectOptionLabel,
  getUniqueTexts,
  isPlaceholderSelectOption,
  labelsMatch,
  normalizeAnswerLabel,
  stripMoodleAnswerPrefix,
} from "../../dom/questionDom";
import { getQuestionId } from "../../dom/questionIdentity";
import {
  getSecondQuestionClass,
  isMatchingQuestionNode,
  isMatchingQuestionTypeName,
  isTextInputQuestionType,
} from "../../dom/questionTypes";
import {
  cleanReviewDisplayedTextAnswer,
  extractBracketedAnswers,
  getRightAnswerBodyText,
  parseReviewMatchPairs,
  splitReviewAnswerText,
} from "../../data/reviewText";
import {
  loadStoredState,
  logReduxShareInfo,
  logReduxShareWarning,
  syncCopyUnlock,
  syncLanguage,
  syncStealthMode,
  waitForFullPageLoad,
} from "../../logic/runtime";
import { canUseQuizFeatures } from "../../logic/settings";
import { setCurrentStoredState } from "../../state";

// Moved out of src/content/quizAttempt.ts.













// Moved out of src/content/quizAttempt.ts.













// Moved out of src/content/quizAttempt.ts.













export function buildReviewAnswersForQuestion(questionNode: Element, questionType: string | null) {
  if (questionType === "multichoice" || questionType === "multichoiceset") {
    const booleanAnswers = buildReviewMultichoiceBooleanAnswers(questionNode);

    if (booleanAnswers.length > 0) {
      return booleanAnswers;
    }
  }

  const correctLabels =
    questionType === "ordering" ||
    questionType === "ddwtos" ||
    questionType === "ddmarker" ||
    questionType === "ddimageortext" ||
    questionType === "gapselect" ||
    questionType === "gapfill"
      ? []
      : getReviewCorrectLabels(questionNode);
  const correctObservations = getReviewCorrectObservations(questionNode, questionType, correctLabels);
  const selectedObservations = getReviewSelectedObservations(questionNode);

  if (correctObservations.length === 0) {
    if (selectedObservations.length > 0) {
      return buildReviewAnswersFromObservations(selectedObservations, 1);
    }

    return [];
  }

  const answersByKey = new Map<string, ReviewAnswerPayload>();

  const addAnswer = (
    observation: { label: string; slotKey: string; slotIndex: number | null },
    isCorrect: boolean,
    wasSelected: boolean
  ) => {
    const answerKey = createReviewAnswerKey(observation.label);

    if (!answerKey) {
      return;
    }

    const key = `${observation.slotKey}|${answerKey}`;
    const existingAnswer = answersByKey.get(key);
    const correctness = isCorrect ? 2 : 0;
    const existingCorrectness = existingAnswer?.correctness ?? correctness;

    answersByKey.set(key, {
      label: observation.label,
      answerKey,
      slotKey: observation.slotKey,
      slotIndex: observation.slotIndex,
      correctness: existingCorrectness === 2 || correctness === 2 ? 2 : Math.min(existingCorrectness, correctness),
      isCorrect: existingAnswer?.isCorrect === true || isCorrect,
      wasSelected: existingAnswer?.wasSelected === true || wasSelected
    });
  };

  for (const correctObservation of correctObservations) {
    addAnswer(
      correctObservation,
      true,
      selectedObservations.some((selectedObservation) => reviewObservationsMatch(selectedObservation, correctObservation))
    );
  }

  for (const selectedObservation of selectedObservations) {
    if (correctObservations.some((correctObservation) => reviewObservationsMatch(selectedObservation, correctObservation))) {
      continue;
    }

    addAnswer(selectedObservation, false, true);
  }

  return Array.from(answersByKey.values());
}

function buildReviewAnswersFromObservations(observations: ReviewObservation[], correctness: number) {
  return observations
    .map((observation): ReviewAnswerPayload | null => {
      const answerKey = createReviewAnswerKey(observation.label);

      return answerKey
        ? {
            label: observation.label,
            answerKey,
            slotKey: observation.slotKey,
            slotIndex: observation.slotIndex,
            correctness,
            isCorrect: correctness === 2,
            wasSelected: true
          }
        : null;
    })
    .filter((answer): answer is ReviewAnswerPayload => answer !== null);
}

function buildReviewMultichoiceBooleanAnswers(questionNode: Element): ReviewAnswerPayload[] {
  const inputs = getReviewChoiceInputs(questionNode);

  if (!inputs.some((input) => input.type === "checkbox")) {
    return [];
  }

  const correctLabels = getReviewCorrectLabels(questionNode);
  const hasSelectedChoice = inputs.some((input) => input.type === "checkbox" && input.checked);

  if (correctLabels.length === 0 && !hasSelectedChoice) {
    return [];
  }

  const checkboxInputs = inputs.filter((input) => input.type === "checkbox");
  // The review names a correct answer, but it matched none of the rendered options (shuffled
  // markup, paraphrased "rightanswer" text): per-option truth values are then unknown, and
  // writing "false" with correctness 2 for every checkbox would poison the next attempt's
  // menu and auto-select. Fall back to observed statistics for the whole question.
  const hasUsableCorrectLabels =
    correctLabels.length > 0 &&
    checkboxInputs.some((input) =>
      correctLabels.some((correctLabel) => labelsMatch(getInputAnswerLabelText(questionNode, input), correctLabel))
    );

  return checkboxInputs
    .flatMap((input, index): ReviewAnswerPayload[] => {
      const optionLabel = getInputAnswerLabelText(questionNode, input);
      const hasCorrectLabels = hasUsableCorrectLabels;
      const isCorrectOption = hasCorrectLabels && correctLabels.some((correctLabel) => labelsMatch(optionLabel, correctLabel));
      const actualLabel = input.checked ? "true" : "false";
      const expectedLabel = hasCorrectLabels ? (isCorrectOption ? "true" : "false") : actualLabel;
      const slotIndex = getReviewChoiceSlotIndex(input, index);
      const slotKey = optionLabel || `slot:${slotIndex}`;
      const exactAnswerKey = createReviewAnswerKey(expectedLabel);
      const answers: ReviewAnswerPayload[] = [];

      if (!exactAnswerKey) {
        return answers;
      }

      if (!hasCorrectLabels) {
        answers.push({
          label: actualLabel,
          answerKey: exactAnswerKey,
          slotKey,
          slotIndex,
          correctness: 1,
          isCorrect: false,
          wasSelected: true
        });

        return answers;
      }

      answers.push({
        label: expectedLabel,
        answerKey: exactAnswerKey,
        slotKey,
        slotIndex,
        correctness: 2,
        isCorrect: true,
        wasSelected: actualLabel === expectedLabel
      });

      if (actualLabel !== expectedLabel) {
        const observedAnswerKey = createReviewAnswerKey(actualLabel);

        if (observedAnswerKey) {
          answers.push({
            label: actualLabel,
            answerKey: observedAnswerKey,
            slotKey,
            slotIndex,
            correctness: 0,
            isCorrect: false,
            wasSelected: true
          });
        }
      }

      return answers;
    })
}

export function buildReviewSaveRequestPayload(storedState: StoredStateLike | undefined) {
  const moodleConfig = getReviewSaveMoodleConfig(storedState);
  const identity = getQuizReviewUrlIdentity(window.location.href);
  const questions = collectReviewQuestionsForSave();

  if (questions.length === 0) {
    return null;
  }

  return {
    domain: window.location.hostname,
    courseId: moodleConfig.courseId,
    quizId: moodleConfig.contextInstanceId,
    attemptKey: identity.attemptKey,
    pageUrl: window.location.href,
    questions
  };
}

async function clearQuizReviewPendingMarker(attemptKey: string) {
  const result = await chrome.storage.local.get(QUIZ_REVIEW_PENDING_STORAGE_KEY);
  const marker = result[QUIZ_REVIEW_PENDING_STORAGE_KEY] as QuizReviewPendingMarker | undefined;

  if (marker?.attemptKey === attemptKey) {
    await chrome.storage.local.remove(QUIZ_REVIEW_PENDING_STORAGE_KEY);
  }
}

function collectReviewMatchTokens(node: Node): ReviewMatchToken[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    return value ? [{ kind: "text", value }] : [];
  }

  if (!(node instanceof Element)) {
    return [];
  }

  if (node instanceof HTMLImageElement) {
    const value = getImageIdentityLabel(node);
    return value ? [{ kind: "image", value }] : [];
  }

  return Array.from(node.childNodes).flatMap(collectReviewMatchTokens);
}

export function collectReviewQuestionsForSave(): ReviewQuestionPayload[] {
  return Array.from(document.querySelectorAll(".que"))
    .map((questionNode): ReviewQuestionPayload | null => {
      const questionType = getSecondQuestionClass(questionNode);

      if (!questionType || !SUPPORTED_REVIEW_QUESTION_TYPES.has(questionType)) {
        return null;
      }

      const questionId = getQuestionId(questionNode);
      const questionHash = getQuestionHash(questionNode, questionType);
      const answers = buildReviewAnswersForQuestion(questionNode, questionType);

      if (!questionId || !questionHash || answers.length === 0) {
        return null;
      }

      return {
        questionId,
        questionType,
        questionHash,
        questionText: getQuestionText(questionNode),
        answerOptions: collectReviewQuestionOptions(questionNode),
        answers
      };
    })
    .filter((question): question is ReviewQuestionPayload => question !== null);
}

const REVIEW_OPTION_PLACEHOLDER_PATTERNS = [/^choose(\s*(…|\.\.\.))?$/i, /^выберите(\s*(…|\.\.\.))?$/i];
const REVIEW_OPTION_MAX_COUNT = 200;
const REVIEW_OPTION_MAX_LENGTH = 300;

// Every option the review page rendered: radio/checkbox labels plus select
// options (match and gapselect render their pools as <option> elements).
// Free-form types (shortanswer, numerical, essay) produce an empty list.
export function collectReviewQuestionOptions(questionNode: Element): string[] {
  const options: string[] = [];
  const seenLower = new Set<string>();

  const pushOption = (value: string | null | undefined) => {
    const label = (value ?? "").replace(/\s+/g, " ").trim();

    if (!label || label.length > REVIEW_OPTION_MAX_LENGTH) {
      return;
    }

    if (REVIEW_OPTION_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(label))) {
      return;
    }

    const lowerLabel = label.toLowerCase();

    if (seenLower.has(lowerLabel)) {
      return;
    }

    seenLower.add(lowerLabel);
    options.push(label);
  };

  for (const input of questionNode.querySelectorAll<HTMLInputElement>("input[type='radio'], input[type='checkbox']")) {
    pushOption(getInputAnswerLabelText(questionNode, input));
  }

  for (const option of questionNode.querySelectorAll<HTMLOptionElement>("select option")) {
    pushOption(option.textContent);
  }

  return options.slice(0, REVIEW_OPTION_MAX_COUNT);
}

function createReviewAnswerKey(label: string) {
  return normalizeAnswerLabel(stripMoodleAnswerPrefix(label));
}

function getCompoundReviewControls(questionNode: Element) {
  const controls: Array<HTMLInputElement | HTMLSelectElement> = [
    ...Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select")),
    ...getTextAnswerInputs(questionNode)
  ];
  const seenChoiceGroups = new Set<string>();

  for (const input of getChoiceAnswerInputs(questionNode)) {
    const key = input.name || input.id;

    if (seenChoiceGroups.has(key)) {
      continue;
    }

    seenChoiceGroups.add(key);
    controls.push(input);
  }

  return controls.sort((left, right) => {
    const leftSlotIndex = getAnswerControlSlotIndex(left) ?? Number.MAX_SAFE_INTEGER;
    const rightSlotIndex = getAnswerControlSlotIndex(right) ?? Number.MAX_SAFE_INTEGER;

    return leftSlotIndex - rightSlotIndex;
  });
}

function getControlSlotObservation(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  label: string,
  explicitSlotIndex: number | null = null
) {
  const slotIndex = explicitSlotIndex ?? getAnswerControlSlotIndex(control);

  return {
    label,
    slotKey: slotIndex === null ? "question" : `slot:${slotIndex}`,
    slotIndex
  };
}

function getCorrectAnswerFromFeedbackText(feedbackText: string) {
  const match =
    /(?:the\s+correct\s+answers?\s+(?:is|are)|правильн(?:ый|ые)\s+ответ(?:ы)?|верн(?:ый|ые)\s+ответ(?:ы)?)\s*[:：]\s*(.+?)(?=\s*(?:mark|grade|score|оценка|балл)\b|$)/iu.exec(
      feedbackText
    );

  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

function getFirstCompoundControl(container: Element) {
  const textInput = Array.from(container.querySelectorAll<HTMLInputElement>("input")).find((input) => {
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    return type === "text";
  });

  if (textInput) {
    return textInput;
  }

  const select = container.querySelector<HTMLSelectElement>("select");

  if (select) {
    return select;
  }

  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')).find((input) => {
    return !input.closest(".questionflag") && !input.name.includes("_:flagged");
  }) ?? null;
}

function getMoodleSelectedOption(select: HTMLSelectElement) {
  return (
    Array.from(select.options).find((option) => option.hasAttribute("selected")) ??
    select.selectedOptions[0] ??
    Array.from(select.options).find((option) => option.value === select.value) ??
    null
  );
}

function getQuestionSlotObservation(label: string) {
  return {
    label,
    slotKey: "question",
    slotIndex: null as number | null
  };
}

export function getQuizReviewUrlIdentity(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    const attemptId = url.searchParams.get("attempt");
    const cmId = url.searchParams.get("cmid") ?? url.searchParams.get("id");
    const attemptPart = attemptId ? `attempt:${attemptId}` : `attempt:unknown`;
    const cmidPart = cmId ? `cmid:${cmId}` : `cmid:unknown`;

    return {
      attemptId,
      cmId,
      attemptKey: `${attemptPart}|${cmidPart}`
    };
  } catch {
    return {
      attemptId: null,
      cmId: null,
      attemptKey: `page:${pageUrl}`
    };
  }
}

function getReviewChoiceInputs(questionNode: Element) {
  return Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  ).filter((input) => !input.closest(".questionflag") && !input.name.includes("_:flagged"));
}

function getReviewChoiceSlotIndex(input: HTMLInputElement, fallbackIndex: number) {
  return getAnswerControlSlotIndex(input) ?? (getChoiceInputIndex(input) ?? fallbackIndex) + 1;
}

function getReviewCorrectLabels(questionNode: Element) {
  const optionLabels = getQuestionAnswerLabels(questionNode);
  const labels: string[] = [];

  for (const rightAnswerNode of Array.from(questionNode.querySelectorAll(".rightanswer"))) {
    const answerText = getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode));

    if (!answerText) {
      continue;
    }

    const optionMatches = matchAnswerTextToOptions(answerText, optionLabels);

    if (optionMatches.length > 0) {
      labels.push(...optionMatches);
      continue;
    }

    labels.push(...splitReviewAnswerText(answerText));
  }

  return getUniqueTexts(labels);
}

function getReviewCorrectObservations(questionNode: Element, questionType: string | null, correctLabels: string[]) {
  if (questionType !== null && TEXT_INPUT_QUESTION_TYPES.has(questionType)) {
    return getReviewTextInputCorrectObservations(questionNode);
  }

  if (questionType === "ordering") {
    return getReviewOrderingCorrectObservations(questionNode);
  }

  if (questionType === "ddwtos") {
    return getReviewDdwtosCorrectObservations(questionNode);
  }

  if (questionType === "ddmarker") {
    return getReviewDdmarkerCorrectObservations(questionNode);
  }

  if (questionType === "ddimageortext") {
    return getReviewDdimageOrTextCorrectObservations(questionNode);
  }

  if (questionType === "gapselect" || questionType === "gapfill") {
    const gapselectObservations = getReviewGapSelectCorrectObservations(questionNode);

    if (gapselectObservations.length > 0) {
      return gapselectObservations;
    }
  }

  if (isMatchingQuestionTypeName(questionType)) {
    const matchObservations = getReviewMatchCorrectObservations(questionNode);

    if (matchObservations.length > 0) {
      return matchObservations;
    }
  }

  if (questionType === "multianswer") {
    const multianswerObservations = getReviewMultianswerCorrectObservations(questionNode);

    if (multianswerObservations.length > 0) {
      return multianswerObservations;
    }
  }

  if (
    (questionType === "gapselect" || questionType === "gapfill" || isMatchingQuestionTypeName(questionType)) &&
    correctLabels.length > 0
  ) {
    const selects = Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"));

    if (selects.length === correctLabels.length) {
      return correctLabels.map((label, index) => getSelectSlotObservation(selects[index], label));
    }
  }

  if (questionType === "multianswer" && correctLabels.length > 0) {
    const controls = getCompoundReviewControls(questionNode);

    if (controls.length === correctLabels.length) {
      return correctLabels.map((label, index) => getControlSlotObservation(controls[index], label));
    }
  }

  return correctLabels.map(getQuestionSlotObservation);
}

function getReviewDdimageOrTextCorrectObservations(questionNode: Element): ReviewObservation[] {
  if (isReviewQuestionMarkedCorrect(questionNode)) {
    return getReviewDdimageOrTextSelectedObservations(questionNode);
  }

  const drops = getDdimageOrTextDrops(questionNode);
  const choices = getDdimageOrTextChoices(questionNode).map((choice) => choice.label);

  for (const rightAnswerNode of Array.from(questionNode.querySelectorAll(".rightanswer"))) {
    const labels = matchAnswerTextToOptionsInTextOrder(
      getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode)),
      choices,
      drops.length
    );

    if (labels.length >= drops.length) {
      return drops
        .map((drop, index): ReviewObservation | null => {
          const slotIndex = getDdimageOrTextDropSlotIndex(drop);
          const label = labels[index] ?? "";

          return label && slotIndex !== null
            ? {
                label,
                slotKey: `slot:${slotIndex}`,
                slotIndex
              }
            : null;
        })
        .filter((observation): observation is ReviewObservation => observation !== null);
    }
  }

  return [];
}

function getReviewDdimageOrTextSelectedObservations(questionNode: Element): ReviewObservation[] {
  return getDdimageOrTextDrops(questionNode)
    .map((drop): ReviewObservation | null => {
      const slotIndex = getDdimageOrTextDropSlotIndex(drop);
      const label = getDdimageOrTextSelectedLabelForDrop(questionNode, drop);

      return label && slotIndex !== null
        ? {
            label,
            slotKey: `slot:${slotIndex}`,
            slotIndex
          }
        : null;
    })
    .filter((observation): observation is ReviewObservation => observation !== null);
}

function getReviewDdmarkerCoordinatesFromRightAnswer(questionNode: Element) {
  const rightAnswerText = Array.from(questionNode.querySelectorAll(".rightanswer"))
    .map((node) => getRightAnswerBodyText(getMoodleAnswerLabelText(node)))
    .join(" ");
  const coordinates = rightAnswerText.match(/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?/g) ?? [];

  return coordinates.map(getDdmarkerCoordinateLabel).filter(Boolean);
}

function getReviewDdmarkerCorrectObservations(questionNode: Element): ReviewObservation[] {
  if (isReviewQuestionMarkedCorrect(questionNode)) {
    return getReviewDdmarkerSelectedObservations(questionNode);
  }

  const coordinates = getReviewDdmarkerCoordinatesFromRightAnswer(questionNode);

  if (coordinates.length === 0) {
    return [];
  }

  return getDdmarkerChoices(questionNode)
    .map((choice, index): ReviewObservation | null => {
      const coordinate = coordinates[index] ?? "";

      return coordinate
        ? {
            label: coordinate,
            slotKey: `slot:${choice.choiceIndex}`,
            slotIndex: choice.choiceIndex
          }
        : null;
    })
    .filter((observation): observation is ReviewObservation => observation !== null);
}

function getReviewDdmarkerSelectedObservations(questionNode: Element): ReviewObservation[] {
  return getDdmarkerChoices(questionNode)
    .map((choice): ReviewObservation | null => {
      const coordinate = getDdmarkerCoordinateLabel(choice.input.value);

      return coordinate
        ? {
            label: coordinate,
            slotKey: `slot:${choice.choiceIndex}`,
            slotIndex: choice.choiceIndex
          }
        : null;
    })
    .filter((observation): observation is ReviewObservation => observation !== null);
}

function getReviewDdwtosCorrectObservations(questionNode: Element): ReviewObservation[] {
  const drops = getDdwtosDrops(questionNode);
  const choices = getDdwtosChoices(questionNode).map((choice) => choice.label);

  for (const rightAnswerNode of Array.from(questionNode.querySelectorAll(".rightanswer"))) {
    const inlineCorrectLabels = Array.from(rightAnswerNode.querySelectorAll(".drop, .draghome"))
      .map((node) => getMoodleAnswerLabelText(node).replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const labels =
      inlineCorrectLabels.length >= drops.length
        ? inlineCorrectLabels
        : matchAnswerTextToOptionsInTextOrder(
            getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode)),
            choices,
            drops.length
          );

    if (labels.length >= drops.length) {
      return drops
        .map((drop, index): ReviewObservation | null => {
          const slotIndex = getDdwtosDropSlotIndex(drop);
          const label = labels[index] ?? "";

          return label && slotIndex !== null
            ? {
                label,
                slotKey: `slot:${slotIndex}`,
                slotIndex
              }
            : null;
        })
        .filter((observation): observation is ReviewObservation => observation !== null);
    }
  }

  return [];
}

function getReviewDdwtosSelectedObservations(questionNode: Element): ReviewObservation[] {
  return getDdwtosDrops(questionNode)
    .map((drop): ReviewObservation | null => {
      const slotIndex = getDdwtosDropSlotIndex(drop);
      const label = getDdwtosSelectedLabelForDrop(questionNode, drop);

      return label && slotIndex !== null
        ? {
            label,
            slotKey: `slot:${slotIndex}`,
            slotIndex
          }
        : null;
    })
    .filter((observation): observation is ReviewObservation => observation !== null);
}

function getReviewDisplayedTextAnswer(questionNode: Element) {
  const answerNode = questionNode.querySelector(".answer");

  if (!answerNode) {
    return "";
  }

  const clone = answerNode.cloneNode(true);

  if (!(clone instanceof Element)) {
    return "";
  }

  clone.querySelectorAll(
    [
      `[${ANSWER_WIDGET_ATTR}="true"]`,
      "input",
      "select",
      "textarea",
      "button",
      "script",
      "style",
      ".accesshide",
      ".visually-hidden",
      ".icon",
      ".feedback",
      ".rightanswer",
      ".validationerror"
    ].join(",")
  ).forEach((node) => node.remove());

  return cleanReviewDisplayedTextAnswer(getMoodleAnswerLabelText(clone));
}

function getReviewFeedbackContentText(feedbackTrigger: Element) {
  const rawContent =
    feedbackTrigger.getAttribute("data-bs-content") ??
    feedbackTrigger.getAttribute("data-content") ??
    feedbackTrigger.getAttribute("title") ??
    "";

  if (!rawContent) {
    return "";
  }

  const container = document.createElement("div");
  container.innerHTML = rawContent.replace(/<br\s*\/?>/gi, "\n");
  return getMoodleAnswerLabelText(container).replace(/\s+/g, " ").trim();
}

function getReviewGapSelectCorrectObservations(questionNode: Element): ReviewObservation[] {
  if (isReviewQuestionMarkedCorrect(questionNode)) {
    return getReviewSelectedObservations(questionNode);
  }

  const selects = Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"));

  if (selects.length === 0) {
    return [];
  }

  const optionLabels = getQuestionAnswerLabels(questionNode);

  for (const rightAnswerNode of Array.from(questionNode.querySelectorAll(".rightanswer"))) {
    const bracketedLabels = extractBracketedAnswers(getMoodleAnswerLabelText(rightAnswerNode));

    if (bracketedLabels.length >= selects.length) {
      return selects.map((select, index) => getSelectSlotObservation(select, bracketedLabels[index]));
    }

    const labels = matchAnswerTextToOptionsInTextOrder(
      getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode)),
      optionLabels,
      selects.length
    );

    if (labels.length >= selects.length) {
      return selects.map((select, index) => getSelectSlotObservation(select, labels[index]));
    }
  }

  return [];
}

function getReviewMatchCorrectObservations(questionNode: Element): ReviewObservation[] {
  const rightAnswerNodes = Array.from(questionNode.querySelectorAll(".rightanswer"));
  const imagePairs = rightAnswerNodes.flatMap(parseReviewMatchImagePairs);
  const pairs = imagePairs.length > 0
    ? imagePairs
    : rightAnswerNodes.flatMap((rightAnswerNode) => {
        return parseReviewMatchPairs(getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode)));
      });

  if (pairs.length === 0) {
    return [];
  }

  const observations: ReviewObservation[] = [];
  const selects = Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"));

  selects.forEach((select, index) => {
    const promptLabel = getSelectControlLabel(questionNode, select, index);
    const pair = pairs.find((candidate) => labelsMatch(candidate.prompt, promptLabel));

    if (!pair?.answer) {
      return;
    }

    observations.push({
      label: pair.answer,
      slotKey: promptLabel,
      slotIndex: getSelectPlaceIndex(select)
    });
  });

  return observations;
}

function getReviewMultianswerCorrectObservations(questionNode: Element): ReviewObservation[] {
  const observations: ReviewObservation[] = [];

  for (const subquestion of Array.from(questionNode.querySelectorAll(".subquestion"))) {
    const control = getFirstCompoundControl(subquestion);
    const feedbackTrigger = subquestion.querySelector(".feedbacktrigger");

    if (!control || !feedbackTrigger) {
      continue;
    }

    const correctLabel = getCorrectAnswerFromFeedbackText(getReviewFeedbackContentText(feedbackTrigger));

    if (!correctLabel) {
      continue;
    }

    observations.push(getControlSlotObservation(control, correctLabel));
  }

  if (observations.length > 0) {
    return observations;
  }

  return isReviewQuestionMarkedCorrect(questionNode) ? getReviewMultianswerSelectedObservations(questionNode) : [];
}

function getReviewMultianswerSelectedObservations(questionNode: Element): ReviewObservation[] {
  const observations: ReviewObservation[] = [];

  observations.push(...getReviewTextInputSelectedObservations(questionNode));

  const choiceInputs = getReviewChoiceInputs(questionNode);

  for (const [index, input] of choiceInputs.entries()) {
    if (!input.checked) {
      continue;
    }

    const label = getInputAnswerLabelText(questionNode, input);

    if (label) {
      const slotIndex = getReviewChoiceSlotIndex(input, index);
      observations.push(getControlSlotObservation(input, label, slotIndex));
    }
  }

  for (const select of Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"))) {
    const selectedOption = getMoodleSelectedOption(select);

    if (!selectedOption || isPlaceholderSelectOption(selectedOption)) {
      continue;
    }

    const label = getSelectOptionLabel(selectedOption);

    if (label) {
      observations.push(getControlSlotObservation(select, label));
    }
  }

  return observations;
}

function getReviewOrderingCorrectObservations(questionNode: Element): ReviewObservation[] {
  if (isReviewQuestionMarkedCorrect(questionNode)) {
    return getReviewOrderingSelectedObservations(questionNode);
  }

  return Array.from(questionNode.querySelectorAll(".rightanswer ol.correctorder li"))
    .map((item, index) => getOrderingPositionObservation(index + 1, getMoodleAnswerLabelText(item).replace(/\s+/g, " ").trim()))
    .filter((observation) => observation.label.trim() !== "");
}

function getReviewOrderingSelectedObservations(questionNode: Element): ReviewObservation[] {
  return getOrderingItems(questionNode)
    .map((item, index) => getOrderingPositionObservation(index + 1, getOrderingItemLabel(item)))
    .filter((observation) => observation.label.trim() !== "");
}

function getReviewQuestionFeedbackText(questionNode: Element) {
  return normalizeAnswerLabel(questionNode.querySelector(".outcome .feedback, .specificfeedback")?.textContent ?? "");
}

function getReviewQuestionStateText(questionNode: Element) {
  return normalizeAnswerLabel(questionNode.querySelector(".state")?.textContent ?? "");
}

function getReviewSelectedObservations(questionNode: Element) {
  if (questionNode.classList.contains("multianswer")) {
    return getReviewMultianswerSelectedObservations(questionNode);
  }

  if (questionNode.classList.contains("ordering")) {
    return getReviewOrderingSelectedObservations(questionNode);
  }

  if (questionNode.classList.contains("ddwtos")) {
    return getReviewDdwtosSelectedObservations(questionNode);
  }

  if (questionNode.classList.contains("ddmarker")) {
    return getReviewDdmarkerSelectedObservations(questionNode);
  }

  if (questionNode.classList.contains("ddimageortext")) {
    return getReviewDdimageOrTextSelectedObservations(questionNode);
  }

  if (isTextInputQuestionType(questionNode)) {
    return getReviewTextInputSelectedObservations(questionNode);
  }

  const observations: ReviewObservation[] = [];
  const choiceInputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  );

  for (const input of choiceInputs) {
    if (!input.checked) {
      continue;
    }

    const label = getInputAnswerLabelText(questionNode, input);

    if (label) {
      observations.push(
        questionNode.classList.contains("multianswer")
          ? getControlSlotObservation(input, label)
          : getQuestionSlotObservation(label)
      );
    }
  }

  for (const select of Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"))) {
    const selectedOption = getMoodleSelectedOption(select);

    if (!selectedOption || isPlaceholderSelectOption(selectedOption)) {
      continue;
    }

    const label = getSelectOptionLabel(selectedOption);

    if (label) {
      observations.push(getSelectSlotObservation(select, label));
    }
  }

  return observations;
}

function getReviewTextInputCorrectObservations(questionNode: Element) {
  const labels = Array.from(questionNode.querySelectorAll(".rightanswer"))
    .flatMap((rightAnswerNode) => splitReviewAnswerText(getRightAnswerBodyText(getMoodleAnswerLabelText(rightAnswerNode))));

  return getUniqueTexts(labels).map(getQuestionSlotObservation);
}

function getReviewTextInputSelectedObservations(questionNode: Element): ReviewObservation[] {
  const observations: ReviewObservation[] = [];
  const textInputs = Array.from(questionNode.querySelectorAll<HTMLInputElement>("input")).filter((input) => {
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    return type === "text" && getReviewTextInputValue(input) !== "";
  });

  for (const input of textInputs) {
    const label = getReviewTextInputValue(input);

    observations.push(
      questionNode.classList.contains("multianswer")
        ? getControlSlotObservation(input, label)
        : getQuestionSlotObservation(label)
    );
  }

  if (observations.length === 0) {
    const displayedAnswer = getReviewDisplayedTextAnswer(questionNode);

    if (displayedAnswer) {
      observations.push(getQuestionSlotObservation(displayedAnswer));
    }
  }

  return observations;
}

function getReviewTextInputValue(input: HTMLInputElement) {
  return (input.value || input.getAttribute("value") || "").replace(/\s+/g, " ").trim();
}

function getSelectSlotObservation(select: HTMLSelectElement, label: string) {
  const questionNode = getSelectQuestionNode(select);

  if (questionNode && isMatchingQuestionNode(questionNode)) {
    const selects = Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select"));
    const selectIndex = Math.max(0, selects.indexOf(select));
    const promptLabel = getSelectControlLabel(questionNode, select, selectIndex);
    const slotIndex = getSelectPlaceIndex(select);

    if (promptLabel) {
      return {
        label,
        slotKey: promptLabel,
        slotIndex
      };
    }
  }

  const slotIndex = getSelectPlaceIndex(select);

  return getControlSlotObservation(select, label, slotIndex);
}

function hasFullReviewGrade(questionNode: Element) {
  const gradeText = (questionNode.querySelector(".grade")?.textContent ?? "").replace(/\s+/g, " ").trim();
  const gradeMatch = /(?:mark|score|grade|оценка|балл)[^\d]*(\d+(?:[.,]\d+)?)\s*(?:out of|\/|из)\s*(\d+(?:[.,]\d+)?)/i.exec(
    gradeText
  );

  if (!gradeMatch) {
    return false;
  }

  const score = parseMoodleReviewNumber(gradeMatch[1]);
  const maxScore = parseMoodleReviewNumber(gradeMatch[2]);

  return score !== null && maxScore !== null && maxScore > 0 && score >= maxScore;
}

export async function initializeQuizReviewSave() {
  let storedState = await loadStoredState();
  setCurrentStoredState(storedState);
  syncLanguage(storedState);
  syncStealthMode(storedState);
  syncCopyUnlock(storedState);

  if (!canUseQuizFeatures(storedState)) {
    await saveQuizReviewSaveDiagnostics("content-blocked-after-load", {
      reason: "quiz features unavailable",
      hasAuthSession: Boolean(storedState?.authSession?.user?.id),
      extensionEnabled: storedState?.settings?.extensionEnabled !== false
    });
    return;
  }

  const pageFullyLoaded = await waitForFullPageLoad();

  if (!pageFullyLoaded) {
    logReduxShareInfo("ReduxShare: continuing review parse after page load wait timeout");
  }

  storedState = await loadStoredState();
  setCurrentStoredState(storedState);
  syncLanguage(storedState);
  syncStealthMode(storedState);
  syncCopyUnlock(storedState);

  if (!canUseQuizFeatures(storedState)) {
    return;
  }

  const identity = getQuizReviewUrlIdentity(window.location.href);
  const savePayload = buildReviewSaveRequestPayload(storedState);

  if (!savePayload) {
    await saveQuizReviewSaveDiagnostics("content-no-payload", {
      questionCount: document.querySelectorAll(".que").length
    });
    logReduxShareInfo("ReduxShare: review page detected, no supported answers found");
    await clearQuizReviewPendingMarker(identity.attemptKey);
    return;
  }

  try {
    await saveQuizReviewSaveDiagnostics("content-sending", {
      courseId: savePayload.courseId,
      quizId: savePayload.quizId,
      attemptKey: savePayload.attemptKey,
      questions: savePayload.questions.map((question) => ({
        questionId: question.questionId,
        questionType: question.questionType,
        questionHash: question.questionHash,
        answerCount: question.answers.length,
        answers: question.answers.map((answer) => ({
          label: answer.label,
          slotKey: answer.slotKey,
          correctness: answer.correctness,
          isCorrect: answer.isCorrect,
          wasSelected: answer.wasSelected
        }))
      }))
    });
    const response = await requestSaveReviewAnswersWithRetry(savePayload);

    if (!response.ok) {
      await saveQuizReviewSaveDiagnostics("content-response-error", {
        response
      });
      logReduxShareWarning("ReduxShare: review answers save failed", response.error);
      return;
    }

    await saveQuizReviewSaveDiagnostics("content-response-ok", {
      response,
      courseId: savePayload.courseId,
      quizId: savePayload.quizId,
      attemptKey: savePayload.attemptKey
    });
    await clearQuizReviewPendingMarker(identity.attemptKey);
    logReduxShareInfo(
      "ReduxShare: review answers processed",
      response.imported ? response.savedCount ?? 0 : 0,
      response.queued ? "queued" : response.imported === false ? "duplicate" : "saved"
    );
  } catch (error) {
    await saveQuizReviewSaveDiagnostics("content-exception", {
      error: error instanceof Error ? error.message : String(error)
    });
    logReduxShareWarning("ReduxShare: review answers save failed", error);
  }
}

function isPartiallyCorrectReviewQuestion(questionNode: Element) {
  const stateText = getReviewQuestionStateText(questionNode);
  const feedbackText = getReviewQuestionFeedbackText(questionNode);

  return (
    questionNode.classList.contains("partiallycorrect") ||
    stateText.includes("partially correct") ||
    stateText.includes("частично") ||
    feedbackText.includes("partially correct") ||
    feedbackText.includes("частично")
  );
}

export function isQuizReviewUrl(url: Location) {
  return url.protocol === "https:" && url.pathname.endsWith("/mod/quiz/review.php");
}

function isReviewQuestionMarkedCorrect(questionNode: Element) {
  if (isPartiallyCorrectReviewQuestion(questionNode)) {
    return false;
  }

  const stateText = getReviewQuestionStateText(questionNode);
  const feedbackText = getReviewQuestionFeedbackText(questionNode);

  return (
    questionNode.classList.contains("correct") ||
    /\bcorrect\b/i.test(stateText) ||
    stateText === "верно" ||
    stateText === "правильно" ||
    /\byour answer is correct\b/i.test(feedbackText) ||
    feedbackText.includes("ответ верен") ||
    hasFullReviewGrade(questionNode)
  );
}

function isReviewQuestionMarkedIncorrect(questionNode: Element) {
  const stateText = getReviewQuestionStateText(questionNode);
  const feedbackText = getReviewQuestionFeedbackText(questionNode);

  return (
    questionNode.classList.contains("incorrect") ||
    /\bincorrect\b/i.test(stateText) ||
    stateText.includes("невер") ||
    /\byour answer is incorrect\b/i.test(feedbackText) ||
    feedbackText.includes("ответ невер")
  );
}

function matchAnswerTextToOptions(answerText: string, optionLabels: string[]) {
  const normalizedAnswerText = normalizeAnswerLabel(answerText);
  const answerPartKeys = new Set(splitReviewAnswerText(answerText).map(normalizeAnswerLabel));
  const matchedLabels: string[] = [];

  for (const optionLabel of optionLabels) {
    const optionKeys = getAnswerLabelMatchKeys(optionLabel);
    const isMatched = [...optionKeys].some((key) => {
      return answerPartKeys.has(key) || normalizedAnswerText === key || (key.length >= 3 && normalizedAnswerText.includes(key));
    });

    if (isMatched) {
      matchedLabels.push(optionLabel);
    }
  }

  return getUniqueTexts(matchedLabels);
}

function matchAnswerTextToOptionsInTextOrder(answerText: string, optionLabels: string[], expectedCount: number) {
  const normalizedAnswerText = normalizeAnswerLabel(answerText);
  const matches = optionLabels
    .map((label) => {
      const indexes = [...getAnswerLabelMatchKeys(label)]
        .map((key) => normalizedAnswerText.indexOf(key))
        .filter((index) => index >= 0);

      return indexes.length > 0 ? { label, index: Math.min(...indexes) } : null;
    })
    .filter((match): match is { label: string; index: number } => match !== null)
    .sort((left, right) => left.index - right.index)
    .map((match) => match.label);

  return getUniqueTexts(matches).slice(0, expectedCount);
}

function parseMoodleReviewNumber(value: string) {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReviewMatchImagePairs(rightAnswerNode: Element) {
  const pairs: Array<{ prompt: string; answer: string }> = [];
  let pendingPrompt: string | null = null;

  for (const token of collectReviewMatchTokens(rightAnswerNode)) {
    if (token.kind === "image") {
      pendingPrompt = token.value;
      continue;
    }

    if (!pendingPrompt) {
      continue;
    }

    const answerText = getRightAnswerBodyText(token.value);
    const answerMatch = /(?:→|->|=>|=)\s*([^,;|]+)/.exec(answerText);

    if (!answerMatch) {
      continue;
    }

    pairs.push({
      prompt: pendingPrompt,
      answer: answerMatch[1].replace(/\s+/g, " ").trim()
    });
    pendingPrompt = null;
  }

  return pairs;
}

function requestSaveReviewAnswers(payload: {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptKey: string;
  pageUrl: string;
  questions: ReviewQuestionPayload[];
}): Promise<SaveReviewAnswersResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: SAVE_REVIEW_ANSWERS_MESSAGE,
          payload
        },
        (response: SaveReviewAnswersResponse | undefined) => {
          const runtimeError = chrome.runtime.lastError;

          if (runtimeError) {
            reject(new Error(runtimeError.message));
            return;
          }

          resolve(response ?? { ok: false, error: "Background script did not return a response." });
        }
      );
    } catch (error) {
      // Synchronous throw: the extension context is gone (reloaded/removed).
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// Transport-level failures (a just-woken service worker, a closed message port)
// are retried a couple of times before giving up. Background-level failures are
// not retried here: the background queues them itself for its own retry cycle.
async function requestSaveReviewAnswersWithRetry(
  payload: Parameters<typeof requestSaveReviewAnswers>[0],
  attempts = 3
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestSaveReviewAnswers(payload);
    } catch (error) {
      lastError = error;

      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 1_000 : 3_000));
      }
    }
  }

  throw lastError;
}

function reviewObservationsMatch(
  left: { label: string; slotKey: string },
  right: { label: string; slotKey: string }

) {
  const slotsMatch = left.slotKey === right.slotKey || left.slotKey === "question" || right.slotKey === "question";
  return slotsMatch && labelsMatch(left.label, right.label);
}
export async function saveQuizReviewPendingMarker(marker: QuizReviewPendingMarker) {
  await chrome.storage.local.set({
    [QUIZ_REVIEW_PENDING_STORAGE_KEY]: marker
  });
}

export async function saveQuizReviewSaveDiagnostics(stage: string, details: Record<string, unknown> = {}) {
  try {
    await chrome.storage.local.set({
      [QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY]: {
        stage,
        pageUrl: window.location.href,
        savedAt: new Date().toISOString(),
        details
      }
    });
  } catch {
    // Diagnostics must not block quiz behavior.
  }
}

type ReviewMatchToken = {
  kind: "image" | "text";
  value: string;
};
