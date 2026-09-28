import { describe, expect, it } from "vitest";

import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { syncCopyUnlock } from "../src/logic/runtime";
import { APP_STORAGE_KEY } from "../src/shared/storageKeys";

interface CopyUnlockMessage {
  source?: unknown;
  type?: unknown;
  enabled?: unknown;
}

function collectCopyUnlockMessages() {
  const messages: CopyUnlockMessage[] = [];

  const listener = (event: MessageEvent) => {
    const data = event.data as CopyUnlockMessage | undefined;

    if (data?.type === "REDUXSHARE_COPY_UNLOCK") {
      messages.push(data);
    }
  };

  window.addEventListener("message", listener);

  return {
    messages,
    stop: () => window.removeEventListener("message", listener),
  };
}

function waitForPostMessageDelivery() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function storedStateWith(copyUnlock: boolean) {
  return {
    settings: {
      extensionEnabled: true,
      stealthMode: false,
      language: "ru",
      copyUnlock,
    },
    authSession: { user: { id: "u1" } },
  };
}

describe("copy unlock sync on quiz pages", () => {
  it("pushes enabled copy unlock state to the MAIN world", async () => {
    const api = await getQuizAttemptTestApi();
    api.reset();
    api.setStoredState(storedStateWith(true));

    const { messages, stop } = collectCopyUnlockMessages();
    syncCopyUnlock(api.getStoredState());
    await waitForPostMessageDelivery();
    stop();

    expect(messages).toEqual([
      { source: "ReduxShare", type: "REDUXSHARE_COPY_UNLOCK", enabled: true },
    ]);
  });

  it("pushes disabled copy unlock state when the setting is off", async () => {
    const api = await getQuizAttemptTestApi();
    api.reset();
    api.setStoredState(storedStateWith(false));

    const { messages, stop } = collectCopyUnlockMessages();
    syncCopyUnlock(api.getStoredState());
    await waitForPostMessageDelivery();
    stop();

    expect(messages).toEqual([
      { source: "ReduxShare", type: "REDUXSHARE_COPY_UNLOCK", enabled: false },
    ]);
  });

  it("re-pushes copy unlock when the popup writes new settings", async () => {
    window.history.pushState({}, "", "/mod/quiz/view.php?id=1150");

    const api = await getQuizAttemptTestApi();
    api.reset();
    api.setStoredState(storedStateWith(false));
    api.watchStoredSettingsChanges();

    const { messages, stop } = collectCopyUnlockMessages();

    await chrome.storage.local.set({
      [APP_STORAGE_KEY]: storedStateWith(true),
    });
    await waitForPostMessageDelivery();
    stop();

    expect(messages.some((message) => message.enabled === true)).toBe(true);
  });
});
