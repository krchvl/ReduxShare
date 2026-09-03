import type PocketBase from "pocketbase";
import type { AuthSession, UserProfile } from "../types";
import { USERS_COLLECTION, isNotFoundError, toI18nError, withPocketBaseSessionRetry } from "./pocketbase";
import { AuthError } from "./auth";

export interface PocketBaseUserRecord {
  id: string;
  email: string;
  username: string;
  moodle_domain: string;
  solved_tests_count: number | null;
  solved_tasks_count: number | null;
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
    solvedTasksCount: record.solved_tasks_count ?? 0
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
  seed: UserProfileSeed = {}
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

        // Username is assigned at registration; only fill it when the stored
        // record has none (defensive, mirrors the old touch_user_profile RPC).
        if (seed.username && !current.username) {
          patch.username = seed.username;
        }

        if (Object.keys(patch).length === 0) {
          return current;
        }

        return pb.collection(USERS_COLLECTION).update<PocketBaseUserRecord>(session.user.id, patch);
      }
    );

    return {
      authSession: nextAuthSession,
      userProfile: mapUserRecord(result)
    };
  } catch (error) {
    throw toI18nError(error, "errors.profileSaveFailed");
  }
}

export async function recordUserQuizProgress(
  authSession: AuthSession,
  { moodleDomain, solvedTestsDelta, solvedTasksDelta, username }: UserProgressDelta
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
      }
    );

    return {
      authSession: nextAuthSession,
      userProfile: mapUserRecord(result)
    };
  } catch (error) {
    throw toI18nError(error, "errors.progressUpdateFailed");
  }
}
