import { I18nError, type TranslationKey } from "../i18n";
import type { AuthSession } from "../types";

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
