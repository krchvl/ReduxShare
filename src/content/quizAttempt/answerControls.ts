// Answer control discovery, answer-data lookups and progress reporting that several
// quiz-attempt modules share. Moved out of src/content/quizAttempt.ts.
import {
  UNSUPPORTED_DRAG_DROP_QUESTION_TYPES,
  type AnswerData,
  type AnswerEntry,
  type AnswerSlotData,
  type AnswerVariantCounts,
  type QuizAttemptContext,
  type QuizProgressReports,
  type QuizQuestionSummary,
  type RecordQuizProgressResponse,
  type QuizAnswersResponse,
  type QuizVariantResult,
  type SourceAnswerData,
  type StoredStateLike,
  type SuggestionItem,
  type SubmissionItem
} from "../../model";
import { QUIZ_PROGRESS_REPORTS_STORAGE_KEY } from "../../shared/storageKeys";
import { RECORD_QUIZ_PROGRESS_MESSAGE } from "../../shared/messages";
import {
  createEmptyAnswerData,
  createEmptySourceAnswerData,
  createEmptyVariantCounts,
  getAnswerData,
  getPreferredSuggestionLabels,
  getVariantCounts,
  hasAnswerData
} from "../../data/answerData";
import {
  findClosestLabel,
  getAnswerLabelMatchKeys,
  getClassNumber,
  getImageFileName,
  getMoodleAnswerLabelText,
  getMoodleAnswerLabelTextOrImageIdentity,
  getQuestionText,
  getSelectOptionLabel,
  getUniqueTexts,
  hashQuestionImage,
  isPlaceholderSelectOption,
  itemLabelMatches,
  javaStringHashCode,
  labelsMatch,
  normalizeAnswerLabel,
  normalizeFingerprintText,
  splitSequentialAnswerLabels,
  stableHashText,
  stripMoodleAnswerPrefix
} from "../../dom/questionDom";
import { getQuestionId, getQuestionPostData } from "../../dom/questionIdentity";
import {
  answerDataHasZeroBasedOrderingSlots,
  getOrderingItemLabel,
  getOrderingItems,
  getOrderingPositionLabel,
  getOrderingSlotPosition,
  mapSubmissionToOrderingPosition,
  mapSuggestionToOrderingPosition
} from "../../dom/ordering";
import {
  getSecondQuestionClass,
  getSupportedAutoSelectQuestionType,
  isChoiceQuestionType,
  isEssayQuestionType,
  isMatchingQuestionNode,
  isMatchingQuestionTypeName,
  isSelectableQuestionType,
  isTextInputQuestionType
} from "../../dom/questionTypes";
import { isExtensionContextValid, logReduxShareInfo, logReduxShareWarning } from "../../logic/runtime";
import { canUseAuthenticatedQuizFeatures } from "../../logic/settings";
import { answerDataByQuestionId, currentQuizAttemptContext, currentStoredState, variantCountsByQuestionId } from "../../state";
import { getDdwtosChoices, getDdwtosDropSlotIndex } from "./ddwtos";
import { getDdmarkerChoices } from "./ddmarker";
import { getDdimageOrTextChoices, getDdimageOrTextDropSlotIndex } from "./ddimageortext";
import { setTextAnswerValue, setTextareaAnswerValue } from "./textControls";

export function getQuestionAnswerLabels(
  questionNode: Element,
  options: { includePlaceholderSelectOptions?: boolean } = {}
) {
  const includePlaceholderSelectOptions = options.includePlaceholderSelectOptions ?? true;
  const labels: string[] = [];
  const choiceInputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  );

  for (const input of choiceInputs) {
    if (input.closest(".questionflag") || input.name.includes("_:flagged") || isMoodleClearChoiceInput(input)) {
      continue;
    }

    labels.push(getInputAnswerLabelText(questionNode, input));
  }

  for (const [selectIndex, select] of Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select")).entries()) {
    if (isMatchingQuestionNode(questionNode)) {
      labels.push(getSelectControlLabel(questionNode, select, selectIndex));
    }

    for (const option of Array.from(select.options)) {
      if (option.value && (includePlaceholderSelectOptions || !isPlaceholderSelectOption(option))) {
        labels.push(getSelectOptionLabel(option));
      }
    }
  }

  if (questionNode.classList.contains("ordering")) {
    labels.push(...getOrderingItems(questionNode).map(getOrderingItemLabel));
  }

  if (questionNode.classList.contains("ddwtos")) {
    labels.push(...getDdwtosChoices(questionNode).map((choice) => choice.label));
  }

  if (questionNode.classList.contains("ddmarker")) {
    labels.push(...getDdmarkerChoices(questionNode).map((choice) => choice.label));
  }

  if (questionNode.classList.contains("ddimageortext")) {
    labels.push(...getDdimageOrTextChoices(questionNode).map((choice) => choice.label));
  }

  return getUniqueTexts(labels);
}


export function getQuizAttemptUrlIdentity(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    const attemptId = url.searchParams.get("attempt");
    const cmId = url.searchParams.get("cmid") ?? url.searchParams.get("id");

    if (attemptId) {
      return `attempt:${attemptId}`;
    }

    if (cmId) {
      return `cmid:${cmId}`;
    }

    return `page:${url.pathname}?${url.searchParams.toString()}`;
  } catch {
    return `page:${pageUrl}`;
  }
}


export function getQuizProgressTestKey(context: QuizAttemptContext) {
  return [
    `domain:${context.domain}`,
    `course:${context.courseId ?? "unknown"}`,
    `quiz:${context.contextInstanceId ?? "unknown"}`,
    getQuizAttemptUrlIdentity(context.pageUrl)
  ].join("|");
}


export function getQuestionProgressId(questionNode: Element, questionId: string | null) {
  if (questionId) {
    return `qid:${questionId}`;
  }

  const questionIndex = Array.from(document.querySelectorAll(".que")).indexOf(questionNode);
  return `index:${questionIndex >= 0 ? questionIndex : "unknown"}`;
}


export function requestQuizProgressRecord(payload: {
  moodleDomain: string | null;
  solvedTestsDelta: number;
  solvedTasksDelta: number;
}): Promise<RecordQuizProgressResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        {
          type: RECORD_QUIZ_PROGRESS_MESSAGE,
          payload
        },
        (response: RecordQuizProgressResponse | undefined) => {
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


export async function reportSolvedQuestions(questionProgressIds: string[]) {
  const context = currentQuizAttemptContext;
  const uniqueQuestionProgressIds = Array.from(new Set(questionProgressIds.filter(Boolean)));

  if (!context || uniqueQuestionProgressIds.length === 0 || !canUseAuthenticatedQuizFeatures(currentStoredState)) {
    return;
  }

  // Auto-select timeouts can fire after the extension context is gone
  // (reloaded/removed): bail out before touching chrome.storage.
  if (!isExtensionContextValid()) {
    return;
  }

  const reports = await loadProgressReports();
  const testKey = getQuizProgressTestKey(context);
  const newQuestionKeys = uniqueQuestionProgressIds
    .map((questionProgressId) => `${testKey}|${questionProgressId}`)
    .filter((questionKey) => reports.questions[questionKey] !== true);
  const solvedTestsDelta = reports.tests[testKey] === true ? 0 : 1;
  const solvedTasksDelta = newQuestionKeys.length;

  if (solvedTestsDelta === 0 && solvedTasksDelta === 0) {
    return;
  }

  try {
    const response = await requestQuizProgressRecord({
      moodleDomain: context.domain,
      solvedTestsDelta,
      solvedTasksDelta
    });

    if (!response.ok) {
      logReduxShareWarning("ReduxShare: quiz progress update failed", response.error);
      return;
    }

    if (solvedTestsDelta > 0) {
      reports.tests[testKey] = true;
    }

    for (const questionKey of newQuestionKeys) {
      reports.questions[questionKey] = true;
    }

    await saveProgressReports(reports);
  } catch (error) {
    logReduxShareWarning("ReduxShare: quiz progress update failed", error);
  }
}


export function getChoiceAnswerInputs(questionNode: Element) {
  return Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  ).filter((input) => {
    return (
      !input.disabled &&
      !input.closest(".questionflag") &&
      !input.name.includes("_:flagged") &&
      !isMoodleClearChoiceInput(input)
    );
  });
}


export function isMultiAnswerMultichoiceQuestion(questionNode: Element) {
  return isChoiceQuestionType(questionNode) && getChoiceAnswerInputs(questionNode).some((input) => input.type === "checkbox");
}


export function getInputAnswerLabelText(questionNode: Element, input: HTMLInputElement) {
  const getUniqueLabelText = (labelTexts: string[]) =>
    Array.from(new Set(labelTexts.map((text) => text.replace(/\s+/g, " ").trim()).filter(Boolean))).join(" ");
  const labelTexts: string[] = [];
  const labels = input.labels ? Array.from(input.labels) : [];

  for (const label of labels) {
    const labelText = getMoodleAnswerLabelText(label).trim();

    if (labelText) {
      labelTexts.push(labelText);
    }
  }

  if (labelTexts.length > 0) {
    return getUniqueLabelText(labelTexts);
  }

  if (input.id) {
    const generatedLabel = document.getElementById(`${input.id}_label`);

    if (generatedLabel && questionNode.contains(generatedLabel)) {
      const generatedLabelText = getMoodleAnswerLabelText(generatedLabel).trim();

      if (generatedLabelText) {
        labelTexts.push(generatedLabelText);
      }
    }
  }

  if (labelTexts.length > 0) {
    return getUniqueLabelText(labelTexts);
  }

  const labelledByIds = (input.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);

  for (const labelledById of labelledByIds) {
    const labelledByElement = document.getElementById(labelledById);

    if (!labelledByElement || !questionNode.contains(labelledByElement)) {
      continue;
    }

    const labelledByText = getMoodleAnswerLabelText(labelledByElement).trim();

    if (labelledByText) {
      labelTexts.push(labelledByText);
    }
  }

  if (labelTexts.length > 0) {
    return getUniqueLabelText(labelTexts);
  }

  if (labelTexts.length === 0) {
    const row = input.closest(".r0, .r1, .r, li") ?? input.parentElement;

    if (row && questionNode.contains(row)) {
      const rowText = getMoodleAnswerLabelText(row).trim();

      if (rowText) {
        labelTexts.push(rowText);
      }
    }
  }

  return getUniqueLabelText(labelTexts);
}


export function selectNextSelectOptionByLabel(questionNode: Element, label: string) {
  for (const select of getSelectableAnswerControls(questionNode)) {
    const option = findSelectOptionByLabel(select, label);

    if (option && setSelectValue(select, option.value)) {
      return true;
    }
  }

  return false;
}




export function getChoiceInputIndex(input: HTMLInputElement) {
  const indexMatch = /(?:^|[_:])choice(\d+)$/.exec(input.id) ?? /(?:^|[_:])choice(\d+)$/.exec(input.name);
  return indexMatch ? Number.parseInt(indexMatch[1], 10) : null;
}


export function getSubQuestionIndex(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const subMatch = /(?:^|[_:])sub(\d+)(?:[_:]|$)/.exec(`${control.name} ${control.id}`);
  return subMatch ? Number.parseInt(subMatch[1], 10) : null;
}


export function getAnswerControlSlotIndex(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  const placeClassIndex = getClassNumber(control, "place");

  if (placeClassIndex !== null) {
    return placeClassIndex;
  }

  const placeIdMatch = /_p(\d+)$/.exec(control.id);

  if (placeIdMatch) {
    return Number.parseInt(placeIdMatch[1], 10);
  }

  const subIndex = getSubQuestionIndex(control);

  if (subIndex !== null) {
    return subIndex > 0 ? subIndex : subIndex + 1;
  }

  return null;
}


export function getAnswerControlSlotIndexCandidates(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  answerData?: AnswerData
) {
  const candidates: number[] = [];
  const primaryIndex = getAnswerControlSlotIndex(control);

  if (primaryIndex !== null) {
    candidates.push(primaryIndex);
  }

  const subIndex = getSubQuestionIndex(control);

  if (subIndex !== null) {
    candidates.push(subIndex, subIndex + 1);
  }

  return Array.from(new Set(candidates.filter((candidate) => {
    if (!Number.isFinite(candidate) || candidate < 0) {
      return false;
    }

    return !answerData || answerData.slots.length === 0 || answerData.slots.some((slot) => slot.index === candidate);
  })));
}


export function getChoiceSlotIndex(input: HTMLInputElement, answerData: AnswerData) {
  const choiceIndex = getChoiceInputIndex(input);

  if (input.closest(".que.multianswer")) {
    const controlSlotIndex = getAnswerControlSlotIndex(input);
    return controlSlotIndex ?? choiceIndex;
  }

  if (choiceIndex === null) {
    return null;
  }

  return answerData.slots.some((slot) => slot.index === 0) ? choiceIndex : choiceIndex + 1;
}


export function isOpaqueMatchAnchor(value: string) {
  return /^-?\d+$/.test(value.trim());
}


export function getPromptHashCandidates(label: string) {
  const collapsed = label.replace(/\s+/g, " ").trim();
  return Array.from(
    new Set([collapsed, normalizeFingerprintText(label), normalizeFingerprintText(stripMoodleAnswerPrefix(label))].filter(Boolean))
  );
}


export function hashAnchorMatchesPrompt(anchor: string, label: string) {
  // Some external providers send opaque integer anchors (e.g. ["", "-1510145339"])
  // that look like Java-style prompt hashes. They can never match prompt labels
  // by text, but they match exactly when the provider hashed the same prompt.
  if (!isOpaqueMatchAnchor(anchor)) {
    return false;
  }

  const target = Number.parseInt(anchor.trim(), 10);

  if (!Number.isSafeInteger(target)) {
    return false;
  }

  return getPromptHashCandidates(label).some((candidate) => javaStringHashCode(candidate) === target);
}


export function anchorMatchesPrompt(anchor: string, label: string) {
  if (labelsMatch(anchor, label)) {
    return true;
  }

  if (hashAnchorMatchesPrompt(anchor, label)) {
    return true;
  }

  // Machine identifiers (paths, URLs, image identities) must match exactly:
  // fuzzy-matching them binds near-identical wrong variants (".../icon5.png"
  // vs ".../icon3.png"). Typo tolerance applies to human text only.
  if (/[/:]/.test(anchor)) {
    return false;
  }

  return findClosestLabel(label, [anchor]) !== null;
}


export function answerSlotMatchesLabel(slot: AnswerSlotData, label: string) {
  return (
    slot.anchors.some((anchor) => anchorMatchesPrompt(anchor, label)) ||
    slot.suggestions.some((suggestion) => itemLabelMatches(suggestion, label)) ||
    slot.submissions.some((submission) => itemLabelMatches(submission, label))
  );
}


// Strict variant without typo tolerance. Quiz options are often near-duplicates
// ("23 percent of the time." vs "63 percent of the time." differ by one character), so the
// fuzzy pass can bind several checkboxes to one slot; an exact match is always unambiguous.
export function answerSlotMatchesLabelExactly(slot: AnswerSlotData, label: string) {
  return (
    slot.anchors.some((anchor) => labelsMatch(anchor, label)) ||
    slot.suggestions.some((suggestion) => labelsMatch(suggestion.label, label)) ||
    slot.submissions.some((submission) => labelsMatch(submission.label, label))
  );
}


export function answerSlotHasBooleanConflict(slot: AnswerSlotData) {
  const booleanValues = new Set<boolean>();

  for (const label of [
    ...slot.suggestions.map((suggestion) => suggestion.label),
    ...slot.submissions.map((submission) => submission.label)
  ]) {
    const booleanValue = getBooleanChoiceAnswerValue(label);

    if (booleanValue !== null) {
      booleanValues.add(booleanValue);
    }
  }

  return booleanValues.size > 1;
}


export function getChoiceAnswerSlotMatch(answerData: AnswerData, input: HTMLInputElement, label: string) {
  const slotIndex = getChoiceSlotIndex(input, answerData);
  // Exact label match wins before the typo-tolerant pass: near-duplicate option labels would
  // otherwise let the first fuzzy-matched slot swallow every checkbox of the question.
  const exactLabelMatchedSlot = answerData.slots.find((slot) => answerSlotMatchesLabelExactly(slot, label));
  const labelMatchedSlot =
    exactLabelMatchedSlot ?? answerData.slots.find((slot) => answerSlotMatchesLabel(slot, label));
  const indexMatchedSlot =
    slotIndex === null ? null : (answerData.slots.find((slot) => slot.hasExplicitIndex && slot.index === slotIndex) ?? null);
  const isCheckboxChoice = input.type === "checkbox" && !input.closest(".que.multianswer");

  if (isCheckboxChoice && labelMatchedSlot) {
    return { slot: labelMatchedSlot, slotIndex };
  }

  if (isCheckboxChoice && indexMatchedSlot && answerSlotHasBooleanConflict(indexMatchedSlot)) {
    return { slot: null, slotIndex };
  }

  const slot = input.closest(".que.multianswer") ? (indexMatchedSlot ?? labelMatchedSlot) : (labelMatchedSlot ?? indexMatchedSlot);

  return { slot, slotIndex };
}


export function getBooleanChoiceAnswerValue(label: string) {
  const normalizedLabel = label.trim().toLowerCase();

  if (normalizedLabel === "true") {
    return true;
  }

  if (normalizedLabel === "false") {
    return false;
  }

  return null;
}


export function getBooleanChoiceSuggestionTotals(
  suggestions: SuggestionItem[],
  booleanValue: boolean
) {
  return suggestions
    .filter((suggestion) => suggestion.correctness === 2 && getBooleanChoiceAnswerValue(suggestion.label) === booleanValue)
    .reduce(
      (totals, suggestion) => {
        totals.entries.push(suggestion);
        totals.count += suggestion.count ?? 1;
        totals.confidence += suggestion.confidence ?? 0;
        return totals;
      },
      {
        entries: [] as SuggestionItem[],
        count: 0,
        confidence: 0
      }
    );
}


export function getPreferredBooleanChoiceExactSuggestion(slot: AnswerSlotData | null | undefined): SuggestionItem | null {
  if (!slot) {
    return null;
  }

  const trueTotals = getBooleanChoiceSuggestionTotals(slot.suggestions, true);
  const falseTotals = getBooleanChoiceSuggestionTotals(slot.suggestions, false);

  if (trueTotals.entries.length === 0 && falseTotals.entries.length === 0) {
    return null;
  }

  const compareByWeight = (left: typeof trueTotals, right: typeof trueTotals) => {
    if (left.count !== right.count) {
      return left.count - right.count;
    }

    if (left.confidence !== right.confidence) {
      return left.confidence - right.confidence;
    }

    return left.entries.length - right.entries.length;
  };

  const comparison = compareByWeight(trueTotals, falseTotals);

  if (comparison === 0) {
    return null;
  }

  const winner = comparison > 0 ? trueTotals : falseTotals;
  const loser = comparison > 0 ? falseTotals : trueTotals;
  const winnerLabel = comparison > 0 ? "true" : "false";
  const totalWeight = winner.count + loser.count;
  const normalizedConfidence =
    totalWeight > 0
      ? Math.max(0, Math.min(1, winner.count / totalWeight))
      : Math.max(...winner.entries.map((entry) => entry.confidence ?? 0), 0);

  return {
    correctness: 2,
    confidence: normalizedConfidence,
    count: winner.count,
    label: winnerLabel,
    actionSlotIndex: winner.entries[0]?.actionSlotIndex
  };
}


export function normalizeChoiceSlotForWidget(slot: AnswerSlotData): AnswerSlotData {
  const preferredBooleanSuggestion = getPreferredBooleanChoiceExactSuggestion(slot);

  if (!preferredBooleanSuggestion) {
    return slot;
  }

  const hasTrueExact = slot.suggestions.some((suggestion) => suggestion.correctness === 2 && getBooleanChoiceAnswerValue(suggestion.label) === true);
  const hasFalseExact = slot.suggestions.some((suggestion) => suggestion.correctness === 2 && getBooleanChoiceAnswerValue(suggestion.label) === false);
  const hasConflictingBooleanExact = hasTrueExact && hasFalseExact;

  if (!hasConflictingBooleanExact) {
    return {
      ...slot,
      suggestions: [preferredBooleanSuggestion]
    };
  }

  return {
    ...slot,
    suggestions: [preferredBooleanSuggestion],
    submissions: [
      ...slot.submissions,
      ...slot.suggestions
        .filter((suggestion) => suggestion.correctness === 2)
        .map((suggestion): SubmissionItem => ({
          correctness: suggestion.correctness,
          count: suggestion.count ?? 1,
          label: suggestion.label,
          displayLabel: suggestion.displayLabel,
          actionSlotIndex: suggestion.actionSlotIndex
        }))
    ]
  };
}


export function getExactBooleanChoiceSlotValue(slot: AnswerSlotData | null | undefined) {
  return getBooleanChoiceAnswerValue(getPreferredBooleanChoiceExactSuggestion(slot)?.label ?? "");
}


export function getNonBooleanExactChoiceSuggestions(answerData: AnswerData) {
  const exactSuggestions = answerData.suggestions.filter((suggestion) => {
    return suggestion.correctness === 2 && suggestion.label.trim() && getBooleanChoiceAnswerValue(suggestion.label) === null;
  });

  return exactSuggestions.length > 0 ? exactSuggestions : [];
}


export function getNonBooleanChoiceSubmissions(answerData: AnswerData) {
  return answerData.submissions.filter((submission) => {
    return submission.label.trim() && getBooleanChoiceAnswerValue(submission.label) === null;
  });
}


export function scopeQuestionLevelChoiceDataToBoolean(answerData: AnswerData, input: HTMLInputElement, label: string) {
  if (input.type !== "checkbox") {
    return null;
  }

  const exactSuggestions = getNonBooleanExactChoiceSuggestions(answerData);
  const nonBooleanSubmissions = getNonBooleanChoiceSubmissions(answerData);

  if (exactSuggestions.length === 0 && nonBooleanSubmissions.length === 0) {
    return null;
  }

  const slotIndex = getChoiceSlotIndex(input, answerData) ?? getChoiceInputIndex(input);
  const matchingSuggestion = exactSuggestions.find((suggestion) => itemLabelMatches(suggestion, label));
  const matchingSubmission = nonBooleanSubmissions.find((submission) => itemLabelMatches(submission, label));
  // The stored data is question-level while this scoping runs per checkbox. If nothing matches
  // this option's label (slot bindings lost, shuffled options, rightanswer wording drift), the
  // option's boolean value is unknown: inventing "false" here would leak it into the next
  // attempt's menu and auto-select as a guaranteed-correct answer.
  const hasMatchingData = matchingSuggestion !== undefined || matchingSubmission !== undefined;
  const hasExactData = exactSuggestions.length > 0 && hasMatchingData;
  const booleanLabel = (hasExactData ? matchingSuggestion : matchingSubmission) ? "true" : "false";
  const fallbackCount = Math.max(1, ...exactSuggestions.map((suggestion) => suggestion.count ?? 0));
  const fallbackSubmissionCount = Math.max(1, ...nonBooleanSubmissions.map((submission) => submission.count));
  const booleanCount = matchingSuggestion?.count ?? matchingSubmission?.count ?? (hasExactData ? fallbackCount : fallbackSubmissionCount);
  const suggestions: SuggestionItem[] = hasExactData
    ? [
        {
          correctness: 2,
          confidence: 1,
          count: booleanCount,
          label: booleanLabel
        }
      ]
    : [];
  const submissions: SubmissionItem[] = hasExactData
    ? answerData.submissions
        .filter((submission) => itemLabelMatches(submission, label))
        .map((submission): SubmissionItem => ({
          ...submission,
          label: "true",
          displayLabel: "true"
        }))
    : [];

  if (submissions.length === 0) {
    submissions.push({
      correctness: hasExactData ? 2 : 1,
      count: booleanCount,
      label: booleanLabel
    });
  }

  return {
    answerData: {
      anchors: label ? [label] : [],
      suggestions,
      submissions,
      slots:
        slotIndex === null
          ? []
          : [
              {
                index: slotIndex,
                hasExplicitIndex: false,
                anchors: label ? [label] : [],
                suggestions,
                submissions
              }
            ]
    },
    slotIndex
  };
}


export function scopeAnswerDataToChoice(answerData: AnswerData, input: HTMLInputElement, label: string) {
  const booleanScopedData = scopeQuestionLevelChoiceDataToBoolean(answerData, input, label);

  if (booleanScopedData) {
    return booleanScopedData;
  }

  const { slot, slotIndex } = getChoiceAnswerSlotMatch(answerData, input, label);

  if (slot) {
    const normalizedSlot = normalizeChoiceSlotForWidget(slot);

    return {
      answerData: {
        anchors: normalizedSlot.anchors,
        suggestions: normalizedSlot.suggestions,
        submissions: normalizedSlot.submissions,
        slots: [normalizedSlot]
      },
      slotIndex: normalizedSlot.index
    };
  }

  const anchors = answerData.anchors.filter((anchor) => labelsMatch(anchor, label));
  const suggestions = answerData.suggestions.filter((suggestion) => itemLabelMatches(suggestion, label));
  const submissions = answerData.submissions.filter((submission) => itemLabelMatches(submission, label));
  const fallbackIndex = getChoiceInputIndex(input);
  const fallbackSlotIndex = slotIndex ?? fallbackIndex;

  return {
    answerData: {
      anchors,
      suggestions,
      submissions,
      slots:
        fallbackSlotIndex === null || (anchors.length === 0 && suggestions.length === 0 && submissions.length === 0)
          ? []
          : [
              {
                index: fallbackSlotIndex,
                hasExplicitIndex: false,
                anchors,
                suggestions,
                submissions
              }
            ]
    },
    slotIndex: fallbackSlotIndex
  };
}


export function findInputForAnswerLabelContainer(questionNode: Element, container: Element) {
  const answerInputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  ).filter((input) => !isMoodleClearChoiceInput(input));

  if (container.id) {
    const inputByAria = answerInputs.find((input) =>
      (input.getAttribute("aria-labelledby") ?? "").split(/\s+/).includes(container.id)
    );

    if (inputByAria) {
      return inputByAria;
    }

    if (container.id.endsWith("_label")) {
      const inputId = container.id.slice(0, -"_label".length);
      const inputById = answerInputs.find((input) => input.id === inputId);

      if (inputById) {
        return inputById;
      }
    }
  }

  const row = container.parentElement;

  if (!row) {
    return null;
  }

  return row.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
}


export function findInputForAnswerLabel(questionNode: Element, label: string) {
  const targetKeys = getAnswerLabelMatchKeys(label);
  const labelContainers = Array.from(
    questionNode.querySelectorAll('[data-region="answer-label"]')
  );

  for (const container of labelContainers) {
    const containerKeys = getAnswerLabelMatchKeys(getMoodleAnswerLabelText(container));

    if (![...targetKeys].some((key) => containerKeys.has(key))) {
      continue;
    }

    const input = findInputForAnswerLabelContainer(questionNode, container);

    if (input) {
      return input;
    }
  }

  const answerInputs = Array.from(
    questionNode.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]')
  ).filter((input) => !isMoodleClearChoiceInput(input));

  for (const input of answerInputs) {
    const inputKeys = getAnswerLabelMatchKeys(getInputAnswerLabelText(questionNode, input));

    if ([...targetKeys].some((key) => inputKeys.has(key))) {
      return input;
    }
  }

  return null;
}


export function setAnswerInputChecked(input: HTMLInputElement, checked: boolean) {
  if (input.disabled || input.checked === checked) {
    return false;
  }

  input.click();

  if (input.checked !== checked) {
    input.checked = checked;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}


export function getSelectableAnswerControls(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLSelectElement>("select")).filter((select) => !select.disabled);
}


export function findSelectOptionByLabel(select: HTMLSelectElement, label: string) {
  const options = Array.from(select.options).filter((option) => option.value);
  const targetKeys = getAnswerLabelMatchKeys(label);
  const exact = options.find((option) => {
    const optionKeys = getAnswerLabelMatchKeys(option.textContent ?? option.label);
    return [...targetKeys].some((key) => optionKeys.has(key));
  });

  if (exact) {
    return exact;
  }

  const closest = findClosestLabel(
    label,
    options.map((option) => option.textContent ?? option.label)
  );

  return closest ? options[closest.index] : undefined;
}


export function setSelectValue(select: HTMLSelectElement, value: string) {
  if (select.value === value) {
    return false;
  }

  select.value = value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}


export function getTextAnswerInputs(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLInputElement>("input")).filter((input) => {
    const type = (input.getAttribute("type") ?? "text").toLowerCase();
    return type === "text" && !input.disabled && !input.readOnly;
  });
}


export function getEssayAnswerTextareas(questionNode: Element) {
  return Array.from(questionNode.querySelectorAll<HTMLTextAreaElement>("textarea")).filter((textarea) => {
    return !textarea.disabled && !textarea.readOnly && !textarea.closest(".questionflag");
  });
}


export function selectTextAnswerByLabel(questionNode: Element, label: string) {
  const input = getTextAnswerInputs(questionNode)[0];
  return input ? setTextAnswerValue(input, label) : false;
}


export function getSelectSubIndex(select: HTMLSelectElement) {
  return getSubQuestionIndex(select);
}


export function getSelectQuestionNode(select: HTMLSelectElement) {
  return select.closest(".que");
}


export function getSelectControlLabelElements(questionNode: Element, select: HTMLSelectElement): HTMLElement[] {
  const elements: HTMLElement[] = [];
  const labelledByIds = (select.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const describedByIds = (select.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const labelIds = [
    ...labelledByIds,
    ...describedByIds.filter((id) => /(?:^|[_-])(?:sub\d+_)?itemtext$|_itemtext$/i.test(id))
  ];

  for (const labelId of labelIds) {
    const labelElement = document.getElementById(labelId);

    if (labelElement && questionNode.contains(labelElement) && !elements.includes(labelElement)) {
      elements.push(labelElement);
    }
  }

  const rowTextCell = select.closest("tr")?.querySelector<HTMLElement>("td.text, th.text, .text");

  if (rowTextCell && questionNode.contains(rowTextCell) && !elements.includes(rowTextCell)) {
    elements.push(rowTextCell);
  }

  return elements;
}


export function getSelectPromptImageHashes(questionNode: Element, select: HTMLSelectElement): string[] {
  const hashes = new Set<string>();

  for (const labelElement of getSelectControlLabelElements(questionNode, select)) {
    for (const image of Array.from(labelElement.querySelectorAll("img"))) {
      const rawSrc = image.currentSrc || image.getAttribute("src") || "";
      const src = rawSrc.startsWith("data:") ? javaStringHashCode(rawSrc).toString() : rawSrc;

      if (!src.trim()) {
        continue;
      }

      hashes.add(hashQuestionImage(src, image.alt ?? ""));
    }
  }

  return [...hashes];
}


export function getSelectControlLabel(questionNode: Element, select: HTMLSelectElement, index: number) {
  for (const labelElement of getSelectControlLabelElements(questionNode, select)) {
    const label = getMoodleAnswerLabelTextOrImageIdentity(labelElement);

    if (label) {
      return label;
    }
  }

  return `Select ${index + 1}`;
}


export function canMatchOpaqueMatchSlotsPositionally(answerData: AnswerData, selectCount: number) {
  // Some external providers send opaque anchors such as ["", "-1510145339"]: no
  // prompt text at all, only internal row ids. No client — including the
  // provider's own — can bind such rows by content; the only possible binding
  // is row order against DOM order (Moodle renders match stems in author-fixed
  // order). Allow it only when every select maps to exactly one slot.
  // Text anchors that disagree keep the strict behavior (no match) so answers
  // from a wrong variant are never applied positionally.
  return (
    selectCount > 0 &&
    answerData.slots.length === selectCount &&
    answerData.slots.every((slot) => slot.anchors.length > 0 && slot.anchors.every(isOpaqueMatchAnchor))
  );
}


export function getSelectPlaceIndex(select: HTMLSelectElement) {
  const slotIndex = getAnswerControlSlotIndex(select);

  if (slotIndex !== null) {
    return slotIndex;
  }

  const subIndex = getSelectSubIndex(select);
  return subIndex === null ? null : subIndex + 1;
}


export function getSelectSlotIndexCandidates(select: HTMLSelectElement, answerData?: AnswerData) {
  const candidates: number[] = [];
  const subIndex = getSelectSubIndex(select);

  if (subIndex !== null) {
    if (select.closest(".que.multianswer")) {
      candidates.push(...getAnswerControlSlotIndexCandidates(select, answerData));
    } else if (answerData?.slots.some((slot) => slot.index === 0)) {
      candidates.push(subIndex, subIndex + 1);
    } else {
      candidates.push(subIndex + 1, subIndex);
    }

    return Array.from(new Set(candidates.filter((candidate) => Number.isFinite(candidate))));
  }

  const primaryIndex = getSelectPlaceIndex(select);

  if (primaryIndex !== null) {
    candidates.push(primaryIndex);
  }

  return Array.from(new Set(candidates.filter((candidate) => Number.isFinite(candidate))));
}


export function getAnswerSlotByIndex(answerData: AnswerData, slotIndex: number | null) {
  return slotIndex === null ? null : (answerData.slots.find((slot) => slot.index === slotIndex) ?? null);
}


export function getAnswerSlotForSelect(answerData: AnswerData, select: HTMLSelectElement) {
  const questionNode = getSelectQuestionNode(select);

  if (questionNode && isMatchingQuestionNode(questionNode)) {
    const selects = getSelectableAnswerControls(questionNode);
    const selectIndex = Math.max(0, selects.indexOf(select));
    const label = getSelectControlLabel(questionNode, select, selectIndex);
    const labelMatchedSlot = answerData.slots.find((slot) => answerSlotMatchesLabel(slot, label));

    if (labelMatchedSlot) {
      return labelMatchedSlot;
    }

    // Image prompts carry no matchable text, but external providers hash the
    // prompt image the same way (see hashQuestionImage): an exact hash match
    // binds the row to its subquestion precisely.
    const promptImageHashes = getSelectPromptImageHashes(questionNode, select);
    const imageMatchedSlot =
      promptImageHashes.length > 0
        ? answerData.slots.find((slot) => slot.anchors.some((anchor) => promptImageHashes.includes(anchor.trim())))
        : null;

    if (imageMatchedSlot) {
      return imageMatchedSlot;
    }

    if (answerData.slots.length > 0 && !canMatchOpaqueMatchSlotsPositionally(answerData, selects.length)) {
      return null;
    }
  }

  for (const slotIndex of getSelectSlotIndexCandidates(select, answerData)) {
    const slot = getAnswerSlotByIndex(answerData, slotIndex);

    if (slot) {
      return slot;
    }
  }

  return null;
}


export function getQuestionAnswerNode(questionNode: Element) {
  const answerNode = questionNode.querySelector(".answer");

  if (isHTMLElement(answerNode)) {
    return answerNode;
  }

  const fallbackNode = questionNode.querySelector(".content, .formulation, .answercontainer, .ddarea");

  if (isHTMLElement(fallbackNode)) {
    return fallbackNode;
  }

  return isHTMLElement(questionNode) ? questionNode : null;
}


export function getAnswerEntries(): AnswerEntry[] {
  const answerEntries = Array.from(document.querySelectorAll(".que"))
    .map((questionNode) => {
      const answerNode = getQuestionAnswerNode(questionNode);

      if (!isHTMLElement(answerNode)) {
        return null;
      }

      return {
        answerNode,
        questionId: getQuestionId(questionNode),
        questionNode
      };
    })
    .filter((entry): entry is AnswerEntry => entry !== null);

  if (answerEntries.length > 0) {
    return answerEntries;
  }

  return Array.from(document.querySelectorAll(".answer"))
    .filter(isHTMLElement)
    .map((answerNode): AnswerEntry | null => {
      const questionNode = answerNode.closest(".que");

      if (!questionNode) {
        return null;
      }

      return {
        answerNode,
        questionId: null,
        questionNode
      };
    })
    .filter((entry): entry is AnswerEntry => entry !== null);
}


export function getVariantCountsForQuestion(questionId: string | null) {
  return questionId ? (variantCountsByQuestionId.get(questionId) ?? createEmptyVariantCounts()) : createEmptyVariantCounts();
}


export function getAnswerDataForQuestion(questionId: string | null): SourceAnswerData {
  return questionId ? (answerDataByQuestionId.get(questionId) ?? createEmptySourceAnswerData()) : createEmptySourceAnswerData();
}


export function clearReduxShareAnswerData() {
  for (const [questionId, answerData] of answerDataByQuestionId) {
    answerDataByQuestionId.set(questionId, {
      ...answerData,
      reduxshare: createEmptyAnswerData()
    });
  }
}


export function hasSourceAnswerData(answerData: SourceAnswerData) {
  return hasAnswerData(answerData.reduxshare) || hasAnswerData(answerData.external);
}


// Shared predicates used by several modules.
export function isHTMLElement(value: Element | null): value is HTMLElement {
  return value instanceof HTMLElement;
}

export function isMoodleClearChoiceInput(input: HTMLInputElement) {
  if (input.type !== "radio") {
    return false;
  }

  return (
    input.value === "-1" ||
    input.closest(".qtype_multichoice_clearchoice") !== null ||
    /(?:^|[_:])answer-1$/i.test(input.id) ||
    /(?:^|[_:])answer-1$/i.test(input.name)
  );
}

export function isUnsupportedDragDropQuestionType(questionNode: Element) {
  const questionType = getSecondQuestionClass(questionNode);

  return questionType !== null && UNSUPPORTED_DRAG_DROP_QUESTION_TYPES.has(questionType);
}


export function scopeSourceAnswerDataToChoice(answerData: SourceAnswerData, input: HTMLInputElement, label: string) {
  const scopedReduxShare = scopeAnswerDataToChoice(answerData.reduxshare, input, label);
  const scopedExternal = scopeAnswerDataToChoice(answerData.external, input, label);

  return {
    answerData: {
      reduxshare: scopedReduxShare.answerData,
      external: scopedExternal.answerData
    },
    slotIndex: scopedReduxShare.slotIndex ?? scopedExternal.slotIndex
  };
}


export function getUnboundExternalMatchStats(external: AnswerData, select: HTMLSelectElement): AnswerData {
  const questionNode = getSelectQuestionNode(select);

  if (!questionNode || !isMatchingQuestionNode(questionNode) || external.submissions.length === 0) {
    return createEmptyAnswerData();
  }

  // Opaque (hashed) anchors cannot be bound to prompts, but the aggregated
  // statistics are still useful — including known-incorrect answers.
  // Text anchors that disagree mean a wrong variant: keep those hidden entirely.
  const allAnchorsOpaque =
    external.slots.length > 0 &&
    external.slots.every((slot) => slot.anchors.length > 0 && slot.anchors.every(isOpaqueMatchAnchor));

  if (!allAnchorsOpaque) {
    return createEmptyAnswerData();
  }

  return {
    anchors: [],
    suggestions: [],
    submissions: external.submissions,
    slots: []
  };
}


export function scopeSourceAnswerDataToSelect(answerData: SourceAnswerData, select: HTMLSelectElement) {
  const reduxShareSlot = getAnswerSlotForSelect(answerData.reduxshare, select);
  const externalSlot = getAnswerSlotForSelect(answerData.external, select);
  const fallbackSlotIndex = getSelectPlaceIndex(select);

  return {
    answerData: {
      reduxshare: reduxShareSlot
        ? {
            anchors: reduxShareSlot.anchors,
            suggestions: reduxShareSlot.suggestions,
            submissions: reduxShareSlot.submissions,
            slots: [reduxShareSlot]
          }
        : createEmptyAnswerData(),
      external: externalSlot
        ? {
            anchors: externalSlot.anchors,
            suggestions: externalSlot.suggestions,
            submissions: externalSlot.submissions,
            slots: [externalSlot]
          }
        : getUnboundExternalMatchStats(answerData.external, select)
    },
    slotIndex: reduxShareSlot?.index ?? externalSlot?.index ?? fallbackSlotIndex
  };
}


export function getAnswerSlotForControl(
  answerData: AnswerData,
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
) {
  for (const slotIndex of getAnswerControlSlotIndexCandidates(control, answerData)) {
    const slot = getAnswerSlotByIndex(answerData, slotIndex);

    if (slot) {
      return slot;
    }
  }

  return null;
}


export function createAnswerDataFromSlot(slot: AnswerSlotData) {
  return {
    anchors: slot.anchors,
    suggestions: slot.suggestions,
    submissions: slot.submissions,
    slots: [slot]
  };
}


export function shouldUseQuestionLevelTextAnswerData(answerData: AnswerData, control: HTMLInputElement | HTMLTextAreaElement) {
  if (!hasAnswerData(answerData) || getAnswerControlSlotIndex(control) !== null || control.closest(".que.multianswer")) {
    return false;
  }

  const questionNode = control.closest(".que");

  if (!questionNode) {
    return answerData.slots.length <= 1;
  }

  return getTextAnswerInputs(questionNode).length <= 1;
}


export function scopeAnswerDataToTextControl(answerData: AnswerData, control: HTMLInputElement | HTMLTextAreaElement) {
  const slot = getAnswerSlotForControl(answerData, control);

  if (slot) {
    return {
      answerData: createAnswerDataFromSlot(slot),
      slotIndex: slot.index
    };
  }

  return {
    answerData: shouldUseQuestionLevelTextAnswerData(answerData, control) ? answerData : createEmptyAnswerData(),
    slotIndex: getAnswerControlSlotIndex(control)
  };
}


export function scopeSourceAnswerDataToTextControl(answerData: SourceAnswerData, control: HTMLInputElement | HTMLTextAreaElement) {
  const scopedReduxShare = scopeAnswerDataToTextControl(answerData.reduxshare, control);
  const scopedExternal = scopeAnswerDataToTextControl(answerData.external, control);

  return {
    answerData: {
      reduxshare: scopedReduxShare.answerData,
      external: scopedExternal.answerData
    },
    slotIndex: scopedReduxShare.slotIndex ?? scopedExternal.slotIndex
  };
}


export function scopeSourceAnswerDataToSlot(answerData: SourceAnswerData, slotIndex: number | null) {
  const reduxShareSlot = getAnswerSlotByIndex(answerData.reduxshare, slotIndex);
  const externalSlot = getAnswerSlotByIndex(answerData.external, slotIndex);

  return {
    answerData: {
      reduxshare: reduxShareSlot
        ? {
            anchors: reduxShareSlot.anchors,
            suggestions: reduxShareSlot.suggestions,
            submissions: reduxShareSlot.submissions,
            slots: [reduxShareSlot]
          }
        : createEmptyAnswerData(),
      external: externalSlot
        ? {
            anchors: externalSlot.anchors,
            suggestions: externalSlot.suggestions,
            submissions: externalSlot.submissions,
            slots: [externalSlot]
          }
        : createEmptyAnswerData()
    },
    slotIndex
  };
}


export function scopeAnswerDataToOrderingItem(answerData: AnswerData, itemLabel: string, itemCount: number) {
  const scopedAnswerData = createEmptyAnswerData();
  const hasZeroBasedSlots = answerDataHasZeroBasedOrderingSlots(answerData);

  for (const slot of answerData.slots) {
    const position = getOrderingSlotPosition(slot, itemCount, hasZeroBasedSlots);

    if (position === null) {
      continue;
    }

    const suggestions = slot.suggestions
      .filter((suggestion) => itemLabelMatches(suggestion, itemLabel))
      .map((suggestion) => mapSuggestionToOrderingPosition(suggestion, position));
    const submissions = slot.submissions
      .filter((submission) => itemLabelMatches(submission, itemLabel))
      .map((submission) => mapSubmissionToOrderingPosition(submission, position));

    if (suggestions.length === 0 && submissions.length === 0) {
      continue;
    }

    const anchor = getOrderingPositionLabel(position);
    scopedAnswerData.anchors.push(anchor);
    scopedAnswerData.suggestions.push(...suggestions);
    scopedAnswerData.submissions.push(...submissions);
    scopedAnswerData.slots.push({
      index: position,
      hasExplicitIndex: true,
      anchors: [anchor],
      suggestions,
      submissions
    });
  }

  if (hasAnswerData(scopedAnswerData) || answerData.slots.length > 0) {
    return scopedAnswerData;
  }

  answerData.suggestions.forEach((suggestion, index) => {
    const position = index + 1;

    if (position <= itemCount && itemLabelMatches(suggestion, itemLabel)) {
      scopedAnswerData.suggestions.push(mapSuggestionToOrderingPosition(suggestion, position));
    }
  });

  answerData.submissions.forEach((submission, index) => {
    const position = index + 1;

    if (position <= itemCount && itemLabelMatches(submission, itemLabel)) {
      scopedAnswerData.submissions.push(mapSubmissionToOrderingPosition(submission, position));
    }
  });

  if (scopedAnswerData.suggestions.length === 0) {
    const sequentialLabels = splitSequentialAnswerLabels(getPreferredSuggestionLabels(answerData.suggestions), itemCount);
    const fallbackSuggestion = answerData.suggestions.find((suggestion) => suggestion.label.trim());

    if (fallbackSuggestion && sequentialLabels.length === itemCount) {
      sequentialLabels.forEach((label, index) => {
        if (labelsMatch(label, itemLabel)) {
          scopedAnswerData.suggestions.push(
            mapSuggestionToOrderingPosition(
              {
                ...fallbackSuggestion,
                label
              },
              index + 1
            )
          );
        }
      });
    }
  }

  return scopedAnswerData;
}


export function scopeSourceAnswerDataToOrderingItem(answerData: SourceAnswerData, itemLabel: string, itemCount: number) {
  const reduxshare = scopeAnswerDataToOrderingItem(answerData.reduxshare, itemLabel, itemCount);
  const external = scopeAnswerDataToOrderingItem(answerData.external, itemLabel, itemCount);
  const slotIndex =
    reduxshare.slots[0]?.index ??
    reduxshare.suggestions[0]?.actionSlotIndex ??
    reduxshare.submissions[0]?.actionSlotIndex ??
    external.slots[0]?.index ??
    external.suggestions[0]?.actionSlotIndex ??
    external.submissions[0]?.actionSlotIndex ??
    null;

  return {
    answerData: {
      reduxshare,
      external
    },
    slotIndex
  };
}


export function getAnswerDataForQuestionSelect(questionId: string | null, select: HTMLSelectElement) {
  return scopeSourceAnswerDataToSelect(getAnswerDataForQuestion(questionId), select);
}


export function getAnswerDataForQuestionTextControl(questionId: string | null, control: HTMLInputElement | HTMLTextAreaElement) {
  return scopeSourceAnswerDataToTextControl(getAnswerDataForQuestion(questionId), control);
}


export function getAnswerDataForQuestionChoice(questionId: string | null, questionNode: Element, input: HTMLInputElement) {
  const fullAnswerData = getAnswerDataForQuestion(questionId);
  const label = getInputAnswerLabelText(questionNode, input);

  return scopeSourceAnswerDataToChoice(fullAnswerData, input, label);
}


export function getAnswerDataForDdwtosDrop(questionId: string | null, drop: Element) {
  return scopeSourceAnswerDataToSlot(getAnswerDataForQuestion(questionId), getDdwtosDropSlotIndex(drop));
}


export function getAnswerDataForDdmarkerChoice(questionId: string | null, choiceIndex: number) {
  return scopeSourceAnswerDataToSlot(getAnswerDataForQuestion(questionId), choiceIndex);
}


export function getAnswerDataForDdimageOrTextDrop(questionId: string | null, drop: Element) {
  return scopeSourceAnswerDataToSlot(getAnswerDataForQuestion(questionId), getDdimageOrTextDropSlotIndex(drop));
}


export function getAnswerDataForOrderingItem(questionId: string | null, item: Element, itemCount: number) {
  return scopeSourceAnswerDataToOrderingItem(getAnswerDataForQuestion(questionId), getOrderingItemLabel(item), itemCount);
}


export function addVariantCounts(left: AnswerVariantCounts, right: AnswerVariantCounts): AnswerVariantCounts {
  return {
    anchors: left.anchors + right.anchors,
    suggestions: left.suggestions + right.suggestions,
    submissions: left.submissions + right.submissions
  };
}


export function setSourceAnswerData(questionId: string | null, source: keyof SourceAnswerData, data: AnswerData) {
  if (!questionId) {
    return;
  }

  const currentAnswerData = answerDataByQuestionId.get(questionId) ?? createEmptySourceAnswerData();

  answerDataByQuestionId.set(questionId, {
    ...currentAnswerData,
    [source]: data
  });
}


export function applyQuizAnswerResults(results: QuizVariantResult[] | undefined, source: keyof SourceAnswerData) {
  for (const result of results ?? []) {
    const counts = getVariantCounts(result);
    const data = getAnswerData(result);

    if (result.questionId) {
      variantCountsByQuestionId.set(
        result.questionId,
        addVariantCounts(variantCountsByQuestionId.get(result.questionId) ?? createEmptyVariantCounts(), counts)
      );
      setSourceAnswerData(result.questionId, source, data);
    }
  }
}

export function createEmptyProgressReports(): QuizProgressReports {
  return {
    tests: {},
    questions: {}
  };
}

export function normalizeProgressReportMap(value: unknown): Record<string, true> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const reportMap: Record<string, true> = {};

  for (const [key, isReported] of Object.entries(value)) {
    if (isReported === true) {
      reportMap[key] = true;
    }
  }

  return reportMap;
}

export function normalizeProgressReports(value: unknown): QuizProgressReports {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyProgressReports();
  }

  const record = value as Partial<QuizProgressReports>;

  return {
    tests: normalizeProgressReportMap(record.tests),
    questions: normalizeProgressReportMap(record.questions)
  };
}

export async function loadProgressReports(): Promise<QuizProgressReports> {
  const result = await chrome.storage.local.get(QUIZ_PROGRESS_REPORTS_STORAGE_KEY);
  return normalizeProgressReports(result[QUIZ_PROGRESS_REPORTS_STORAGE_KEY]);
}

export async function saveProgressReports(reports: QuizProgressReports) {
  await chrome.storage.local.set({
    [QUIZ_PROGRESS_REPORTS_STORAGE_KEY]: reports
  });
}

export function getQuestionHash(questionNode: Element, questionType: string | null) {
  const questionText = getQuestionText(questionNode);
  const answerLabels = getQuestionAnswerLabels(questionNode)
    .map(normalizeFingerprintText)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const fingerprint = [
    normalizeFingerprintText(questionType ?? ""),
    normalizeFingerprintText(questionText),
    ...answerLabels
  ].join("|");

  return fingerprint ? stableHashText(fingerprint) : null;
}
