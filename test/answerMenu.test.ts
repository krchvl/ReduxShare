import { describe, expect, it } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import {
  exactAnswerData,
  sourceAnswerData,
  unknownAnswerData,
  unknownSubmission,
  votedSubmission,
} from "./helpers/sourceData";
import type { SubmissionItem } from "../src/model";

const idleAiState = {
  status: "idle",
  answer: null,
  confidence: null,
  actions: [],
  error: null,
} as const;

function renderMenu(markup: string) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = markup;
  document.body.append(host);
  return root;
}

function textOf(root: ShadowRoot, selector: string) {
  return root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("R-menu source rendering", () => {
  it("shows internal exact answers and mirrors them into statistics fallback", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("true"),
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        true,
      ),
    );

    expect(textOf(root, '[data-menu-tab="internal"]')).toContain("Внутренние источники");
    expect(textOf(root, '[data-menu-tab="ai"]')).toContain("Инструменты ИИ");
    expect(textOf(root, '[data-answer-menu="reduxshare-exact"]')).toContain("true");
    expect(textOf(root, '[data-answer-menu="reduxshare-stats"]')).toContain("true");
    expect(textOf(root, '[data-answer-menu="reduxshare-stats"] .flyout-pct')).toBe("1");
  });

  it("renders hidden-review fallback only in statistics with white confidence", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: unknownAnswerData("true"),
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        true,
      ),
    );

    expect(textOf(root, '[data-answer-menu="reduxshare-exact"]')).toContain("Нет ответов");
    expect(textOf(root, '[data-answer-menu="reduxshare-stats"]')).toContain("true");
    expect(
      root
        .querySelector('[data-answer-menu="reduxshare-stats"] .flyout-pct')
        ?.getAttribute("style"),
    ).toContain("color:#ffffff");
  });

  it("shows external sources with the same exact/statistics structure", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          external: exactAnswerData("false"),
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        true,
      ),
    );

    expect(textOf(root, '[data-menu-tab="external"]')).toContain("Внешние источники");
    expect(textOf(root, '[data-answer-menu="external-exact"]')).toContain("false");
    expect(textOf(root, '[data-answer-menu="external-stats"]')).toContain("false");
  });

  it("renders external-only data without treating statistics as exact answers", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          external: unknownAnswerData("true"),
        }),
        false,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        false,
      ),
    );

    expect(root.querySelector('[data-menu-tab="internal"]')).toBeNull();
    expect(textOf(root, '[data-menu-tab="external"]')).toContain("Внешние источники");
    expect(textOf(root, '[data-answer-menu="external-exact"]')).toContain("Нет ответов");
    expect(
      root.querySelector('[data-answer-menu="external-exact"] [data-answer-label]'),
    ).toBeNull();
    expect(textOf(root, '[data-answer-menu="external-stats"]')).toContain("true");
  });

  it("keeps unauthenticated menus limited to external sources", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("internal answer"),
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        true,
        true,
      ),
    );

    expect(root.querySelector('[data-menu-tab="internal"]')).toBeNull();
    expect(root.querySelector('[data-menu-tab="ai"]')).toBeNull();
    expect(textOf(root, '[data-menu-tab="external"]')).toContain("Внешние источники");
    expect(textOf(root, '[data-answer-menu="external-exact"]')).toContain("Нет ответов");
  });

  it("strikes through known-incorrect statistics answers", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          external: {
            anchors: [],
            suggestions: [],
            submissions: [
              { correctness: -1, count: 1, label: "Facetime" },
              { correctness: 2, count: 1, label: "Yelp" },
            ],
            slots: [],
          },
        }),
        false,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        false,
      ),
    );

    const wrongLabel = Array.from(
      root.querySelectorAll('[data-answer-menu="external-stats"] .flyout-label'),
    ).find((node) => node.textContent?.trim() === "Facetime");
    expect(wrongLabel?.className).toContain("flyout-label--wrong");

    const correctLabel = Array.from(
      root.querySelectorAll('[data-answer-menu="external-stats"] .flyout-label'),
    ).find((node) => node.textContent?.trim() === "Yelp");
    expect(correctLabel?.className).not.toContain("flyout-label--wrong");
  });

  it("shows contributor and date metadata under internal answers", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: {
            anchors: [],
            suggestions: [
              {
                correctness: 2,
                confidence: 1,
                label: "LinkedIn",
                contributor: "maria",
                addedAt: "2026-09-01T10:00:00.000Z",
                updatedAt: "2026-09-02T10:00:00.000Z",
              },
            ],
            submissions: [],
            slots: [],
          },
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        true,
      ),
    );

    const option = root.querySelector(
      '[data-answer-menu="reduxshare-exact"] [data-answer-label="LinkedIn"]',
    );
    expect(option).toBeInstanceOf(HTMLElement);
    expect(option?.querySelector(".flyout-meta")).toBeNull();
    expect(option?.getAttribute("data-meta-user")).toBe("maria");
  });

  it("shows a hovercard with metadata near the cursor", async () => {
    const { attachAnswerHovercards } = await import("../src/ui/answerMenu");
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: {
            anchors: [],
            suggestions: [
              {
                correctness: 2,
                confidence: 1,
                label: "LinkedIn",
                contributor: "maria",
                addedAt: "2026-09-01T10:00:00.000Z",
                updatedAt: "2026-09-02T10:00:00.000Z",
              },
            ],
            submissions: [],
            slots: [],
          },
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        true,
      ),
    );

    attachAnswerHovercards(root);
    const option = root.querySelector<HTMLElement>(
      '[data-answer-menu="reduxshare-exact"] [data-answer-label="LinkedIn"]',
    );
    expect(option).toBeInstanceOf(HTMLElement);

    option!.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: false, clientX: 100, clientY: 100 }),
    );
    const card = root.querySelector<HTMLElement>(".flyout-hovercard");
    expect(card?.hidden).toBe(false);
    expect(card?.textContent).toContain("LinkedIn");
    expect(card?.textContent).toContain("maria");

    option!.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    expect(card?.hidden).toBe(true);
  });

  it("flips the hovercard to the left near the viewport edge", async () => {
    const { attachAnswerHovercards } = await import("../src/ui/answerMenu");
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: {
            anchors: [],
            suggestions: [
              {
                correctness: 2,
                confidence: 1,
                label: "LinkedIn",
                contributor: "maria",
                addedAt: "2026-09-01T10:00:00.000Z",
                updatedAt: "2026-09-02T10:00:00.000Z",
              },
            ],
            submissions: [],
            slots: [],
          },
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
        true,
      ),
    );

    attachAnswerHovercards(root);
    const option = root.querySelector<HTMLElement>(
      '[data-answer-menu="reduxshare-exact"] [data-answer-label="LinkedIn"]',
    );
    option!.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: false, clientX: 1000, clientY: 100 }),
    );
    const card = root.querySelector<HTMLElement>(".flyout-hovercard");
    expect(card?.hidden).toBe(false);
    expect(card?.style.left).toBe("754px");
  });

  it("hides AI tools when the question type disables AI", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("student.png"),
        }),
        true,
        idleAiState,
        false,
      ),
    );

    expect(root.querySelector('[data-menu-tab="ai"]')).toBeNull();
    expect(root.querySelector('[data-ai-action="send"]')).toBeNull();
  });
});

describe("R-menu vote rendering", () => {
  function renderStatsRoot(submissions: SubmissionItem[]) {
    return getQuizAttemptTestApi().then((api) =>
      renderMenu(
        api.getAnswerMenuMarkup(
          sourceAnswerData({
            reduxshare: {
              anchors: [],
              suggestions: [],
              submissions,
              slots: [],
            },
          }),
          true,
          idleAiState,
          true,
        ),
      ),
    );
  }

  it("renders vote buttons with counts and the own-vote highlight", async () => {
    const root = await renderStatsRoot([
      votedSubmission("Vercel", { taskId: "task-1", votesUp: 3, votesDown: 1, myVote: 1 }),
      votedSubmission("Netlify", { taskId: "task-2", votesUp: 0, votesDown: 2, myVote: 0 }),
    ]);

    const stats = root.querySelector('[data-answer-menu="reduxshare-stats"]');
    const clusters = stats!.querySelectorAll(".flyout-votes");
    expect(clusters).toHaveLength(2);

    const upButton = stats!.querySelector<HTMLButtonElement>('[data-vote-action="up"]');
    expect(upButton?.dataset.voteTaskId).toBe("task-1");
    expect(upButton?.getAttribute("aria-pressed")).toBe("true");
    expect(upButton?.className).toContain("flyout-vote-btn--active");
    expect(upButton?.querySelector(".flyout-vote-count")?.textContent).toBe("3");

    const downButton = stats!.querySelector<HTMLButtonElement>('[data-vote-action="down"]');
    expect(downButton?.dataset.voteTaskId).toBe("task-1");
    expect(downButton?.getAttribute("aria-pressed")).toBe("false");
    expect(downButton?.className).not.toContain("flyout-vote-btn--active");
    expect(downButton?.querySelector(".flyout-vote-count")?.textContent).toBe("1");
  });

  it("omits vote buttons for rows without a server task id", async () => {
    const root = await renderStatsRoot([
      votedSubmission("Vercel", { taskId: "task-1", votesUp: 1, votesDown: 0 }),
      unknownSubmission("Netlify", 2),
    ]);

    const rows = root.querySelectorAll('[data-answer-menu="reduxshare-stats"] .flyout-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector(".flyout-votes")).not.toBeNull();
    expect(rows[1]!.querySelector(".flyout-votes")).toBeNull();
  });

  it("omits vote buttons for verified answers even when vote data exists", async () => {
    const root = await renderStatsRoot([
      {
        correctness: 2,
        count: 9,
        label: "Vercel",
        taskId: "task-1",
        votesUp: 3,
        votesDown: 0,
        myVote: 0,
      },
      {
        correctness: 0,
        count: 4,
        label: "Netlify",
        taskId: "task-2",
        votesUp: 1,
        votesDown: 5,
        myVote: 0,
      },
      votedSubmission("GitHub Pages", { taskId: "task-3", votesUp: 1, votesDown: 0 }),
    ]);

    const rows = root.querySelectorAll('[data-answer-menu="reduxshare-stats"] .flyout-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.querySelector(".flyout-votes")).toBeNull();
    expect(rows[0]!.getAttribute("data-meta-votes")).toBeNull();
    expect(rows[0]!.querySelector(".flyout-label")?.className).not.toContain(
      "flyout-label--dubious",
    );
    expect(rows[1]!.querySelector(".flyout-votes")).toBeNull();
    expect(rows[1]!.getAttribute("data-meta-votes")).toBeNull();
    expect(rows[1]!.querySelector(".flyout-label")?.className).not.toContain(
      "flyout-label--dubious",
    );
    expect(rows[2]!.querySelector(".flyout-votes")).not.toBeNull();
  });

  it("marks downvoted variants as dubious in statistics", async () => {
    const root = await renderStatsRoot([
      votedSubmission("Vercel", { taskId: "task-1", votesUp: 1, votesDown: 4 }),
      votedSubmission("Netlify", { taskId: "task-2", votesUp: 4, votesDown: 4 }),
    ]);

    const labels = Array.from(
      root.querySelectorAll('[data-answer-menu="reduxshare-stats"] .flyout-label'),
    );
    const vercel = labels.find((node) => node.textContent?.trim() === "Vercel");
    const netlify = labels.find((node) => node.textContent?.trim() === "Netlify");

    expect(vercel?.className).toContain("flyout-label--dubious");
    expect(netlify?.className).not.toContain("flyout-label--dubious");
  });

  it("shows the votes line in the hovercard", async () => {
    const { attachAnswerHovercards } = await import("../src/ui/answerMenu");
    const root = await renderStatsRoot([
      votedSubmission("Vercel", { taskId: "task-1", votesUp: 3, votesDown: 1 }),
    ]);

    attachAnswerHovercards(root);
    const option = root.querySelector<HTMLElement>(
      '[data-answer-menu="reduxshare-stats"] [data-answer-label="Vercel"]',
    );
    expect(option).toBeInstanceOf(HTMLElement);
    expect(option?.getAttribute("data-meta-votes")).toBe("3/1");

    option!.dispatchEvent(
      new MouseEvent("mouseenter", { bubbles: false, clientX: 100, clientY: 100 }),
    );
    const card = root.querySelector<HTMLElement>(".flyout-hovercard");
    expect(card?.hidden).toBe(false);
    expect(card?.textContent).toContain("Голоса: 3 за · 1 против");
  });
});

describe("R-menu AI explain rendering", () => {
  function successAiState(answer: string) {
    return {
      status: "success",
      answer,
      confidence: 92,
      actions: [],
      error: null,
    } as const;
  }

  it("hides explain controls until an AI answer is received", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("true"),
        }),
        true,
        idleAiState,
        true,
      ),
    );

    expect(textOf(root, '[data-ai-action="send"]')).toContain("Отправить запрос");
    expect(textOf(root, '[data-ai-action="explain"]')).toContain("Объясни ответ");
    expect(root.querySelector<HTMLButtonElement>('[data-ai-action="explain"]')?.hidden).toBe(true);
    expect(root.querySelector('[data-answer-menu="ai-explanation"]')?.hidden).toBe(true);
  });

  it("shows explain controls with the explanation flyout after a successful AI answer", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("ом"),
        }),
        true,
        successAiState("ом"),
        true,
        false,
        {
          status: "success",
          answer: "Сопротивление измеряется в омах по определению единицы СИ.",
          confidence: 0,
          actions: [],
          error: null,
        },
      ),
    );

    expect(textOf(root, '[data-answer-menu="ai-explanation"]')).toContain("Объяснить ответ");
    expect(root.querySelector<HTMLButtonElement>('[data-ai-action="explain"]')?.hidden).toBe(false);
    expect(root.querySelector('[data-answer-menu="ai-explanation"]')?.hidden).toBe(false);
    expect(textOf(root, '[data-answer-menu="ai-explanation"] .flyout-text--answer')).toContain(
      "в омах",
    );
    expect(
      root.querySelector('[data-answer-menu="ai-explanation"] [data-ai-answer-action="apply"]'),
    ).toBeNull();
  });

  it("renders explanation loading and error states in the flyout", async () => {
    const api = await getQuizAttemptTestApi();
    const loadingRoot = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("ом"),
        }),
        true,
        successAiState("ом"),
        true,
        false,
        {
          status: "loading",
          answer: null,
          confidence: null,
          actions: [],
          error: null,
        },
      ),
    );

    expect(textOf(loadingRoot, '[data-answer-menu="ai-explanation"]')).toContain("Идёт запрос...");

    const errorRoot = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("ом"),
        }),
        true,
        successAiState("ом"),
        true,
        false,
        {
          status: "error",
          answer: null,
          confidence: null,
          actions: [],
          error: "AI request failed",
        },
      ),
    );

    expect(textOf(errorRoot, '[data-answer-menu="ai-explanation"] .flyout-text--error')).toBe(
      "AI request failed",
    );
  });
});
