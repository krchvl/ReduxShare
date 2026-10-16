import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession, UserProfile } from "../src/types";
import type * as UpdatesLib from "../src/lib/updates";

const appMocks = vi.hoisted(() => ({
  requestTouchUserProfile: vi.fn(),
  requestUpdateCheck: vi.fn(),
  loadStoredState: vi.fn(),
  saveStoredState: vi.fn(),
}));

vi.mock("../src/lib/userProfiles", () => ({
  requestTouchUserProfile: appMocks.requestTouchUserProfile,
}));

vi.mock("../src/lib/updates", async () => {
  const actual = await vi.importActual<typeof UpdatesLib>("../src/lib/updates");
  return {
    ...actual,
    requestUpdateCheck: appMocks.requestUpdateCheck,
  };
});

vi.mock("../src/lib/storage", () => ({
  loadStoredState: appMocks.loadStoredState,
  saveStoredState: appMocks.saveStoredState,
}));

async function importApp() {
  return import("../src/App");
}

const authSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: null,
  user: {
    id: "user-1",
    email: "user@example.com",
  },
};

const userProfile: UserProfile = {
  id: "user-1",
  email: "user@example.com",
  username: "user-1",
  moodleDomain: null,
  solvedTestsCount: 0,
  solvedTasksCount: 0,
  importedQuestionsCount: 0,
  attemptCorrectCount: 0,
  attemptIncorrectCount: 0,
};

describe("App auth helpers", () => {
  beforeEach(() => {
    appMocks.requestTouchUserProfile.mockReset();
    appMocks.requestUpdateCheck.mockReset();
    appMocks.loadStoredState.mockReset();
    appMocks.saveStoredState.mockReset();
  });

  it("returns the refreshed session and profile when the background touch succeeds", async () => {
    const { getAuthenticatedUserState } = await importApp();
    appMocks.requestTouchUserProfile.mockResolvedValue({
      ok: true,
      authSession,
      userProfile,
    });

    await expect(getAuthenticatedUserState(authSession, "school.moodledemo.net")).resolves.toEqual({
      authSession,
      userProfile,
    });

    expect(appMocks.requestTouchUserProfile).toHaveBeenCalledWith(
      authSession,
      "school.moodledemo.net",
      {},
    );
  });

  it("keeps a successful auth session even when ReduxShare profile sync fails", async () => {
    const { getAuthenticatedUserState } = await importApp();
    appMocks.requestTouchUserProfile.mockResolvedValue({
      ok: false,
      error: "profile sync failed",
    });

    await expect(getAuthenticatedUserState(authSession, "school.moodledemo.net")).resolves.toEqual({
      authSession,
      userProfile: null,
    });
  });

  it("falls back to the login session when the background touch rejects", async () => {
    const { getAuthenticatedUserState } = await importApp();
    appMocks.requestTouchUserProfile.mockRejectedValue(new Error("background down"));

    await expect(
      getAuthenticatedUserState(authSession, null, { email: "user@example.com" }),
    ).resolves.toEqual({
      authSession,
      userProfile: null,
    });

    expect(appMocks.requestTouchUserProfile).toHaveBeenCalledWith(authSession, null, {
      email: "user@example.com",
    });
  });
});
