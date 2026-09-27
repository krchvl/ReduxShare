import type PocketBase from "pocketbase";
import type { AuthSession, UserProfile } from "../types";
import { FETCH_LEADERBOARD_MESSAGE, FETCH_OWN_PROFILE_MESSAGE } from "../shared/messages";
import {
  TASKS_COLLECTION,
  USERS_COLLECTION,
  isNotFoundError,
  toI18nError,
  withPocketBaseSessionRetry,
} from "./pocketbase";
import { AuthError } from "./auth";

export interface PocketBaseUserRecord {
  id: string;
  email: string;
  username: string;
  moodle_domain: string;
  solved_tests_count: number | null;
  solved_tasks_count: number | null;
  imported_questions_count: number | null;
  attempt_correct_count: number | null;
  attempt_incorrect_count: number | null;
}

interface UserProfileSeed {
  email?: string | null;
  username?: string | null;
}

interface UserProgressDelta {
  moodleDomain: string | null;
  solvedTestsDelta: number;
  solvedTasksDelta: number;
  email?: string | null;
  username?: string | null;
}

export interface AuthenticatedProfileResult {
  authSession: AuthSession;
  userProfile: UserProfile;
}

export function mapUserRecord(record: PocketBaseUserRecord): UserProfile {
  return {
    id: record.id,
    email: record.email,
    username: record.username,
    moodleDomain: record.moodle_domain || null,
    solvedTestsCount: record.solved_tests_count ?? 0,
    solvedTasksCount: record.solved_tasks_count ?? 0,
    importedQuestionsCount: record.imported_questions_count ?? 0,
    attemptCorrectCount: record.attempt_correct_count ?? 0,
    attemptIncorrectCount: record.attempt_incorrect_count ?? 0,
  };
}

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

export interface OwnProfileResponse {
  ok: boolean;
  error?: string;
  userProfile?: UserProfile;
}

export function requestOwnUserProfile(): Promise<OwnProfileResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: FETCH_OWN_PROFILE_MESSAGE },
      (response: OwnProfileResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      },
    );
  });
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  importedQuestionsCount: number;
  attemptCorrectCount: number;
  attemptIncorrectCount: number;
}

export interface UserLeaderboard {
  entries: LeaderboardEntry[];
  myRank: number | null;
  totalContributors: number;
  totalAnswerRows: number;
}

export interface FetchUserLeaderboardResult {
  authSession: AuthSession;
  leaderboard: UserLeaderboard;
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

export interface LeaderboardResponse {
  ok: boolean;
  error?: string;
  leaderboard?: UserLeaderboard;
}

export function requestUserLeaderboard(): Promise<LeaderboardResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: FETCH_LEADERBOARD_MESSAGE },
      (response: LeaderboardResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      },
    );
  });
}
