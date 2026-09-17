import { describe, expect, it } from "vitest";
import "../src/content/stealthConsole";

const COPY_UNLOCK_STYLE_ID = "reduxshare-copy-unlock-style";

function postCopyUnlockMessage(enabled: boolean) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      origin: window.location.origin,
      data: {
        source: "ReduxShare",
        type: "REDUXSHARE_COPY_UNLOCK",
        enabled
      }
    })
  );
}

async function flushMessages() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("copy-paste unlock bridge", () => {
  it("installs user-select styles and blocks prohibition handlers when enabled", async () => {
    postCopyUnlockMessage(true);
    await flushMessages();

    const style = document.getElementById(COPY_UNLOCK_STYLE_ID);
    expect(style).toBeInstanceOf(HTMLStyleElement);
    expect(style?.textContent).toContain("user-select:text!important");

    let pageHandlerCalls = 0;
    // Registered after the unlock listeners, like a site prohibition handler would be.
    document.addEventListener("copy", () => {
      pageHandlerCalls += 1;
    });

    document.body.dispatchEvent(new Event("copy", { bubbles: true, cancelable: true }));
    expect(pageHandlerCalls).toBe(0);
  });

  it("lets ordinary keyboard input reach the page", async () => {
    postCopyUnlockMessage(true);
    await flushMessages();

    let pageHandlerCalls = 0;
    document.addEventListener("keydown", () => {
      pageHandlerCalls += 1;
    });

    document.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "a" }));
    expect(pageHandlerCalls).toBe(1);

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "c", ctrlKey: true })
    );
    expect(pageHandlerCalls).toBe(1);
  });

  it("removes styles and listeners when disabled", async () => {
    postCopyUnlockMessage(true);
    await flushMessages();
    expect(document.getElementById(COPY_UNLOCK_STYLE_ID)).toBeInstanceOf(HTMLStyleElement);

    postCopyUnlockMessage(false);
    await flushMessages();
    expect(document.getElementById(COPY_UNLOCK_STYLE_ID)).toBeNull();

    let pageHandlerCalls = 0;
    document.addEventListener("copy", () => {
      pageHandlerCalls += 1;
    });

    document.body.dispatchEvent(new Event("copy", { bubbles: true, cancelable: true }));
    expect(pageHandlerCalls).toBe(1);
  });
});
