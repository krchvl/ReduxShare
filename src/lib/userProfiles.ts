import { I18nError } from "../i18n";
import type { AuthSession } from "../types";
import {
  FETCH_ATTEMPT_HISTORY_MESSAGE,
  FETCH_LEADERBOARD_MESSAGE,
  FETCH_OWN_PROFILE_MESSAGE,
  TOUCH_PROFILE_MESSAGE,
} from "../shared/messages";
import type {
  AttemptHistoryResponse,
  AuthenticatedProfileResult,
  FetchUserAttemptHistoryResult,
  FetchUserLeaderboardResult,
  LeaderboardResponse,
  OwnProfileResponse,
  TouchProfileResponse,
  UserProfileSeed,
  UserProgressDelta,
} from "./dataTypes";
import { getUserProfilesProvider } from "./dataProvider";

export type {
  PocketBaseUserRecord,
  UserProfileSeed,
  UserProgressDelta,
  AuthenticatedProfileResult,
  OwnProfileResponse,
  TouchProfileResponse,
  LeaderboardEntry,
  UserLeaderboard,
  FetchUserLeaderboardResult,
  LeaderboardResponse,
  AttemptHistoryEntry,
  UserAttemptHistory,
  FetchUserAttemptHistoryResult,
  AttemptHistoryResponse,
} from "./dataTypes";

export { mapUserRecord } from "./dataCore/profileCore";

export async function touchUserProfile(
  authSession: AuthSession,
  moodleDomain: string | null,
  seed: UserProfileSeed = {},
): Promise<AuthenticatedProfileResult> {
  return getUserProfilesProvider().touchUserProfile(authSession, moodleDomain, seed);
}

export async function recordUserQuizProgress(
  authSession: AuthSession,
  delta: UserProgressDelta,
): Promise<AuthenticatedProfileResult> {
  return getUserProfilesProvider().recordUserQuizProgress(authSession, delta);
}

export async function fetchOwnUserProfile(
  authSession: AuthSession,
): Promise<AuthenticatedProfileResult> {
  return getUserProfilesProvider().fetchOwnUserProfile(authSession);
}

export async function fetchUserLeaderboard(
  authSession: AuthSession,
  limit = 10,
): Promise<FetchUserLeaderboardResult> {
  return getUserProfilesProvider().fetchUserLeaderboard(authSession, limit);
}

export async function fetchUserAttemptHistory(
  authSession: AuthSession,
  limit = 20,
): Promise<FetchUserAttemptHistoryResult> {
  return getUserProfilesProvider().fetchUserAttemptHistory(authSession, limit);
}

export function requestTouchUserProfile(
  authSession: AuthSession,
  moodleDomain: string | null,
  seed: UserProfileSeed = {},
): Promise<TouchProfileResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: TOUCH_PROFILE_MESSAGE,
        payload: { authSession, moodleDomain, seed },
      },
      (response: TouchProfileResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError || !response) {
          reject(new I18nError("errors.backgroundConnection"));
          return;
        }

        resolve(response);
      },
    );
  });
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

export function requestUserAttemptHistory(): Promise<AttemptHistoryResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: FETCH_ATTEMPT_HISTORY_MESSAGE },
      (response: AttemptHistoryResponse | undefined) => {
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
