import PocketBase, { BaseAuthStore, ClientResponseError, type AuthModel } from "pocketbase";
import { I18nError, type TranslationKey } from "../i18n";
import type { AuthSession } from "../types";
import { ensurePocketBaseSession, restorePocketBaseSession } from "./auth";

export const USERS_COLLECTION = "users";
export const TASKS_COLLECTION = "reduxshare_tasks";
export const REVIEW_IMPORTS_COLLECTION = "reduxshare_review_imports";

export function getPocketBaseUrl() {
  const rawUrl = (import.meta.env.VITE_POCKETBASE_URL as string | undefined)?.trim().replace(/\/+$/, "");

  if (!rawUrl) {
    throw new I18nError("errors.pocketbaseMissingConfig");
  }

  return rawUrl;
}

export function tryGetPocketBaseUrl(): string | null {
  try {
    return getPocketBaseUrl();
  } catch {
    return null;
  }
}

export function getPocketBaseLabel() {
  const rawLabel = (import.meta.env.VITE_POCKETBASE_LABEL as string | undefined)?.trim();
  return rawLabel || "Основной [DE #1]";
}

export type PingStatus = "good" | "warn" | "bad" | "offline";

export function pingStatusForLatency(latencyMs: number | null): PingStatus {
  if (latencyMs === null) {
    return "offline";
  }

  if (latencyMs <= 300) {
    return "good";
  }

  if (latencyMs <= 800) {
    return "warn";
  }

  return "bad";
}

export async function measurePocketBasePing(baseUrl: string, timeoutMs = 5000): Promise<number | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    return Date.now() - startedAt;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getJwtExpiresAt(token: string): number | null {
  try {
    const payloadSegment = token.split(".")[1];

    if (!payloadSegment) {
      return null;
    }

    const binary = atob(payloadSegment.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };

    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function mapPocketBaseSession(pb: PocketBase): AuthSession | null {
  if (!pb.authStore.isValid || !pb.authStore.token || !pb.authStore.model) {
    return null;
  }

  const model = pb.authStore.model as AuthModel & { email?: unknown };

  return {
    accessToken: pb.authStore.token,
    // PocketBase uses a single stateless auth token (no separate refresh token).
    // refreshToken mirrors accessToken to keep the StoredState shape compatible.
    refreshToken: pb.authStore.token,
    expiresAt: getJwtExpiresAt(pb.authStore.token),
    user: {
      id: model.id,
      email: typeof model.email === "string" ? model.email : null
    }
  };
}

/**
 * Creates a PocketBase client. A fresh instance is built per call on purpose:
 * the background service worker and the popup do not share memory, and the
 * persisted AuthSession from chrome.storage is the source of truth.
 */
export function getPocketBase(authSession?: AuthSession | null) {
  // In-memory auth store on purpose: the persisted AuthSession from
  // chrome.storage is the single source of truth. The default
  // LocalAuthStore would additionally leak tokens into window.localStorage
  // on extension pages.
  const pb = new PocketBase(getPocketBaseUrl(), new BaseAuthStore());
  pb.autoCancellation(false);

  if (authSession?.accessToken) {
    pb.authStore.save(authSession.accessToken, {
      id: authSession.user.id,
      email: authSession.user.email ?? ""
    } as unknown as AuthModel);
  }

  return pb;
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ClientResponseError && (error.status === 401 || error.status === 403);
}

export function isNotFoundError(error: unknown) {
  return error instanceof ClientResponseError && error.status === 404;
}

export function isValidationError(error: unknown) {
  return error instanceof ClientResponseError && error.status === 400;
}

function getClientResponseMessage(error: unknown) {
  if (error instanceof ClientResponseError) {
    const dataMessage =
      error.data && typeof error.data === "object" && "message" in error.data
        ? (error.data as { message?: unknown }).message
        : undefined;

    if (typeof dataMessage === "string" && dataMessage) {
      return dataMessage;
    }

    if (typeof error.message === "string" && error.message) {
      return error.message;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

export function toI18nError(error: unknown, messageKey: TranslationKey) {
  if (error instanceof I18nError) {
    return error;
  }

  return new I18nError(messageKey, { message: getClientResponseMessage(error) });
}

/**
 * Runs a PocketBase request with the stored session, refreshing the token once
 * when the server reports it as unauthorized (expired/invalid).
 */
export async function withPocketBaseSessionRetry<TResult>(
  authSession: AuthSession,
  runner: (pb: PocketBase, session: AuthSession) => Promise<TResult>
): Promise<{ authSession: AuthSession; result: TResult }> {
  let nextAuthSession = await ensurePocketBaseSession(authSession);

  try {
    return {
      authSession: nextAuthSession,
      result: await runner(getPocketBase(nextAuthSession), nextAuthSession)
    };
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      throw error;
    }

    nextAuthSession = await restorePocketBaseSession(nextAuthSession);

    return {
      authSession: nextAuthSession,
      result: await runner(getPocketBase(nextAuthSession), nextAuthSession)
    };
  }
}

export async function throwIfUserMissing(pb: PocketBase, userId: string): Promise<void> {
  try {
    await pb.collection(USERS_COLLECTION).getOne(userId, { fields: "id" });
  } catch (error) {
    if (isNotFoundError(error) || isUnauthorizedError(error)) {
      throw new I18nError("errors.sessionExpired");
    }

    throw error;
  }
}
