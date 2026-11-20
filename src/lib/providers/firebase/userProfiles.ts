import type { AuthSession } from "../../../types";
import { I18nError } from "../../../i18n";
import type {
  AttemptHistoryEntry,
  AuthenticatedProfileResult,
  FetchUserAttemptHistoryResult,
  FetchUserLeaderboardResult,
  LeaderboardEntry,
  PocketBaseUserRecord,
  UserAttemptHistory,
  UserLeaderboard,
  UserProfileSeed,
  UserProgressDelta,
} from "../../dataTypes";
import { toDataError } from "../../dataCore/errors";
import { mapUserRecord } from "../../dataCore/profileCore";
import { requireFirebaseConfig } from "./config";
import {
  createDocumentWrite,
  incrementDocumentWrite,
  updateDocumentWithIncrementsWrite,
  updateDocumentWrite,
} from "./firestore";
import { isFirebasePreconditionError } from "./http";
import { usernameDocumentId } from "./ids";
import { mapReviewImportDocument, mapUserDocument } from "./mappers";
import { withFirebaseSessionRetry } from "./session";

const USERS_COLLECTION_ID = "users";
const TASKS_COLLECTION_ID = "tasks";
const REVIEW_IMPORTS_COLLECTION_ID = "reviewImports";

function emailPrefix(email: string): string {
  return email.includes("@") ? email.split("@")[0] : "";
}

function mapLeaderboardEntry(record: PocketBaseUserRecord): LeaderboardEntry {
  return {
    id: record.id,
    username: record.username || emailPrefix(record.email) || "user",
    importedQuestionsCount: record.imported_questions_count ?? 0,
    attemptCorrectCount: record.attempt_correct_count ?? 0,
    attemptIncorrectCount: record.attempt_incorrect_count ?? 0,
  };
}

export async function touchUserProfile(
  authSession: AuthSession,
  moodleDomain: string | null,
  seed: UserProfileSeed = {},
): Promise<AuthenticatedProfileResult> {
  const projectId = requireFirebaseConfig().projectId;

  try {
    const { authSession: nextAuthSession, result } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const path = `${USERS_COLLECTION_ID}/${session.user.id}`;
        const document = await client.getDocument(path);

        if (!document) {
          const email = (seed.email ?? session.user.email ?? "").trim();
          const username = seed.username?.trim() || emailPrefix(email) || "user";
          const created = {
            email,
            username,
            moodle_domain: moodleDomain ?? "",
            solved_tests_count: 0,
            solved_tasks_count: 0,
            imported_questions_count: 0,
            attempt_correct_count: 0,
            attempt_incorrect_count: 0,
          };

          try {
            await client.commit([
              createDocumentWrite(projectId, path, created),
              createDocumentWrite(projectId, `usernames/${usernameDocumentId(username)}`, {
                user: session.user.id,
                username,
              }),
            ]);
          } catch (error) {
            if (!isFirebasePreconditionError(error)) {
              throw error;
            }

            const winner = await client.getDocument(path);

            if (winner) {
              return mapUserDocument(winner);
            }

            await client.commit([createDocumentWrite(projectId, path, created)]);
          }

          return { id: session.user.id, ...created };
        }

        const current = mapUserDocument(document);
        const patch: Record<string, unknown> = {};

        if (moodleDomain && moodleDomain !== current.moodle_domain) {
          patch.moodle_domain = moodleDomain;
        }

        if (seed.username && !current.username) {
          patch.username = seed.username;
        }

        if (Object.keys(patch).length === 0) {
          return current;
        }

        await client.commit([updateDocumentWrite(projectId, path, patch)]);

        return { ...current, ...patch };
      },
    );

    return {
      authSession: nextAuthSession,
      userProfile: mapUserRecord(result),
    };
  } catch (error) {
    throw toDataError(error, "errors.profileSaveFailed");
  }
}

export async function recordUserQuizProgress(
  authSession: AuthSession,
  { moodleDomain, solvedTestsDelta, solvedTasksDelta, username }: UserProgressDelta,
): Promise<AuthenticatedProfileResult> {
  const projectId = requireFirebaseConfig().projectId;

  try {
    const { authSession: nextAuthSession, result } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const path = `${USERS_COLLECTION_ID}/${session.user.id}`;
        const document = await client.getDocument(path);

        if (!document) {
          throw new I18nError("errors.sessionExpired");
        }

        const current = mapUserDocument(document);
        const testsDelta = Math.max(0, Math.trunc(solvedTestsDelta) || 0);
        const tasksDelta = Math.max(0, Math.trunc(solvedTasksDelta) || 0);
        const fields: Record<string, unknown> = {};
        const increments: Record<string, number> = {};

        if (moodleDomain && moodleDomain !== current.moodle_domain) {
          fields.moodle_domain = moodleDomain;
        }

        if (username && !current.username) {
          fields.username = username;
        }

        if (testsDelta > 0) {
          increments.solved_tests_count = testsDelta;
        }

        if (tasksDelta > 0) {
          increments.solved_tasks_count = tasksDelta;
        }

        if (Object.keys(fields).length === 0 && Object.keys(increments).length === 0) {
          return current;
        }

        await client.commit([
          Object.keys(fields).length > 0
            ? updateDocumentWithIncrementsWrite(projectId, path, fields, increments)
            : incrementDocumentWrite(projectId, path, increments),
        ]);

        return {
          ...current,
          moodle_domain:
            typeof fields.moodle_domain === "string" ? fields.moodle_domain : current.moodle_domain,
          username: typeof fields.username === "string" ? fields.username : current.username,
          solved_tests_count: (current.solved_tests_count ?? 0) + testsDelta,
          solved_tasks_count: (current.solved_tasks_count ?? 0) + tasksDelta,
        };
      },
    );

    return {
      authSession: nextAuthSession,
      userProfile: mapUserRecord(result),
    };
  } catch (error) {
    throw toDataError(error, "errors.progressUpdateFailed");
  }
}

export async function fetchOwnUserProfile(
  authSession: AuthSession,
): Promise<AuthenticatedProfileResult> {
  try {
    const { authSession: nextAuthSession, result } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const document = await client.getDocument(`${USERS_COLLECTION_ID}/${session.user.id}`);

        if (!document) {
          throw new I18nError("errors.sessionExpired");
        }

        return mapUserDocument(document);
      },
    );

    return {
      authSession: nextAuthSession,
      userProfile: mapUserRecord(result),
    };
  } catch (error) {
    throw toDataError(error, "errors.profileLoadFailed");
  }
}

export async function fetchUserLeaderboard(
  authSession: AuthSession,
  limit = 10,
): Promise<FetchUserLeaderboardResult> {
  try {
    const { authSession: nextAuthSession, result } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const top = await client.runQuery(USERS_COLLECTION_ID, {
          filters: [{ field: "imported_questions_count", op: "GREATER_THAN", value: 0 }],
          orderBy: [{ field: "imported_questions_count", direction: "DESCENDING" }],
          limit,
        });
        const meDocument = await client.getDocument(`${USERS_COLLECTION_ID}/${session.user.id}`);

        if (!meDocument) {
          throw new I18nError("errors.sessionExpired");
        }

        const me = mapUserDocument(meDocument);
        const myImported = me.imported_questions_count ?? 0;
        const myRank =
          myImported > 0
            ? (await client.runCount(USERS_COLLECTION_ID, {
                filters: [
                  {
                    field: "imported_questions_count",
                    op: "GREATER_THAN",
                    value: myImported,
                  },
                ],
              })) + 1
            : null;
        const totalContributors = await client.runCount(USERS_COLLECTION_ID, {
          filters: [{ field: "imported_questions_count", op: "GREATER_THAN", value: 0 }],
        });
        const totalAnswerRows = await client.runCount(TASKS_COLLECTION_ID);

        const leaderboard: UserLeaderboard = {
          entries: top.map((document) => mapLeaderboardEntry(mapUserDocument(document))),
          myRank,
          totalContributors,
          totalAnswerRows,
        };

        return leaderboard;
      },
    );

    return { authSession: nextAuthSession, leaderboard: result };
  } catch (error) {
    throw toDataError(error, "errors.leaderboardLoadFailed");
  }
}

export async function fetchUserAttemptHistory(
  authSession: AuthSession,
  limit = 20,
): Promise<FetchUserAttemptHistoryResult> {
  try {
    const { authSession: nextAuthSession, result } = await withFirebaseSessionRetry(
      authSession,
      async (client, session) => {
        const filters = [{ field: "user", value: session.user.id }];
        const documents = await client.runQuery(REVIEW_IMPORTS_COLLECTION_ID, { filters });
        const total = await client.runCount(REVIEW_IMPORTS_COLLECTION_ID, { filters });
        const entries: AttemptHistoryEntry[] = documents
          .map(mapReviewImportDocument)
          .map((record) => ({
            id: record.id,
            domain: record.moodle_domain ?? "",
            courseId: record.course_id,
            quizId: record.quiz_id,
            pageUrl: record.page_url,
            importedQuestionsCount: record.imported_question_count ?? 0,
            updatedAt: record.updated ?? record.created ?? null,
          }))
          .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
          .slice(0, limit);

        const history: UserAttemptHistory = { entries, total };

        return history;
      },
    );

    return { authSession: nextAuthSession, history: result };
  } catch (error) {
    throw toDataError(error, "errors.attemptHistoryLoadFailed");
  }
}
