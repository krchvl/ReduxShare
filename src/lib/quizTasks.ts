import type PocketBase from "pocketbase";
import type { AuthSession } from "../types";
import { getTranslator, I18nError } from "../i18n";
import type { LanguageSetting } from "../types";
import { ensurePocketBaseSession } from "./auth";
import {
  REVIEW_ANSWER_IMPORTS_COLLECTION,
  REVIEW_IMPORTS_COLLECTION,
  TASKS_COLLECTION,
  USERS_COLLECTION,
  isNotFoundError,
  isValidationError,
  toI18nError,
  withPocketBaseSessionRetry
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
  slot_key: string;
  slot_index: number | null;
  answer_key: string;
  answer_label: string;
  correct_count: number | null;
  selected_correct_count: number | null;
  selected_incorrect_count: number | null;
  selected_unknown_count: number | null;
  updated: string;
}

interface ReviewAnswerImportRecord {
  id: string;
  question_id: string;
  question_hash: string;
  slot_key: string;
  answer_key: string;
}

interface ReviewImportRecord {
  id: string;
  course_id: number | null;
  quiz_id: number | null;
  page_url: string;
  imported_question_count: number | null;
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

export interface ReviewQuestionPayload {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  answers: ReviewAnswerPayload[];
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

function getTaskKey(questionId: string | null, questionHash: string | null) {
  return `${questionId ?? ""}|${questionHash ?? ""}`;
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

function getBooleanSuggestionValue(label: string) {
  const normalizedLabel = label.trim().toLowerCase();

  if (normalizedLabel === "true") {
    return true;
  }

  if (normalizedLabel === "false") {
    return false;
  }

  return null;
}

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

  return suggestionLabels.length > 0 && suggestionLabels.every((label) => getBooleanSuggestionValue(label) !== null);
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
              const label = typeof suggestionLike.label === "string" ? suggestionLike.label.trim() : "";

              if (!label) {
                return null;
              }

              return {
                correctness: 1,
                count: 1,
                label
              };
            })
            .filter((submission): submission is ReduxShareSubmissionLike => submission !== null);

    return {
      ...typedRow,
      suggestions: [],
      submissions: submissions.length > 0 ? submissions : syntheticSubmissions
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
    0
  );
}

function normalizeRowType(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Mirrors the SQL ranking in the old fetch_reduxshare_tasks RPC: candidates
 * share one question_id, then the hash group with a hash match wins, otherwise
 * the most recently updated group (ties broken by hash, ascending).
 */
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
    updatedAt: groupRows.reduce((latest, row) => (row.updated > latest ? row.updated : latest), "")
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
  suggestions: Array<{ correctness: 2; confidence: number; label: string }>;
  submissions: Array<{ correctness: number; count: number; label: string }>;
  slotAnswerCount: number;
}

/**
 * Mirrors the slot aggregation of the old fetch_reduxshare_tasks RPC, including
 * confidence rounding and ordering.
 */
function aggregateSlotRows(rows: TaskRecord[]): AggregatedSlot[] {
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
            slotVerifiedTotal > 0 ? Math.round((verifiedTotal / slotVerifiedTotal) * 10_000) / 10_000 : 0,
          label: row.answer_label
        };
      })
      .sort((a, b) =>
        a.verifiedTotal !== b.verifiedTotal
          ? b.verifiedTotal - a.verifiedTotal
          : a.label.localeCompare(b.label)
      )
      .map(({ correctness, confidence, label }) => ({ correctness, confidence, label }));
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
        label: row.answer_label
      }))
      .sort((a, b) => (a.count !== b.count ? b.count - a.count : a.label.localeCompare(b.label)));

    return {
      slotKey,
      slotIndex: slotIndexes.length > 0 ? Math.min(...slotIndexes) : null,
      suggestions,
      submissions,
      slotAnswerCount: slotRows.length
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
      label: slot.slotKey
    },
    suggestions: slot.suggestions,
    submissions: slot.submissions
  }));
}

export async function fetchReduxShareTasks(
  authSession: AuthSession,
  payload: FetchReduxShareTasksPayload,
  language?: LanguageSetting
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
        error: t("errors.moodleIdsMissing")
      }))
    };
  }

  try {
    const { authSession: nextAuthSession, result: rowsByQuestionId } = await withPocketBaseSessionRetry(
      authSession,
      async (pb) => {
        const grouped = new Map<string, TaskRecord[]>();
        const uniqueQuestionIds = [...new Set(payload.questions.map((question) => question.questionId))].filter(
          (questionId): questionId is string => Boolean(questionId)
        );

        for (const questionId of uniqueQuestionIds) {
          const rows = await pb.collection(TASKS_COLLECTION).getFullList<TaskRecord>({
            filter: pb.filter(
              "moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz} && question_id = {:qid}",
              {
                domain: payload.domain,
                course: payload.courseId as number,
                quiz: payload.quizId as number,
                qid: questionId
              }
            ),
            sort: "-updated"
          });

          grouped.set(questionId, rows);
        }

        return grouped;
      }
    );

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
            answerCount: 0
          };
        }

        const slots = aggregateSlotRows(bestRows);
        const data = buildQuestionData(slots);
        const rowHash = maxText(bestRows.map((row) => row.question_hash));
        const hasHashMismatch =
          Boolean(question.questionHash) && Boolean(rowHash) && rowHash !== question.questionHash;

        return {
          questionId: question.questionId,
          questionType: maxText(bestRows.map((row) => normalizeRowType(row.question_type))) ?? question.questionType,
          questionHash: rowHash,
          ok: true,
          data: hasHashMismatch && shouldDowngradeMismatchedHashData(data) ? downgradeMismatchedHashData(data) : data,
          answerCount: slots.reduce((sum, slot) => sum + slot.slotAnswerCount, 0)
        };
      })
    };
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
  answers: NormalizedReviewAnswer[];
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Mirrors the normalization of the old save_reduxshare_review_answers RPC.
 */
function normalizeReviewQuestions(questions: ReviewQuestionPayload[]): NormalizedReviewQuestion[] {
  const normalized: NormalizedReviewQuestion[] = [];

  for (const question of questions) {
    const questionId = (question.questionId ?? "").trim();
    const questionHash = (question.questionHash ?? "").trim();
    const questionType = (question.questionType ?? "").trim() || null;

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

    normalized.push({ questionId, questionType, questionHash, answers });
  }

  return normalized;
}

function getAnswerDedupKey(questionId: string, questionHash: string, slotKey: string, answerKey: string) {
  return [questionId, questionHash, slotKey, answerKey].join("\n");
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
    entry.answerKey
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
  }
) {
  const filter = pb.filter("user = {:user} && moodle_domain = {:domain} && attempt_key = {:attempt}", {
    user: entry.userId,
    domain: entry.domain,
    attempt: entry.attemptKey
  });

  try {
    const existing = await pb.collection(REVIEW_IMPORTS_COLLECTION).getFirstListItem<ReviewImportRecord>(filter);
    await pb.collection(REVIEW_IMPORTS_COLLECTION).update(existing.id, {
      course_id: entry.courseId,
      quiz_id: entry.quizId,
      page_url: entry.pageUrl || existing.page_url,
      imported_question_count: Math.max(existing.imported_question_count ?? 0, entry.questionCount)
    });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    await pb.collection(REVIEW_IMPORTS_COLLECTION).create({
      user: entry.userId,
      moodle_domain: entry.domain,
      attempt_key: entry.attemptKey,
      course_id: entry.courseId,
      quiz_id: entry.quizId,
      page_url: entry.pageUrl,
      imported_question_count: entry.questionCount
    });
  }
}

export async function saveReduxShareReviewAnswers(
  authSession: AuthSession,
  payload: SaveReduxShareReviewPayload
): Promise<SaveReduxShareReviewResult> {
  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensurePocketBaseSession(authSession),
      imported: false,
      savedCount: 0
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
          const me = await pb.collection(USERS_COLLECTION).getOne<{ moodle_domain: string }>(userId, {
            fields: "id,moodle_domain"
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

        await upsertReviewImport(pb, {
          userId,
          domain: payload.domain,
          attemptKey: payload.attemptKey,
          courseId,
          quizId,
          pageUrl: payload.pageUrl,
          questionCount: questions.length
        });

        const existingImports = await pb
          .collection(REVIEW_ANSWER_IMPORTS_COLLECTION)
          .getFullList<ReviewAnswerImportRecord>({
            filter: pb.filter("user = {:user} && moodle_domain = {:domain} && attempt_key = {:attempt}", {
              user: userId,
              domain: payload.domain,
              attempt: payload.attemptKey
            })
          });
        const importedKeys = new Set(
          existingImports.map((entry) =>
            getAnswerDedupKey(entry.question_id, entry.question_hash, entry.slot_key, entry.answer_key)
          )
        );

        const existingTasks = await pb.collection(TASKS_COLLECTION).getFullList<TaskRecord>({
          filter: pb.filter("moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz}", {
            domain: payload.domain,
            course: courseId,
            quiz: quizId
          }),
          sort: "-updated"
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
              answerKey: task.answer_key
            }),
            task
          ])
        );

        let savedEntries = 0;

        for (const question of questions) {
          for (const answer of question.answers) {
            const dedupKey = getAnswerDedupKey(question.questionId, question.questionHash, answer.slotKey, answer.key);

            if (importedKeys.has(dedupKey)) {
              continue;
            }

            try {
              await pb.collection(REVIEW_ANSWER_IMPORTS_COLLECTION).create({
                user: userId,
                moodle_domain: payload.domain,
                attempt_key: payload.attemptKey,
                question_id: question.questionId,
                question_hash: question.questionHash,
                slot_key: answer.slotKey,
                answer_key: answer.key
              });
            } catch (error) {
              // A concurrent tab imported the same answer first: skip it.
              if (isValidationError(error)) {
                importedKeys.add(dedupKey);
                continue;
              }

              throw error;
            }

            importedKeys.add(dedupKey);

            const correctDelta = answer.correctness === 2 ? 1 : 0;
            const selectedCorrectDelta = answer.correctness === 2 && answer.wasSelected ? 1 : 0;
            const selectedIncorrectDelta = answer.correctness <= 0 && answer.wasSelected ? 1 : 0;
            const selectedUnknownDelta = answer.correctness === 1 && answer.wasSelected ? 1 : 0;
            const identityKey = getTaskIdentityKey({
              moodleDomain: payload.domain,
              courseId,
              quizId,
              questionId: question.questionId,
              questionHash: question.questionHash,
              slotKey: answer.slotKey,
              answerKey: answer.key
            });
            const existing = tasksByIdentity.get(identityKey);

            if (existing) {
              const patch: Record<string, unknown> = {
                answer_label: answer.label,
                "correct_count+": correctDelta,
                "selected_correct_count+": selectedCorrectDelta,
                "selected_incorrect_count+": selectedIncorrectDelta,
                "selected_unknown_count+": selectedUnknownDelta,
                last_contributor: userId
              };

              if (question.questionType) {
                patch.question_type = question.questionType;
              }

              if (answer.slotIndex !== null) {
                patch.slot_index = answer.slotIndex;
              }

              const updated = await pb.collection(TASKS_COLLECTION).update<TaskRecord>(existing.id, patch);
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
                  slot_key: answer.slotKey,
                  slot_index: answer.slotIndex,
                  answer_key: answer.key,
                  answer_label: answer.label,
                  correct_count: correctDelta,
                  selected_correct_count: selectedCorrectDelta,
                  selected_incorrect_count: selectedIncorrectDelta,
                  selected_unknown_count: selectedUnknownDelta,
                  first_contributor: userId,
                  last_contributor: userId
                });
                tasksByIdentity.set(identityKey, created);
              } catch (error) {
                // Lost a create race with another tab: apply the counters to the winner.
                if (isValidationError(error)) {
                  const winner = await pb
                    .collection(TASKS_COLLECTION)
                    .getFirstListItem<TaskRecord>(
                      pb.filter(
                        "moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz} && question_id = {:qid} && question_hash = {:hash} && slot_key = {:slot} && answer_key = {:akey}",
                        {
                          domain: payload.domain,
                          course: courseId,
                          quiz: quizId,
                          qid: question.questionId,
                          hash: question.questionHash,
                          slot: answer.slotKey,
                          akey: answer.key
                        }
                      )
                    );
                  const updated = await pb.collection(TASKS_COLLECTION).update<TaskRecord>(winner.id, {
                    answer_label: answer.label,
                    "correct_count+": correctDelta,
                    "selected_correct_count+": selectedCorrectDelta,
                    "selected_incorrect_count+": selectedIncorrectDelta,
                    "selected_unknown_count+": selectedUnknownDelta,
                    last_contributor: userId
                  });
                  tasksByIdentity.set(identityKey, updated);
                } else {
                  throw error;
                }
              }
            }

            savedEntries += 1;
          }
        }

        return savedEntries;
      }
    );

    return {
      authSession: nextAuthSession,
      imported: savedCount > 0,
      savedCount
    };
  } catch (error) {
    throw toI18nError(error, "errors.reduxReviewSaveFailed");
  }
}
