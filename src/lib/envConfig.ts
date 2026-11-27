import type { AuthSession, ServerConfig } from "../types";

export const BUILTIN_SERVER_ID = "primary";

export type DataProviderId = "pocketbase" | "firebase";

export interface FirebaseEnvConfig {
  apiKey: string;
  projectId: string;
}

export function getDataProvider(): DataProviderId {
  const rawProvider = (import.meta.env.VITE_DATA_PROVIDER as string | undefined)
    ?.trim()
    .toLowerCase();

  return rawProvider === "firebase" ? "firebase" : "pocketbase";
}

export function isFirebaseBackend(): boolean {
  return getDataProvider() === "firebase";
}

export function isOfficialAiAvailable(): boolean {
  return !isFirebaseBackend();
}

export function getFirebaseEnvConfig(): FirebaseEnvConfig | null {
  const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim();
  const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim();

  if (!apiKey || !projectId) {
    return null;
  }

  return { apiKey, projectId };
}

export function isAuthSessionForProvider(authSession: AuthSession | null | undefined): boolean {
  if (!authSession) {
    return false;
  }

  return (authSession.provider ?? "pocketbase") === getDataProvider();
}

export function getEnvPocketBaseUrl(): string | null {
  const rawUrl = (import.meta.env.VITE_POCKETBASE_URL as string | undefined)?.trim();

  if (!rawUrl) {
    return null;
  }

  return rawUrl.replace(/\/+$/, "");
}

export function getEnvPocketBaseLabel(): string {
  const rawLabel = (import.meta.env.VITE_POCKETBASE_LABEL as string | undefined)?.trim();
  return rawLabel || "Основной [DE #1]";
}

export function getBuiltinServerConfig(): ServerConfig | null {
  const url = getEnvPocketBaseUrl();

  if (!url) {
    return null;
  }

  return { id: BUILTIN_SERVER_ID, url, label: getEnvPocketBaseLabel(), builtIn: true };
}
