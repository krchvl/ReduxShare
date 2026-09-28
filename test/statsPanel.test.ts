import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainScreen } from "../src/components/MainScreen";
import { I18nProvider } from "../src/i18n/react";
import { DEFAULT_SETTINGS, DEFAULT_UPDATE_STATE, type UserProfile } from "../src/types";

const { requestOwnUserProfile, requestUserLeaderboard, requestUserAttemptHistory } = vi.hoisted(
  () => ({
    requestOwnUserProfile: vi.fn(),
    requestUserLeaderboard: vi.fn(),
    requestUserAttemptHistory: vi.fn(),
  }),
);

vi.mock("../src/lib/userProfiles", () => ({
  requestOwnUserProfile,
  requestUserLeaderboard,
  requestUserAttemptHistory,
}));

const profile: UserProfile = {
  id: "user-1",
  email: "user@example.com",
  username: "ivan",
  moodleDomain: null,
  solvedTestsCount: 12,
  solvedTasksCount: 240,
  importedQuestionsCount: 156,
  attemptCorrectCount: 130,
  attemptIncorrectCount: 20,
};

const leaderboard = {
  entries: [
    {
      id: "other-1",
      username: "maria",
      importedQuestionsCount: 500,
      attemptCorrectCount: 470,
      attemptIncorrectCount: 10,
    },
    {
      id: "user-1",
      username: "ivan",
      importedQuestionsCount: 156,
      attemptCorrectCount: 130,
      attemptIncorrectCount: 20,
    },
  ],
  myRank: 2,
  totalContributors: 9,
  totalAnswerRows: 1234,
};

const attemptHistory = {
  entries: [
    {
      id: "attempt-2",
      domain: "moodle.example.com",
      courseId: 3,
      quizId: 77,
      pageUrl: "https://moodle.example.com/mod/quiz/review.php?attempt=22&cmid=77",
      importedQuestionsCount: 8,
      updatedAt: "2026-09-28 10:00:00.000",
    },
    {
      id: "attempt-1",
      domain: "moodle.example.com",
      courseId: 3,
      quizId: null,
      pageUrl: "",
      importedQuestionsCount: 12,
      updatedAt: "2026-09-27 09:30:00.000",
    },
  ],
  total: 2,
};

let root: Root | null = null;
let container: HTMLElement;

function renderMainScreen(userProfile?: UserProfile | null) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      createElement(
        I18nProvider,
        { language: "ru" },
        createElement(MainScreen, {
          settings: DEFAULT_SETTINGS,
          updateState: DEFAULT_UPDATE_STATE,
          isCheckingUpdates: false,
          userProfile,
          onSettingsChange: () => {},
          onCheckUpdates: () => {},
          onResetSettings: () => {},
          onLogout: () => {},
        }),
      ),
    );
  });
}

function clickStatsTab() {
  const statsTab = Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-tab")).find(
    (tab) => tab.textContent === "Статистика",
  );

  if (!statsTab) {
    return false;
  }

  act(() => {
    statsTab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  return true;
}

function tileValues() {
  return Array.from(container.querySelectorAll<HTMLElement>(".stats-tile__value")).map((tile) =>
    tile.textContent?.trim(),
  );
}

beforeEach(() => {
  requestOwnUserProfile.mockReset();
  requestOwnUserProfile.mockResolvedValue({ ok: true, userProfile: profile });
  requestUserLeaderboard.mockReset();
  requestUserLeaderboard.mockResolvedValue({ ok: true, leaderboard });
  requestUserAttemptHistory.mockReset();
  requestUserAttemptHistory.mockResolvedValue({ ok: true, history: attemptHistory });
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
});

describe("MainScreen stats tab", () => {
  it("adds the stats tab to the tab bar", () => {
    renderMainScreen(profile);

    const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-tab"));

    expect(tabs).toHaveLength(6);
    expect(tabs[0]?.textContent).toBe("Статистика");
    expect(tabs[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(tabs[1]?.textContent).toBe("Основные");
    expect(tabs[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(clickStatsTab()).toBe(true);
    expect(container.querySelector(".stats-panel")).not.toBeNull();
  });

  it("renders personal stats tiles from the fetched profile", async () => {
    requestOwnUserProfile.mockResolvedValue({ ok: true, userProfile: profile });
    renderMainScreen();

    act(() => {
      clickStatsTab();
    });
    await act(async () => {});

    const tiles = Array.from(container.querySelectorAll<HTMLElement>(".stats-tile"));
    const labels = tiles.map((tile) =>
      tile.querySelector(".stats-tile__label")?.textContent?.trim(),
    );

    expect(labels).toEqual(["Решено тестов", "Точность", "Импортировано"]);
    expect(tileValues()[0]).toBe("12");
    expect(tileValues()[2]).toBe("156");
    expect(tileValues()[1]).toMatch(/87\s?%/);
    expect(container.querySelector(".stats-tile__hint")?.textContent).toBe(
      "из проверенных ответов",
    );
  });

  it("shows the local profile while the server response is pending", () => {
    requestOwnUserProfile.mockReturnValue(new Promise(() => {}));
    renderMainScreen(profile);

    act(() => {
      clickStatsTab();
    });

    expect(tileValues()[0]).toBe("12");
    expect(container.querySelector(".stats-status")?.textContent).toBe("Загружаем статистику…");
  });

  it("renders the error state and retries on demand", async () => {
    requestOwnUserProfile.mockResolvedValue({ ok: false, error: "boom" });
    renderMainScreen();

    act(() => {
      clickStatsTab();
    });
    await act(async () => {});

    const errorBlock = container.querySelector(".stats-error");
    expect(errorBlock?.textContent).toContain("boom");

    requestOwnUserProfile.mockResolvedValue({ ok: true, userProfile: profile });
    const retryButton = errorBlock?.querySelector<HTMLButtonElement>("button");
    act(() => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});

    expect(container.querySelector(".stats-error")).toBeNull();
    expect(tileValues()[0]).toBe("12");
  });

  it("renders the leaderboard with ranks, totals and own-row highlight", async () => {
    renderMainScreen();

    act(() => {
      clickStatsTab();
    });
    await act(async () => {});

    const head = container.querySelector(".stats-leaderboard__head");
    expect(head?.querySelector("h2")?.textContent).toBe("Лидерборд контрибьюторов");
    expect(head?.querySelector(".stats-leaderboard__rank")?.textContent).toBe("Ваше место: #2");

    const meta = container.querySelector(".stats-leaderboard__meta")?.textContent ?? "";
    expect(meta).toMatch(/1\s?234/);
    expect(meta).toContain("9");

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".stats-leaderboard__row:not(.stats-leaderboard__row--head)",
      ),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".stats-leaderboard__place")?.textContent).toBe("1");
    expect(rows[0].querySelector(".stats-leaderboard__user")?.textContent).toContain("maria");
    expect(rows[0].className).toContain("stats-leaderboard__row--top");
    expect(rows[0].querySelector(".stats-leaderboard__count")?.textContent).toBe("500");
    expect(rows[0].querySelector(".stats-leaderboard__accuracy")?.textContent).toMatch(/98\s?%/);

    expect(rows[1].className).toContain("stats-leaderboard__row--me");
    expect(rows[1].querySelector(".stats-leaderboard__you")?.textContent).toBe("вы");
    expect(rows[1].querySelector(".stats-leaderboard__accuracy")?.textContent).toMatch(/87\s?%/);
  });

  it("renders the empty leaderboard state without the rank chip", async () => {
    requestUserLeaderboard.mockResolvedValue({
      ok: true,
      leaderboard: { ...leaderboard, entries: [], myRank: null, totalContributors: 0 },
    });
    renderMainScreen();

    act(() => {
      clickStatsTab();
    });
    await act(async () => {});

    expect(container.querySelector(".stats-leaderboard__empty")?.textContent).toBe(
      "Пока нет импортированных ответов — лидерборд заполнится после первых импортов",
    );
    expect(container.querySelector(".stats-leaderboard__grid")).toBeNull();
    expect(container.querySelector(".stats-leaderboard__rank")).toBeNull();
  });

  it("renders the attempt history rows below the leaderboard", async () => {
    renderMainScreen();

    act(() => {
      clickStatsTab();
    });
    await act(async () => {});

    const head = container.querySelector(".stats-history__head");
    expect(head?.querySelector("h2")?.textContent).toBe("История попыток");
    expect(head?.querySelector(".stats-history__total")?.textContent).toBe("Попыток: 2");

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(".stats-history__row:not(.stats-history__row--head)"),
    );
    expect(rows).toHaveLength(2);

    const link = rows[0]?.querySelector<HTMLAnchorElement>(".stats-history__quiz a");
    expect(link?.textContent).toBe("Тест #77");
    expect(link?.getAttribute("href")).toBe(attemptHistory.entries[0]?.pageUrl);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(rows[0]?.querySelector(".stats-history__count")?.textContent).toBe("8");
    expect(rows[0]?.querySelector(".stats-history__date")?.textContent).not.toBe("—");
    expect(rows[0]?.querySelector(".stats-history__domain")?.textContent).toBe(
      "moodle.example.com",
    );

    expect(rows[1]?.querySelector(".stats-history__quiz a")).toBeNull();
    expect(rows[1]?.querySelector(".stats-history__quiz")?.textContent).toBe("—");
  });

  it("renders the empty attempt history state without the grid", async () => {
    requestUserAttemptHistory.mockResolvedValue({
      ok: true,
      history: { entries: [], total: 0 },
    });
    renderMainScreen();

    act(() => {
      clickStatsTab();
    });
    await act(async () => {});

    expect(container.querySelector(".stats-history__empty")?.textContent).toBe(
      "Пока нет импортированных попыток — история заполнится после импорта ответов со страниц review",
    );
    expect(container.querySelector(".stats-history__grid")).toBeNull();
    expect(container.querySelector(".stats-history__total")?.textContent).toBe("Попыток: 0");
  });
});
