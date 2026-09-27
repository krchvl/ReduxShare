import type {
  AnswerData,
  AnswerSlotData,
  SourceAnswerData,
  SubmissionItem,
  SuggestionItem,
} from "../../src/model";

export function emptyAnswerData(): AnswerData {
  return {
    anchors: [],
    suggestions: [],
    submissions: [],
    slots: [],
  };
}

export function exactSuggestion(label: string, confidence = 1, count?: number): SuggestionItem {
  return {
    correctness: 2,
    confidence,
    count,
    label,
  };
}

export function slottedExactSuggestion(
  label: string,
  slotIndex: number,
  confidence = 1,
  count?: number,
): SuggestionItem {
  return {
    ...exactSuggestion(label, confidence, count),
    actionSlotIndex: slotIndex,
  };
}

export function unknownSubmission(label: string, count = 1): SubmissionItem {
  return {
    correctness: 1,
    count,
    label,
  };
}

export function votedSubmission(
  label: string,
  votes: { taskId: string; votesUp?: number; votesDown?: number; myVote?: 1 | -1 | 0 },
): SubmissionItem {
  return {
    ...unknownSubmission(label),
    taskId: votes.taskId,
    votesUp: votes.votesUp ?? 0,
    votesDown: votes.votesDown ?? 0,
    myVote: votes.myVote ?? 0,
  };
}

export function slottedUnknownSubmission(
  label: string,
  slotIndex: number,
  count = 1,
): SubmissionItem {
  return {
    ...unknownSubmission(label, count),
    actionSlotIndex: slotIndex,
  };
}

export function exactAnswerData(label: string): AnswerData {
  return {
    anchors: [],
    suggestions: [exactSuggestion(label)],
    submissions: [],
    slots: [],
  };
}

export function unknownAnswerData(label: string, count = 1): AnswerData {
  return {
    anchors: [],
    suggestions: [],
    submissions: [unknownSubmission(label, count)],
    slots: [],
  };
}

export function answerSlot(index: number, parts: Partial<AnswerSlotData>): AnswerSlotData {
  return {
    index,
    hasExplicitIndex: true,
    anchors: parts.anchors ?? [],
    suggestions: parts.suggestions ?? [],
    submissions: parts.submissions ?? [],
  };
}

export function slottedAnswerData(slots: AnswerSlotData[]): AnswerData {
  return {
    anchors: slots.flatMap((slot) => slot.anchors),
    suggestions: slots.flatMap((slot) => slot.suggestions),
    submissions: slots.flatMap((slot) => slot.submissions),
    slots,
  };
}

export function sourceAnswerData(parts: Partial<SourceAnswerData>): SourceAnswerData {
  return {
    reduxshare: parts.reduxshare ?? emptyAnswerData(),
    external: parts.external ?? emptyAnswerData(),
  };
}
