import { I18nError } from "../../../i18n";
import { getFirebaseEnvConfig } from "../../envConfig";

export interface FirebaseRuntimeConfig {
  apiKey: string;
  projectId: string;
}

export const IDENTITY_TOOLKIT_ENDPOINT = "https://identitytoolkit.googleapis.com/v1";
export const SECURE_TOKEN_ENDPOINT = "https://securetoken.googleapis.com/v1/token";

export function requireFirebaseConfig(): FirebaseRuntimeConfig {
  const config = getFirebaseEnvConfig();

  if (!config) {
    throw new I18nError("errors.firebaseMissingConfig");
  }

  return config;
}

export function getFirestoreDocumentsUrl(projectId: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId,
  )}/databases/(default)/documents`;
}
