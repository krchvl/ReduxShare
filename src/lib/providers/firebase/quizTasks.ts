import type { LanguageSetting } from "../../../types";
import type { AuthSession } from "../../../types";
import { getTranslator, I18nError } from "../../../i18n";
import type {
  FetchReduxShareTasksPayload,
  FetchReduxShareTasksResult,
  QuizPreviewTaskResult,
  ReduxShareTaskResult,
  SaveReduxShareReviewPayload,
  SaveReduxShareReviewResult,
  SaveUserAnswerPayload,
  SaveUserAnswerResult,
  SelectionVerdict,
  TaskRecord,
  UserAnswerSelectionQuestion,
  VoteTaskAnswerPayload,
  VoteTaskAnswerResult,
} from "../../dataTypes";
import {
  aggregateSlotRows,
  buildQuestionData,
  collapseWhitespace,
  downgradeMismatchedHashData,
  getQuestionImportKey,
  getReviewQuestionContentHash,
  getReviewQuestionOutcome,
  getReviewSelectionVerdict,
  getSelectionTransitionDeltas,
  getTaskIdentityKey,
  isTaskRowVerified,
  maxText,
  mergeAnswerOptionLabels,
  normalizeReviewQuestions,
  normalizeRowType,
  normalizeSelectionVerdict,
  parseTaskAnswerOptions,
  pickBestHashRows,
  serializeTaskAnswerOptions,
  shouldDowngradeMismatchedHashData,
} from "../../dataCore/quizTasksCore";
import { toDataError } from "../../dataCore/errors";
import { ensureSession } from "../../auth";
import { requireFirebaseConfig } from "./config";
import {
  createDocumentWrite,
  incrementDocumentWrite,
  updateDocumentWithIncrementsWrite,
  updateDocumentWrite,
  type FirestoreClient,
  type FirestoreWrite,
} from "./firestore";
import { isFirebasePreconditionError } from "./http";
import { reviewImportDocumentId, taskDocumentId, taskVoteDocumentId } from "./ids";
import { mapReviewImportDocument, mapTaskDocument, mapUserDocument } from "./mappers";
import { fetchContributorName, withFirebaseSessionRetry } from "./session";
import { performVoteToggle } from "./votes";

const TASKS_COLLECTION_ID = "tasks";
const TASK_VOTES_COLLECTION_ID = "taskVotes";
const REVIEW_IMPORTS_COLLECTION_ID = "reviewImports";
const USERS_COLLECTION_ID = "users";
const COMMIT_CHUNK_SIZE = 400;
const VOTES_QUERY_CHUNK = 100;

interface TaskIdentity {
  moodleDomain: string;
  courseId: number;
  quizId: number;
  questionId: string;
  questionHash: string;
  slotKey: string;
  answerKey: string;
}

function groupRowsByQuestionId(rows: TaskRecord[]) {
  const grouped = new Map<string, TaskRecord[]>();

  for (const row of rows) {
    const group = grouped.get(row.question_id) ?? [];
    group.push(row);
    grouped.set(row.question_id, group);
  }

  return grouped;
}

async function queryQuizTaskRows(
  client: FirestoreClient,
  domain: string,
  courseId: number,
  quizId: number,
): Promise<TaskRecord[]> {
  const documents = await client.runQuery(TASKS_COLLECTION_ID, {
    filters: [
      { field: "moodle_domain", value: domain },
      { field: "course_id", value: courseId },
      { field: "quiz_id", value: quizId },
    ],
  });

  return documents.map(mapTaskDocument);
}

async function fetchMyVotes(
  client: FirestoreClient,
  userId: string,
  taskIds: string[],
): Promise<Map<string, 1 | -1>> {
  const votes = new Map<string, 1 | -1>();

  for (let offset = 0; offset < taskIds.length; offset += VOTES_QUERY_CHUNK) {
    const chunk = taskIds.slice(offset, offset + VOTES_QUERY_CHUNK);
    const documents = await client.batchGet(
      chunk.map((taskId) => `${TASK_VOTES_COLLECTION_ID}/${taskVoteDocumentId(taskId, userId)}`),
    );

    for (const document of documents) {
      if (!document) {
        continue;
      }

      const taskId = typeof document.fields.task_id === "string" ? document.fields.task_id : "";

      if (!taskId) {
        continue;
      }

      votes.set(taskId, document.fields.value === -1 ? -1 : 1);
    }
  }

  return votes;
}

function buildTaskResult(
  question: FetchReduxShareTasksPayload["questions"][number],
  rows: TaskRecord[],
  votesByTaskId: Map<string, 1 | -1>,
): ReduxShareTaskResult {
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
      maxText(bestRows.map((row) => normalizeRowType(row.question_type))) ?? question.questionType,
    questionHash: rowHash,
    ok: true,
    data:
      hasHashMismatch && shouldDowngradeMismatchedHashData(data)
        ? downgradeMismatchedHashData(data)
        : data,
    answerCount: slots.reduce((sum, slot) => sum + slot.slotAnswerCount, 0),
  };
}

export async function fetchReduxShareTasks(
  authSession: AuthSession,
  payload: FetchReduxShareTasksPayload,
  language?: LanguageSetting,
): Promise<FetchReduxShareTasksResult> {
  const t = getTranslator(language);

  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensureSession(authSession),
      results: payload.questions.map((question) => ({
        questionId: question.questionId,
        questionType: question.questionType,
        questionHash: question.questionHash,
        ok: false,
        error: t("errors.moodleIdsMissing"),
      })),
    };
  }

  const courseId = payload.courseId;
  const quizId = payload.quizId;

  try {
    const { authSession: nextAuthSession, result } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const rows = await queryQuizTaskRows(client, payload.domain, courseId, quizId);
        const votesByTaskId = await fetchMyVotes(
          client,
          session.user.id,
          rows.map((row) => row.id),
        );

        return { grouped: groupRowsByQuestionId(rows), votesByTaskId };
      },
    );

    return {
      authSession: nextAuthSession,
      results: payload.questions.map((question) =>
        buildTaskResult(
          question,
          question.questionId ? (result.grouped.get(question.questionId) ?? []) : [],
          result.votesByTaskId,
        ),
      ),
    };
  } catch (error) {
    throw toDataError(error, "errors.reduxAnswersFetchFailed");
  }
}

export async function voteTaskAnswer(
  authSession: AuthSession,
  payload: VoteTaskAnswerPayload,
): Promise<VoteTaskAnswerResult> {
  const projectId = requireFirebaseConfig().projectId;

  try {
    const { authSession: nextAuthSession, result } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const taskDocument = await client.getDocument(`tasks/${payload.taskId}`);

        if (!taskDocument) {
          throw new I18nError("errors.voteTaskMissing");
        }

        const task = mapTaskDocument(taskDocument);

        if (isTaskRowVerified(task)) {
          throw new I18nError("errors.voteUnverifiableOnly");
        }

        return performVoteToggle({
          client,
          projectId,
          votePath: `${TASK_VOTES_COLLECTION_ID}/${taskVoteDocumentId(payload.taskId, session.user.id)}`,
          documentPath: `tasks/${payload.taskId}`,
          voteFields: (value) => ({
            user: session.user.id,
            task_id: payload.taskId,
            value,
          }),
          value: payload.value,
        });
      },
    );

    return { authSession: nextAuthSession, ...result };
  } catch (error) {
    throw toDataError(error, "errors.voteSaveFailed");
  }
}

export async function fetchReduxShareQuizPreviewTasks(
  authSession: AuthSession,
  payload: { domain: string; courseId: number | null; quizId: number | null },
): Promise<{ authSession: AuthSession; results: QuizPreviewTaskResult[] }> {
  if (payload.courseId === null || payload.quizId === null) {
    throw new I18nError("errors.moodleIdsMissing");
  }

  const courseId = payload.courseId;
  const quizId = payload.quizId;

  try {
    const { authSession: nextAuthSession, result: rowsByQuestionId } =
      await withFirebaseSessionRetry(authSession, async (client) => {
        const rows = await queryQuizTaskRows(client, payload.domain, courseId, quizId);
        return groupRowsByQuestionId(rows);
      });

    const results: QuizPreviewTaskResult[] = [];
    const latestUpdateByQuestionId = new Map<string, string>();

    for (const [questionId, rows] of rowsByQuestionId) {
      const bestRows = pickBestHashRows(rows, {
        questionId,
        questionType: null,
        questionHash: null,
      });

      if (bestRows.length === 0) {
        continue;
      }

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
      latestUpdateByQuestionId.set(questionId, maxText(rows.map((row) => row.updated)) ?? "");
    }

    results.sort((left, right) =>
      (latestUpdateByQuestionId.get(right.questionId ?? "") ?? "").localeCompare(
        latestUpdateByQuestionId.get(left.questionId ?? "") ?? "",
      ),
    );

    return { authSession: nextAuthSession, results };
  } catch (error) {
    throw toDataError(error, "errors.reduxAnswersFetchFailed");
  }
}

async function commitInChunks(client: FirestoreClient, writes: FirestoreWrite[]): Promise<void> {
  for (let offset = 0; offset < writes.length; offset += COMMIT_CHUNK_SIZE) {
    await client.commit(writes.slice(offset, offset + COMMIT_CHUNK_SIZE));
  }
}

async function commitCreateWrites(
  client: FirestoreClient,
  writes: FirestoreWrite[],
): Promise<void> {
  for (let offset = 0; offset < writes.length; offset += COMMIT_CHUNK_SIZE) {
    const chunk = writes.slice(offset, offset + COMMIT_CHUNK_SIZE);

    try {
      await client.commit(chunk);
    } catch (error) {
      if (!isFirebasePreconditionError(error)) {
        throw error;
      }

      for (const write of chunk) {
        try {
          await client.commit([write]);
        } catch (writeError) {
          if (!isFirebasePreconditionError(writeError)) {
            throw writeError;
          }
        }
      }
    }
  }
}

function applyTaskIncrements(record: TaskRecord, increments: Record<string, number>) {
  record.correct_count = (record.correct_count ?? 0) + (increments.correct_count ?? 0);
  record.selected_correct_count =
    (record.selected_correct_count ?? 0) + (increments.selected_correct_count ?? 0);
  record.selected_incorrect_count =
    (record.selected_incorrect_count ?? 0) + (increments.selected_incorrect_count ?? 0);
  record.selected_unknown_count =
    (record.selected_unknown_count ?? 0) + (increments.selected_unknown_count ?? 0);
}

function buildSyntheticTaskRecord(entry: {
  id: string;
  identity: TaskIdentity;
  questionType: string | null;
  questionText: string | null;
  answerOptions: string[];
  slotIndex: number | null;
  answerLabel: string;
  correctCount: number;
  selectedCorrectCount: number;
  selectedIncorrectCount: number;
  selectedUnknownCount: number;
}): TaskRecord {
  return {
    id: entry.id,
    moodle_domain: entry.identity.moodleDomain,
    course_id: entry.identity.courseId,
    quiz_id: entry.identity.quizId,
    question_id: entry.identity.questionId,
    question_hash: entry.identity.questionHash,
    question_type: entry.questionType ?? "",
    question_text: entry.questionText,
    answer_options: serializeTaskAnswerOptions(entry.answerOptions),
    slot_key: entry.identity.slotKey,
    slot_index: entry.slotIndex,
    answer_key: entry.identity.answerKey,
    answer_label: entry.answerLabel,
    correct_count: entry.correctCount,
    selected_correct_count: entry.selectedCorrectCount,
    selected_incorrect_count: entry.selectedIncorrectCount,
    selected_unknown_count: entry.selectedUnknownCount,
    votes_up: 0,
    votes_down: 0,
    created: "",
    updated: "",
    expand: null,
  };
}

async function upsertReviewImport(
  client: FirestoreClient,
  projectId: string,
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
  const id = reviewImportDocumentId(entry.userId, entry.domain, entry.attemptKey);
  const path = `${REVIEW_IMPORTS_COLLECTION_ID}/${id}`;
  const existing = await client.getDocument(path);

  if (existing) {
    const record = mapReviewImportDocument(existing);

    await client.commit([
      updateDocumentWrite(projectId, path, {
        course_id: entry.courseId,
        quiz_id: entry.quizId,
        page_url: entry.pageUrl || record.page_url,
        imported_question_count: Math.max(record.imported_question_count ?? 0, entry.questionCount),
      }),
    ]);

    return { id, questionHashes: record.imported_question_hashes ?? {} };
  }

  try {
    await client.commit([
      createDocumentWrite(projectId, path, {
        user: entry.userId,
        moodle_domain: entry.domain,
        attempt_key: entry.attemptKey,
        course_id: entry.courseId,
        quiz_id: entry.quizId,
        page_url: entry.pageUrl,
        imported_question_count: entry.questionCount,
        imported_question_hashes: {},
      }),
    ]);
  } catch (error) {
    if (!isFirebasePreconditionError(error)) {
      throw error;
    }

    const winner = await client.getDocument(path);

    if (!winner) {
      throw error;
    }

    return {
      id,
      questionHashes: mapReviewImportDocument(winner).imported_question_hashes ?? {},
    };
  }

  return { id, questionHashes: {} };
}

export async function saveReduxShareReviewAnswers(
  authSession: AuthSession,
  payload: SaveReduxShareReviewPayload,
): Promise<SaveReduxShareReviewResult> {
  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensureSession(authSession),
      imported: false,
      savedCount: 0,
    };
  }

  const projectId = requireFirebaseConfig().projectId;
  const courseId = payload.courseId;
  const quizId = payload.quizId;
  const questions = normalizeReviewQuestions(payload.questions);

  try {
    const { authSession: nextAuthSession, result: savedCount } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const userId = session.user.id;
        const userDocument = await client.getDocument(`${USERS_COLLECTION_ID}/${userId}`);

        if (!userDocument) {
          throw new I18nError("errors.sessionExpired");
        }

        const userProfile = mapUserDocument(userDocument);

        if (payload.domain && userProfile.moodle_domain !== payload.domain) {
          await client.commit([
            updateDocumentWrite(projectId, `${USERS_COLLECTION_ID}/${userId}`, {
              moodle_domain: payload.domain,
            }),
          ]);
        }

        const contributorName = await fetchContributorName(client, session);
        const { id: reviewImportId, questionHashes: importedQuestionHashes } =
          await upsertReviewImport(client, projectId, {
            userId,
            domain: payload.domain,
            attemptKey: payload.attemptKey,
            courseId,
            quizId,
            pageUrl: payload.pageUrl,
            questionCount: questions.length,
          });

        const existingTasks = await queryQuizTaskRows(client, payload.domain, courseId, quizId);
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
        const createWrites: FirestoreWrite[] = [];
        const updateWrites: FirestoreWrite[] = [];

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
              const serializedOptions = serializeTaskAnswerOptions(mergedOptions);

              if (serializedOptions === (taskRow.answer_options ?? "")) {
                continue;
              }

              updateWrites.push(
                updateDocumentWrite(projectId, `${TASKS_COLLECTION_ID}/${taskRow.id}`, {
                  answer_options: serializedOptions,
                }),
              );
              taskRow.answer_options = serializedOptions;
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
            const identity: TaskIdentity = {
              moodleDomain: payload.domain,
              courseId,
              quizId,
              questionId: question.questionId,
              questionHash: question.questionHash,
              slotKey: answer.slotKey,
              answerKey: answer.key,
            };
            const identityKey = getTaskIdentityKey(identity);
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
              const fields: Record<string, unknown> = {
                answer_label: answer.label,
                last_contributor: userId,
                last_contributor_username: contributorName,
              };

              if (question.questionType) {
                fields.question_type = question.questionType;
              }

              if (question.questionText && !existing.question_text) {
                fields.question_text = question.questionText;
              }

              if (answer.slotIndex !== null) {
                fields.slot_index = answer.slotIndex;
              }

              const increments: Record<string, number> = {
                correct_count: correctDelta,
                selected_correct_count: selectedCorrectDelta,
                selected_incorrect_count: selectedIncorrectDelta,
                selected_unknown_count: selectedUnknownDelta,
              };

              updateWrites.push(
                updateDocumentWithIncrementsWrite(
                  projectId,
                  `${TASKS_COLLECTION_ID}/${existing.id}`,
                  fields,
                  increments,
                ),
              );
              applyTaskIncrements(existing, increments);
            } else {
              const docId = taskDocumentId(identity);
              const counters = {
                correctCount: correctDelta,
                selectedCorrectCount: selectedCorrectDelta,
                selectedIncorrectCount: selectedIncorrectDelta,
                selectedUnknownCount: selectedUnknownDelta,
              };

              createWrites.push(
                createDocumentWrite(projectId, `${TASKS_COLLECTION_ID}/${docId}`, {
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
                  correct_count: counters.correctCount,
                  selected_correct_count: counters.selectedCorrectCount,
                  selected_incorrect_count: counters.selectedIncorrectCount,
                  selected_unknown_count: counters.selectedUnknownCount,
                  first_contributor: userId,
                  first_contributor_username: contributorName,
                  last_contributor: userId,
                  last_contributor_username: contributorName,
                  votes_up: 0,
                  votes_down: 0,
                }),
              );
              tasksByIdentity.set(
                identityKey,
                buildSyntheticTaskRecord({
                  id: docId,
                  identity,
                  questionType: question.questionType,
                  questionText: question.questionText,
                  answerOptions: question.answerOptions,
                  slotIndex: answer.slotIndex,
                  answerLabel: answer.label,
                  ...counters,
                }),
              );
            }

            savedEntries += 1;
          }

          for (const tracked of trackedSelections.values()) {
            const identity: TaskIdentity = {
              moodleDomain: payload.domain,
              courseId,
              quizId,
              questionId: question.questionId,
              questionHash: question.questionHash,
              slotKey: tracked.slotKey,
              answerKey: tracked.key,
            };
            const identityKey = getTaskIdentityKey(identity);
            const existing = tasksByIdentity.get(identityKey);

            if (!existing) {
              continue;
            }

            const deltas = getSelectionTransitionDeltas(tracked.verdict, null, existing);
            const increments: Record<string, number> = {
              selected_correct_count: deltas.selectedCorrectDelta,
              selected_incorrect_count: deltas.selectedIncorrectDelta,
              selected_unknown_count: deltas.selectedUnknownDelta,
            };

            if (
              increments.selected_correct_count === 0 &&
              increments.selected_incorrect_count === 0 &&
              increments.selected_unknown_count === 0
            ) {
              continue;
            }

            updateWrites.push(
              incrementDocumentWrite(
                projectId,
                `${TASKS_COLLECTION_ID}/${existing.id}`,
                increments,
              ),
            );
            applyTaskIncrements(existing, increments);
            savedEntries += 1;
          }

          importedQuestionHashes[importKey] = contentHash;
          hashesChanged = true;
        }

        if (createWrites.length > 0) {
          await commitCreateWrites(client, createWrites);
        }

        if (updateWrites.length > 0) {
          await commitInChunks(client, updateWrites);
        }

        if (hashesChanged) {
          await client.commit([
            updateDocumentWrite(projectId, `${REVIEW_IMPORTS_COLLECTION_ID}/${reviewImportId}`, {
              imported_question_hashes: importedQuestionHashes,
            }),
          ]);
        }

        const userStats: Record<string, number> = {
          imported_questions_count: importedQuestions,
          attempt_correct_count: correctQuestions,
          attempt_incorrect_count: wrongQuestions,
        };

        if (
          userStats.imported_questions_count ||
          userStats.attempt_correct_count ||
          userStats.attempt_incorrect_count
        ) {
          await client.commit([
            incrementDocumentWrite(projectId, `${USERS_COLLECTION_ID}/${userId}`, userStats),
          ]);
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
    throw toDataError(error, "errors.reduxReviewSaveFailed");
  }
}

interface NormalizedUserAnswerSelection {
  questionId: string;
  questionType: string | null;
  questionHash: string;
  questionText: string | null;
  answerOptions: string[];
  answers: Array<{
    label: string;
    key: string;
    slotKey: string;
    slotIndex: number | null;
    verdict: SelectionVerdict;
  }>;
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

function getSelectionCounterField(verdict: SelectionVerdict) {
  return verdict === "correct"
    ? "selected_correct_count"
    : verdict === "incorrect"
      ? "selected_incorrect_count"
      : "selected_unknown_count";
}

export async function saveUserAnswerSelection(
  authSession: AuthSession,
  payload: SaveUserAnswerPayload,
): Promise<SaveUserAnswerResult> {
  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensureSession(authSession),
      savedCount: 0,
    };
  }

  const courseId = payload.courseId;
  const quizId = payload.quizId;
  const question = normalizeUserAnswerSelectionQuestion(payload.question);

  if (!question) {
    return {
      authSession: await ensureSession(authSession),
      savedCount: 0,
    };
  }

  const projectId = requireFirebaseConfig().projectId;

  try {
    const { authSession: nextAuthSession, result: savedCount } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const userId = session.user.id;
        const contributorName = await fetchContributorName(client, session);
        let savedEntries = 0;

        for (const answer of question.answers) {
          const counterField = getSelectionCounterField(answer.verdict);
          const identity: TaskIdentity = {
            moodleDomain: payload.domain,
            courseId,
            quizId,
            questionId: question.questionId,
            questionHash: question.questionHash,
            slotKey: answer.slotKey,
            answerKey: answer.key,
          };
          const path = `${TASKS_COLLECTION_ID}/${taskDocumentId(identity)}`;
          const existing = await client.getDocument(path);

          if (existing) {
            const record = mapTaskDocument(existing);
            const fields: Record<string, unknown> = {
              answer_label: answer.label,
              last_contributor: userId,
              last_contributor_username: contributorName,
            };

            if (question.questionType) {
              fields.question_type = question.questionType;
            }

            if (question.questionText && !record.question_text) {
              fields.question_text = question.questionText;
            }

            if (answer.slotIndex !== null) {
              fields.slot_index = answer.slotIndex;
            }

            await client.commit([
              updateDocumentWithIncrementsWrite(projectId, path, fields, {
                [counterField]: 1,
              }),
            ]);
          } else {
            const createWrite = createDocumentWrite(projectId, path, {
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
              first_contributor_username: contributorName,
              last_contributor: userId,
              last_contributor_username: contributorName,
              votes_up: 0,
              votes_down: 0,
            });

            try {
              await client.commit([createWrite]);
            } catch (error) {
              if (!isFirebasePreconditionError(error)) {
                throw error;
              }

              await client.commit([
                updateDocumentWithIncrementsWrite(
                  projectId,
                  path,
                  {
                    answer_label: answer.label,
                    last_contributor: userId,
                    last_contributor_username: contributorName,
                  },
                  { [counterField]: 1 },
                ),
              ]);
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
    throw toDataError(error, "errors.reduxReviewSaveFailed");
  }
}
