import {
  type AnswerData,
  type AnswerSlotData,
  type AnswerVariantCounts,
  type QuizVariantResult,
  type SourceAnswerData,
  type SubmissionItem,
  type SuggestionItem
} from "./model";

export function createEmptyVariantCounts(): AnswerVariantCounts {
  return {
    anchors: 0,
    suggestions: 0,
    submissions: 0
  };
}

export function createEmptyAnswerData(): AnswerData {
  return { anchors: [], suggestions: [], submissions: [], slots: [] };
}

export function createEmptySourceAnswerData(): SourceAnswerData {
  return {
    reduxshare: createEmptyAnswerData(),
    external: createEmptyAnswerData()
  };
}

export function hasAnswerData(answerData: AnswerData) {
  return (
    answerData.suggestions.length > 0 ||
    answerData.submissions.length > 0 ||
    answerData.slots.some((slot) => slot.suggestions.length > 0 || slot.submissions.length > 0)
  );
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getArrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function getStringField(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = record[field];

    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return "";
}

function normalizeVariantRows(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(getRecord).filter((record): record is Record<string, unknown> => record !== null);
  }

  const record = getRecord(value);
  return record ? [record] : [];
}

function getAnchorCount(value: unknown) {
  if (Array.isArray(value)) {
    return value.length;
  }

  return getRecord(value) ? 1 : 0;
}

export function getVariantCounts(result: QuizVariantResult): AnswerVariantCounts {
  const counts = createEmptyVariantCounts();
  const rows = normalizeVariantRows(result.data);

  for (const row of rows) {
    counts.anchors += getAnchorCount(row.anchor);
    counts.suggestions += getArrayCount(row.suggestions);
    counts.submissions += getArrayCount(row.submissions);
  }

  return counts;
}

function getExplicitAnchorIndex(anchor: unknown): number | null {
  if (Array.isArray(anchor) && anchor.length === 1) {
    return getExplicitAnchorIndex(anchor[0]);
  }

  const anchorRecord = getRecord(anchor);
  const rawIndex = anchorRecord?.index;

  if (typeof rawIndex === "number" && Number.isFinite(rawIndex)) {
    return rawIndex;
  }

  if (typeof rawIndex === "string") {
    const parsedIndex = Number.parseInt(rawIndex, 10);

    if (Number.isFinite(parsedIndex)) {
      return parsedIndex;
    }
  }

  return null;
}

function getAnchorIndex(anchor: unknown, fallbackIndex: number) {
  return getExplicitAnchorIndex(anchor) ?? fallbackIndex;
}

function collectAnchorLabels(anchor: unknown): string[] {
  if (Array.isArray(anchor)) {
    return anchor.flatMap(collectAnchorLabels);
  }

  const anchorRecord = getRecord(anchor);

  if (!anchorRecord) {
    return typeof anchor === "string" && anchor.trim() !== "" ? [anchor] : [];
  }

  const label = getStringField(anchorRecord, ["anchor", "label", "data", "answer", "text", "value", "name"]);
  return label ? [label] : [];
}

function parseSuggestionItem(value: unknown): SuggestionItem | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  return {
    correctness: typeof record.correctness === "number" ? record.correctness : 1,
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
    count: typeof record.count === "number" ? record.count : undefined,
    label: getStringField(record, ["label", "data", "answer", "text", "value", "name"])
  };
}

function parseSubmissionItem(value: unknown): SubmissionItem | null {
  const record = getRecord(value);

  if (!record) {
    return null;
  }

  return {
    correctness: typeof record.correctness === "number" ? record.correctness : 1,
    count: typeof record.count === "number" ? record.count : 0,
    label: getStringField(record, ["label", "data", "answer", "text", "value", "name"])
  };
}

export function getAnswerData(result: QuizVariantResult): AnswerData {
  const data = createEmptyAnswerData();
  const rows = normalizeVariantRows(result.data);

  rows.forEach((row, rowIndex) => {
    const anchors = collectAnchorLabels(row.anchor);
    const slot: AnswerSlotData = {
      index: getAnchorIndex(row.anchor, rowIndex + 1),
      hasExplicitIndex: getExplicitAnchorIndex(row.anchor) !== null,
      anchors,
      suggestions: [],
      submissions: []
    };

    data.anchors.push(...anchors);

    if (Array.isArray(row.suggestions)) {
      for (const value of row.suggestions) {
        const suggestion = parseSuggestionItem(value);

        if (!suggestion) {
          continue;
        }

        if (suggestion.correctness === 2) {
          data.suggestions.push(suggestion);
          slot.suggestions.push(suggestion);
        } else {
          const submission: SubmissionItem = {
            correctness: suggestion.correctness,
            count: 1,
            label: suggestion.label,
            displayLabel: suggestion.displayLabel,
            actionSlotIndex: suggestion.actionSlotIndex
          };

          data.submissions.push(submission);
          slot.submissions.push(submission);
        }
      }
    }

    if (Array.isArray(row.submissions)) {
      for (const value of row.submissions) {
        const submission = parseSubmissionItem(value);

        if (!submission) {
          continue;
        }

        data.submissions.push(submission);
        slot.submissions.push(submission);
      }
    }

    data.slots.push(slot);
  });

  return data;
}
