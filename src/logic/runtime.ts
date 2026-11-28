import { setAnswerMenuTranslator } from "../ui/answerMenu";
import { renderAttemptStatusPanel } from "../content/quizAttempt/attemptStatusPanel";
import { getContentTranslator } from "../i18n/contentI18n";
import { FULL_PAGE_LOAD_MAX_WAIT_MS, type StoredStateLike } from "../model";
import { APP_STORAGE_KEY } from "../shared/storageKeys";
import { COPY_UNLOCK_MESSAGE, CONTENT_MESSAGE_SOURCE } from "../shared/messages";
import { canUseQuizFeatures } from "./settings";
import { currentT, setCurrentStoredState, setCurrentT } from "../state";

export function isExtensionContextValid() {
  try {
    return typeof chrome !== "undefined" && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export async function loadStoredState(): Promise<StoredStateLike> {
  const result = await chrome.storage.local.get(APP_STORAGE_KEY);
  const storedState = (result[APP_STORAGE_KEY] as StoredStateLike | undefined) ?? {};
  setCurrentStoredState(storedState);
  return storedState;
}

export function syncLanguage(storedState: StoredStateLike | undefined) {
  setCurrentT(getContentTranslator(storedState?.settings?.language));
  setAnswerMenuTranslator(currentT);
}

export function syncContentUi() {
  renderAttemptStatusPanel();
}

export function syncCopyUnlock(storedState: StoredStateLike | undefined) {
  const enabled = canUseQuizFeatures(storedState);
  window.postMessage(
    {
      source: CONTENT_MESSAGE_SOURCE,
      type: COPY_UNLOCK_MESSAGE,
      enabled,
    },
    window.location.origin,
  );
}

export async function waitForFullPageLoad() {
  if (document.readyState === "complete") {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const finish = (isFullyLoaded: boolean) => {
      if (resolved) {
        return;
      }

      resolved = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("load", handleLoad);
      resolve(isFullyLoaded);
    };

    const handleLoad = () => finish(true);
    const timeoutId = window.setTimeout(() => finish(false), FULL_PAGE_LOAD_MAX_WAIT_MS);

    window.addEventListener("load", handleLoad, { once: true });
  });
}

export function logReduxShareInfo(...args: unknown[]) {
  console.log(...args);
}

export function logReduxShareWarning(...args: unknown[]) {
  console.warn(...args);
}
