import type { StoredState } from "../types";

const STORAGE_KEY = "reduxshare";

const hasChromeStorage = () =>
  typeof chrome !== "undefined" &&
  Boolean(chrome.storage?.local?.get) &&
  Boolean(chrome.storage?.local?.set);

export async function loadStoredState(): Promise<Partial<StoredState>> {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return (result[STORAGE_KEY] as Partial<StoredState> | undefined) ?? {};
  }

  const rawState = window.localStorage.getItem(STORAGE_KEY);

  if (!rawState) {
    return {};
  }

  try {
    return JSON.parse(rawState) as Partial<StoredState>;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

function mergeUserProfile(
  nextProfile: StoredState["userProfile"],
  currentProfile: Partial<StoredState>["userProfile"]
): StoredState["userProfile"] {
  if (!nextProfile || !currentProfile || nextProfile.id !== currentProfile.id) {
    return nextProfile;
  }

  return {
    ...nextProfile,
    moodleDomain: nextProfile.moodleDomain ?? currentProfile.moodleDomain,
    solvedTestsCount: Math.max(nextProfile.solvedTestsCount, currentProfile.solvedTestsCount),
    solvedTasksCount: Math.max(nextProfile.solvedTasksCount, currentProfile.solvedTasksCount)
  };
}

type StoredStateSaveInput = Omit<StoredState, "updateState"> & Pick<Partial<StoredState>, "updateState">;

export async function saveStoredState(state: StoredStateSaveInput): Promise<void> {
  if (hasChromeStorage()) {
    const currentState = await loadStoredState();
    const userProfile = mergeUserProfile(state.userProfile, currentState.userProfile);

    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...currentState,
        ...state,
        userProfile,
        latestQuizAttemptContext: state.latestQuizAttemptContext ?? currentState.latestQuizAttemptContext ?? null,
        updateState: state.updateState ?? currentState.updateState ?? null
      }
    });
    return;
  }

  const currentState = await loadStoredState();
  const userProfile = mergeUserProfile(state.userProfile, currentState.userProfile);

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...currentState,
      ...state,
      userProfile,
      latestQuizAttemptContext: state.latestQuizAttemptContext ?? currentState.latestQuizAttemptContext ?? null,
      updateState: state.updateState ?? currentState.updateState ?? null
    })
  );
}
