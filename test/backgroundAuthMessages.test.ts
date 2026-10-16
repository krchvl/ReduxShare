import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_STORAGE_KEY } from "../src/shared/storageKeys";
import { I18nError } from "../src/i18n";
import type { AuthSession, UserProfile } from "../src/types";
import type * as AuthLib from "../src/lib/auth";
import type * as UserProfilesLib from "../src/lib/userProfiles";
import type * as PocketBaseLib from "../src/lib/pocketbase";

const loginMock = vi.hoisted(() => vi.fn());
const registerMock = vi.hoisted(() => vi.fn());
const touchMock = vi.hoisted(() => vi.fn());
const pingMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthLib>();
  return { ...actual, loginWithPocketBase: loginMock, registerWithPocketBase: registerMock };
});

vi.mock("../src/lib/userProfiles", async (importOriginal) => {
  const actual = await importOriginal<typeof UserProfilesLib>();
  return { ...actual, touchUserProfile: touchMock };
});

vi.mock("../src/lib/pocketbase", async (importOriginal) => {
  const actual = await importOriginal<typeof PocketBaseLib>();
  return { ...actual, measurePocketBasePing: pingMock };
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

function flushMicrotasks(hops: number) {
  return new Promise<void>((resolve) => {
    for (let index = 0; index < hops; index += 1) {
      queueMicrotask(() => {});
    }

    setTimeout(resolve, 0);
  });
}

async function getWorkerListener(): Promise<WorkerListener> {
  const addListener = vi.mocked(chrome.runtime.onMessage.addListener);
  await import("../src/background/external");
  return addListener.mock.calls.at(-1)![0] as WorkerListener;
}

async function readStoredState() {
  const result = await chrome.storage.local.get(APP_STORAGE_KEY);
  return (result[APP_STORAGE_KEY] as Record<string, unknown> | undefined) ?? {};
}

async function dispatch(message: unknown) {
  const listener = await getWorkerListener();
  let response: unknown;

  const keepChannelOpen = listener(message, {}, (value) => {
    response = value;
  });

  await flushMicrotasks(20);

  return {
    keepChannelOpen,
    response: response as Record<string, unknown> | undefined,
  };
}

describe("background auth message handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    loginMock.mockReset();
    registerMock.mockReset();
    touchMock.mockReset();
    pingMock.mockReset();
  });

  it("logs in via the worker and persists the session", async () => {
    loginMock.mockResolvedValue(authSession);

    const { keepChannelOpen, response } = await dispatch({
      type: "REDUXSHARE_LOGIN",
      payload: { email: "user@example.com", password: "secret" },
    });

    expect(keepChannelOpen).toBe(true);
    expect(loginMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret",
    });
    expect(response).toEqual({ ok: true, authSession });
    expect((await readStoredState()).authSession).toEqual(authSession);
  });

  it("returns a localized error when login fails", async () => {
    loginMock.mockRejectedValue(new I18nError("errors.loginFailed"));

    const { response } = await dispatch({
      type: "REDUXSHARE_LOGIN",
      payload: { email: "user@example.com", password: "wrong" },
    });

    expect(response).toEqual({
      ok: false,
      error: "Не удалось войти. Проверьте почту и пароль.",
    });
    expect((await readStoredState()).authSession).toBeUndefined();
  });

  it("registers via the worker and persists the auto-created session", async () => {
    registerMock.mockResolvedValue({ authSession });

    const { keepChannelOpen, response } = await dispatch({
      type: "REDUXSHARE_REGISTER",
      payload: {
        email: "user@example.com",
        username: "user-1",
        password: "secret",
      },
    });

    expect(keepChannelOpen).toBe(true);
    expect(registerMock).toHaveBeenCalledWith({
      email: "user@example.com",
      username: "user-1",
      password: "secret",
    });
    expect(response).toEqual({ ok: true, authSession });
    expect((await readStoredState()).authSession).toEqual(authSession);
  });

  it("translates the confirm-email register outcome without persisting a session", async () => {
    registerMock.mockResolvedValue({
      authSession: null,
      messageKey: "auth.register.confirmEmail",
    });

    const { response } = await dispatch({
      type: "REDUXSHARE_REGISTER",
      payload: {
        email: "user@example.com",
        username: "user-1",
        password: "secret",
      },
    });

    expect(response).toEqual({
      ok: true,
      authSession: null,
      message:
        "Регистрация создана. Если включено подтверждение почты, проверьте письмо для входа.",
    });
    expect((await readStoredState()).authSession).toBeUndefined();
  });

  it("touches the profile via the worker and persists the refreshed session", async () => {
    await chrome.storage.local.set({ [APP_STORAGE_KEY]: { authSession } });
    const refreshedSession: AuthSession = {
      ...authSession,
      accessToken: "token-2",
      refreshToken: "token-2",
    };
    const touchedProfile: UserProfile = { ...userProfile, moodleDomain: "moodle.example" };
    touchMock.mockResolvedValue({
      authSession: refreshedSession,
      userProfile: touchedProfile,
    });

    const { response } = await dispatch({
      type: "REDUXSHARE_TOUCH_PROFILE",
      payload: {
        authSession,
        moodleDomain: "moodle.example",
        seed: { email: "user@example.com" },
      },
    });

    expect(touchMock).toHaveBeenCalledWith(authSession, "moodle.example", {
      email: "user@example.com",
    });
    expect(response).toEqual({
      ok: true,
      authSession: refreshedSession,
      userProfile: touchedProfile,
    });

    const stored = await readStoredState();
    expect(stored.authSession).toEqual(refreshedSession);
    expect(stored.userProfile).toEqual(touchedProfile);
  });

  it("logs a failed profile touch before answering with a localized error", async () => {
    const { setStealthModeEnabled } = await import("../src/state");
    setStealthModeEnabled(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    touchMock.mockRejectedValue(new Error("touch down"));

    const { response } = await dispatch({
      type: "REDUXSHARE_TOUCH_PROFILE",
      payload: { authSession, moodleDomain: "moodle.example", seed: {} },
    });

    expect(response).toEqual({ ok: false, error: "touch down" });
    expect(warnSpy).toHaveBeenCalledWith("ReduxShare: profile touch failed", {
      userId: authSession.user.id,
      moodleDomain: "moodle.example",
      error: "touch down",
    });
    warnSpy.mockRestore();
  });

  it("pings a storage server via the worker", async () => {
    pingMock.mockResolvedValue(42);

    const { response } = await dispatch({
      type: "REDUXSHARE_PING_SERVER",
      payload: { url: "https://pb.example.com" },
    });

    expect(pingMock).toHaveBeenCalledWith("https://pb.example.com");
    expect(response).toEqual({ ok: true, latencyMs: 42 });
  });

  it("reports an unreachable server as a null ping", async () => {
    pingMock.mockResolvedValue(null);

    const { response } = await dispatch({
      type: "REDUXSHARE_PING_SERVER",
      payload: { url: "https://pb.example.com" },
    });

    expect(response).toEqual({ ok: true, latencyMs: null });
  });

  it("ignores ping messages without a url", async () => {
    const listener = await getWorkerListener();

    expect(listener({ type: "REDUXSHARE_PING_SERVER", payload: {} }, {}, vi.fn())).toBe(false);
    expect(pingMock).not.toHaveBeenCalled();
  });
});
