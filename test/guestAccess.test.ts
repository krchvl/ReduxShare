import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainScreen } from "../src/components/MainScreen";
import { I18nProvider } from "../src/i18n/react";
import {
  DEFAULT_SETTINGS,
  DEFAULT_UPDATE_STATE,
  type AuthSession,
  type Settings,
} from "../src/types";
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

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const authSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: null,
  user: { id: "user-1", email: "user@example.com" },
};

beforeEach(() => {
  appMocks.loadStoredState.mockReset();
  appMocks.saveStoredState.mockReset();
  appMocks.requestUpdateCheck.mockReset();
  appMocks.saveStoredState.mockResolvedValue(undefined);
  appMocks.requestUpdateCheck.mockResolvedValue({ ok: true, updateState: null });
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
  document.body.innerHTML = "";
});

function renderMainScreen(overrides: { isAuthenticated?: boolean; settings?: Settings } = {}) {
  const onOpenLogin = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      createElement(
        I18nProvider,
        { language: "en" },
        createElement(MainScreen, {
          settings: overrides.settings ?? DEFAULT_SETTINGS,
          updateState: DEFAULT_UPDATE_STATE,
          isCheckingUpdates: false,
          isAuthenticated: overrides.isAuthenticated ?? false,
          onSettingsChange: vi.fn(),
          onCheckUpdates: vi.fn(),
          onResetSettings: vi.fn(),
          onLogout: vi.fn(),
          onOpenLogin,
        }),
      ),
    );
  });

  return { onOpenLogin };
}

function clickTab(labels: string | string[]) {
  const expected = Array.isArray(labels) ? labels : [labels];
  const tab = Array.from(container!.querySelectorAll<HTMLButtonElement>(".settings-tab")).find(
    (button) => expected.includes(button.textContent ?? ""),
  );
  expect(tab).toBeTruthy();

  act(() => {
    tab!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const statsTab = ["Stats", "Статистика"];
const aiTab = ["AI", "ИИ"];
const extraTab = ["Extra", "Дополнительно"];
const gateMessages = {
  en: "Sign in for full extension access",
  ru: "Авторизуйтесь для получения полного доступа к расширению",
};

async function renderApp() {
  const { App } = await import("../src/App");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(createElement(Suspense, { fallback: null }, createElement(App)));
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (container.querySelector(".settings-tab") || container.querySelector(".auth-form")) {
      break;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

describe("guest access in MainScreen", () => {
  it("blurs the stats panel behind the auth gate for guests", () => {
    renderMainScreen({ isAuthenticated: false });
    clickTab(statsTab);

    const gate = container!.querySelector(".auth-gated");
    expect(gate).toBeTruthy();
    expect(gate!.querySelector(".auth-gated__message")?.textContent).toBe(gateMessages.en);
    expect(gate!.querySelector(".auth-gated__content")?.getAttribute("aria-hidden")).toBe("true");
    expect(gate!.querySelector(".stats-panel")).toBeTruthy();
  });

  it("does not request background stats data for guests", () => {
    renderMainScreen({ isAuthenticated: false });
    clickTab(statsTab);

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("routes the gate action to the login screen", () => {
    const { onOpenLogin } = renderMainScreen({ isAuthenticated: false });
    clickTab(statsTab);

    const action = container!.querySelector<HTMLButtonElement>(".auth-gated__action");
    expect(action).toBeTruthy();

    act(() => {
      action!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenLogin).toHaveBeenCalledTimes(1);
  });

  it("renders the stats panel without the gate for authenticated users", () => {
    renderMainScreen({ isAuthenticated: true });
    clickTab(statsTab);

    expect(container!.querySelector(".auth-gated")).toBeNull();
    expect(container!.querySelector(".stats-panel")).toBeTruthy();
  });

  it("gates the official AI block but keeps the custom mode usable for guests", () => {
    renderMainScreen({
      isAuthenticated: false,
      settings: {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, accessMode: "official" },
      },
    });
    clickTab(aiTab);

    expect(container!.querySelector(".auth-gated")).toBeTruthy();
    expect(container!.querySelector(".ai-official__plans")).toBeTruthy();

    const customCard = container!.querySelector<HTMLButtonElement>(
      '.tab-card[aria-label="Custom"]',
    );
    expect(customCard).toBeTruthy();

    act(() => {
      customCard!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container!.querySelector(".auth-gated")).toBeNull();
    expect(container!.querySelector(".ai-provider-tab")).toBeTruthy();
  });

  it("shows the official AI block without the gate for authenticated users", () => {
    renderMainScreen({
      isAuthenticated: true,
      settings: {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, accessMode: "official" },
      },
    });
    clickTab(aiTab);

    expect(container!.querySelector(".auth-gated")).toBeNull();
    expect(container!.querySelector(".ai-official__plans")).toBeTruthy();
  });

  it("hides the official models block from guests", () => {
    renderMainScreen({
      isAuthenticated: false,
      settings: {
        ...DEFAULT_SETTINGS,
        ai: { ...DEFAULT_SETTINGS.ai, accessMode: "official" },
      },
    });
    clickTab(aiTab);

    expect(container!.querySelector(".ai-official__models")).toBeNull();
  });

  it("offers sign-in instead of logout in the extra tab for guests", () => {
    renderMainScreen({ isAuthenticated: false });
    clickTab(extraTab);

    const actions = container!.querySelector(".settings-panel__account-actions");
    expect(actions).toBeTruthy();
    expect(
      Array.from(actions!.querySelectorAll("button")).map((button) => button.textContent),
    ).toContain("Sign in");
  });

  it("keeps the logout button for authenticated users", () => {
    renderMainScreen({ isAuthenticated: true });
    clickTab(extraTab);

    const actions = container!.querySelector(".settings-panel__account-actions");
    expect(actions).toBeTruthy();
    expect(
      Array.from(actions!.querySelectorAll("button")).map((button) => button.textContent),
    ).toContain("Log out");
  });
});

describe("guest access through the popup entry", () => {
  it("lets an unauthenticated user into the main menu and gates the protected tabs", async () => {
    appMocks.loadStoredState.mockResolvedValue({
      settings: DEFAULT_SETTINGS,
      authSession: null,
      userProfile: null,
    });

    await renderApp();

    const guestButton = container!.querySelector<HTMLButtonElement>(".auth-button--guest");
    expect(["Continue without sign-in", "Продолжить без входа"]).toContain(
      guestButton?.textContent,
    );

    await act(async () => {
      guestButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (container.querySelector(".settings-tab")) {
        break;
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }

    expect(container!.querySelectorAll(".settings-tab").length).toBeGreaterThan(0);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    clickTab(statsTab);
    expect(container!.querySelector(".auth-gated__message")?.textContent).toBe(gateMessages.ru);
  });

  it("skips the login screen for a stored session and leaves the stats tab ungated", async () => {
    appMocks.loadStoredState.mockResolvedValue({
      settings: DEFAULT_SETTINGS,
      authSession,
      userProfile: null,
    });

    await renderApp();

    expect(container!.querySelector(".auth-button--guest")).toBeNull();
    expect(container!.querySelectorAll(".settings-tab").length).toBeGreaterThan(0);

    clickTab(statsTab);
    expect(container!.querySelector(".auth-gated")).toBeNull();
    expect(container!.querySelector(".stats-panel")).toBeTruthy();
  });

  it("returns to the login screen from the gate action", async () => {
    appMocks.loadStoredState.mockResolvedValue({
      settings: DEFAULT_SETTINGS,
      authSession: null,
      userProfile: null,
    });

    await renderApp();

    await act(async () => {
      container!
        .querySelector<HTMLButtonElement>(".auth-button--guest")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (container.querySelector(".settings-tab")) {
        break;
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }

    clickTab(statsTab);

    await act(async () => {
      container!
        .querySelector<HTMLButtonElement>(".auth-gated__action")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container!.querySelector(".auth-form--login")).toBeTruthy();
    expect(container!.querySelector(".settings-tab")).toBeNull();
  });
});
