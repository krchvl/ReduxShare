import type { AuthSession, UserProfile } from "../types";
import { I18nError } from "../i18n";
import { getSupabaseClient } from "./supabaseClient";
import { restoreSupabaseSession } from "./auth";

interface ReduxShareUserRow {
  id: string;
  email: string;
  username: string;
  moodle_domain: string | null;
  solved_tests_count: number;
  solved_tasks_count: number;
}

interface UserProgressDelta {
  moodleDomain: string | null;
  solvedTestsDelta: number;
  solvedTasksDelta: number;
}

export interface AuthenticatedProfileResult {
  authSession: AuthSession;
  userProfile: UserProfile;
}

function mapUserRow(row: ReduxShareUserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    moodleDomain: row.moodle_domain,
    solvedTestsCount: row.solved_tests_count,
    solvedTasksCount: row.solved_tasks_count
  };
}

async function activateSession(authSession: AuthSession): Promise<AuthSession> {
  return restoreSupabaseSession(authSession);
}

export async function touchUserProfile(
  authSession: AuthSession,
  moodleDomain: string | null
): Promise<AuthenticatedProfileResult> {
  const nextAuthSession = await activateSession(authSession);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .rpc("touch_user_profile", {
      profile_moodle_domain: moodleDomain
    })
    .single<ReduxShareUserRow>();

  if (error) {
    throw new I18nError("errors.profileSaveFailed", { message: error.message });
  }

  return {
    authSession: nextAuthSession,
    userProfile: mapUserRow(data)
  };
}

export async function recordUserQuizProgress(
  authSession: AuthSession,
  { moodleDomain, solvedTestsDelta, solvedTasksDelta }: UserProgressDelta
): Promise<AuthenticatedProfileResult> {
  const nextAuthSession = await activateSession(authSession);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .rpc("record_quiz_progress", {
      progress_moodle_domain: moodleDomain,
      solved_tests_delta: solvedTestsDelta,
      solved_tasks_delta: solvedTasksDelta
    })
    .single<ReduxShareUserRow>();

  if (error) {
    throw new I18nError("errors.progressUpdateFailed", { message: error.message });
  }

  return {
    authSession: nextAuthSession,
    userProfile: mapUserRow(data)
  };
}
