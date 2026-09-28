import { beforeEach, describe, expect, it } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { loadQuestionFixture } from "./helpers/fixtures";
import type { EssayExampleEntry } from "../src/model";

const idleAiState = {
  status: "idle",
  answer: null,
  confidence: null,
  actions: [],
  error: null,
} as const;

function essayExample(overrides: Partial<EssayExampleEntry> = {}): EssayExampleEntry {
  return {
    exampleId: "essay-1",
    questionId: "q-1",
    questionHash: "hash-1",
    body: "The revolution was caused by the crisis of the provisional government.",
    authorName: "alice",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    votesUp: 3,
    votesDown: 0,
    myVote: 0,
    ...overrides,
  };
}

function renderMenu(markup: string) {
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = markup;
  document.body.append(host);
  return root;
}

async function renderEssayMenu(options: {
  examples: EssayExampleEntry[];
  canSave?: boolean;
  externalOnly?: boolean;
}) {
  const api = await getQuizAttemptTestApi();

  return renderMenu(
    api.getAnswerMenuMarkup(
      api.createEmptySourceAnswerData(),
      true,
      idleAiState,
      true,
      options.externalOnly ?? false,
      idleAiState,
      { examples: options.examples, canSave: options.canSave ?? true },
    ),
  );
}

describe("R-menu essay examples panel", () => {
  it("renders the essay examples tab with rows, votes and the save button", async () => {
    const root = await renderEssayMenu({
      examples: [
        essayExample(),
        essayExample({ exampleId: "essay-2", body: "Second draft", votesUp: 1, votesDown: 4 }),
      ],
    });

    expect(root.querySelector('[data-menu-tab="internal"]')?.textContent).toContain(
      "Внутренние источники",
    );
    expect(root.querySelector('[data-menu-panel="internal"]')).not.toBeNull();
    expect(root.querySelector('[data-answer-menu="essay-examples"]')?.textContent).toContain(
      "Примеры эссе",
    );

    const rows = root.querySelectorAll<HTMLElement>(".essay-example");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.getAttribute("data-essay-example-id")).toBe("essay-1");
    expect(rows[0]?.getAttribute("data-meta-votes")).toBe("3/0");
    expect(rows[0]?.querySelector(".essay-example__body")?.textContent).toContain(
      "The revolution was caused",
    );

    const upButton = rows[0]?.querySelector<HTMLButtonElement>('[data-vote-action="up"]');
    expect(upButton?.dataset.voteExampleId).toBe("essay-1");
    expect(upButton?.querySelector(".flyout-vote-count")?.textContent).toBe("3");

    // Минусов больше, чем плюсов — сомнительный пример помечен.
    expect(rows[1]?.querySelector(".essay-example__body")?.className).toContain(
      "flyout-label--dubious",
    );

    expect(root.querySelector('[data-essay-action="save"]')).not.toBeNull();
  });

  it("shows the empty state when there are no examples yet", async () => {
    const root = await renderEssayMenu({ examples: [] });

    expect(root.querySelector(".essay-examples-empty")?.textContent).toContain("Пока нет примеров");
    expect(root.querySelectorAll(".essay-example")).toHaveLength(0);
    expect(root.querySelector('[data-essay-action="save"]')).not.toBeNull();
  });

  it("hides the save button for guests but keeps the examples list", async () => {
    const root = await renderEssayMenu({ examples: [essayExample()], canSave: false });

    expect(root.querySelector('[data-essay-action="save"]')).toBeNull();
    expect(root.querySelectorAll(".essay-example")).toHaveLength(1);
  });

  it("keeps the regular source panel for non-essay questions", async () => {
    const api = await getQuizAttemptTestApi();
    const root = renderMenu(
      api.getAnswerMenuMarkup(api.createEmptySourceAnswerData(), true, idleAiState, true),
    );

    expect(root.querySelector(".essay-example")).toBeNull();
    expect(root.querySelector(".essay-examples-empty")).toBeNull();
    expect(root.querySelector('[data-essay-action="save"]')).toBeNull();
    expect(root.querySelector('[data-answer-menu="ai-answer"]')).not.toBeNull();
  });
});

describe("essay examples text helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("extracts plain text from the attempt editor HTML", async () => {
    const { getCurrentEssayText, htmlToPlainText } =
      await import("../src/content/quizAttempt/essayExamples");
    const questionNode = loadQuestionFixture("essay", "attempt");
    const textarea = questionNode.querySelector("textarea")!;

    textarea.value = "<p>First paragraph</p><p>Second paragraph</p>";

    expect(getCurrentEssayText(questionNode)).toBe("First paragraph\nSecond paragraph");
    expect(htmlToPlainText("Plain text")).toBe("Plain text");
    expect(htmlToPlainText("Line one<br>Line two")).toBe("Line one\nLine two");
  });

  it("falls back to the review response block when the editor is empty", async () => {
    const { getCurrentEssayText } = await import("../src/content/quizAttempt/essayExamples");
    const questionNode = loadQuestionFixture("essay", "review-open");

    expect(getCurrentEssayText(questionNode)).toContain("The revolution was caused by the crisis");
  });

  it("inserts an example instantly into a plain textarea", async () => {
    const { applyEssayExampleToQuestion } =
      await import("../src/content/quizAttempt/essayExamples");
    const questionNode = loadQuestionFixture("essay", "attempt");
    const textarea = questionNode.querySelector("textarea")!;

    const applied = await applyEssayExampleToQuestion(
      questionNode,
      "The revolution was caused by the crisis.",
      { humanTyping: false },
    );

    expect(applied).toBe(true);
    expect(textarea.value).toBe("The revolution was caused by the crisis.");
  });

  it("converts the example to editor HTML inside a rich editor field", async () => {
    const { applyEssayExampleToQuestion } =
      await import("../src/content/quizAttempt/essayExamples");
    const questionNode = loadQuestionFixture("essay", "attempt");
    const textarea = questionNode.querySelector("textarea")!;
    textarea.dataset.fieldtype = "editor";

    const applied = await applyEssayExampleToQuestion(questionNode, "First\n\nSecond", {
      humanTyping: false,
    });

    expect(applied).toBe(true);
    expect(textarea.value).toBe("<p>First</p><p>Second</p>");
  });

  it("types an example human-like into a plain textarea", async () => {
    const { applyEssayExampleToQuestion } =
      await import("../src/content/quizAttempt/essayExamples");
    const questionNode = loadQuestionFixture("essay", "attempt");
    const textarea = questionNode.querySelector("textarea")!;

    const applied = await applyEssayExampleToQuestion(questionNode, "OK", { humanTyping: true });

    expect(applied).toBe(true);
    expect(textarea.value).toBe("OK");
  });

  it("rejects empty example bodies", async () => {
    const { applyEssayExampleToQuestion } =
      await import("../src/content/quizAttempt/essayExamples");
    const questionNode = loadQuestionFixture("essay", "attempt");

    const applied = await applyEssayExampleToQuestion(questionNode, "   ", {
      humanTyping: false,
    });

    expect(applied).toBe(false);
  });
});
