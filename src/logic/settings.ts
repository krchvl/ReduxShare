import { type StoredStateLike } from "../model";

export function canUseQuizFeatures(storedState: StoredStateLike | undefined) {
  return storedState?.settings?.extensionEnabled !== false;
}

export function isLoggedInToExtension(storedState: StoredStateLike | undefined) {
  const userId = storedState?.authSession?.user?.id;
  return typeof userId === "string" && userId.trim() !== "";
}

export function canUseAuthenticatedQuizFeatures(storedState: StoredStateLike | undefined) {
  return canUseQuizFeatures(storedState) && isLoggedInToExtension(storedState);
}

export function getContentLocale(language: "auto" | "ru" | "en" | undefined) {
  if (language === "en") {
    return "en-US";
  }

  if (language === "ru") {
    return "ru-RU";
  }

  if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }

  return typeof navigator !== "undefined" ? navigator.language : "ru-RU";
}
