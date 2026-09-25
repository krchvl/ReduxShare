import { beforeEach, describe, expect, it, vi } from "vitest";
import { isQuizViewUrl } from "../src/content/quizAttempt/quizUrl";
import { getAnswerData } from "../src/data/answerData";
import {
  beginQuizPreviewLoading,
  getQuizPreviewPanelState,
  resetQuizPreviewPanelState,
  showQuizPreviewError,
  showQuizPreviewQuestions,
  setQuizPreviewPanelQuizTitle,
} from "../src/ui/quizPreviewPanel";
import { setCurrentStoredState, setCurrentT } from "../src/state";
import { getContentTranslator } from "../src/i18n/contentI18n";
import type { QuizPreviewQuestion } from "../src/model";

function storedState(overrides: Record<string, unknown> = {}) {
  return {
    settings: { extensionEnabled: true, stealthMode: false, language: "ru" },
    ...overrides
  };
}

// Minimal view.php markup: start button block plus quizinfo, mirroring a live
// Moodle page.
const VIEW_PAGE_HTML = `
  <div role="main">
    <div class="tertiary-navigation">
      <div class="d-flex">
        <div class="navitem">
          <div class="singlebutton quizstartbuttondiv">
            <form method="post" action="/mod/quiz/startattempt.php">
              <input type="hidden" name="cmid" value="789" />
              <button type="submit" class="btn btn-primary">Preview quiz</button>
            </form>
          </div>
        </div>
      </div>
    </div>
    <div class="box py-3 quizinfo">
      <p>Grading method: Highest grade</p>
    </div>
    <div class="page-header-headings"><h1>Итоговый тест по математике</h1></div>
  </div>
`;

function getPreviewModal(): HTMLDivElement {
  const root = document.getElementById("reduxshare-quiz-preview-modal");
  expect(root).toBeInstanceOf(HTMLDivElement);
  expect(root!.querySelector(".modal-dialog")).toBeTruthy();
  return root as HTMLDivElement;
}

describe("isQuizViewUrl", () => {
  it("matches only https quiz view pages", () => {
    expect(isQuizViewUrl({ protocol: "https:", pathname: "/mod/quiz/view.php" } as Location)).toBe(true);
    expect(isQuizViewUrl({ protocol: "https:", pathname: "/course/mod/quiz/view.php" } as Location)).toBe(true);
    expect(isQuizViewUrl({ protocol: "https:", pathname: "/mod/quiz/view.php", search: "?id=789" } as unknown as Location)).toBe(true);
    expect(isQuizViewUrl({ protocol: "http:", pathname: "/mod/quiz/view.php" } as Location)).toBe(false);
    expect(isQuizViewUrl({ protocol: "https:", pathname: "/mod/quiz/attempt.php" } as Location)).toBe(false);
  });
});

describe("quiz preview answer conversion", () => {
  it("converts stored task rows into slots with exact answers", () => {
    const data = getAnswerData({
      questionId: "3699",
      questionType: "truefalse",
      questionHash: "abc",
      ok: true,
      data: [
        {
          anchor: { index: 1, label: "question" },
          suggestions: [{ label: "Верно", correctness: 2, confidence: 0.95 }],
          submissions: [
            { label: "Верно", correctness: 2, count: 5 },
            { label: "Неверно", correctness: 0, count: 2 }
          ]
        }
      ]
    });

    expect(data.slots).toHaveLength(1);
    expect(data.slots[0].suggestions[0]).toMatchObject({ label: "Верно", correctness: 2 });
    expect(data.submissions).toHaveLength(2);
  });
});

describe("quiz preview panel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetQuizPreviewPanelState();
    setCurrentStoredState(storedState());
    setCurrentT(getContentTranslator("ru"));
  });

  it("renders internal and external source tabs, pairing external answers with the internal statement", () => {
    beginQuizPreviewLoading();
    expect(getPreviewModal().querySelector(".reduxshare-preview-placeholder")?.textContent).toContain(
      "Загрузка вопросов"
    );

    const question: QuizPreviewQuestion = {
      questionId: "3699",
      questionType: "truefalse",
      questionHash: "abc",
      questionText: "Социальные сети полезны для общества",
      answerOptions: ["Верно", "Неверно", "Не указано"],
      reduxshare: {
        anchors: [],
        suggestions: [{ correctness: 2, confidence: 1, label: "Верно" }],
        submissions: [{ correctness: 2, count: 3, label: "Верно" }],
        slots: [
          {
            index: 1,
            hasExplicitIndex: true,
            anchors: [],
            suggestions: [{ correctness: 2, confidence: 1, label: "Верно" }],
            submissions: [{ correctness: 2, count: 3, label: "Верно" }]
          }
        ]
      },
      external: {
        anchors: [],
        suggestions: [{ correctness: 2, confidence: 0.99, label: "Yandex" }],
        submissions: [{ correctness: 2, count: 1, label: "Yandex" }],
        slots: []
      }
    };

    showQuizPreviewQuestions([question], false);

    const modal = getPreviewModal();

    // The internal tab is active by default and shows only internal answers.
    const tabs = Array.from(modal.querySelectorAll<HTMLButtonElement>(".reduxshare-preview-tab"));
    expect(tabs.map((tab) => tab.dataset.tab)).toEqual(["internal", "external"]);
    expect(tabs[0].classList.contains("active")).toBe(true);

    const internalCard = modal.querySelector<HTMLElement>(".reduxshare-preview-question")!;
    expect(internalCard.querySelector(".reduxshare-preview-condition")?.textContent).toBe(
      "Социальные сети полезны для общества"
    );
    expect(internalCard.querySelector(".reduxshare-preview-answers")?.textContent).toContain("Верно");
    expect(internalCard.querySelector(".reduxshare-preview-answers")?.textContent).not.toContain("Yandex");
    // Slot labels ("Слот N") are not rendered.
    expect(internalCard.querySelector(".reduxshare-preview-answer-slot")).toBeNull();

    // The stored option pool renders as chips on the internal tab; the exact answer is highlighted.
    const options = internalCard.querySelectorAll(".reduxshare-preview-option");
    expect(options).toHaveLength(3);
    expect(internalCard.querySelector(".reduxshare-preview-options")?.textContent).toContain("Варианты ответов");
    expect(internalCard.querySelector(".reduxshare-preview-option--exact")?.textContent).toBe("Верно");

    // The external tab shows the external answers under the statement taken from
    // the internal record.
    tabs[1].click();
    const externalModal = getPreviewModal();
    expect(externalModal.querySelector(".reduxshare-preview-tab.active")?.textContent).toContain("Внешние источники");
    const externalCard = externalModal.querySelector<HTMLElement>(".reduxshare-preview-question")!;
    expect(externalCard.querySelector(".reduxshare-preview-condition")?.textContent).toBe(
      "Социальные сети полезны для общества"
    );
    expect(externalCard.querySelector(".reduxshare-preview-answers")?.textContent).toContain("Yandex");
    expect(externalCard.querySelector(".reduxshare-preview-answers")?.textContent).not.toContain("Верно");
    // Option chips belong to the internal tab only.
    expect(externalCard.querySelector(".reduxshare-preview-options")).toBeNull();
  });

  it("defaults to the external tab when the internal database has nothing", () => {
    const question: QuizPreviewQuestion = {
      questionId: "42",
      questionType: "match",
      questionHash: "def",
      questionText: null,
      reduxshare: { anchors: [], suggestions: [], submissions: [], slots: [] },
      external: {
        anchors: [],
        suggestions: [{ correctness: 2, confidence: 0.99, label: "Evernote" }],
        submissions: [],
        slots: []
      }
    };

    showQuizPreviewQuestions([question], false);

    expect(getQuizPreviewPanelState().activeTab).toBe("external");
    const card = getPreviewModal().querySelector<HTMLElement>(".reduxshare-preview-question")!;
    // No internal record: the card shows the placeholder instead of a statement,
    // but the external answers are still rendered.
    expect(card.querySelector(".reduxshare-preview-condition--missing")?.textContent).toBe(
      "Условие задания не найдено"
    );
    expect(card.querySelector(".reduxshare-preview-answers")?.textContent).toContain("Evernote");
  });

  it("shows the quiz name in the title and truncates long names with an ellipsis", () => {
    setQuizPreviewPanelQuizTitle("Итоговый тест по математике");
    beginQuizPreviewLoading();
    expect(getPreviewModal().querySelector(".modal-title")?.textContent).toContain(
      "Итоговый тест по математике"
    );

    const longName = "Очень длинное название квиза про интегралы, пределы и ряды Фурье в действии";
    setQuizPreviewPanelQuizTitle(longName);
    beginQuizPreviewLoading();
    const title = getPreviewModal().querySelector(".modal-title")?.textContent ?? "";
    // 64 characters of the name, then an ellipsis.
    expect(title).toContain("Очень длинное название квиза про интегралы, пределы и ряды Фурье…");
    expect(title).not.toContain("в действии");

    // Without a quiz name the generic title is used as the fallback.
    setQuizPreviewPanelQuizTitle(null);
    beginQuizPreviewLoading();
    expect(getPreviewModal().querySelector(".modal-title")?.textContent).toContain("Вопросы квиза");
  });

  it("shows the guest hint when authentication is required", () => {
    showQuizPreviewQuestions([], true);

    const state = getQuizPreviewPanelState();
    expect(state.authRequired).toBe(true);
    expect(getPreviewModal().querySelector(".reduxshare-preview-placeholder")?.textContent).toContain(
      "Войдите в аккаунт расширения"
    );
  });

  it("shows an error message and allows closing the modal", () => {
    showQuizPreviewError("boom");
    expect(getPreviewModal().querySelector(".reduxshare-preview-placeholder")?.textContent).toBe("boom");

    getPreviewModal().querySelector<HTMLButtonElement>(".reduxshare-preview-close")!.click();
    expect(document.getElementById("reduxshare-quiz-preview-modal")).toBeNull();
  });

  it("closes on Escape", () => {
    beginQuizPreviewLoading();
    expect(document.getElementById("reduxshare-quiz-preview-modal")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.getElementById("reduxshare-quiz-preview-modal")).toBeNull();
  });

  it("stays hidden while the extension is disabled", () => {
    setCurrentStoredState(storedState({ settings: { extensionEnabled: false, language: "ru" } }));
    beginQuizPreviewLoading();
    expect(document.getElementById("reduxshare-quiz-preview-modal")).toBeNull();
  });
});

describe("quiz preview message request", () => {
  it("sends the quiz payload and forwards the response to the panel", async () => {
    vi.resetModules();
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      expect(message).toMatchObject({
        type: "REDUXSHARE_FETCH_QUIZ_PREVIEW",
        payload: { domain: "localhost", courseId: 66, quizId: 789 }
      });
      callback({ ok: true, authRequired: false, questions: [] });
    });
    vi.stubGlobal("chrome", {
      ...globalThis.chrome,
      runtime: {
        ...(globalThis as { chrome?: { runtime?: unknown } }).chrome?.runtime as object,
        lastError: null,
        sendMessage
      }
    });

    document.body.innerHTML = VIEW_PAGE_HTML;
    const moodleConfigScript = document.createElement("script");
    moodleConfigScript.textContent = 'M.cfg = {"courseId":66,"contextInstanceId":789};';
    document.body.append(moodleConfigScript);
    setCurrentStoredState(storedState());

    const { initializeQuizPreviewFeatures } = await import("../src/content/quizPreview");
    await initializeQuizPreviewFeatures();

    // The button sits right after the start button block, labeled in the stored language.
    const previewButton = document.getElementById("reduxshare-quiz-preview-button");
    expect(previewButton).toBeInstanceOf(HTMLButtonElement);
    expect(previewButton!.textContent).toBe("Показать вопросы");
    expect(
      previewButton!.closest(".singlebutton")!.previousElementSibling?.classList.contains("quizstartbuttondiv")
    ).toBe(true);

    previewButton!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(getQuizPreviewPanelState().visible).toBe(true);
    expect(getQuizPreviewPanelState().authRequired).toBe(false);
  });

  it("is idempotent when the view page renders twice", async () => {
    vi.resetModules();
    vi.stubGlobal("chrome", {
      ...(globalThis as { chrome?: object }).chrome,
      runtime: {
        lastError: null,
        sendMessage: vi.fn()
      }
    });

    document.body.innerHTML = VIEW_PAGE_HTML;
    setCurrentStoredState(storedState());

    const { initializeQuizPreviewFeatures } = await import("../src/content/quizPreview");
    await initializeQuizPreviewFeatures();
    await initializeQuizPreviewFeatures();

    expect(document.querySelectorAll("#reduxshare-quiz-preview-button")).toHaveLength(1);
  });
});
