import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_UPDATE_STATE, type AuthSession } from "../src/types";
import type * as UpdatesLib from "../src/lib/updates";

const appMocks = vi.hoisted(() => ({
  loadStoredState: vi.fn(),
  saveStoredState: vi.fn(),
  requestUpdateCheck: vi.fn(),
}));

vi.mock("../src/lib/storage", () => ({
  loadStoredState: appMocks.loadStoredState,
  saveStoredState: appMocks.saveStoredState,
}));

vi.mock("../src/lib/updates", async () => {
  const actual = await vi.importActual<typeof UpdatesLib>("../src/lib/updates");
  return { ...actual, requestUpdateCheck: appMocks.requestUpdateCheck };
});

async function importApp() {
  return import("../src/App");
}

const authSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: null,
  user: { id: "user-1", email: "user@example.com" },
};

let root: Root | null = null;

describe("App update check effect", () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    document.body.innerHTML = "";
  });

  it("does not loop the update check across renders", async () => {
    appMocks.loadStoredState.mockResolvedValue({
      settings: DEFAULT_SETTINGS,
      authSession,
      userProfile: null,
    });
    appMocks.saveStoredState.mockResolvedValue(undefined);
    // A fresh response object per call, like the real background worker sends.
    appMocks.requestUpdateCheck.mockImplementation(async () => ({
      ok: true,
      updateState: {
        ...DEFAULT_UPDATE_STATE,
        status: "up-to-date",
        checkedAt: new Date().toISOString(),
      },
    }));

    const { App } = await importApp();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(Suspense, { fallback: null }, createElement(App)));
    });

    // Let hydration, the lazy MainScreen chunk and effects settle.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (container.querySelector(".settings-tab")) {
        break;
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    }

    const tabs = Array.from(container.querySelectorAll(".settings-tab")) as HTMLElement[];
    expect(tabs.length).toBeGreaterThan(0);

    for (const tab of tabs) {
      await act(async () => {
        tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    }

    // An update-depth loop would land here instead of the settings panel.
    expect(container.querySelector(".error-boundary")).toBeNull();
    expect(container.querySelector(".settings-panel__rows")).not.toBeNull();
    // One check after hydration (plus StrictMode-free single mount), not dozens.
    expect(appMocks.requestUpdateCheck.mock.calls.length).toBeLessThanOrEqual(3);
  }, 20000);
});
