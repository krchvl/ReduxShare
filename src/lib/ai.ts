import type { AiModelOption, AiSettings } from "../types";
import {
  FETCH_AI_MODELS_MESSAGE,
  GENERATE_AI_ANSWER_MESSAGE,
  TEST_AI_CONNECTION_MESSAGE
} from "../shared/messages";
import type {
  AiAnswerAction,
  AiAnswerResponse,
  AiQuestionControl,
  AiQuestionImage,
  AiQuestionOption
} from "../model";

// The canonical shapes of the AI wire data live in src/model.ts next to the other shared
// answer-data types; this module owns the message protocol on top of them.
export type { AiAnswerAction, AiQuestionControl, AiQuestionImage, AiQuestionOption };

// Historic name of AiAnswerResponse, kept for the background handlers and tests.
export interface AiResponse extends AiAnswerResponse {}

export const AI_DISABLED_QUESTION_TYPES = new Set(["ddimageortext", "ddmarker"]);

export interface TestAiConnectionMessage {
  type: typeof TEST_AI_CONNECTION_MESSAGE;
  payload: AiSettings;
}

export interface FetchAiModelsMessage {
  type: typeof FETCH_AI_MODELS_MESSAGE;
  payload: AiSettings;
}

export interface GenerateAiAnswerPayload {
  questionId: string | null;
  questionType: string | null;
  questionText: string;
  answerLabels: string[];
  controls?: AiQuestionControl[];
  images?: AiQuestionImage[];
  pageUrl: string;
}

export interface GenerateAiAnswerMessage {
  type: typeof GENERATE_AI_ANSWER_MESSAGE;
  payload: GenerateAiAnswerPayload;
}

export interface AiModelsResponse {
  ok: boolean;
  models?: AiModelOption[];
  error?: string;
}

export function isTestAiConnectionMessage(message: unknown): message is TestAiConnectionMessage {
  return Boolean(
    message &&
      typeof message === "object" &&
      (message as Partial<TestAiConnectionMessage>).type === TEST_AI_CONNECTION_MESSAGE &&
      typeof (message as Partial<TestAiConnectionMessage>).payload === "object"
  );
}

export function isFetchAiModelsMessage(message: unknown): message is FetchAiModelsMessage {
  return Boolean(
    message &&
      typeof message === "object" &&
      (message as Partial<FetchAiModelsMessage>).type === FETCH_AI_MODELS_MESSAGE &&
      typeof (message as Partial<FetchAiModelsMessage>).payload === "object"
  );
}

export function isGenerateAiAnswerMessage(message: unknown): message is GenerateAiAnswerMessage {
  return Boolean(
    message &&
      typeof message === "object" &&
      (message as Partial<GenerateAiAnswerMessage>).type === GENERATE_AI_ANSWER_MESSAGE &&
      typeof (message as Partial<GenerateAiAnswerMessage>).payload === "object"
  );
}

export function requestAiModels(settings: AiSettings): Promise<AiModelsResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: FETCH_AI_MODELS_MESSAGE,
        payload: settings
      },
      (response: AiModelsResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      }
    );
  });
}

export function requestAiConnectionTest(settings: AiSettings): Promise<AiResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: TEST_AI_CONNECTION_MESSAGE,
        payload: settings
      },
      (response: AiResponse | undefined) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(response ?? { ok: false, error: "Background script did not return a response." });
      }
    );
  });
}
