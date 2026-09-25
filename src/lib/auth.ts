import { ClientResponseError } from "pocketbase";
import { I18nError, type TranslationKey } from "../i18n";
import type { AuthSession, LoginCredentials, RegisterCredentials } from "../types";
import { getPocketBase, mapPocketBaseSession } from "./pocketbase";

export class AuthError extends I18nError {
  constructor(messageKey: TranslationKey) {
    super(messageKey);
    this.name = "AuthError";
  }
}

export interface AuthResult {
  authSession: AuthSession | null;
  messageKey?: TranslationKey;
}

function maskAuthEmail(email: string) {
  const trimmedEmail = email.trim();
  const [localPart, domainPart] = trimmedEmail.split("@");

  if (!localPart || !domainPart) {
    return trimmedEmail ? "<invalid-email-format>" : "<empty>";
  }

  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

function getFieldErrors(error: unknown) {
  if (!(error instanceof ClientResponseError)) {
    return {};
  }

  const data = error.data as { data?: Record<string, unknown> } | null | undefined;

  if (!data || typeof data !== "object" || !data.data || typeof data.data !== "object") {
    return {};
  }

  return data.data as Record<string, unknown>;
}

function hasFieldError(error: unknown, field: string) {
  return getFieldErrors(error)[field] !== undefined;
}

function getAuthErrorDetails(error: unknown) {
  if (error instanceof ClientResponseError) {
    return {
      status: error.status,
      message: error.message,
      fieldErrors: getFieldErrors(error),
    };
  }

  if (!error || typeof error !== "object") {
    return {
      message: String(error),
    };
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
  };

  return {
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
  };
}

function logAuthInfo(stage: string, details: Record<string, unknown> = {}) {
  console.warn(`ReduxShare auth: ${stage}`, details);
}

function logAuthWarning(stage: string, details: Record<string, unknown> = {}) {
  console.warn(`ReduxShare auth: ${stage}`, details);
}

export async function restorePocketBaseSession(authSession: AuthSession): Promise<AuthSession> {
  const pb = getPocketBase(authSession);

  try {
    await pb.collection("users").authRefresh();
  } catch (error) {
    logAuthWarning("session refresh failed", {
      storedUserId: authSession.user.id,
      ...getAuthErrorDetails(error),
    });
    throw new AuthError("errors.sessionExpired");
  }

  const nextSession = mapPocketBaseSession(pb);

  if (!nextSession) {
    logAuthWarning("session refresh returned no session", {
      storedUserId: authSession.user.id,
    });
    throw new AuthError("errors.sessionMissing");
  }

  logAuthInfo("session refreshed", {
    storedUserId: authSession.user.id,
    userId: nextSession.user.id,
  });

  return nextSession;
}

export async function ensurePocketBaseSession(authSession: AuthSession): Promise<AuthSession> {
  const expiresAtMs = authSession.expiresAt ? authSession.expiresAt * 1000 : null;

  if (expiresAtMs && expiresAtMs - Date.now() > 60_000) {
    return authSession;
  }

  return restorePocketBaseSession(authSession);
}

export async function loginWithPocketBase({
  email,
  password,
}: LoginCredentials): Promise<AuthSession> {
  const pb = getPocketBase();
  const cleanEmail = email.trim();
  logAuthInfo("sign-in start", {
    email: maskAuthEmail(cleanEmail),
  });

  try {
    await pb.collection("users").authWithPassword(cleanEmail, password);
  } catch (error) {
    logAuthWarning("sign-in failed", {
      email: maskAuthEmail(cleanEmail),
      ...getAuthErrorDetails(error),
    });
    throw new AuthError("errors.loginFailed");
  }

  const authSession = mapPocketBaseSession(pb);

  if (!authSession) {
    logAuthWarning("sign-in returned no session", {
      email: maskAuthEmail(cleanEmail),
    });
    throw new AuthError("errors.loginNoSession");
  }

  logAuthInfo("sign-in success", {
    userId: authSession.user.id,
    email: authSession.user.email
      ? maskAuthEmail(authSession.user.email)
      : maskAuthEmail(cleanEmail),
  });

  return authSession;
}

export async function registerWithPocketBase({
  email,
  username,
  password,
}: RegisterCredentials): Promise<AuthResult> {
  const pb = getPocketBase();
  const cleanEmail = email.trim();
  const cleanUsername = username.trim();
  logAuthInfo("sign-up start", {
    email: maskAuthEmail(cleanEmail),
    username: cleanUsername,
  });

  try {
    await pb.collection("users").create({
      email: cleanEmail,
      password,
      passwordConfirm: password,
      username: cleanUsername,
      solved_tests_count: 0,
      solved_tasks_count: 0,
    });
  } catch (error) {
    logAuthWarning("sign-up failed", {
      email: maskAuthEmail(cleanEmail),
      username: cleanUsername,
      ...getAuthErrorDetails(error),
    });

    if (hasFieldError(error, "username")) {
      throw new AuthError("errors.usernameTaken");
    }

    throw new AuthError("errors.registerFailed");
  }

  try {
    await pb.collection("users").authWithPassword(cleanEmail, password);
  } catch (error) {
    logAuthWarning("sign-up auto sign-in failed (verification may be required)", {
      email: maskAuthEmail(cleanEmail),
      username: cleanUsername,
      ...getAuthErrorDetails(error),
    });

    return {
      authSession: null,
      messageKey: "auth.register.confirmEmail",
    };
  }

  const authSession = mapPocketBaseSession(pb);

  if (!authSession) {
    return {
      authSession: null,
      messageKey: "auth.register.confirmEmail",
    };
  }

  logAuthInfo("sign-up success", {
    userId: authSession.user.id,
    email: authSession.user.email
      ? maskAuthEmail(authSession.user.email)
      : maskAuthEmail(cleanEmail),
    username: cleanUsername,
  });

  return {
    authSession,
  };
}

export async function logoutFromPocketBase(authSession: AuthSession | null): Promise<void> {
  if (!authSession) {
    return;
  }

  try {
    getPocketBase(authSession).authStore.clear();
  } catch {
    // Logout must never fail the UI flow.
  }
}
