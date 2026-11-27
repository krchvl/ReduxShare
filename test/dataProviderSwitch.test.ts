import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDataProvider,
  getFirebaseEnvConfig,
  isAuthSessionForProvider,
  isFirebaseBackend,
} from "../src/lib/envConfig";
import {
  getEssayExamplesProvider,
  getQuizTasksProvider,
  getUserProfilesProvider,
} from "../src/lib/dataProvider";
import * as firebaseQuizTasks from "../src/lib/providers/firebase/quizTasks";
import * as firebaseUserProfiles from "../src/lib/providers/firebase/userProfiles";
import * as firebaseEssayExamples from "../src/lib/providers/firebase/essayExamples";
import * as pocketbaseQuizTasks from "../src/lib/providers/pocketbase/quizTasks";
import { ensureSession, logout } from "../src/lib/auth";
import type { AuthSession } from "../src/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

function pocketbaseSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: "pb-token",
    refreshToken: "pb-token",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "user-1", email: "user@example.com" },
    ...overrides,
  };
}

function firebaseSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    provider: "firebase",
    accessToken: "id-token",
    refreshToken: "refresh-token",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "uid-1", email: "user@example.com" },
    ...overrides,
  };
}

describe("data provider switch", () => {
  it("defaults to PocketBase", () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");

    expect(getDataProvider()).toBe("pocketbase");
    expect(isFirebaseBackend()).toBe(false);
    expect(getFirebaseEnvConfig()).toBeNull();
  });

  it("reads the provider from the build environment", () => {
    vi.stubEnv("VITE_DATA_PROVIDER", " Firebase ");

    expect(getDataProvider()).toBe("firebase");
    expect(isFirebaseBackend()).toBe(true);
  });

  it("treats legacy sessions without a provider as PocketBase", () => {
    expect(isAuthSessionForProvider(pocketbaseSession())).toBe(true);
    expect(isAuthSessionForProvider(firebaseSession())).toBe(false);

    vi.stubEnv("VITE_DATA_PROVIDER", "firebase");

    expect(isAuthSessionForProvider(pocketbaseSession())).toBe(false);
    expect(isAuthSessionForProvider(firebaseSession())).toBe(true);
    expect(isAuthSessionForProvider(null)).toBe(false);
  });

  it("selects the matching provider implementations", () => {
    expect(getQuizTasksProvider().fetchReduxShareTasks).toBe(
      pocketbaseQuizTasks.fetchReduxShareTasks,
    );

    vi.stubEnv("VITE_DATA_PROVIDER", "firebase");

    expect(getQuizTasksProvider().fetchReduxShareTasks).toBe(
      firebaseQuizTasks.fetchReduxShareTasks,
    );
    expect(getUserProfilesProvider().touchUserProfile).toBe(firebaseUserProfiles.touchUserProfile);
    expect(getEssayExamplesProvider().voteEssayExample).toBe(
      firebaseEssayExamples.voteEssayExample,
    );
  });

  it("refuses PocketBase sessions under the Firebase provider", async () => {
    vi.stubEnv("VITE_DATA_PROVIDER", "firebase");
    vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "demo");

    await expect(ensureSession(pocketbaseSession())).rejects.toMatchObject({
      i18nKey: "errors.sessionExpired",
    });
  });

  it("keeps a valid PocketBase session under the PocketBase provider", async () => {
    const session = pocketbaseSession();

    await expect(ensureSession(session)).resolves.toBe(session);
  });

  it("logs out without a network call under the Firebase provider", async () => {
    vi.stubEnv("VITE_DATA_PROVIDER", "firebase");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(logout(firebaseSession())).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
