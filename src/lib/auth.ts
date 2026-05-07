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
    throw new AuthError("errors.sessionExpired");
  }

  if (!data.session) {
    throw new AuthError("errors.sessionMissing");
  }

  return mapSupabaseSession(data.session);
}

export async function loginWithSupabase({ email, password }: LoginCredentials): Promise<AuthSession> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new AuthError("errors.loginFailed");
  }

  if (!data.session) {
    throw new AuthError("errors.loginNoSession");
  }

  return mapSupabaseSession(data.session);
}

export async function registerWithSupabase({ email, username, password }: RegisterCredentials): Promise<AuthResult> {
  const supabase = getSupabaseClient();
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
    const message = error.message.toLowerCase().includes("username") ? "errors.usernameTaken" : "errors.registerFailed";

    throw new AuthError(message);
  }

  if (!data.session) {
    return {
      authSession: null,
      messageKey: "auth.register.confirmEmail"
    };
  }

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
