import type { AuthSession, LoginCredentials, RegisterCredentials } from "../../../types";
import { AuthError, type AuthResult } from "../../authErrors";
import { IDENTITY_TOOLKIT_ENDPOINT, SECURE_TOKEN_ENDPOINT, requireFirebaseConfig } from "./config";
import { createDocumentWrite, createFirestoreClient } from "./firestore";
import { isFirebasePreconditionError, firebaseFetchJson } from "./http";
import { usernameDocumentId } from "./ids";

interface IdentityAuthResponse {
  idToken?: unknown;
  refreshToken?: unknown;
  expiresIn?: unknown;
  localId?: unknown;
  email?: unknown;
}

interface SecureTokenResponse {
  id_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user_id?: unknown;
}

function toExpiresAt(expiresIn: unknown, nowSeconds: number): number | null {
  const parsed = typeof expiresIn === "string" ? Number.parseInt(expiresIn, 10) : expiresIn;

  return typeof parsed === "number" && Number.isFinite(parsed)
    ? nowSeconds + Math.trunc(parsed)
    : null;
}

function mapIdentityAuthResponse(response: IdentityAuthResponse): AuthSession | null {
  const accessToken = typeof response.idToken === "string" ? response.idToken : "";
  const localId = typeof response.localId === "string" ? response.localId : "";

  if (!accessToken || !localId) {
    return null;
  }

  return {
    provider: "firebase",
    accessToken,
    refreshToken: typeof response.refreshToken === "string" ? response.refreshToken : accessToken,
    expiresAt: toExpiresAt(response.expiresIn, Math.floor(Date.now() / 1000)),
    user: {
      id: localId,
      email: typeof response.email === "string" ? response.email : null,
    },
  };
}

function identityUrl(path: string, apiKey: string): string {
  return `${IDENTITY_TOOLKIT_ENDPOINT}/${path}?key=${encodeURIComponent(apiKey)}`;
}

export async function firebaseLogin({ email, password }: LoginCredentials): Promise<AuthSession> {
  const config = requireFirebaseConfig();
  let response: IdentityAuthResponse;

  try {
    response = await firebaseFetchJson<IdentityAuthResponse>(
      identityUrl("accounts:signInWithPassword", config.apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          returnSecureToken: true,
        }),
      },
    );
  } catch {
    throw new AuthError("errors.loginFailed");
  }

  const authSession = mapIdentityAuthResponse(response);

  if (!authSession) {
    throw new AuthError("errors.loginNoSession");
  }

  return authSession;
}

export async function firebaseRefreshSession(authSession: AuthSession): Promise<AuthSession> {
  if (authSession.provider !== "firebase") {
    throw new AuthError("errors.sessionExpired");
  }

  const config = requireFirebaseConfig();
  let response: SecureTokenResponse;

  try {
    response = await firebaseFetchJson<SecureTokenResponse>(
      `${SECURE_TOKEN_ENDPOINT}?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: authSession.refreshToken,
        }).toString(),
      },
    );
  } catch {
    throw new AuthError("errors.sessionExpired");
  }

  const accessToken = typeof response.id_token === "string" ? response.id_token : "";

  if (!accessToken) {
    throw new AuthError("errors.sessionMissing");
  }

  return {
    provider: "firebase",
    accessToken,
    refreshToken:
      typeof response.refresh_token === "string"
        ? response.refresh_token
        : authSession.refreshToken,
    expiresAt: toExpiresAt(response.expires_in, Math.floor(Date.now() / 1000)),
    user: {
      id:
        typeof response.user_id === "string" && response.user_id
          ? response.user_id
          : authSession.user.id,
      email: authSession.user.email,
    },
  };
}

export async function firebaseEnsureSession(authSession: AuthSession): Promise<AuthSession> {
  if (authSession.provider !== "firebase") {
    throw new AuthError("errors.sessionExpired");
  }

  const expiresAtMs = authSession.expiresAt ? authSession.expiresAt * 1000 : null;

  if (expiresAtMs && expiresAtMs - Date.now() > 60_000) {
    return authSession;
  }

  return firebaseRefreshSession(authSession);
}

async function deleteFirebaseAccount(apiKey: string, idToken: string): Promise<void> {
  try {
    await firebaseFetchJson(identityUrl("accounts:delete", apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
  } catch {}
}

export async function firebaseRegister({
  email,
  username,
  password,
}: RegisterCredentials): Promise<AuthResult> {
  const config = requireFirebaseConfig();
  const cleanEmail = email.trim();
  const cleanUsername = username.trim();

  if (!cleanUsername) {
    throw new AuthError("errors.registerFailed");
  }

  let authSession: AuthSession;

  try {
    const response = await firebaseFetchJson<IdentityAuthResponse>(
      identityUrl("accounts:signUp", config.apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          returnSecureToken: true,
        }),
      },
    );
    const mapped = mapIdentityAuthResponse(response);

    if (!mapped) {
      throw new AuthError("errors.registerFailed");
    }

    authSession = mapped;
  } catch (error) {
    throw error instanceof AuthError ? error : new AuthError("errors.registerFailed");
  }

  const client = createFirestoreClient({
    projectId: config.projectId,
    accessToken: authSession.accessToken,
  });
  const usernamePath = `usernames/${usernameDocumentId(cleanUsername)}`;

  try {
    const existingUsername = await client.getDocument(usernamePath);

    if (existingUsername) {
      await deleteFirebaseAccount(config.apiKey, authSession.accessToken);
      throw new AuthError("errors.usernameTaken");
    }

    await client.commit([
      createDocumentWrite(config.projectId, `users/${authSession.user.id}`, {
        email: cleanEmail,
        username: cleanUsername,
        moodle_domain: "",
        solved_tests_count: 0,
        solved_tasks_count: 0,
        imported_questions_count: 0,
        attempt_correct_count: 0,
        attempt_incorrect_count: 0,
      }),
      createDocumentWrite(config.projectId, usernamePath, {
        user: authSession.user.id,
        username: cleanUsername,
      }),
    ]);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    await deleteFirebaseAccount(config.apiKey, authSession.accessToken);

    if (isFirebasePreconditionError(error)) {
      throw new AuthError("errors.usernameTaken");
    }

    throw new AuthError("errors.registerFailed");
  }

  return { authSession };
}
