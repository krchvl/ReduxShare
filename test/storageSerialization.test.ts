import { describe, expect, it, vi } from "vitest";
import { APP_STORAGE_KEY } from "../src/shared/storageKeys";
import { loadStoredState, patchStoredState } from "../src/lib/storage";
import { DEFAULT_UPDATE_STATE, type AuthSession, type UpdateState } from "../src/types";

const authSession: AuthSession = {
  accessToken: "token-1",
  refreshToken: "refresh-1",
  expiresAt: null,
  user: { id: "user-1", email: "user@example.com" },
};

const updateState: UpdateState = { ...DEFAULT_UPDATE_STATE, status: "checking" };

describe("stored state patch serialization", () => {
  it("keeps every patch from a concurrent read-modify-write burst", async () => {
    await chrome.storage.local.set({ [APP_STORAGE_KEY]: {} });

    await Promise.all([patchStoredState({ authSession }), patchStoredState({ updateState })]);

    const state = await loadStoredState();
    expect(state.authSession).toEqual(authSession);
    expect(state.updateState).toEqual(updateState);
  });

  it("keeps patching after a failed write", async () => {
    await chrome.storage.local.set({ [APP_STORAGE_KEY]: {} });
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("write failed"));

    await expect(patchStoredState({ authSession })).rejects.toThrow("write failed");
    await patchStoredState({ updateState });

    const state = await loadStoredState();
    expect(state.updateState).toEqual(updateState);
  });
});
