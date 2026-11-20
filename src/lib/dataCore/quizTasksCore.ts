import { getBooleanSuggestionValue } from "../../shared/answerParsing";
import type {
  NormalizedPreCountedSelection,
  NormalizedReviewAnswer,
  NormalizedReviewQuestion,
  PreCountedSelection,
  QuizTaskQuestionRequest,
  ReviewQuestionOutcome,
  ReviewQuestionPayload,
  SelectionVerdict,
  TaskRecord,
} from "../dataTypes";
import { fnv1a32Hex } from "./hash";

type ReduxShareTaskDataRow = {
  anchor?: unknown;
  suggestions?: unknown;
  submissions?: unknown;
};

type ReduxShareSuggestionLike = {
  label?: unknown;
};

type ReduxShareSubmissionLike = {
  correctness: number;
  count: number;
  label: string;
};

export function shouldDowngradeMismatchedHashData(data: unknown) {
  if (!Array.isArray(data)) {
    return false;
  }

  const suggestionLabels = data.flatMap((row) => {
    if (!row || typeof row !== "object") {
      return [];
    }

    const typedRow = row as ReduxShareTaskDataRow;
    const suggestions = Array.isArray(typedRow.suggestions) ? typedRow.suggestions : [];

    return suggestions.flatMap((suggestion) => {
      if (!suggestion || typeof suggestion !== "object") {
        return [];
      }

      const suggestionLike = suggestion as ReduxShareSuggestionLike;
      const label = typeof suggestionLike.label === "string" ? suggestionLike.label.trim() : "";

      return label ? [label] : [];
    });
  });

  return (
    suggestionLabels.length > 0 &&
    suggestionLabels.every((label) => getBooleanSuggestionValue(label) !== null)
  );
}

export function downgradeMismatchedHashData(data: unknown) {
  if (!Array.isArray(data)) {
    return data;
  }

  return data.map((row) => {
    if (!row || typeof row !== "object") {
      return row;
    }

    const typedRow = row as ReduxShareTaskDataRow;
    const suggestions = Array.isArray(typedRow.suggestions) ? typedRow.suggestions : [];
    const submissions = Array.isArray(typedRow.submissions) ? typedRow.submissions : [];

    const syntheticSubmissions: ReduxShareSubmissionLike[] =
      submissions.length > 0
        ? []
        : suggestions
            .map((suggestion) => {
              if (!suggestion || typeof suggestion !== "object") {
                return null;
              }

              const suggestionLike = suggestion as ReduxShareSuggestionLike;
              const label =
                typeof suggestionLike.label === "string" ? suggestionLike.label.trim() : "";

              if (!label) {
                return null;
              }

              return {
                correctness: 1,
                count: 1,
                label,
              };
            })
            .filter((submission): submission is ReduxShareSubmissionLike => submission !== null);

    return {
      ...typedRow,
      suggestions: [],
      submissions: submissions.length > 0 ? submissions : syntheticSubmissions,
    };
  });
}

function getVerifiedTotal(row: TaskRecord) {
  return Math.max((row.correct_count ?? 0) + (row.selected_correct_count ?? 0), 0);
}

function getObservedTotal(row: TaskRecord) {
  return Math.max(
    (row.correct_count ?? 0) +
      (row.selected_correct_count ?? 0) +
      (row.selected_incorrect_count ?? 0) +
      (row.selected_unknown_count ?? 0),
    0,
  );
}

export function normalizeRowType(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function pickBestHashRows(rows: TaskRecord[], request: QuizTaskQuestionRequest) {
  const candidates = rows.filter((row) => {
    if (row.question_id !== request.questionId) {
      return false;
    }

    const rowType = normalizeRowType(row.question_type);

    return request.questionType === null || rowType === null || rowType === request.questionType;
  });

  const groups = new Map<string, TaskRecord[]>();

  for (const row of candidates) {
    const group = groups.get(row.question_hash) ?? [];
    group.push(row);
    groups.set(row.question_hash, group);
  }

  if (groups.size === 0) {
    return [];
  }

  const ranked = [...groups.entries()].map(([hash, groupRows]) => ({
    hash,
    groupRows,
    hashMatches: request.questionHash !== null && hash === request.questionHash,
    updatedAt: groupRows.reduce((latest, row) => (row.updated > latest ? row.updated : latest), ""),
  }));

  ranked.sort((a, b) => {
    if (a.hashMatches !== b.hashMatches) {
      return a.hashMatches ? -1 : 1;
    }

    if (a.updatedAt !== b.updatedAt) {
      return a.updatedAt > b.updatedAt ? -1 : 1;
    }

    return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
  });

  return ranked[0].groupRows;
}

export interface AggregatedSlot {
  slotKey: string;
  slotIndex: number | null;
  suggestions: Array<{
    correctness: 2;
    confidence: number;
    label: string;
    contributor: string | null;
    addedAt: string | null;
    updatedAt: string | null;
    taskId: string;
    votesUp: number;
    votesDown: number;
    myVote: number;
  }>;
  submissions: Array<{
    correctness: number;
    count: number;
    label: string;
    contributor: string | null;
    addedAt: string | null;
    updatedAt: string | null;
    taskId: string;
    votesUp: number;
    votesDown: number;
    myVote: number;
  }>;
  slotAnswerCount: number;
}

function getRowContributor(row: TaskRecord) {
  const expand = row.expand ?? null;
  const first = expand?.first_contributor;
  const last = expand?.last_contributor;
  const username = (record: { username?: unknown } | null | undefined) =>
    typeof record?.username === "string" && record.username ? record.username : null;

  return username(last) ?? username(first);
}

function getRowMeta(row: TaskRecord) {
  return {
    contributor: getRowContributor(row),
    addedAt: row.created || null,
    updatedAt: row.updated || null,
  };
}

function getRowVotes(row: TaskRecord, votesByTaskId: Map<string, 1 | -1>) {
  return {
    taskId: row.id,
    votesUp: Math.max(row.votes_up ?? 0, 0),
    votesDown: Math.max(row.votes_down ?? 0, 0),
    myVote: votesByTaskId.get(row.id) ?? 0,
  };
}

export function aggregateSlotRows(
  rows: TaskRecord[],
  votesByTaskId: Map<string, 1 | -1>,
): AggregatedSlot[] {
  const bySlot = new Map<string, TaskRecord[]>();

  for (const row of rows) {
    const group = bySlot.get(row.slot_key) ?? [];
    group.push(row);
    bySlot.set(row.slot_key, group);
  }

  return [...bySlot.entries()].map(([slotKey, slotRows]) => {
    const slotVerifiedTotal = slotRows.reduce((sum, row) => sum + getVerifiedTotal(row), 0);
    const slotIndexes = slotRows
      .map((row) => row.slot_index)
      .filter((index): index is number => typeof index === "number");
    const suggestions = slotRows
      .filter((row) => (row.correct_count ?? 0) > 0)
      .map((row) => {
        const verifiedTotal = getVerifiedTotal(row);

        return {
          verifiedTotal,
          correctness: 2 as const,
          confidence:
            slotVerifiedTotal > 0
              ? Math.round((verifiedTotal / slotVerifiedTotal) * 10_000) / 10_000
              : 0,
          label: row.answer_label,
          ...getRowMeta(row),
          ...getRowVotes(row, votesByTaskId),
        };
      })
      .sort((a, b) =>
        a.verifiedTotal !== b.verifiedTotal
          ? b.verifiedTotal - a.verifiedTotal
          : a.label.localeCompare(b.label),
      )
      .map(
        ({
          correctness,
          confidence,
          label,
          contributor,
          addedAt,
          updatedAt,
          taskId,
          votesUp,
          votesDown,
          myVote,
        }) => ({
          correctness,
          confidence,
          label,
          contributor,
          addedAt,
          updatedAt,
          taskId,
          votesUp,
          votesDown,
          myVote,
        }),
      );
    const submissions = slotRows
      .filter((row) => getObservedTotal(row) > 0)
      .map((row) => ({
        correctness:
          (row.correct_count ?? 0) + (row.selected_correct_count ?? 0) > 0
            ? 2
            : (row.selected_incorrect_count ?? 0) > 0
              ? 0
              : 1,
        count: getObservedTotal(row),
        label: row.answer_label,
        ...getRowMeta(row),
        ...getRowVotes(row, votesByTaskId),
      }))
      .sort((a, b) => (a.count !== b.count ? b.count - a.count : a.label.localeCompare(b.label)));

    return {
      slotKey,
      slotIndex: slotIndexes.length > 0 ? Math.min(...slotIndexes) : null,
      suggestions,
      submissions,
      slotAnswerCount: slotRows.length,
    };
  });
}

export function maxText(values: Array<string | null | undefined>) {
  let latest: string | null = null;

  for (const value of values) {
    if (!value) {
      continue;
    }

    if (latest === null || value > latest) {
      latest = value;
    }
  }

  return latest;
}

export function buildQuestionData(slots: AggregatedSlot[]) {
  const ordered = [...slots].sort((a, b) => {
    const indexDiff = (a.slotIndex ?? 1) - (b.slotIndex ?? 1);
    return indexDiff !== 0 ? indexDiff : a.slotKey.localeCompare(b.slotKey);
  });

  return ordered.map((slot) => ({
    anchor: {
      index: slot.slotIndex ?? 1,
      label: slot.slotKey,
    },
    suggestions: slot.suggestions,
    submissions: slot.submissions,
  }));
}

export function isTaskRowVerified(
  row: Pick<TaskRecord, "correct_count" | "selected_correct_count" | "selected_incorrect_count">,
) {
  return (
    (row.correct_count ?? 0) + (row.selected_correct_count ?? 0) > 0 ||
    (row.selected_incorrect_count ?? 0) > 0
  );
}

export function normalizeSelectionVerdict(value: unknown): SelectionVerdict | null {
  return value === "correct" || value === "incorrect" || value === "unknown" ? value : null;
}

function normalizePreCountedAnswers(
  value: PreCountedSelection[] | undefined,
): NormalizedPreCountedSelection[] {
  const normalized: NormalizedPreCountedSelection[] = [];
  const seen = new Set<string>();

  for (const entry of Array.isArray(value) ? value : []) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const verdict = normalizeSelectionVerdict(entry.verdict);
    const answerKey = collapseWhitespace(entry.answerKey ?? "");
    const slotKey = (entry.slotKey ?? "").trim() || "question";

    if (!verdict || !answerKey) {
      continue;
    }

    const mapKey = `${slotKey}|${answerKey}`;

    if (seen.has(mapKey)) {
      continue;
    }

    seen.add(mapKey);
    normalized.push({ key: answerKey, slotKey, verdict });
  }

  return normalized;
}

const ANSWER_OPTIONS_MAX_COUNT = 200;
const ANSWER_OPTIONS_MAX_LENGTH = 300;

export function parseTaskAnswerOptions(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function mergeAnswerOptionLabels(existing: string[], incoming: string[]): string[] {
  const merged: string[] = [];
  const seenLower = new Set<string>();

  for (const label of [...existing, ...incoming]) {
    const normalizedLabel = collapseWhitespace(label).slice(0, ANSWER_OPTIONS_MAX_LENGTH);

    if (!normalizedLabel) {
      continue;
    }

    const lowerLabel = normalizedLabel.toLowerCase();

    if (seenLower.has(lowerLabel)) {
      continue;
    }

    seenLower.add(lowerLabel);
    merged.push(normalizedLabel);
  }

  return merged.slice(0, ANSWER_OPTIONS_MAX_COUNT);
}

export function serializeTaskAnswerOptions(options: string[]) {
  return options.length > 0 ? JSON.stringify(options) : "";
}

export function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeReviewQuestions(
  questions: ReviewQuestionPayload[],
): NormalizedReviewQuestion[] {
  const normalized: NormalizedReviewQuestion[] = [];

  for (const question of questions) {
    const questionId = (question.questionId ?? "").trim();
    const questionHash = (question.questionHash ?? "").trim();
    const questionType = (question.questionType ?? "").trim() || null;
    const questionText = collapseWhitespace(question.questionText ?? "") || null;
    const answerOptions = mergeAnswerOptionLabels([], question.answerOptions ?? []);

    if (!questionId || !questionHash) {
      continue;
    }

    const answers: NormalizedReviewAnswer[] = [];

    for (const answer of question.answers ?? []) {
      const label = collapseWhitespace(answer.label ?? "");

      if (!label) {
        continue;
      }

      const rawKey = collapseWhitespace(answer.answerKey ?? "");
      const key = rawKey || label.toLowerCase();
      const slotKey = (answer.slotKey ?? "").trim() || "question";
      const rawSlotIndex = String(answer.slotIndex ?? "").trim();
      const slotIndex = /^\d+$/.test(rawSlotIndex) ? Number.parseInt(rawSlotIndex, 10) : null;
      const isCorrect = answer.isCorrect === true;
      const wasSelected = answer.wasSelected === true;
      const rawCorrectness = String(answer.correctness ?? "").trim();
      const correctness = /^-?\d+$/.test(rawCorrectness)
        ? Number.parseInt(rawCorrectness, 10)
        : isCorrect
          ? 2
          : wasSelected
            ? 0
            : 1;

      if (correctness !== 2 && !wasSelected) {
        continue;
      }

      answers.push({ label, key, slotKey, slotIndex, correctness, isCorrect, wasSelected });
    }

    normalized.push({
      questionId,
      questionType,
      questionHash,
      questionText,
      answerOptions,
      answers,
      preCountedAnswers: normalizePreCountedAnswers(question.preCountedAnswers),
    });
  }

  return normalized;
}

export function getQuestionImportKey(questionId: string, questionHash: string) {
  return [questionId, questionHash].join("\n");
}

export function getReviewQuestionOutcome(answers: NormalizedReviewAnswer[]): ReviewQuestionOutcome {
  let selectedWrong = false;
  let selectedCorrect = false;
  let selectedUnknown = false;

  for (const answer of answers) {
    if (!answer.wasSelected) {
      continue;
    }

    if (answer.correctness <= 0) {
      selectedWrong = true;
    } else if (answer.correctness === 2) {
      selectedCorrect = true;
    } else {
      selectedUnknown = true;
    }
  }

  if (selectedWrong) {
    return "wrong";
  }

  if (selectedCorrect) {
    return "correct";
  }

  if (selectedUnknown) {
    return "unknown";
  }

  return "none";
}

export function getReviewQuestionContentHash(question: NormalizedReviewQuestion) {
  const fingerprint = question.answers
    .map((answer) =>
      [
        answer.label,
        answer.key,
        answer.slotKey,
        answer.slotIndex ?? "",
        answer.correctness,
        answer.wasSelected ? 1 : 0,
      ].join("\n"),
    )
    .sort()
    .join("\n\n");

  return fnv1a32Hex(`${question.questionId}\n${question.questionHash}\n${fingerprint}`);
}

export function getSelectionTransitionDeltas(
  previous: SelectionVerdict,
  current: SelectionVerdict | null,
  existing: TaskRecord | null | undefined,
) {
  const hasCounter = (value: number | null | undefined) => (value ?? 0) > 0;

  return {
    selectedCorrectDelta:
      (current === "correct" ? 1 : 0) -
      (previous === "correct" && hasCounter(existing?.selected_correct_count) ? 1 : 0),
    selectedIncorrectDelta:
      (current === "incorrect" ? 1 : 0) -
      (previous === "incorrect" && hasCounter(existing?.selected_incorrect_count) ? 1 : 0),
    selectedUnknownDelta:
      (current === "unknown" ? 1 : 0) -
      (previous === "unknown" && hasCounter(existing?.selected_unknown_count) ? 1 : 0),
  };
}

export function getReviewSelectionVerdict(answer: NormalizedReviewAnswer): SelectionVerdict | null {
  if (!answer.wasSelected) {
    return null;
  }

  if (answer.correctness === 2) {
    return "correct";
  }

  return answer.correctness <= 0 ? "incorrect" : "unknown";
}

export function getTaskIdentityKey(entry: {
  moodleDomain: string;
  courseId: number;
  quizId: number;
  questionId: string;
  questionHash: string;
  slotKey: string;
  answerKey: string;
}) {
  return [
    entry.moodleDomain,
    String(entry.courseId),
    String(entry.quizId),
    entry.questionId,
    entry.questionHash,
    entry.slotKey,
    entry.answerKey,
  ].join("\n");
}
