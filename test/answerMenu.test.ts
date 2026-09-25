import { describe, expect, it } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { exactAnswerData, sourceAnswerData, unknownAnswerData } from "./helpers/sourceData";

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

    expect(root.querySelector('[data-menu-tab="ai"]')).toBeNull();
    expect(root.querySelector('[data-ai-action="send"]')).toBeNull();
  });
});
