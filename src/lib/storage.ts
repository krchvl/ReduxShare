import type { StoredState, UserProfile } from "../types";
import { APP_STORAGE_KEY } from "../shared/storageKeys";

const hasChromeStorage = () =>
  typeof chrome !== "undefined" &&
  Boolean(chrome.storage?.local?.get) &&
  Boolean(chrome.storage?.local?.set);

export async function loadStoredState(): Promise<Partial<StoredState>> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(APP_STORAGE_KEY);
    return (result[APP_STORAGE_KEY] as Partial<StoredState> | undefined) ?? {};
  }

  const rawState = window.localStorage.getItem(APP_STORAGE_KEY);

  if (!rawState) {
    return {};
  }

  try {
    return JSON.parse(rawState) as Partial<StoredState>;
  } catch {
    window.localStorage.removeItem(APP_STORAGE_KEY);
    return {};
  }
}

export type StoredStatePatch = Omit<Partial<StoredState>, "userProfile"> & {
  userProfile?: Partial<UserProfile> | null;

  moodleDomain?: string | null;
};

function mergeUserProfile(
  nextProfile: Partial<UserProfile> | null | undefined,
  currentProfile: Partial<UserProfile> | null | undefined,
  moodleDomain?: string | null,
): Partial<UserProfile> | null | undefined {
  if (!nextProfile || !currentProfile || nextProfile.id !== currentProfile.id) {
    return nextProfile;
  }

  return {
    ...nextProfile,
    moodleDomain: moodleDomain ?? nextProfile.moodleDomain ?? currentProfile.moodleDomain,
    solvedTestsCount: Math.max(
      nextProfile.solvedTestsCount ?? 0,
      currentProfile.solvedTestsCount ?? 0,
    ),
    solvedTasksCount: Math.max(
      nextProfile.solvedTasksCount ?? 0,
      currentProfile.solvedTasksCount ?? 0,
    ),
  };
}

export async function patchStoredState(patch: StoredStatePatch): Promise<void> {
  const currentState = await loadStoredState();
  const nextState = {
    ...currentState,
    ...patch,
    userProfile: mergeUserProfile(
      patch.userProfile ?? currentState.userProfile,
      currentState.userProfile,
      patch.moodleDomain,
    ),
    latestQuizAttemptContext:
      patch.latestQuizAttemptContext ?? currentState.latestQuizAttemptContext ?? null,
    updateState: patch.updateState ?? currentState.updateState ?? null,
  };

  if (hasChromeStorage()) {
    await chrome.storage.local.set({
      [APP_STORAGE_KEY]: nextState,
    });
    return;
  }

  window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(nextState));
}

type StoredStateSaveInput = Omit<StoredState, "updateState"> &
  Pick<Partial<StoredState>, "updateState">;

export async function saveStoredState(state: StoredStateSaveInput): Promise<void> {
  await patchStoredState(state);
}
