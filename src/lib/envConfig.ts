import type { ServerConfig } from "../types";

export const BUILTIN_SERVER_ID = "primary";

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
