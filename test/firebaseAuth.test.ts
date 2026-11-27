import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  firebaseEnsureSession,
  firebaseLogin,
  firebaseRefreshSession,
  firebaseRegister,
} from "../src/lib/providers/firebase/auth";
import { usernameDocumentId } from "../src/lib/providers/firebase/ids";
import type { AuthSession } from "../src/types";

const NOW = new Date("2026-11-20T00:00:00Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const IDENTITY_URL = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_URL = "https://securetoken.googleapis.com/v1/token";
const DOCUMENTS_URL =
  "https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents";
const RESOURCE_ROOT = "projects/demo/databases/(default)/documents";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("VITE_FIREBASE_API_KEY", "api-key");
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "demo");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetchSequence(responses: Array<{ body?: unknown; status?: number }>) {
  let index = 0;
  const mock = vi.fn(async () => {
    const response = responses[index] ?? responses[responses.length - 1];
    index += 1;
    return new Response(response.body === undefined ? "" : JSON.stringify(response.body), {
      status: response.status ?? 200,
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function firebaseSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    provider: "firebase",
    accessToken: "id-1",
    refreshToken: "refresh-1",
    expiresAt: NOW_SECONDS + 3600,
    user: { id: "uid-1", email: "user@example.com" },
    ...overrides,
  };
}

describe("firebase login", () => {
  it("signs in through the identity toolkit and maps the session", async () => {
    const fetchMock = stubFetchSequence([
      {
        body: {
          idToken: "id-1",
          refreshToken: "refresh-1",
          expiresIn: "3600",
          localId: "uid-1",
          email: "user@example.com",
        },
      },
    ]);

    const session = await firebaseLogin({ email: " user@example.com ", password: "secret" });

    expect(session).toEqual({
      provider: "firebase",
      accessToken: "id-1",
      refreshToken: "refresh-1",
      expiresAt: NOW_SECONDS + 3600,
      user: { id: "uid-1", email: "user@example.com" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${IDENTITY_URL}/accounts:signInWithPassword?key=api-key`,
    );
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      email: "user@example.com",
      password: "secret",
      returnSecureToken: true,
    });
  });

  it("maps rejected credentials to loginFailed", async () => {
    stubFetchSequence([
      {
        status: 400,
        body: { error: { code: 400, message: "INVALID_LOGIN_CREDENTIALS" } },
      },
    ]);

    await expect(
      firebaseLogin({ email: "user@example.com", password: "wrong" }),
    ).rejects.toMatchObject({ i18nKey: "errors.loginFailed" });
  });

  it("rejects responses without tokens", async () => {
    stubFetchSequence([{ body: { localId: "uid-1" } }]);

    await expect(
      firebaseLogin({ email: "user@example.com", password: "secret" }),
    ).rejects.toMatchObject({ i18nKey: "errors.loginNoSession" });
  });
});

describe("firebase session refresh", () => {
  it("refreshes the id token through the secure token endpoint", async () => {
    const fetchMock = stubFetchSequence([
      {
        body: {
          id_token: "id-2",
          refresh_token: "refresh-2",
          expires_in: "3600",
          user_id: "uid-1",
        },
      },
    ]);

    const session = await firebaseRefreshSession(firebaseSession());

    expect(session).toEqual({
      provider: "firebase",
      accessToken: "id-2",
      refreshToken: "refresh-2",
      expiresAt: NOW_SECONDS + 3600,
      user: { id: "uid-1", email: "user@example.com" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${SECURE_TOKEN_URL}?key=api-key`);
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBe(
      "grant_type=refresh_token&refresh_token=refresh-1",
    );
  });

  it("maps refresh failures to sessionExpired", async () => {
    stubFetchSequence([
      { status: 400, body: { error: { code: 400, message: "INVALID_REFRESH_TOKEN" } } },
    ]);

    await expect(firebaseRefreshSession(firebaseSession())).rejects.toMatchObject({
      i18nKey: "errors.sessionExpired",
    });
  });

  it("rejects sessions from another provider without a network call", async () => {
    const fetchMock = stubFetchSequence([{ body: {} }]);

    await expect(
      firebaseRefreshSession(firebaseSession({ provider: "pocketbase" })),
    ).rejects.toMatchObject({ i18nKey: "errors.sessionExpired" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses a session that is valid for more than a minute", async () => {
    const fetchMock = stubFetchSequence([{ body: {} }]);
    const session = firebaseSession();

    await expect(firebaseEnsureSession(session)).resolves.toBe(session);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes a session that is close to expiry", async () => {
    stubFetchSequence([
      { body: { id_token: "id-2", refresh_token: "refresh-2", expires_in: "3600" } },
    ]);
    const session = firebaseSession({ expiresAt: NOW_SECONDS + 30 });

    await expect(firebaseEnsureSession(session)).resolves.toMatchObject({
      accessToken: "id-2",
      refreshToken: "refresh-2",
    });
  });
});

describe("firebase register", () => {
  const signUpResponse = {
    body: {
      idToken: "id-1",
      refreshToken: "refresh-1",
      expiresIn: "3600",
      localId: "uid-1",
      email: "user@example.com",
    },
  };

  it("creates the auth user, profile and username reservation", async () => {
    const fetchMock = stubFetchSequence([
      signUpResponse,
      {
        status: 404,
        body: { error: { code: 404, status: "NOT_FOUND", message: "missing" } },
      },
      { body: {} },
    ]);

    const result = await firebaseRegister({
      email: " user@example.com ",
      username: " Alice ",
      password: "secret",
    });

    expect(result.authSession).toEqual({
      provider: "firebase",
      accessToken: "id-1",
      refreshToken: "refresh-1",
      expiresAt: NOW_SECONDS + 3600,
      user: { id: "uid-1", email: "user@example.com" },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(`${IDENTITY_URL}/accounts:signUp?key=api-key`);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      email: "user@example.com",
      password: "secret",
      returnSecureToken: true,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${DOCUMENTS_URL}/usernames/${usernameDocumentId("Alice")}`,
    );

    const commitBody = JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string);

    expect(commitBody.writes).toHaveLength(2);
    expect(commitBody.writes[0].update.name).toBe(`${RESOURCE_ROOT}/users/uid-1`);
    expect(commitBody.writes[0].currentDocument).toEqual({ exists: false });
    expect(commitBody.writes[0].update.fields.username).toEqual({ stringValue: "Alice" });
    expect(commitBody.writes[0].update.fields.email).toEqual({
      stringValue: "user@example.com",
    });
    expect(commitBody.writes[1].update.name).toBe(
      `${RESOURCE_ROOT}/usernames/${usernameDocumentId("Alice")}`,
    );
    expect(commitBody.writes[1].update.fields.user).toEqual({ stringValue: "uid-1" });
  });

  it("deletes the fresh auth account when the username is already reserved", async () => {
    const fetchMock = stubFetchSequence([
      signUpResponse,
      {
        body: {
          name: `${DOCUMENTS_URL}/usernames/${usernameDocumentId("Alice")}`,
          fields: { user: { stringValue: "other-uid" } },
        },
      },
      { body: {} },
    ]);

    await expect(
      firebaseRegister({ email: "user@example.com", username: "Alice", password: "secret" }),
    ).rejects.toMatchObject({ i18nKey: "errors.usernameTaken" });

    expect(fetchMock.mock.calls[2][0]).toBe(`${IDENTITY_URL}/accounts:delete?key=api-key`);
    expect(JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string)).toEqual({
      idToken: "id-1",
    });
  });

  it("treats a reservation race as a taken username", async () => {
    const fetchMock = stubFetchSequence([
      signUpResponse,
      {
        status: 404,
        body: { error: { code: 404, status: "NOT_FOUND", message: "missing" } },
      },
      {
        status: 409,
        body: { error: { code: 409, status: "ALREADY_EXISTS", message: "exists" } },
      },
      { body: {} },
    ]);

    await expect(
      firebaseRegister({ email: "user@example.com", username: "Alice", password: "secret" }),
    ).rejects.toMatchObject({ i18nKey: "errors.usernameTaken" });

    expect(fetchMock.mock.calls[3][0]).toBe(`${IDENTITY_URL}/accounts:delete?key=api-key`);
  });

  it("maps sign-up failures to registerFailed", async () => {
    stubFetchSequence([{ status: 400, body: { error: { code: 400, message: "EMAIL_EXISTS" } } }]);

    await expect(
      firebaseRegister({ email: "user@example.com", username: "Alice", password: "secret" }),
    ).rejects.toMatchObject({ i18nKey: "errors.registerFailed" });
  });
});
