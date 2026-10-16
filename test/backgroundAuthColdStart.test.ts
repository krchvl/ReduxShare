import { describe, expect, it, vi } from "vitest";
import { APP_STORAGE_KEY } from "../src/shared/storageKeys";
import { DEFAULT_SETTINGS, type AuthSession, type Settings } from "../src/types";
import type * as AuthLib from "../src/lib/auth";

const loginMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthLib>();
  return { ...actual, loginWithPocketBase: loginMock };
});

type WorkerListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

const authSession: AuthSession = {
  accessToken: "token-1",
  refreshToken: "refresh-1",
  expiresAt: null,
  user: { id: "user-1", email: "user@example.com" },
};

function flushMicrotasks(hops: number) {
  return new Promise<void>((resolve) => {
    for (let index = 0; index < hops; index += 1) {
      queueMicrotask(() => {});
    }

    setTimeout(resolve, 0);
  });
}

describe("background auth cold start", () => {
  it("waits for the stored server selection before logging in", async () => {
    const customSettings: Settings = {
      ...DEFAULT_SETTINGS,
      servers: [{ id: "srv-custom", url: "https://custom.example.com", label: "custom" }],
      activeServerId: "srv-custom",
    };
    await chrome.storage.local.set({ [APP_STORAGE_KEY]: { settings: customSettings } });

    const getMock = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>;
    const originalGet = getMock.getMockImplementation() as (...args: unknown[]) => Promise<unknown>;
    let releaseInitialRead: () => void = () => {};
    const initialReadGate = new Promise<void>((resolve) => {
      releaseInitialRead = resolve;
    });
    let loginDispatched = false;

    getMock.mockImplementation(async (...args: unknown[]) => {
      if (!loginDispatched) {
        await initialReadGate;
      }
      return originalGet(...args);
    });

    const { getPocketBaseUrl } = await import("../src/lib/pocketbase");
    const capturedUrls: string[] = [];
    loginMock.mockImplementation(async () => {
      capturedUrls.push(getPocketBaseUrl());
      return authSession;
    });

    try {
      const addListener = vi.mocked(chrome.runtime.onMessage.addListener);
      await import("../src/background/external");
      const listener = addListener.mock.calls.at(-1)![0] as WorkerListener;

      let response: unknown;
      loginDispatched = true;
      listener(
        { type: "REDUXSHARE_LOGIN", payload: { email: "user@example.com", password: "secret" } },
        {},
        (value) => {
          response = value;
        },
      );

      await flushMicrotasks(20);
      expect(loginMock).not.toHaveBeenCalled();

      releaseInitialRead();
      await flushMicrotasks(20);

      expect(capturedUrls).toEqual(["https://custom.example.com"]);
      expect(response).toEqual({ ok: true, authSession });
    } finally {
      getMock.mockImplementation(originalGet as never);
    }
  });
});
