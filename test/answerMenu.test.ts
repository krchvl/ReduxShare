import { describe, expect, it } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import {
  exactAnswerData,
  sourceAnswerData,
  unknownAnswerData
} from "./helpers/sourceData";

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
          reduxshare: exactAnswerData("true")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true
      )
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
          reduxshare: unknownAnswerData("true")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true
      )
    );

    expect(textOf(root, '[data-answer-menu="reduxshare-exact"]')).toContain("Нет ответов");
    expect(textOf(root, '[data-answer-menu="reduxshare-stats"]')).toContain("true");
    expect(root.querySelector('[data-answer-menu="reduxshare-stats"] .flyout-pct')?.getAttribute("style")).toContain(
      "color:#ffffff"
    );
  });

  it("shows external sources with the same exact/statistics structure", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          external: exactAnswerData("false")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true
      )
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
          external: unknownAnswerData("true")
        }),
        false,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        false
      )
    );

    expect(root.querySelector('[data-menu-tab="internal"]')).toBeNull();
    expect(textOf(root, '[data-menu-tab="external"]')).toContain("Внешние источники");
    expect(textOf(root, '[data-answer-menu="external-exact"]')).toContain("Нет ответов");
    expect(root.querySelector('[data-answer-menu="external-exact"] [data-answer-label]')).toBeNull();
    expect(textOf(root, '[data-answer-menu="external-stats"]')).toContain("true");
  });

  it("keeps unauthenticated menus limited to external sources", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("internal answer")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true,
        true
      )
    );

    expect(root.querySelector('[data-menu-tab="internal"]')).toBeNull();
    expect(root.querySelector('[data-menu-tab="ai"]')).toBeNull();
    expect(textOf(root, '[data-menu-tab="external"]')).toContain("Внешние источники");
    expect(textOf(root, '[data-answer-menu="external-exact"]')).toContain("Нет ответов");
  });

  it("hides AI tools when the question type disables AI", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("student.png")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        false
      )
    );

    expect(root.querySelector('[data-menu-tab="ai"]')).toBeNull();
    expect(root.querySelector('[data-ai-action="send"]')).toBeNull();
  });
});
