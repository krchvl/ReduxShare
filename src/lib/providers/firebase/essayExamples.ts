import type { AuthSession } from "../../../types";
import { I18nError } from "../../../i18n";
import type {
  EssayExampleItem,
  EssayExampleRecord,
  FetchEssayExamplesPayload,
  FetchEssayExamplesResult,
  SaveEssayExamplePayload,
  SaveEssayExampleResult,
  VoteEssayExamplePayload,
  VoteEssayExampleResult,
} from "../../dataTypes";
import { toDataError } from "../../dataCore/errors";
import {
  ESSAY_EXAMPLE_MAX_LENGTH,
  ESSAY_EXAMPLE_QUESTION_TEXT_MAX_LENGTH,
  compareEssayExamples,
  toEssayExampleItem,
} from "../../dataCore/essayCore";
import { ensureSession } from "../../auth";
import { requireFirebaseConfig } from "./config";
import { createDocumentWrite, updateDocumentWrite, type FirestoreClient } from "./firestore";
import { isFirebasePreconditionError } from "./http";
import { essayExampleDocumentId, essayVoteDocumentId } from "./ids";
import { mapEssayExampleDocument } from "./mappers";
import { fetchContributorName, withFirebaseSessionRetry } from "./session";
import { performVoteToggle } from "./votes";

const ESSAY_EXAMPLES_COLLECTION_ID = "essayExamples";
const ESSAY_VOTES_COLLECTION_ID = "essayVotes";
const ESSAY_VOTES_QUERY_CHUNK = 100;

function clampText(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return trimmed.slice(0, maxLength);
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

async function fetchMyEssayVotes(
  client: FirestoreClient,
  userId: string,
  exampleIds: string[],
): Promise<Map<string, 1 | -1>> {
  const votes = new Map<string, 1 | -1>();

  for (let offset = 0; offset < exampleIds.length; offset += ESSAY_VOTES_QUERY_CHUNK) {
    const chunk = exampleIds.slice(offset, offset + ESSAY_VOTES_QUERY_CHUNK);
    const documents = await client.batchGet(
      chunk.map(
        (exampleId) => `${ESSAY_VOTES_COLLECTION_ID}/${essayVoteDocumentId(exampleId, userId)}`,
      ),
    );

    for (const document of documents) {
      if (!document) {
        continue;
      }

      const exampleId =
        typeof document.fields.example_id === "string" ? document.fields.example_id : "";

      if (!exampleId) {
        continue;
      }

      votes.set(exampleId, document.fields.value === -1 ? -1 : 1);
    }
  }

  return votes;
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

  const projectId = requireFirebaseConfig().projectId;

  try {
    const { authSession: nextAuthSession, result: example } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const contributorName = await fetchContributorName(client, session);
        const docId = essayExampleDocumentId({
          userId: session.user.id,
          moodleDomain: payload.domain,
          courseId: payload.courseId as number,
          quizId: payload.quizId as number,
          questionId: payload.questionId ?? "",
          questionHash: payload.questionHash ?? "",
        });
        const path = `${ESSAY_EXAMPLES_COLLECTION_ID}/${docId}`;
        const fields = {
          moodle_domain: payload.domain,
          course_id: payload.courseId as number,
          quiz_id: payload.quizId as number,
          question_id: payload.questionId ?? "",
          question_hash: payload.questionHash ?? "",
          question_type: "essay",
          question_text: clampText(
            payload.questionText ?? "",
            ESSAY_EXAMPLE_QUESTION_TEXT_MAX_LENGTH,
          ),
          body,
        };
        const existing = await client.getDocument(path);

        if (existing) {
          await client.commit([updateDocumentWrite(projectId, path, fields)]);
        } else {
          try {
            await client.commit([
              createDocumentWrite(projectId, path, {
                ...fields,
                user: session.user.id,
                author_name: contributorName,
                votes_up: 0,
                votes_down: 0,
              }),
            ]);
          } catch (error) {
            if (!isFirebasePreconditionError(error)) {
              throw error;
            }

            await client.commit([updateDocumentWrite(projectId, path, fields)]);
          }
        }

        const saved = await client.getDocument(path);
        const record = saved
          ? mapEssayExampleDocument(saved)
          : {
              id: docId,
              ...fields,
              votes_up: 0,
              votes_down: 0,
              created: "",
              updated: "",
              expand: { user: { username: contributorName } },
            };

        return toEssayExampleItem(record, 0);
      },
    );

    return { authSession: nextAuthSession, example };
  } catch (error) {
    throw toDataError(error, "errors.essaySaveFailed");
  }
}

export async function fetchEssayExamples(
  authSession: AuthSession,
  payload: FetchEssayExamplesPayload,
): Promise<FetchEssayExamplesResult> {
  if (payload.courseId === null || payload.quizId === null) {
    return {
      authSession: await ensureSession(authSession),
      results: payload.questions.map((question) => ({
        questionId: question.questionId,
        questionHash: question.questionHash,
        ok: false,
        examples: [],
      })),
    };
  }

  const courseId = payload.courseId;
  const quizId = payload.quizId;

  try {
    const { authSession: nextAuthSession, result: rowsByQuestionKeyAndVotes } =
      await withFirebaseSessionRetry(authSession, async (client, session) => {
        const documents = await client.runQuery(ESSAY_EXAMPLES_COLLECTION_ID, {
          filters: [
            { field: "moodle_domain", value: payload.domain },
            { field: "course_id", value: courseId },
            { field: "quiz_id", value: quizId },
          ],
        });
        const rows = documents.map(mapEssayExampleDocument);
        const votesByExampleId = await fetchMyEssayVotes(
          client,
          session.user.id,
          rows.map((row) => row.id),
        );

        return { grouped: groupRowsByQuestionKey(rows), votesByExampleId };
      });

    return {
      authSession: nextAuthSession,
      results: payload.questions.map((question) => {
        const key = question.questionId
          ? `id:${question.questionId}`
          : `hash:${question.questionHash ?? ""}`;
        const rows = rowsByQuestionKeyAndVotes.grouped.get(key) ?? [];
        const examples: EssayExampleItem[] = rows
          .map((row) =>
            toEssayExampleItem(row, rowsByQuestionKeyAndVotes.votesByExampleId.get(row.id) ?? 0),
          )
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
    throw toDataError(error, "errors.essayExamplesFetchFailed");
  }
}

export async function voteEssayExample(
  authSession: AuthSession,
  payload: VoteEssayExamplePayload,
): Promise<VoteEssayExampleResult> {
  const projectId = requireFirebaseConfig().projectId;

  try {
    const { authSession: nextAuthSession, result } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const exampleDocument = await client.getDocument(
          `${ESSAY_EXAMPLES_COLLECTION_ID}/${payload.exampleId}`,
        );

        if (!exampleDocument) {
          throw new I18nError("errors.essayVoteFailed");
        }

        return performVoteToggle({
          client,
          projectId,
          votePath: `${ESSAY_VOTES_COLLECTION_ID}/${essayVoteDocumentId(
            payload.exampleId,
            session.user.id,
          )}`,
          documentPath: `${ESSAY_EXAMPLES_COLLECTION_ID}/${payload.exampleId}`,
          voteFields: (value) => ({
            user: session.user.id,
            example_id: payload.exampleId,
            value,
          }),
          value: payload.value,
        });
      },
    );

    return { authSession: nextAuthSession, ...result };
  } catch (error) {
    throw toDataError(error, "errors.essayVoteFailed");
  }
}
