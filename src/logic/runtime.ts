// Moved out of src/content/quizAttempt.ts.
import { setAnswerMenuTranslator } from "../ui/answerMenu";
import { renderAttemptStatusPanel } from "../content/quizAttempt/attemptStatusPanel";
import { getContentTranslator } from "../i18n/contentI18n";
import { FULL_PAGE_LOAD_MAX_WAIT_MS, type StoredStateLike } from "../model";
import { APP_STORAGE_KEY } from "../shared/storageKeys";
import { COPY_UNLOCK_MESSAGE, STEALTH_MESSAGE_SOURCE, STEALTH_MODE_MESSAGE } from "../shared/messages";
import { canUseQuizFeatures } from "./settings";
import {
  currentT,
  setCurrentStoredState,
  setCurrentT,
  setStealthModeEnabled,
  stealthModeEnabled,
} from "../state";

// Moved out of src/content/quizAttempt.ts.





// After the extension is reloaded, updated, or uninstalled, content scripts
// already running in open tabs keep executing with a dead extension context:
// every chrome.* call then throws "Extension context invalidated". The quiz
// pages mutate constantly (timers, observers), so an unguarded hot path turns
// into console spam. chrome.runtime.id is only present while the context is
// alive, which makes it a cheap synchronous liveness check.
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

export function syncStealthMode(storedState: StoredStateLike | undefined) {
  setStealthModeEnabled(canUseQuizFeatures(storedState) && storedState?.settings?.stealthMode !== false);
  window.postMessage(
    {
      source: STEALTH_MESSAGE_SOURCE,
      type: STEALTH_MODE_MESSAGE,
      enabled: stealthModeEnabled
    },
    window.location.origin
  );
  renderAttemptStatusPanel();
}

export function syncCopyUnlock(storedState: StoredStateLike | undefined) {
  const enabled = canUseQuizFeatures(storedState) && storedState?.settings?.copyUnlock === true;
  window.postMessage(
    {
      source: STEALTH_MESSAGE_SOURCE,
      type: COPY_UNLOCK_MESSAGE,
      enabled
    },
    window.location.origin
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
  if (!stealthModeEnabled) {
    console.log(...args);
  }
}

export function logReduxShareWarning(...args: unknown[]) {
  if (!stealthModeEnabled) {
    console.warn(...args);
  }
}
