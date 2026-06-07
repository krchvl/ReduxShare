import type { Session } from "@supabase/supabase-js";
import { I18nError, type TranslationKey } from "../i18n";
import type { AuthSession, LoginCredentials, RegisterCredentials } from "../types";
import { getSupabaseClient } from "./supabaseClient";

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

function getAuthErrorDetails(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      message: String(error)
    };
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    status?: unknown;
    code?: unknown;
    error?: unknown;
    error_description?: unknown;
  };

  return {
    name: typeof candidate.name === "string" ? candidate.name : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined,
    status: typeof candidate.status === "number" || typeof candidate.status === "string" ? candidate.status : undefined,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    error: typeof candidate.error === "string" ? candidate.error : undefined,
    errorDescription: typeof candidate.error_description === "string" ? candidate.error_description : undefined
  };
}

function logAuthInfo(stage: string, details: Record<string, unknown> = {}) {
  console.info(`ReduxShare auth: ${stage}`, details);
}

function logAuthWarning(stage: string, details: Record<string, unknown> = {}) {
  console.warn(`ReduxShare auth: ${stage}`, details);
}

export function mapSupabaseSession(session: Session): AuthSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    user: {
      id: session.user.id,
      email: session.user.email ?? null
    }
  };
}

export async function restoreSupabaseSession(authSession: AuthSession): Promise<AuthSession> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.setSession({
    access_token: authSession.accessToken,
    refresh_token: authSession.refreshToken
  });

  if (error) {
    logAuthWarning("session restore failed", getAuthErrorDetails(error));
    throw new AuthError("errors.sessionExpired");
  }

  if (!data.session) {
    logAuthWarning("session restore returned no session");
    throw new AuthError("errors.sessionMissing");
  }

  logAuthInfo("session restored", {
    userId: data.session.user.id,
    email: data.session.user.email ? maskAuthEmail(data.session.user.email) : null
  });

  return mapSupabaseSession(data.session);
}

export async function loginWithSupabase({ email, password }: LoginCredentials): Promise<AuthSession> {
  const supabase = getSupabaseClient();
  logAuthInfo("sign-in start", {
    email: maskAuthEmail(email)
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    logAuthWarning("sign-in failed", {
      email: maskAuthEmail(email),
      ...getAuthErrorDetails(error)
    });
    throw new AuthError("errors.loginFailed");
  }

  if (!data.session) {
    logAuthWarning("sign-in returned no session", {
      email: maskAuthEmail(email),
      userId: data.user?.id ?? null
    });
    throw new AuthError("errors.loginNoSession");
  }

  logAuthInfo("sign-in success", {
    userId: data.session.user.id,
    email: data.session.user.email ? maskAuthEmail(data.session.user.email) : maskAuthEmail(email)
  });

  return mapSupabaseSession(data.session);
}

export async function registerWithSupabase({ email, username, password }: RegisterCredentials): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  logAuthInfo("sign-up start", {
    email: maskAuthEmail(email),
    username
  });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username
      }
    }
  });

  if (error) {
    logAuthWarning("sign-up failed", {
      email: maskAuthEmail(email),
      username,
      ...getAuthErrorDetails(error)
    });
    const message = error.message.toLowerCase().includes("username") ? "errors.usernameTaken" : "errors.registerFailed";

    throw new AuthError(message);
  }

  if (!data.session) {
    logAuthWarning("sign-up returned no session", {
      email: maskAuthEmail(email),
      username,
      userId: data.user?.id ?? null,
      confirmedAt: data.user?.confirmed_at ?? null,
      emailConfirmedAt: data.user?.email_confirmed_at ?? null
    });

    return {
      authSession: null,
      messageKey: "auth.register.confirmEmail"
    };
  }

  logAuthInfo("sign-up success", {
    userId: data.session.user.id,
    email: data.session.user.email ? maskAuthEmail(data.session.user.email) : maskAuthEmail(email),
    username
  });

  return {
    authSession: mapSupabaseSession(data.session)
  };
}

export async function logoutFromSupabase(authSession: AuthSession | null): Promise<void> {
  const supabase = getSupabaseClient();

  if (authSession) {
    await supabase.auth
      .setSession({
        access_token: authSession.accessToken,
        refresh_token: authSession.refreshToken
      })
      .catch(() => null);
  }

  await supabase.auth.signOut().catch(() => null);
}
