import { describe, expect, it } from "vitest";
import type { AiAnswerState } from "../src/model";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";

const IDLE_AI_STATE: AiAnswerState = {
  status: "idle",
  answer: null,
  confidence: null,
  actions: [],
  error: null,
};

describe("content script language state", () => {
  it("renders quiz strings in the stored language", async () => {
    const api = await getQuizAttemptTestApi();
    const answerData = api.createEmptySourceAnswerData();

    api.setStoredState({ settings: { language: "ru" } });
    expect(api.getAnswerMenuMarkup(answerData, false, IDLE_AI_STATE, true)).toContain(
      "Настройки ИИ не сохранены",
    );

    api.setStoredState({ settings: { language: "en" } });
    expect(api.getAnswerMenuMarkup(answerData, false, IDLE_AI_STATE, true)).toContain(
      "AI settings are not saved",
    );
  });

  it("switches back when the stored language changes again", async () => {
    const api = await getQuizAttemptTestApi();
    const answerData = api.createEmptySourceAnswerData();

    api.setStoredState({ settings: { language: "en" } });
    expect(api.getAnswerMenuMarkup(answerData, false, IDLE_AI_STATE, true)).toContain(
      "AI settings are not saved",
    );

    api.setStoredState({ settings: { language: "ru" } });
    expect(api.getAnswerMenuMarkup(answerData, false, IDLE_AI_STATE, true)).toContain(
      "Настройки ИИ не сохранены",
    );
  });
});
