import { I18nError, type TranslationKey } from "../../i18n";

export function toDataError(error: unknown, messageKey: TranslationKey) {
  if (error instanceof I18nError) {
    return error;
  }

  return new I18nError(messageKey, {
    message: error instanceof Error ? error.message : String(error),
  });
}
