import type PocketBase from "pocketbase";
import type { AuthSession } from "../types";
import { getBooleanSuggestionValue } from "../shared/answerParsing";
import { getTranslator, I18nError } from "../i18n";
import type { LanguageSetting } from "../types";
import { ensurePocketBaseSession } from "./auth";
import {
  REVIEW_IMPORTS_COLLECTION,
  TASKS_COLLECTION,
  TASK_VOTES_COLLECTION,
  USERS_COLLECTION,
  isNotFoundError,
  isValidationError,
  toI18nError,
  withPocketBaseSessionRetry,
} from "./pocketbase";

export interface QuizTaskQuestionRequest {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
}

export interface FetchReduxShareTasksPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: QuizTaskQuestionRequest[];
}

export interface ReduxShareTaskResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  ok: boolean;
  data?: unknown;
  answerCount?: number;
  error?: string;
}

interface TaskRecord {
  id: string;
  moodle_domain: string;
  course_id: number;
  quiz_id: number;
  question_id: string;
  question_hash: string;
  question_type: string;

  question_text?: string | null;

  answer_options?: string | null;
  slot_key: string;
  slot_index: number | null;
  answer_key: string;
  answer_label: string;
  correct_count: number | null;
  selected_correct_count: number | null;
  selected_incorrect_count: number | null;
  selected_unknown_count: number | null;
  votes_up?: number | null;
  votes_down?: number | null;
  created: string;
  updated: string;
  expand?: {
    first_contributor?: { username?: unknown } | null;
    last_contributor?: { username?: unknown } | null;
  } | null;
}

interface TaskVoteRecord {
  id: string;
  task: string;
  user: string;
  value: number;
}

export interface ReviewImportRecord {
  id: string;
  moodle_domain?: string;
  course_id: number | null;
  quiz_id: number | null;
  page_url: string;
  imported_question_count: number | null;
  imported_question_hashes: Record<string, string> | null;
  created?: string;
  updated?: string;
}

export interface FetchReduxShareTasksResult {
  authSession: AuthSession;
  results: ReduxShareTaskResult[];
}

export interface ReviewAnswerPayload {
  label: string;
  answerKey: string;
  slotKey: string;
  slotIndex: number | null;
  correctness: number;
  isCorrect: boolean;
  wasSelected: boolean;
}

export type SelectionVerdict = "correct" | "incorrect" | "unknown";

export interface PreCountedSelection {
  answerKey: string;
  slotKey: string;
  verdict: SelectionVerdict;
}

export interface ReviewQuestionPayload {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  questionText?: string | null;
  answerOptions?: string[];
  answers: ReviewAnswerPayload[];
  preCountedAnswers?: PreCountedSelection[];
}

export interface SaveReduxShareReviewPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptKey: string;
  pageUrl: string;
  questions: ReviewQuestionPayload[];
}

export interface SaveReduxShareReviewResult {
  authSession: AuthSession;
  imported: boolean;
  savedCount: number;
}

export interface UserAnswerSelectionAnswer {
  label: string;
  answerKey: string;
  slotKey: string;
  slotIndex: number | null;
  verdict: SelectionVerdict;
}

export interface UserAnswerSelectionQuestion {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  questionText?: string | null;
  answerOptions?: string[];
  answers: UserAnswerSelectionAnswer[];
}

export interface SaveUserAnswerPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptKey: string;
  pageUrl: string;
  question: UserAnswerSelectionQuestion;
}

export interface SaveUserAnswerResult {
  authSession: AuthSession;
  savedCount: number;
}

export interface VoteTaskAnswerPayload {
  taskId: string;
  value: 1 | -1;
}

export interface VoteTaskAnswerResult {
  authSession: AuthSession;
  votesUp: number;
  votesDown: number;
  myVote: 1 | -1 | 0;
}

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

function shouldDowngradeMismatchedHashData(data: unknown) {
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

function downgradeMismatchedHashData(data: unknown) {
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

function normalizeRowType(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function pickBestHashRows(rows: TaskRecord[], request: QuizTaskQuestionRequest) {
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

interface AggregatedSlot {
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

function aggregateSlotRows(
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

function maxText(values: Array<string | null | undefined>) {
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

function buildQuestionData(slots: AggregatedSlot[]) {
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

const VOTES_QUERY_CHUNK = 80;

// Строка проверена сообществом: есть импортированные данные о верности или неверности.
// Голосовать можно только за непроверенные варианты.
function isTaskRowVerified(
  row: Pick<TaskRecord, "correct_count" | "selected_correct_count" | "selected_incorrect_count">,
) {
  return (
    (row.correct_count ?? 0) + (row.selected_correct_count ?? 0) > 0 ||
    (row.selected_incorrect_count ?? 0) > 0
  );
}

async function findOwnTaskVote(
  pb: PocketBase,
  userId: string,
  taskId: string,
): Promise<TaskVoteRecord | null> {
  try {
    return await pb
      .collection(TASK_VOTES_COLLECTION)
      .getFirstListItem<TaskVoteRecord>(
        pb.filter("task = {:task} && user = {:user}", { task: taskId, user: userId }),
      );
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function fetchMyVotes(
  pb: PocketBase,
  userId: string,
  taskIds: string[],
): Promise<Map<string, 1 | -1>> {
  const votes = new Map<string, 1 | -1>();

  for (let offset = 0; offset < taskIds.length; offset += VOTES_QUERY_CHUNK) {
    const chunk = taskIds.slice(offset, offset + VOTES_QUERY_CHUNK);
    const terms = chunk.map((_, index) => `task = {:task${index}}`);
    const params = Object.fromEntries(chunk.map((taskId, index) => [`task${index}`, taskId]));
    const voteRows = await pb.collection(TASK_VOTES_COLLECTION).getFullList<TaskVoteRecord>({
      filter: pb.filter(`user = {:user} && (${terms.join(" || ")})`, {
        user: userId,
        ...params,
      }),
    });

    for (const voteRow of voteRows) {
      votes.set(voteRow.task, voteRow.value === -1 ? -1 : 1);
    }
  }

  return votes;
}

export async function fetchReduxShareTasks(
  authSession: AuthSession,
  payload: FetchReduxShareTasksPayload,
  language?: LanguageSetting,
): Promise<FetchReduxShareTasksResult> {
  const t = getTranslator(language);

  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensurePocketBaseSession(authSession),
      results: payload.questions.map((question) => ({
        questionId: question.questionId,
        questionType: question.questionType,
        questionHash: question.questionHash,
        ok: false,
        error: t("errors.moodleIdsMissing"),
      })),
    };
  }

  try {
    const { authSession: nextAuthSession, result: rowsByQuestionIdAndVotes } =
      await withPocketBaseSessionRetry(authSession, async (pb, session) => {
        const uniqueQuestionIds = [
          ...new Set(payload.questions.map((question) => question.questionId)),
        ].filter((questionId): questionId is string => Boolean(questionId));
        const grouped = new Map<string, TaskRecord[]>();
        let allRows: TaskRecord[] = [];

        if (uniqueQuestionIds.length > 0) {
          const questionIdTerms = uniqueQuestionIds.map(
            (_, index) => `question_id = {:qid${index}}`,
          );
          const questionIdParams = Object.fromEntries(
            uniqueQuestionIds.map((questionId, index) => [`qid${index}`, questionId]),
          );
          const rows = await pb.collection(TASKS_COLLECTION).getFullList<TaskRecord>({
            filter: pb.filter(
              `moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz} && (${questionIdTerms.join(" || ")})`,
              {
                domain: payload.domain,
                course: payload.courseId as number,
                quiz: payload.quizId as number,
                ...questionIdParams,
              },
            ),
            sort: "-updated",
            expand: "first_contributor,last_contributor",
          });

          allRows = rows;

          for (const row of rows) {
            const group = grouped.get(row.question_id) ?? [];
            group.push(row);
            grouped.set(row.question_id, group);
          }
        }

        const votesByTaskId = await fetchMyVotes(
          pb,
          session.user.id,
          allRows.map((row) => row.id),
        );

        return { grouped, votesByTaskId };
      });

    const rowsByQuestionId = rowsByQuestionIdAndVotes.grouped;
    const votesByTaskId = rowsByQuestionIdAndVotes.votesByTaskId;

    return {
      authSession: nextAuthSession,
      results: payload.questions.map((question) => {
        const rows = question.questionId ? (rowsByQuestionId.get(question.questionId) ?? []) : [];
        const bestRows = question.questionId ? pickBestHashRows(rows, question) : [];

        if (bestRows.length === 0) {
          return {
            questionId: question.questionId,
            questionType: question.questionType,
            questionHash: question.questionHash,
            ok: true,
            data: null,
            answerCount: 0,
          };
        }

        const slots = aggregateSlotRows(bestRows, votesByTaskId);
        const data = buildQuestionData(slots);
        const rowHash = maxText(bestRows.map((row) => row.question_hash));
        const hasHashMismatch =
          Boolean(question.questionHash) && Boolean(rowHash) && rowHash !== question.questionHash;

        return {
          questionId: question.questionId,
          questionType:
            maxText(bestRows.map((row) => normalizeRowType(row.question_type))) ??
            question.questionType,
          questionHash: rowHash,
          ok: true,
          data:
            hasHashMismatch && shouldDowngradeMismatchedHashData(data)
              ? downgradeMismatchedHashData(data)
              : data,
          answerCount: slots.reduce((sum, slot) => sum + slot.slotAnswerCount, 0),
        };
      }),
    };
  } catch (error) {
    throw toI18nError(error, "errors.reduxAnswersFetchFailed");
  }
}

export async function voteTaskAnswer(
  authSession: AuthSession,
  payload: VoteTaskAnswerPayload,
): Promise<VoteTaskAnswerResult> {
  try {
    const { authSession: nextAuthSession, result } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        let task: Pick<
          TaskRecord,
          "correct_count" | "selected_correct_count" | "selected_incorrect_count"
        >;

        try {
          task = await pb.collection(TASKS_COLLECTION).getOne<TaskRecord>(payload.taskId, {
            fields: "id,correct_count,selected_correct_count,selected_incorrect_count",
          });
        } catch (error) {
          if (isNotFoundError(error)) {
            throw new I18nError("errors.voteTaskMissing");
          }

          throw error;
        }

        if (isTaskRowVerified(task)) {
          throw new I18nError("errors.voteUnverifiableOnly");
        }

        const existingVote = await findOwnTaskVote(pb, session.user.id, payload.taskId);
        let upDelta = 0;
        let downDelta = 0;
        let myVote: 1 | -1 | 0;

        if (!existingVote) {
          try {
            await pb.collection(TASK_VOTES_COLLECTION).create({
              task: payload.taskId,
              user: session.user.id,
              value: payload.value,
            });

            if (payload.value === 1) {
              upDelta += 1;
            } else {
              downDelta += 1;
            }
          } catch (error) {
            if (!isValidationError(error)) {
              throw error;
            }

            // Гонка на уникальном индексе: голос уже создан параллельным запросом
            // и его счётчик применён победителем — доводим запись до желаемого значения.
            const winner = await findOwnTaskVote(pb, session.user.id, payload.taskId);

            if (!winner) {
              throw error;
            }

            if ((winner.value === -1 ? -1 : 1) !== payload.value) {
              await pb.collection(TASK_VOTES_COLLECTION).update(winner.id, {
                value: payload.value,
              });

              if (payload.value === 1) {
                upDelta += 1;
                downDelta -= 1;
              } else {
                downDelta += 1;
                upDelta -= 1;
              }
            }
          }

          myVote = payload.value;
        } else if ((existingVote.value === -1 ? -1 : 1) === payload.value) {
          await pb.collection(TASK_VOTES_COLLECTION).delete(existingVote.id);

          if (payload.value === 1) {
            upDelta -= 1;
          } else {
            downDelta -= 1;
          }

          myVote = 0;
        } else {
          await pb.collection(TASK_VOTES_COLLECTION).update(existingVote.id, {
            value: payload.value,
          });

          if (payload.value === 1) {
            upDelta += 1;
            downDelta -= 1;
          } else {
            downDelta += 1;
            upDelta -= 1;
          }

          myVote = payload.value;
        }

        if (upDelta !== 0 || downDelta !== 0) {
          await pb.collection(TASKS_COLLECTION).update<TaskRecord>(payload.taskId, {
            "votes_up+": upDelta,
            "votes_down+": downDelta,
          });
        }

        const finalTask = await pb.collection(TASKS_COLLECTION).getOne<TaskRecord>(payload.taskId, {
          fields: "id,votes_up,votes_down",
        });
        const votesUp = Math.max(finalTask.votes_up ?? 0, 0);
        const votesDown = Math.max(finalTask.votes_down ?? 0, 0);

        if (votesUp !== (finalTask.votes_up ?? 0) || votesDown !== (finalTask.votes_down ?? 0)) {
          await pb.collection(TASKS_COLLECTION).update<TaskRecord>(payload.taskId, {
            votes_up: votesUp,
            votes_down: votesDown,
          });
        }

        return { votesUp, votesDown, myVote };
      },
    );

    return { authSession: nextAuthSession, ...result };
  } catch (error) {
    throw toI18nError(error, "errors.voteSaveFailed");
  }
}

export interface QuizPreviewTaskResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  questionText: string | null;
  answerOptions: string[];
  ok: boolean;
  data?: unknown;
  answerCount?: number;
}

export async function fetchReduxShareQuizPreviewTasks(
  authSession: AuthSession,
  payload: { domain: string; courseId: number | null; quizId: number | null },
): Promise<{ authSession: AuthSession; results: QuizPreviewTaskResult[] }> {
  if (payload.courseId === null || payload.quizId === null) {
    throw new I18nError("errors.moodleIdsMissing");
  }

  try {
    const { authSession: nextAuthSession, result: rowsByQuestionId } =
      await withPocketBaseSessionRetry(authSession, async (pb) => {
        const rows = await pb.collection(TASKS_COLLECTION).getFullList<TaskRecord>({
          filter: pb.filter(
            "moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz}",
            {
              domain: payload.domain,
              course: payload.courseId as number,
              quiz: payload.quizId as number,
            },
          ),
          sort: "-updated",
          expand: "first_contributor,last_contributor",
        });

        const grouped = new Map<string, TaskRecord[]>();

        for (const row of rows) {
          const group = grouped.get(row.question_id) ?? [];
          group.push(row);
          grouped.set(row.question_id, group);
        }

        return grouped;
      });

    const results: QuizPreviewTaskResult[] = [];

    for (const [questionId, rows] of rowsByQuestionId) {
      const bestRows = pickBestHashRows(rows, {
        questionId,
        questionType: null,
        questionHash: null,
      });

      if (bestRows.length === 0) {
        continue;
      }

      // Превью-панель не голосует: карта голосов не запрашивается.
      const slots = aggregateSlotRows(bestRows, new Map());
      const data = buildQuestionData(slots);

      results.push({
        questionId,
        questionType: maxText(bestRows.map((row) => normalizeRowType(row.question_type))),
        questionHash: maxText(bestRows.map((row) => row.question_hash)),
        questionText: maxText(bestRows.map((row) => row.question_text)),
        answerOptions: mergeAnswerOptionLabels(
          [],
          bestRows.flatMap((row) => parseTaskAnswerOptions(row.answer_options)),
        ),
        ok: true,
        data,
        answerCount: slots.reduce((sum, slot) => sum + slot.slotAnswerCount, 0),
      });
    }

    results.sort((left, right) => {
      const leftUpdated = maxText(
        rowsByQuestionId.get(left.questionId ?? "")?.map((row) => row.updated) ?? [],
      );
      const rightUpdated = maxText(
        rowsByQuestionId.get(right.questionId ?? "")?.map((row) => row.updated) ?? [],
      );

      return (rightUpdated ?? "").localeCompare(leftUpdated ?? "");
    });

    return { authSession: nextAuthSession, results };
  } catch (error) {
    throw toI18nError(error, "errors.reduxAnswersFetchFailed");
  }
}

interface NormalizedReviewAnswer {
  label: string;
  key: string;
  slotKey: string;
  slotIndex: number | null;
  correctness: number;
  isCorrect: boolean;
  wasSelected: boolean;
}

interface NormalizedReviewQuestion {
  questionId: string;
  questionType: string | null;
  questionHash: string;
  questionText: string | null;
  answerOptions: string[];
  answers: NormalizedReviewAnswer[];
  preCountedAnswers: NormalizedPreCountedSelection[];
}

interface NormalizedPreCountedSelection {
  key: string;
  slotKey: string;
  verdict: SelectionVerdict;
}

function normalizeSelectionVerdict(value: unknown): SelectionVerdict | null {
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

function serializeTaskAnswerOptions(options: string[]) {
  return options.length > 0 ? JSON.stringify(options) : "";
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeReviewQuestions(questions: ReviewQuestionPayload[]): NormalizedReviewQuestion[] {
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

function fnv1aHex(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getQuestionImportKey(questionId: string, questionHash: string) {
  return [questionId, questionHash].join("\n");
}

export type ReviewQuestionOutcome = "correct" | "wrong" | "unknown" | "none";

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

function getReviewQuestionContentHash(question: NormalizedReviewQuestion) {
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

  return fnv1aHex(`${question.questionId}\n${question.questionHash}\n${fingerprint}`);
}

// Выбор, учтённый при установке ответа (pre-counted), переносится на вердикт
// review: старый тик снимается (клампится по текущему значению строки), новый
// ставится. Один выбор пользователя = один итоговый тик в verified-счётчике.
function getSelectionTransitionDeltas(
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

function getReviewSelectionVerdict(answer: NormalizedReviewAnswer): SelectionVerdict | null {
  if (!answer.wasSelected) {
    return null;
  }

  if (answer.correctness === 2) {
    return "correct";
  }

  return answer.correctness <= 0 ? "incorrect" : "unknown";
}

function getTaskIdentityKey(entry: {
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

async function upsertReviewImport(
  pb: PocketBase,
  entry: {
    userId: string;
    domain: string;
    attemptKey: string;
    courseId: number;
    quizId: number;
    pageUrl: string;
    questionCount: number;
  },
): Promise<{ id: string; questionHashes: Record<string, string> }> {
  const filter = pb.filter(
    "user = {:user} && moodle_domain = {:domain} && attempt_key = {:attempt}",
    {
      user: entry.userId,
      domain: entry.domain,
      attempt: entry.attemptKey,
    },
  );

  try {
    const existing = await pb
      .collection(REVIEW_IMPORTS_COLLECTION)
      .getFirstListItem<ReviewImportRecord>(filter);
    await pb.collection(REVIEW_IMPORTS_COLLECTION).update(existing.id, {
      course_id: entry.courseId,
      quiz_id: entry.quizId,
      page_url: entry.pageUrl || existing.page_url,
      imported_question_count: Math.max(existing.imported_question_count ?? 0, entry.questionCount),
    });

    return { id: existing.id, questionHashes: existing.imported_question_hashes ?? {} };
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    const created = await pb.collection(REVIEW_IMPORTS_COLLECTION).create<ReviewImportRecord>({
      user: entry.userId,
      moodle_domain: entry.domain,
      attempt_key: entry.attemptKey,
      course_id: entry.courseId,
      quiz_id: entry.quizId,
      page_url: entry.pageUrl,
      imported_question_count: entry.questionCount,
      imported_question_hashes: {},
    });

    return { id: created.id, questionHashes: {} };
  }
}

export async function saveReduxShareReviewAnswers(
  authSession: AuthSession,
  payload: SaveReduxShareReviewPayload,
): Promise<SaveReduxShareReviewResult> {
  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensurePocketBaseSession(authSession),
      imported: false,
      savedCount: 0,
    };
  }

  const courseId = payload.courseId;
  const quizId = payload.quizId;
  const questions = normalizeReviewQuestions(payload.questions);

  try {
    const { authSession: nextAuthSession, result: savedCount } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        const userId = session.user.id;

        try {
          const me = await pb
            .collection(USERS_COLLECTION)
            .getOne<{ moodle_domain: string }>(userId, {
              fields: "id,moodle_domain",
            });

          if (payload.domain && me.moodle_domain !== payload.domain) {
            await pb.collection(USERS_COLLECTION).update(userId, { moodle_domain: payload.domain });
          }
        } catch (error) {
          if (isNotFoundError(error)) {
            throw new I18nError("errors.sessionExpired");
          }

          throw error;
        }

        const { id: reviewImportId, questionHashes: importedQuestionHashes } =
          await upsertReviewImport(pb, {
            userId,
            domain: payload.domain,
            attemptKey: payload.attemptKey,
            courseId,
            quizId,
            pageUrl: payload.pageUrl,
            questionCount: questions.length,
          });

        const existingTasks = await pb.collection(TASKS_COLLECTION).getFullList<TaskRecord>({
          filter: pb.filter(
            "moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz}",
            {
              domain: payload.domain,
              course: courseId,
              quiz: quizId,
            },
          ),
          sort: "-updated",
        });
        const tasksByIdentity = new Map(
          existingTasks.map((task) => [
            getTaskIdentityKey({
              moodleDomain: task.moodle_domain,
              courseId: task.course_id,
              quizId: task.quiz_id,
              questionId: task.question_id,
              questionHash: task.question_hash,
              slotKey: task.slot_key,
              answerKey: task.answer_key,
            }),
            task,
          ]),
        );

        let savedEntries = 0;
        let hashesChanged = false;
        let importedQuestions = 0;
        let correctQuestions = 0;
        let wrongQuestions = 0;

        for (const question of questions) {
          const importKey = getQuestionImportKey(question.questionId, question.questionHash);
          const contentHash = getReviewQuestionContentHash(question);

          if (question.answerOptions.length > 0) {
            const questionTaskRows = existingTasks.filter(
              (task) =>
                task.question_id === question.questionId &&
                task.question_hash === question.questionHash,
            );

            for (const taskRow of questionTaskRows) {
              const mergedOptions = mergeAnswerOptionLabels(
                parseTaskAnswerOptions(taskRow.answer_options),
                question.answerOptions,
              );

              if (serializeTaskAnswerOptions(mergedOptions) === (taskRow.answer_options ?? "")) {
                continue;
              }

              const updated = await pb.collection(TASKS_COLLECTION).update<TaskRecord>(taskRow.id, {
                answer_options: serializeTaskAnswerOptions(mergedOptions),
              });
              tasksByIdentity.set(
                getTaskIdentityKey({
                  moodleDomain: updated.moodle_domain,
                  courseId: updated.course_id,
                  quizId: updated.quiz_id,
                  questionId: updated.question_id,
                  questionHash: updated.question_hash,
                  slotKey: updated.slot_key,
                  answerKey: updated.answer_key,
                }),
                updated,
              );
            }
          }

          if (importedQuestionHashes[importKey] === contentHash) {
            continue;
          }

          const outcome = getReviewQuestionOutcome(question.answers);

          if (outcome === "correct") {
            correctQuestions += 1;
          } else if (outcome === "wrong") {
            wrongQuestions += 1;
          }

          importedQuestions += 1;

          const trackedSelections = new Map(
            question.preCountedAnswers.map((entry) => [`${entry.slotKey}|${entry.key}`, entry]),
          );

          for (const answer of question.answers) {
            const correctDelta = answer.correctness === 2 ? 1 : 0;
            const identityKey = getTaskIdentityKey({
              moodleDomain: payload.domain,
              courseId,
              quizId,
              questionId: question.questionId,
              questionHash: question.questionHash,
              slotKey: answer.slotKey,
              answerKey: answer.key,
            });
            const existing = tasksByIdentity.get(identityKey);
            const tracked = trackedSelections.get(`${answer.slotKey}|${answer.key}`) ?? null;
            const { selectedCorrectDelta, selectedIncorrectDelta, selectedUnknownDelta } = tracked
              ? getSelectionTransitionDeltas(
                  tracked.verdict,
                  getReviewSelectionVerdict(answer),
                  existing,
                )
              : {
                  selectedCorrectDelta: answer.correctness === 2 && answer.wasSelected ? 1 : 0,
                  selectedIncorrectDelta: answer.correctness <= 0 && answer.wasSelected ? 1 : 0,
                  selectedUnknownDelta: answer.correctness === 1 && answer.wasSelected ? 1 : 0,
                };

            trackedSelections.delete(`${answer.slotKey}|${answer.key}`);

            if (existing) {
              const patch: Record<string, unknown> = {
                answer_label: answer.label,
                "correct_count+": correctDelta,
                "selected_correct_count+": selectedCorrectDelta,
                "selected_incorrect_count+": selectedIncorrectDelta,
                "selected_unknown_count+": selectedUnknownDelta,
                last_contributor: userId,
              };

              if (question.questionType) {
                patch.question_type = question.questionType;
              }

              if (question.questionText && !existing.question_text) {
                patch.question_text = question.questionText;
              }

              if (answer.slotIndex !== null) {
                patch.slot_index = answer.slotIndex;
              }

              const updated = await pb
                .collection(TASKS_COLLECTION)
                .update<TaskRecord>(existing.id, patch);
              tasksByIdentity.set(identityKey, updated);
            } else {
              try {
                const created = await pb.collection(TASKS_COLLECTION).create<TaskRecord>({
                  moodle_domain: payload.domain,
                  course_id: courseId,
                  quiz_id: quizId,
                  question_id: question.questionId,
                  question_hash: question.questionHash,
                  question_type: question.questionType ?? "",
                  question_text: question.questionText ?? "",
                  answer_options: serializeTaskAnswerOptions(question.answerOptions),
                  slot_key: answer.slotKey,
                  slot_index: answer.slotIndex,
                  answer_key: answer.key,
                  answer_label: answer.label,
                  correct_count: correctDelta,
                  selected_correct_count: selectedCorrectDelta,
                  selected_incorrect_count: selectedIncorrectDelta,
                  selected_unknown_count: selectedUnknownDelta,
                  first_contributor: userId,
                  last_contributor: userId,
                });
                tasksByIdentity.set(identityKey, created);
              } catch (error) {
                if (isValidationError(error)) {
                  const winner = await pb.collection(TASKS_COLLECTION).getFirstListItem<TaskRecord>(
                    pb.filter(
                      "moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz} && question_id = {:qid} && question_hash = {:hash} && slot_key = {:slot} && answer_key = {:akey}",
                      {
                        domain: payload.domain,
                        course: courseId,
                        quiz: quizId,
                        qid: question.questionId,
                        hash: question.questionHash,
                        slot: answer.slotKey,
                        akey: answer.key,
                      },
                    ),
                  );
                  const updated = await pb
                    .collection(TASKS_COLLECTION)
                    .update<TaskRecord>(winner.id, {
                      answer_label: answer.label,
                      "correct_count+": correctDelta,
                      "selected_correct_count+": selectedCorrectDelta,
                      "selected_incorrect_count+": selectedIncorrectDelta,
                      "selected_unknown_count+": selectedUnknownDelta,
                      last_contributor: userId,
                    });
                  tasksByIdentity.set(identityKey, updated);
                } else {
                  throw error;
                }
              }
            }

            savedEntries += 1;
          }

          for (const tracked of trackedSelections.values()) {
            const identityKey = getTaskIdentityKey({
              moodleDomain: payload.domain,
              courseId,
              quizId,
              questionId: question.questionId,
              questionHash: question.questionHash,
              slotKey: tracked.slotKey,
              answerKey: tracked.key,
            });
            const existing = tasksByIdentity.get(identityKey);

            if (!existing) {
              continue;
            }

            const deltas = getSelectionTransitionDeltas(tracked.verdict, null, existing);
            const patch: Record<string, unknown> = {};

            if (deltas.selectedCorrectDelta !== 0) {
              patch["selected_correct_count+"] = deltas.selectedCorrectDelta;
            }

            if (deltas.selectedIncorrectDelta !== 0) {
              patch["selected_incorrect_count+"] = deltas.selectedIncorrectDelta;
            }

            if (deltas.selectedUnknownDelta !== 0) {
              patch["selected_unknown_count+"] = deltas.selectedUnknownDelta;
            }

            if (Object.keys(patch).length === 0) {
              continue;
            }

            const updated = await pb
              .collection(TASKS_COLLECTION)
              .update<TaskRecord>(existing.id, patch);
            tasksByIdentity.set(identityKey, updated);
            savedEntries += 1;
          }

          importedQuestionHashes[importKey] = contentHash;
          hashesChanged = true;
        }

        if (hashesChanged) {
          await pb.collection(REVIEW_IMPORTS_COLLECTION).update(reviewImportId, {
            imported_question_hashes: importedQuestionHashes,
          });
        }

        // Счётчики персональной статистики применяются последними: после записи
        // хэшей повторный сохранённый импорт дедуплицируется и не задваивает
        // общие счётчики задач, поэтому ретрай здесь безопасен.
        const userStatsPatch: Record<string, unknown> = {};

        if (importedQuestions > 0) {
          userStatsPatch["imported_questions_count+"] = importedQuestions;
        }

        if (correctQuestions > 0) {
          userStatsPatch["attempt_correct_count+"] = correctQuestions;
        }

        if (wrongQuestions > 0) {
          userStatsPatch["attempt_incorrect_count+"] = wrongQuestions;
        }

        if (Object.keys(userStatsPatch).length > 0) {
          await pb.collection(USERS_COLLECTION).update(userId, userStatsPatch);
        }

        return savedEntries;
      },
    );

    return {
      authSession: nextAuthSession,
      imported: savedCount > 0,
      savedCount,
    };
  } catch (error) {
    throw toI18nError(error, "errors.reduxReviewSaveFailed");
  }
}

interface NormalizedUserAnswerSelection {
  questionId: string;
  questionType: string | null;
  questionHash: string;
  questionText: string | null;
  answerOptions: string[];
  answers: Array<NormalizedReviewAnswer & { verdict: SelectionVerdict }>;
}

function normalizeUserAnswerSelectionQuestion(
  question: UserAnswerSelectionQuestion | undefined,
): NormalizedUserAnswerSelection | null {
  if (!question || typeof question !== "object") {
    return null;
  }

  const questionId = (question.questionId ?? "").trim();
  const questionHash = (question.questionHash ?? "").trim();

  if (!questionId || !questionHash) {
    return null;
  }

  const answers: NormalizedUserAnswerSelection["answers"] = [];

  for (const answer of question.answers ?? []) {
    const label = collapseWhitespace(answer.label ?? "");
    const verdict = normalizeSelectionVerdict(answer.verdict);

    if (!label || !verdict) {
      continue;
    }

    const rawKey = collapseWhitespace(answer.answerKey ?? "");
    const slotKey = (answer.slotKey ?? "").trim() || "question";
    const rawSlotIndex = String(answer.slotIndex ?? "").trim();

    answers.push({
      label,
      key: rawKey || label.toLowerCase(),
      slotKey,
      slotIndex: /^\d+$/.test(rawSlotIndex) ? Number.parseInt(rawSlotIndex, 10) : null,
      correctness: verdict === "correct" ? 2 : verdict === "incorrect" ? 0 : 1,
      isCorrect: verdict === "correct",
      wasSelected: true,
      verdict,
    });
  }

  if (answers.length === 0) {
    return null;
  }

  return {
    questionId,
    questionType: (question.questionType ?? "").trim() || null,
    questionHash,
    questionText: collapseWhitespace(question.questionText ?? "") || null,
    answerOptions: mergeAnswerOptionLabels([], question.answerOptions ?? []),
    answers,
  };
}

// Мгновенное сохранение выбора пользователя на attempt.php: только счётчики
// selected_* по вердикту. Без review_imports, user stats и correct_count —
// верификация остаётся за review-импортом после сдачи попытки.
export async function saveUserAnswerSelection(
  authSession: AuthSession,
  payload: SaveUserAnswerPayload,
): Promise<SaveUserAnswerResult> {
  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensurePocketBaseSession(authSession),
      savedCount: 0,
    };
  }

  const courseId = payload.courseId;
  const quizId = payload.quizId;
  const question = normalizeUserAnswerSelectionQuestion(payload.question);

  if (!question) {
    return {
      authSession: await ensurePocketBaseSession(authSession),
      savedCount: 0,
    };
  }

  try {
    const { authSession: nextAuthSession, result: savedCount } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        const userId = session.user.id;
        let savedEntries = 0;

        for (const answer of question.answers) {
          const counterField =
            answer.verdict === "correct"
              ? "selected_correct_count"
              : answer.verdict === "incorrect"
                ? "selected_incorrect_count"
                : "selected_unknown_count";
          const filter = pb.filter(
            "moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz} && question_id = {:qid} && question_hash = {:hash} && slot_key = {:slot} && answer_key = {:akey}",
            {
              domain: payload.domain,
              course: courseId,
              quiz: quizId,
              qid: question.questionId,
              hash: question.questionHash,
              slot: answer.slotKey,
              akey: answer.key,
            },
          );

          let existing: TaskRecord | null = null;

          try {
            existing = await pb.collection(TASKS_COLLECTION).getFirstListItem<TaskRecord>(filter);
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
          }

          if (existing) {
            const patch: Record<string, unknown> = {
              answer_label: answer.label,
              [`${counterField}+`]: 1,
              last_contributor: userId,
            };

            if (question.questionType) {
              patch.question_type = question.questionType;
            }

            if (question.questionText && !existing.question_text) {
              patch.question_text = question.questionText;
            }

            if (answer.slotIndex !== null) {
              patch.slot_index = answer.slotIndex;
            }

            await pb.collection(TASKS_COLLECTION).update<TaskRecord>(existing.id, patch);
          } else {
            try {
              await pb.collection(TASKS_COLLECTION).create<TaskRecord>({
                moodle_domain: payload.domain,
                course_id: courseId,
                quiz_id: quizId,
                question_id: question.questionId,
                question_hash: question.questionHash,
                question_type: question.questionType ?? "",
                question_text: question.questionText ?? "",
                answer_options: serializeTaskAnswerOptions(question.answerOptions),
                slot_key: answer.slotKey,
                slot_index: answer.slotIndex,
                answer_key: answer.key,
                answer_label: answer.label,
                correct_count: 0,
                selected_correct_count: answer.verdict === "correct" ? 1 : 0,
                selected_incorrect_count: answer.verdict === "incorrect" ? 1 : 0,
                selected_unknown_count: answer.verdict === "unknown" ? 1 : 0,
                first_contributor: userId,
                last_contributor: userId,
              });
            } catch (error) {
              if (!isValidationError(error)) {
                throw error;
              }

              const winner = await pb
                .collection(TASKS_COLLECTION)
                .getFirstListItem<TaskRecord>(filter);
              await pb.collection(TASKS_COLLECTION).update<TaskRecord>(winner.id, {
                answer_label: answer.label,
                [`${counterField}+`]: 1,
                last_contributor: userId,
              });
            }
          }

          savedEntries += 1;
        }

        return savedEntries;
      },
    );

    return {
      authSession: nextAuthSession,
      savedCount,
    };
  } catch (error) {
    throw toI18nError(error, "errors.reduxReviewSaveFailed");
  }
}
