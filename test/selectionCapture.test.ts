import { beforeEach, describe, expect, it } from "vitest";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { APP_STORAGE_KEY, SELECTION_SAVES_STORAGE_KEY } from "../src/shared/storageKeys";
import { SAVE_USER_ANSWER_MESSAGE } from "../src/shared/messages";
import type { AnswerData } from "../src/model";

type SavedUserSelectionAnswer = {
  label: string;
  answerKey: string;
  slotKey: string;
  slotIndex: number | null;
  verdict: "correct" | "incorrect" | "unknown";
};

function emptyAnswerData(): AnswerData {
  return { anchors: [], suggestions: [], submissions: [], slots: [] };
}

function exactSuggestion(label: string): AnswerData["suggestions"][number] {
  return {
    correctness: 2,
    confidence: 1,
    label,
    taskId: `task-${label}`,
    votesUp: 0,
    votesDown: 0,
    myVote: 0,
  };
}

async function seedStoredState() {
  await chrome.storage.local.set({
    [APP_STORAGE_KEY]: {
      settings: { extensionEnabled: true },
      latestQuizAttemptContext: {
        domain: "school.moodledemo.net",
        courseId: 2,
        contextInstanceId: 1150,
        attemptId: "94",
        pageUrl: "https://school.moodledemo.net/mod/quiz/attempt.php?attempt=94&cmid=1150",
      },
    },
  });
}

function getSentSelectionPayloads(): SavedUserSelectionAnswer[][] {
  return chrome.runtime.sendMessage.mock.calls
    .filter((call) => call[0]?.type === SAVE_USER_ANSWER_MESSAGE)
    .map((call) => call[0].payload.question.answers as SavedUserSelectionAnswer[]);
}

describe("user answer selection capture", () => {
  beforeEach(() => {
    chrome.runtime.sendMessage.mockImplementation((_message, callback) => {
      callback?.({ ok: true, savedCount: 1 });
    });
  });

  it("saves a manual checkbox choice as unverified when no exact answer is known", async () => {
    const api = await getQuizAttemptTestApi();
    await seedStoredState();
    const questionNode = loadQuestionFixture("multichoice", "attempt");
    const checkbox = questionNode.querySelector<HTMLInputElement>('input[type="checkbox"]');

    expect(checkbox).toBeTruthy();
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));

    await api.flushQuestionSelections(questionNode);

    const payloads = getSentSelectionPayloads();

    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toEqual([
      {
        label: "63 percent of the time.",
        answerKey: "63 percent of the time.",
        slotKey: "question",
        slotIndex: null,
        verdict: "unknown",
      },
    ]);

    const store = await chrome.storage.local.get(SELECTION_SAVES_STORAGE_KEY);
    const attempt = store[SELECTION_SAVES_STORAGE_KEY]?.["attempt:unknown|cmid:unknown"];

    expect(attempt?.questions?.["1385"]).toHaveLength(1);
    expect(attempt?.questions?.["1385"]?.[0]).toMatchObject({
      answerKey: "63 percent of the time.",
      verdict: "unknown",
    });
  });

  it("marks the verdict from known exact answers", async () => {
    const api = await getQuizAttemptTestApi();
    await seedStoredState();
    const questionNode = loadQuestionFixture("multichoice", "attempt");
    const checkbox = questionNode.querySelector<HTMLInputElement>('input[type="checkbox"]');

    api.setSourceAnswerData("1385", "reduxshare", {
      ...emptyAnswerData(),
      suggestions: [exactSuggestion("63 percent of the time.")],
    });

    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));
    await api.flushQuestionSelections(questionNode);

    expect(
      api.resolveSelectionVerdict(null, {
        label: "any",
        slotKey: "question",
        slotIndex: null,
      }),
    ).toBe("unknown");
    expect(getSentSelectionPayloads()[0][0].verdict).toBe("correct");

    const secondCheckbox =
      questionNode.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1];

    secondCheckbox.checked = true;
    secondCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
    await api.flushQuestionSelections(questionNode);

    const payloads = getSentSelectionPayloads();

    expect(payloads).toHaveLength(2);
    expect(payloads[1][0].verdict).toBe("incorrect");
  });

  it("does not resend already tracked selections", async () => {
    const api = await getQuizAttemptTestApi();
    await seedStoredState();
    const questionNode = loadQuestionFixture("multichoice", "attempt");
    const checkbox = questionNode.querySelector<HTMLInputElement>('input[type="checkbox"]');

    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));
    await api.flushQuestionSelections(questionNode);
    await api.flushQuestionSelections(questionNode);

    expect(getSentSelectionPayloads()).toHaveLength(1);

    const store = await chrome.storage.local.get(SELECTION_SAVES_STORAGE_KEY);
    const attempt = store[SELECTION_SAVES_STORAGE_KEY]?.["attempt:unknown|cmid:unknown"];

    expect(attempt?.questions?.["1385"]).toHaveLength(1);
  });

  it("does not send anything when nothing is selected", async () => {
    const api = await getQuizAttemptTestApi();
    await seedStoredState();
    const questionNode = loadQuestionFixture("multichoice", "attempt");

    await api.flushQuestionSelections(questionNode);

    expect(getSentSelectionPayloads()).toHaveLength(0);
  });

  it("attaches tracked selections to the review save payload", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("multichoice", "review-open");

    const trackedAttempt = {
      updatedAt: new Date().toISOString(),
      questions: {
        "1385": [
          {
            answerKey: "true",
            slotKey: "63 percent of the time.",
            slotIndex: 1,
            label: "true",
            verdict: "unknown" as const,
          },
          {
            answerKey: "stale-answer",
            slotKey: "question",
            slotIndex: null,
            label: "stale",
            verdict: "unknown" as const,
          },
        ],
      },
    };

    const payload = api.buildReviewSaveRequestPayload(undefined, trackedAttempt) as {
      questions: Array<{
        questionId: string | null;
        preCountedAnswers?: Array<{ answerKey: string; slotKey: string; verdict: string }>;
      }>;
    };

    expect(payload.questions[0].preCountedAnswers).toEqual([
      { answerKey: "true", slotKey: "63 percent of the time.", verdict: "unknown" },
      { answerKey: "stale-answer", slotKey: "question", verdict: "unknown" },
    ]);

    const plainPayload = api.buildReviewSaveRequestPayload(undefined) as {
      questions: Array<{ preCountedAnswers?: unknown }>;
    };

    expect(plainPayload.questions[0].preCountedAnswers).toBeUndefined();
  });
});
