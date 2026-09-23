// Regression for the preview "always errors" bug: handleFetchQuizPreview used to
// ship the raw { data } variant results, but the panel expected AnswerData
// (slots/suggestions/submissions). hasAnswerData() then read undefined.suggestions
// and threw inside showQuizPreviewQuestions' try/catch, so every click surfaced as
// "Не удалось загрузить вопросы" even when the database had the answer.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_STORAGE_KEY } from "../src/shared/storageKeys";
import { DEFAULT_UPDATE_STATE } from "../src/types";
import type { AuthSession } from "../src/types";
import { setCurrentStoredState } from "../src/state";
import {
  getQuizPreviewPanelState,
  showQuizPreviewQuestions
} from "../src/ui/quizPreviewPanel";

const fetchPreviewTasksMock = vi.hoisted(() => vi.fn());
const fetchQuestionVariantsMock = vi.hoisted(() => vi.fn());

vi.mock("../src/lib/quizTasks", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchReduxShareQuizPreviewTasks: fetchPreviewTasksMock };
});

vi.mock("../src/lib/externalProvider", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchQuestionVariants: fetchQuestionVariantsMock };
});

const authSession: AuthSession = {
  accessToken: "token-1",
  refreshToken: "refresh-1",
  expiresAt: null,
  user: { id: "user-1", email: "user@example.com" }
};

// Raw rows exactly as PocketBase / the external provider return them: getAnswerData
// is the only thing that understands this shape.
const ROW_DATA = [
  {
    anchor: { index: 1, label: "question" },
    suggestions: [{ label: "Верно", correctness: 2, confidence: 1 }],
    submissions: [{ label: "Верно", correctness: 2, count: 3 }]
  }
];

function flushMicrotasks(hops: number) {
  return new Promise<void>((resolve) => {
    for (let index = 0; index < hops; index += 1) {
      queueMicrotask(() => {});
    }

    setTimeout(resolve, 0);
  });
}

describe("quiz preview backend contract", () => {
  beforeEach(async () => {
    vi.resetModules();
    await chrome.storage.local.set({
      [APP_STORAGE_KEY]: {
        authSession,
        updateState: { ...DEFAULT_UPDATE_STATE, nextCheckAt: "9999-01-01T00:00:00.000Z" }
      }
    });
    fetchPreviewTasksMock.mockReset();
    fetchQuestionVariantsMock.mockReset();
  });

  it("normalises raw variant rows into AnswerData the panel can render", async () => {
    fetchPreviewTasksMock.mockResolvedValue({
      authSession,
      results: [
        {
          questionId: "3699",
          questionType: "truefalse",
          questionHash: "abc",
          questionText: "Социальные сети полезны для общества",
          ok: true,
          data: ROW_DATA,
          answerCount: 1
        }
      ]
    });
    fetchQuestionVariantsMock.mockResolvedValue({
      questionId: "3699",
      questionType: "truefalse",
      questionHash: "abc",
      ok: true,
      status: 200,
      data: ROW_DATA
    });

    const addListener = vi.mocked(chrome.runtime.onMessage.addListener);
    await import("../src/background/external");
    const listener = addListener.mock.calls.at(-1)![0] as (
      message: unknown,
      sender: unknown,
      sendResponse: (response: unknown) => void
    ) => boolean | void;

    let response: { ok: boolean; questions: Array<{ reduxshare: unknown; external: unknown }> } | undefined;
    const keepChannelOpen = listener(
      { type: "REDUXSHARE_FETCH_QUIZ_PREVIEW", payload: { domain: "moodle.example", courseId: 2, quizId: 5 } },
      {},
      (value) => {
        response = value as typeof response;
      }
    );

    expect(keepChannelOpen).toBe(true);
    await flushMicrotasks(20);

    expect(response).toBeDefined();
    expect(response!.ok).toBe(true);
    expect(response!.questions).toHaveLength(1);

    const question = response!.questions[0];
    // The panel reads AnswerData (slots/suggestions/submissions); a raw { data } result
    // here would reproduce the original "always errors" bug.
    expect(question.reduxshare).not.toHaveProperty("data");
    expect(Array.isArray((question.reduxshare as { slots: unknown[] }).slots)).toBe(true);
    expect((question.reduxshare as { suggestions: unknown[] }).suggestions).toHaveLength(1);
    expect(Array.isArray((question.external as { slots: unknown[] }).slots)).toBe(true);
    // The statement of the task travels with the internal answers.
    expect((question as { questionText: string | null }).questionText).toBe("Социальные сети полезны для общества");

    // And the modal must render it without throwing.
    setCurrentStoredState({ settings: { extensionEnabled: true, stealthMode: false, language: "ru" } });
    showQuizPreviewQuestions(response!.questions as never, false);

    expect(getQuizPreviewPanelState().visible).toBe(true);
    const modal = document.getElementById("reduxshare-quiz-preview-modal");
    expect(modal?.querySelector(".reduxshare-preview-condition")?.textContent).toBe(
      "Социальные сети полезны для общества"
    );
    expect(modal?.querySelector(".reduxshare-preview-answer--exact .reduxshare-preview-answer-label")?.textContent).toBe(
      "Верно"
    );
  });
});
