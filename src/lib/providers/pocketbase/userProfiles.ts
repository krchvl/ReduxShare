import type PocketBase from "pocketbase";
import type { AuthSession } from "../../../types";
import {
  REVIEW_IMPORTS_COLLECTION,
  TASKS_COLLECTION,
  USERS_COLLECTION,
  isNotFoundError,
  toI18nError,
  withPocketBaseSessionRetry,
} from "../../pocketbase";
import type { ReviewImportRecord } from "../../dataTypes";
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
import { AuthError } from "../../auth";
import { mapUserRecord } from "../../dataCore/profileCore";

async function getOwnUserRecord(pb: PocketBase, userId: string): Promise<PocketBaseUserRecord> {
  try {
    return await pb.collection(USERS_COLLECTION).getOne<PocketBaseUserRecord>(userId);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new AuthError("errors.sessionExpired");
    }

    throw error;
  }
}

export async function touchUserProfile(
  authSession: AuthSession,
  moodleDomain: string | null,
  seed: UserProfileSeed = {},
): Promise<AuthenticatedProfileResult> {
  try {
    const { authSession: nextAuthSession, result } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        const current = await getOwnUserRecord(pb, session.user.id);
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

        return pb.collection(USERS_COLLECTION).update<PocketBaseUserRecord>(session.user.id, patch);
      },
    );

    return {
      authSession: nextAuthSession,
      userProfile: mapUserRecord(result),
    };
  } catch (error) {
    throw toI18nError(error, "errors.profileSaveFailed");
  }
}

export async function recordUserQuizProgress(
  authSession: AuthSession,
  { moodleDomain, solvedTestsDelta, solvedTasksDelta, username }: UserProgressDelta,
): Promise<AuthenticatedProfileResult> {
  try {
    const { authSession: nextAuthSession, result } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        const current = await getOwnUserRecord(pb, session.user.id);
        const testsDelta = Math.max(0, Math.trunc(solvedTestsDelta) || 0);
        const tasksDelta = Math.max(0, Math.trunc(solvedTasksDelta) || 0);
        const patch: Record<string, unknown> = {};

        if (moodleDomain && moodleDomain !== current.moodle_domain) {
          patch.moodle_domain = moodleDomain;
        }

        if (username && !current.username) {
          patch.username = username;
        }

        if (testsDelta > 0) {
          patch.solved_tests_count = (current.solved_tests_count ?? 0) + testsDelta;
        }

        if (tasksDelta > 0) {
          patch.solved_tasks_count = (current.solved_tasks_count ?? 0) + tasksDelta;
        }

        if (Object.keys(patch).length === 0) {
          return current;
        }

        return pb.collection(USERS_COLLECTION).update<PocketBaseUserRecord>(session.user.id, patch);
      },
    );

    return {
      authSession: nextAuthSession,
      userProfile: mapUserRecord(result),
    };
  } catch (error) {
    throw toI18nError(error, "errors.progressUpdateFailed");
  }
}

export async function fetchOwnUserProfile(
  authSession: AuthSession,
): Promise<AuthenticatedProfileResult> {
  try {
    const { authSession: nextAuthSession, result } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => getOwnUserRecord(pb, session.user.id),
    );

    return {
      authSession: nextAuthSession,
      userProfile: mapUserRecord(result),
    };
  } catch (error) {
    throw toI18nError(error, "errors.profileLoadFailed");
  }
}

function mapLeaderboardEntry(record: PocketBaseUserRecord): LeaderboardEntry {
  return {
    id: record.id,
    username: record.username || record.email.split("@")[0] || "user",
    importedQuestionsCount: record.imported_questions_count ?? 0,
    attemptCorrectCount: record.attempt_correct_count ?? 0,
    attemptIncorrectCount: record.attempt_incorrect_count ?? 0,
  };
}

export async function fetchUserLeaderboard(
  authSession: AuthSession,
  limit = 10,
): Promise<FetchUserLeaderboardResult> {
  try {
    const { authSession: nextAuthSession, result } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        const top = await pb.collection(USERS_COLLECTION).getList<PocketBaseUserRecord>(1, limit, {
          filter: "imported_questions_count > 0",
          sort: "-imported_questions_count",
        });

        const me = await getOwnUserRecord(pb, session.user.id);
        const myImported = me.imported_questions_count ?? 0;

        let myRank: number | null = null;

        if (myImported > 0) {
          const ahead = await pb.collection(USERS_COLLECTION).getList(1, 1, {
            filter: pb.filter("imported_questions_count > {:count}", { count: myImported }),
          });
          myRank = ahead.totalItems + 1;
        }

        const contributors = await pb.collection(USERS_COLLECTION).getList(1, 1, {
          filter: "imported_questions_count > 0",
        });
        const answerRows = await pb.collection(TASKS_COLLECTION).getList(1, 1, {});

        const leaderboard: UserLeaderboard = {
          entries: top.items.map(mapLeaderboardEntry),
          myRank,
          totalContributors: contributors.totalItems,
          totalAnswerRows: answerRows.totalItems,
        };

        return leaderboard;
      },
    );

    return { authSession: nextAuthSession, leaderboard: result };
  } catch (error) {
    throw toI18nError(error, "errors.leaderboardLoadFailed");
  }
}

function mapAttemptHistoryEntry(record: ReviewImportRecord): AttemptHistoryEntry {
  return {
    id: record.id,
    domain: record.moodle_domain ?? "",
    courseId: record.course_id,
    quizId: record.quiz_id,
    pageUrl: record.page_url,
    importedQuestionsCount: record.imported_question_count ?? 0,
    updatedAt: record.updated ?? record.created ?? null,
  };
}

export async function fetchUserAttemptHistory(
  authSession: AuthSession,
  limit = 20,
): Promise<FetchUserAttemptHistoryResult> {
  try {
    const { authSession: nextAuthSession, result } = await withPocketBaseSessionRetry(
      authSession,
      async (pb, session) => {
        const imports = await pb
          .collection(REVIEW_IMPORTS_COLLECTION)
          .getList<ReviewImportRecord>(1, limit, {
            filter: pb.filter("user = {:user}", { user: session.user.id }),
            sort: "-updated",
          });

        const history: UserAttemptHistory = {
          entries: imports.items.map(mapAttemptHistoryEntry),
          total: imports.totalItems,
        };

        return history;
      },
    );

    return { authSession: nextAuthSession, history: result };
  } catch (error) {
    throw toI18nError(error, "errors.attemptHistoryLoadFailed");
  }
}
