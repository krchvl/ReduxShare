import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../src/types";

const appMocks = vi.hoisted(() => ({
  touchUserProfile: vi.fn(),
  requestUpdateCheck: vi.fn(),
  loadStoredState: vi.fn(),
  saveStoredState: vi.fn()
}));

vi.mock("../src/lib/userProfiles", () => ({
  touchUserProfile: appMocks.touchUserProfile
}));

vi.mock("../src/lib/updates", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/updates")>("../src/lib/updates");
  return {
    ...actual,
    requestUpdateCheck: appMocks.requestUpdateCheck
  };
});

vi.mock("../src/lib/storage", () => ({
  loadStoredState: appMocks.loadStoredState,
  saveStoredState: appMocks.saveStoredState
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
    email: "user@example.com"
  }
};

describe("App auth helpers", () => {
  beforeEach(() => {
    appMocks.touchUserProfile.mockReset();
    appMocks.requestUpdateCheck.mockReset();
    appMocks.loadStoredState.mockReset();
    appMocks.saveStoredState.mockReset();
  });

  it("keeps a successful auth session even when ReduxShare profile sync fails", async () => {
    const { getAuthenticatedUserState } = await importApp();
    appMocks.touchUserProfile.mockRejectedValue(new Error("profile sync failed"));

    await expect(getAuthenticatedUserState(authSession, "school.moodledemo.net")).resolves.toEqual({
      authSession,
      userProfile: null
    });

    expect(appMocks.touchUserProfile).toHaveBeenCalledWith(authSession, "school.moodledemo.net");
  });
});
