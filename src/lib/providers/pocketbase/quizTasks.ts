import type PocketBase from "pocketbase";
import type { AuthSession } from "../../../types";
import { getTranslator, I18nError } from "../../../i18n";
import type { LanguageSetting } from "../../../types";
import { ensurePocketBaseSession } from "../../auth";
import {
  REVIEW_IMPORTS_COLLECTION,
  TASKS_COLLECTION,
  TASK_VOTES_COLLECTION,
  USERS_COLLECTION,
  isNotFoundError,
  isValidationError,
  toI18nError,
  withPocketBaseSessionRetry,
} from "../../pocketbase";
import type {
  FetchReduxShareTasksPayload,
  FetchReduxShareTasksResult,
  NormalizedReviewAnswer,
  QuizPreviewTaskResult,
  ReviewImportRecord,
  SaveReduxShareReviewPayload,
  SaveReduxShareReviewResult,
  SaveUserAnswerPayload,
  SaveUserAnswerResult,
  SelectionVerdict,
  TaskRecord,
  TaskVoteRecord,
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

const VOTES_QUERY_CHUNK = 80;

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
