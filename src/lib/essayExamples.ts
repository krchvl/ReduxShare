import type PocketBase from "pocketbase";
import type { AuthSession } from "../types";
import { I18nError } from "../i18n";
import { ensurePocketBaseSession } from "./auth";
import {
  ESSAY_EXAMPLES_COLLECTION,
  ESSAY_VOTES_COLLECTION,
  isNotFoundError,
  isValidationError,
  toI18nError,
  withPocketBaseSessionRetry,
} from "./pocketbase";

export const ESSAY_EXAMPLE_MAX_LENGTH = 20000;
export const ESSAY_EXAMPLE_QUESTION_TEXT_MAX_LENGTH = 2000;

const ESSAY_VOTES_QUERY_CHUNK = 80;

export interface EssayExampleRequest {
  questionId: string | null;
  questionHash: string | null;
}

export interface EssayExampleItem {
  exampleId: string;
  questionId: string;
  questionHash: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  votesUp: number;
  votesDown: number;
  myVote: 1 | -1 | 0;
}

interface EssayExampleRecord {
  id: string;
  moodle_domain: string;
  course_id: number;
  quiz_id: number;
  question_id: string;
  question_hash: string;
  question_type: string;
  question_text?: string | null;
  body: string;
  votes_up?: number | null;
  votes_down?: number | null;
  created: string;
  updated: string;
  expand?: {
    user?: { username?: unknown } | null;
  } | null;
}

interface EssayVoteRecord {
  id: string;
  example: string;
  user: string;
  value: number;
}

export interface SaveEssayExamplePayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questionId: string | null;
  questionHash: string | null;
  questionText?: string | null;
  body: string;
}

export interface SaveEssayExampleResult {
  authSession: AuthSession;
  example: EssayExampleItem;
}

export interface FetchEssayExamplesPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: EssayExampleRequest[];
}

export interface FetchEssayExamplesResultItem {
  questionId: string | null;
  questionHash: string | null;
  ok: boolean;
  examples: EssayExampleItem[];
}

export interface FetchEssayExamplesResult {
  authSession: AuthSession;
  results: FetchEssayExamplesResultItem[];
}

export interface VoteEssayExamplePayload {
  exampleId: string;
  value: 1 | -1;
}

export interface VoteEssayExampleResult {
  authSession: AuthSession;
  votesUp: number;
  votesDown: number;
  myVote: 1 | -1 | 0;
}

export function isDownvotedEssayExample(item: Pick<EssayExampleItem, "votesUp" | "votesDown">) {
  return (item.votesDown ?? 0) > (item.votesUp ?? 0);
}

function clampText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength);
}

function getRowAuthorName(record: EssayExampleRecord) {
  const username = record.expand?.user?.username;

  return typeof username === "string" && username ? username : null;
}

function toEssayExampleItem(record: EssayExampleRecord, myVote: 1 | -1 | 0): EssayExampleItem {
  return {
    exampleId: record.id,
    questionId: record.question_id,
    questionHash: record.question_hash,
    body: record.body,
    authorName: getRowAuthorName(record),
    createdAt: record.created,
    updatedAt: record.updated,
    votesUp: Math.max(record.votes_up ?? 0, 0),
    votesDown: Math.max(record.votes_down ?? 0, 0),
    myVote,
  };
}

function netVotes(item: Pick<EssayExampleItem, "votesUp" | "votesDown">) {
  return (item.votesUp ?? 0) - (item.votesDown ?? 0);
}

function compareEssayExamples(a: EssayExampleItem, b: EssayExampleItem): number {
  const aDubious = isDownvotedEssayExample(a) ? 1 : 0;
  const bDubious = isDownvotedEssayExample(b) ? 1 : 0;

  if (aDubious !== bDubious) {
    return aDubious - bDubious;
  }

  const netDiff = netVotes(b) - netVotes(a);

  if (netDiff !== 0) {
    return netDiff;
  }

  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
}

async function findOwnEssayExample(
  pb: PocketBase,
  userId: string,
  payload: SaveEssayExamplePayload,
): Promise<EssayExampleRecord | null> {
  try {
    return await pb.collection(ESSAY_EXAMPLES_COLLECTION).getFirstListItem<EssayExampleRecord>(
      pb.filter(
        "user = {:user} && moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz} && question_id = {:qid} && question_hash = {:qhash}",
        {
          user: userId,
          domain: payload.domain,
          course: payload.courseId as number,
          quiz: payload.quizId as number,
          qid: payload.questionId ?? "",
          qhash: payload.questionHash ?? "",
        },
      ),
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function findOwnEssayVote(
  pb: PocketBase,
  userId: string,
  exampleId: string,
): Promise<EssayVoteRecord | null> {
  try {
    return await pb.collection(ESSAY_VOTES_COLLECTION).getFirstListItem<EssayVoteRecord>(
      pb.filter("example = {:example} && user = {:user}", {
        example: exampleId,
        user: userId,
      }),
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function fetchMyEssayVotes(
  pb: PocketBase,
  userId: string,
  exampleIds: string[],
): Promise<Map<string, 1 | -1>> {
  const votes = new Map<string, 1 | -1>();

  for (let offset = 0; offset < exampleIds.length; offset += ESSAY_VOTES_QUERY_CHUNK) {
    const chunk = exampleIds.slice(offset, offset + ESSAY_VOTES_QUERY_CHUNK);
    const terms = chunk.map((_, index) => `example = {:example${index}}`);
    const params = Object.fromEntries(
      chunk.map((exampleId, index) => [`example${index}`, exampleId]),
    );
    const voteRows = await pb.collection(ESSAY_VOTES_COLLECTION).getFullList<EssayVoteRecord>({
      filter: pb.filter(`user = {:user} && (${terms.join(" || ")})`, {
        user: userId,
        ...params,
      }),
    });

    for (const voteRow of voteRows) {
      votes.set(voteRow.example, voteRow.value === -1 ? -1 : 1);
    }
  }

  return votes;
}

function groupRowsByQuestionKey(rows: EssayExampleRecord[]) {
  const grouped = new Map<string, EssayExampleRecord[]>();

  for (const row of rows) {
    const key = row.question_id ? `id:${row.question_id}` : `hash:${row.question_hash}`;
    const group = grouped.get(key) ?? [];

    group.push(row);
    grouped.set(key, group);
  }

  return grouped;
}

export async function saveEssayExample(
  authSession: AuthSession,
  payload: SaveEssayExamplePayload,
): Promise<SaveEssayExampleResult> {
  if (payload.courseId === null || payload.quizId === null) {
    throw new I18nError("errors.moodleIdsMissing");
  }

  const body = clampText(payload.body ?? "", ESSAY_EXAMPLE_MAX_LENGTH);

  if (!body) {
    throw new I18nError("errors.essaySaveEmpty");
  }

  try {
    const { authSession: nextAuthSession, result: example } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        const normalized = {
          domain: payload.domain,
          courseId: payload.courseId as number,
          quizId: payload.quizId as number,
          questionId: payload.questionId ?? "",
          questionHash: payload.questionHash ?? "",
          questionType: "essay",
          questionText: clampText(
            payload.questionText ?? "",
            ESSAY_EXAMPLE_QUESTION_TEXT_MAX_LENGTH,
          ),
          body,
        };
        const existing = await findOwnEssayExample(pb, session.user.id, payload);
        const recordFields = {
          moodle_domain: normalized.domain,
          course_id: normalized.courseId,
          quiz_id: normalized.quizId,
          question_id: normalized.questionId,
          question_hash: normalized.questionHash,
          question_type: normalized.questionType,
          question_text: normalized.questionText,
          body: normalized.body,
        };

        if (existing) {
          const updated = await pb
            .collection(ESSAY_EXAMPLES_COLLECTION)
            .update<EssayExampleRecord>(existing.id, recordFields);

          return toEssayExampleItem(updated, 0);
        }

        try {
          const created = await pb
            .collection(ESSAY_EXAMPLES_COLLECTION)
            .create<EssayExampleRecord>({
              ...recordFields,
              user: session.user.id,
            });

          return toEssayExampleItem(created, 0);
        } catch (error) {
          if (!isValidationError(error)) {
            throw error;
          }

          const winner = await findOwnEssayExample(pb, session.user.id, payload);

          if (!winner) {
            throw error;
          }

          const updated = await pb
            .collection(ESSAY_EXAMPLES_COLLECTION)
            .update<EssayExampleRecord>(winner.id, recordFields);

          return toEssayExampleItem(updated, 0);
        }
      },
    );

    return { authSession: nextAuthSession, example };
  } catch (error) {
    throw toI18nError(error, "errors.essaySaveFailed");
  }
}

export async function fetchEssayExamples(
  authSession: AuthSession,
  payload: FetchEssayExamplesPayload,
): Promise<FetchEssayExamplesResult> {
  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensurePocketBaseSession(authSession),
      results: payload.questions.map((question) => ({
        questionId: question.questionId,
        questionHash: question.questionHash,
        ok: false,
        examples: [],
      })),
    };
  }

  try {
    const { authSession: nextAuthSession, result: rowsByQuestionKeyAndVotes } =
      await withPocketBaseSessionRetry(authSession, async (pb, session) => {
        const questionIdTerms: string[] = [];
        const queryParams: Record<string, string | number> = {
          domain: payload.domain,
          course: payload.courseId as number,
          quiz: payload.quizId as number,
        };
        let termIndex = 0;

        for (const question of payload.questions) {
          if (question.questionId) {
            queryParams[`qid${termIndex}`] = question.questionId;
            questionIdTerms.push(`question_id = {:qid${termIndex}}`);
            termIndex += 1;
          } else if (question.questionHash) {
            queryParams[`qhash${termIndex}`] = question.questionHash;
            questionIdTerms.push(`question_id = '' && question_hash = {:qhash${termIndex}}`);
            termIndex += 1;
          }
        }

        let allRows: EssayExampleRecord[] = [];

        if (questionIdTerms.length > 0) {
          allRows = await pb.collection(ESSAY_EXAMPLES_COLLECTION).getFullList<EssayExampleRecord>({
            filter: pb.filter(
              `moodle_domain = {:domain} && course_id = {:course} && quiz_id = {:quiz} && (${questionIdTerms.join(" || ")})`,
              queryParams,
            ),
            sort: "-updated",
            expand: "user",
          });
        }

        const votesByExampleId = await fetchMyEssayVotes(
          pb,
          session.user.id,
          allRows.map((row) => row.id),
        );

        return { grouped: groupRowsByQuestionKey(allRows), votesByExampleId };
      });

    const rowsByQuestionKey = rowsByQuestionKeyAndVotes.grouped;
    const votesByExampleId = rowsByQuestionKeyAndVotes.votesByExampleId;

    return {
      authSession: nextAuthSession,
      results: payload.questions.map((question) => {
        const key = question.questionId
          ? `id:${question.questionId}`
          : `hash:${question.questionHash ?? ""}`;
        const rows = rowsByQuestionKey.get(key) ?? [];
        const examples = rows
          .map((row) => toEssayExampleItem(row, votesByExampleId.get(row.id) ?? 0))
          .sort(compareEssayExamples);

        return {
          questionId: question.questionId,
          questionHash: question.questionHash,
          ok: true,
          examples,
        };
      }),
    };
  } catch (error) {
    throw toI18nError(error, "errors.essayExamplesFetchFailed");
  }
}

export async function voteEssayExample(
  authSession: AuthSession,
  payload: VoteEssayExamplePayload,
): Promise<VoteEssayExampleResult> {
  try {
    const { authSession: nextAuthSession, result } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        const existingVote = await findOwnEssayVote(pb, session.user.id, payload.exampleId);
        let upDelta = 0;
        let downDelta = 0;
        let myVote: 1 | -1 | 0;

        if (!existingVote) {
          try {
            await pb.collection(ESSAY_VOTES_COLLECTION).create({
              example: payload.exampleId,
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

            const winner = await findOwnEssayVote(pb, session.user.id, payload.exampleId);

            if (!winner) {
              throw error;
            }

            if ((winner.value === -1 ? -1 : 1) !== payload.value) {
              await pb.collection(ESSAY_VOTES_COLLECTION).update(winner.id, {
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
          await pb.collection(ESSAY_VOTES_COLLECTION).delete(existingVote.id);

          if (payload.value === 1) {
            upDelta -= 1;
          } else {
            downDelta -= 1;
          }

          myVote = 0;
        } else {
          await pb.collection(ESSAY_VOTES_COLLECTION).update(existingVote.id, {
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
          await pb
            .collection(ESSAY_EXAMPLES_COLLECTION)
            .update<EssayExampleRecord>(payload.exampleId, {
              "votes_up+": upDelta,
              "votes_down+": downDelta,
            });
        }

        const finalExample = await pb
          .collection(ESSAY_EXAMPLES_COLLECTION)
          .getOne<EssayExampleRecord>(payload.exampleId, {
            fields: "id,votes_up,votes_down",
          });
        const votesUp = Math.max(finalExample.votes_up ?? 0, 0);
        const votesDown = Math.max(finalExample.votes_down ?? 0, 0);

        if (
          votesUp !== (finalExample.votes_up ?? 0) ||
          votesDown !== (finalExample.votes_down ?? 0)
        ) {
          await pb
            .collection(ESSAY_EXAMPLES_COLLECTION)
            .update<EssayExampleRecord>(payload.exampleId, {
              votes_up: votesUp,
              votes_down: votesDown,
            });
        }

        return { votesUp, votesDown, myVote };
      },
    );

    return { authSession: nextAuthSession, ...result };
  } catch (error) {
    throw toI18nError(error, "errors.essayVoteFailed");
  }
}
