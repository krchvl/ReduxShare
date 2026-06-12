import type { AiModelOption, AiProvider, AiSettings } from "../types";
import calculatedPrompt from "../aiPrompts/calculated.json";
import calculatedMultiPrompt from "../aiPrompts/calculatedmulti.json";
import calculatedSimplePrompt from "../aiPrompts/calculatedsimple.json";
import defaultPrompt from "../aiPrompts/default.json";
import ddwtosPrompt from "../aiPrompts/ddwtos.json";
import essayPrompt from "../aiPrompts/essay.json";
import gapselectPrompt from "../aiPrompts/gapselect.json";
import matchPrompt from "../aiPrompts/match.json";
import multichoicePrompt from "../aiPrompts/multichoice.json";
import multianswerPrompt from "../aiPrompts/multianswer.json";
import numericalPrompt from "../aiPrompts/numerical.json";
import orderingPrompt from "../aiPrompts/ordering.json";
import shortanswerPrompt from "../aiPrompts/shortanswer.json";
import truefalsePrompt from "../aiPrompts/truefalse.json";
import type { AiAnswerAction, AiQuestionControl, AiQuestionImage, GenerateAiAnswerPayload } from "./ai";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type OpenAiCompatibleProviderConfig = {
  name: string;
  endpoint: string;
  extraHeaders?: Record<string, string>;
};

const OPENAI_COMPATIBLE_PROVIDERS: Partial<Record<AiProvider, OpenAiCompatibleProviderConfig>> = {
  openrouter: {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    extraHeaders: {
      "X-Title": "ReduxShare"
    }
  },
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions"
  },
  groq: {
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1/chat/completions"
  },
  mistral: {
    name: "Mistral",
    endpoint: "https://api.mistral.ai/v1/chat/completions"
  },
  xai: {
    name: "xAI",
    endpoint: "https://api.x.ai/v1/chat/completions"
  },
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions"
  }
};

type ModelListProviderConfig = {
  name: string;
  endpoint: string;
  auth: "bearer" | "google" | "anthropic" | "optional-bearer";
};

const MODEL_LIST_PROVIDERS: Partial<Record<AiProvider, ModelListProviderConfig>> = {
  google: {
    name: "Google",
    endpoint: GEMINI_API_BASE_URL,
    auth: "google"
  },
  openrouter: {
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/models",
    auth: "optional-bearer"
  },
  openai: {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/models",
    auth: "bearer"
  },
  anthropic: {
    name: "Anthropic",
    endpoint: "https://api.anthropic.com/v1/models",
    auth: "anthropic"
  },
  groq: {
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1/models",
    auth: "bearer"
  },
  mistral: {
    name: "Mistral",
    endpoint: "https://api.mistral.ai/v1/models",
    auth: "bearer"
  },
  xai: {
    name: "xAI",
    endpoint: "https://api.x.ai/v1/models",
    auth: "bearer"
  },
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/models",
    auth: "bearer"
  }
};

interface PromptConfig {
  title: string;
  instructions: string[];
}

const PROMPTS_BY_QUESTION_TYPE: Record<string, PromptConfig> = {
  multichoice: multichoicePrompt,
  truefalse: truefalsePrompt,
  calculatedmulti: calculatedMultiPrompt,
  shortanswer: shortanswerPrompt,
  numerical: numericalPrompt,
  calculated: calculatedPrompt,
  calculatedsimple: calculatedSimplePrompt,
  gapselect: gapselectPrompt,
  match: matchPrompt,
  multianswer: multianswerPrompt,
  ddwtos: ddwtosPrompt,
  ordering: orderingPrompt,
  essay: essayPrompt
};

function getGeminiGenerateContentUrl(model: string) {
  return `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

async function readGeminiResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getGeminiErrorMessage(body: unknown) {
  return getAiErrorMessage(body);
}

function getAiErrorMessage(body: unknown) {
  const bodyRecord = getRecord(body);
  const errorRecord = getRecord(bodyRecord?.error);
  const message = errorRecord?.message ?? bodyRecord?.message;

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (typeof bodyRecord?.error === "string" && bodyRecord.error.trim()) {
    return bodyRecord.error;
  }

  return null;
}

function extractGeminiText(body: unknown) {
  const bodyRecord = getRecord(body);
  const candidates = Array.isArray(bodyRecord?.candidates) ? bodyRecord.candidates : [];
  const firstCandidate = getRecord(candidates[0]);
  const content = getRecord(firstCandidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];

  return parts
    .map((part) => {
      const partRecord = getRecord(part);
      return typeof partRecord?.text === "string" ? partRecord.text : "";
    })
    .join("")
    .trim();
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      const partRecord = getRecord(part);
      const text = partRecord?.text ?? partRecord?.content;

      return typeof text === "string" ? text : "";
    })
    .join("")
    .trim();
}

function extractOpenAiCompatibleText(body: unknown) {
  const bodyRecord = getRecord(body);
  const choices = Array.isArray(bodyRecord?.choices) ? bodyRecord.choices : [];
  const firstChoice = getRecord(choices[0]);
  const message = getRecord(firstChoice?.message);

  return extractTextContent(message?.content).trim();
}

function extractAnthropicText(body: unknown) {
  const bodyRecord = getRecord(body);
  return extractTextContent(bodyRecord?.content).trim();
}

function getModelRecordId(modelRecord: Record<string, unknown>) {
  const id = modelRecord.id ?? modelRecord.name;
  return typeof id === "string" ? id.trim() : "";
}

function getModelRecordLabel(modelRecord: Record<string, unknown>, fallbackId: string) {
  const label = modelRecord.display_name ?? modelRecord.displayName ?? modelRecord.name ?? modelRecord.id;
  return typeof label === "string" && label.trim() ? label.trim().replace(/^models\//, "") : fallbackId;
}

function shouldKeepListedModel(provider: AiProvider, modelRecord: Record<string, unknown>, modelId: string) {
  if (!modelId) {
    return false;
  }

  if (provider === "google") {
    const supportedMethods = modelRecord.supportedGenerationMethods;
    return Array.isArray(supportedMethods)
      ? supportedMethods.some((method) => method === "generateContent")
      : true;
  }

  const architecture = getRecord(modelRecord.architecture);
  const outputModalities = architecture && Array.isArray(architecture.output_modalities)
    ? architecture.output_modalities
    : null;

  if (outputModalities && !outputModalities.includes("text")) {
    return false;
  }

  return !/\b(?:embedding|moderation|transcrib|tts|whisper|image|audio|realtime)\b/i.test(modelId);
}

function normalizeListedModels(provider: AiProvider, body: unknown): AiModelOption[] {
  const bodyRecord = getRecord(body);
  let rawModels: unknown[] = [];

  if (Array.isArray(body)) {
    rawModels = body;
  } else if (Array.isArray(bodyRecord?.models)) {
    rawModels = bodyRecord.models;
  } else if (Array.isArray(bodyRecord?.data)) {
    rawModels = bodyRecord.data;
  }

  const seenModelIds = new Set<string>();
  const models: AiModelOption[] = [];

  for (const rawModel of rawModels) {
    const modelRecord = getRecord(rawModel);

    if (!modelRecord) {
      continue;
    }

    const rawId = getModelRecordId(modelRecord);
    const modelId = provider === "google" ? rawId.replace(/^models\//, "") : rawId;

    if (!shouldKeepListedModel(provider, modelRecord, modelId) || seenModelIds.has(modelId)) {
      continue;
    }

    seenModelIds.add(modelId);
    models.push({
      value: modelId,
      label: getModelRecordLabel(modelRecord, modelId)
    });
  }

  return models;
}

function getModelListHeaders(config: ModelListProviderConfig, apiKey: string) {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };
  const trimmedApiKey = apiKey.trim();

  if (config.auth === "google" && trimmedApiKey) {
    headers["x-goog-api-key"] = trimmedApiKey;
  }

  if ((config.auth === "bearer" || config.auth === "optional-bearer") && trimmedApiKey) {
    headers.Authorization = `Bearer ${trimmedApiKey}`;
  }

  if (config.auth === "anthropic") {
    headers["anthropic-version"] = ANTHROPIC_VERSION;
    if (trimmedApiKey) {
      headers["x-api-key"] = trimmedApiKey;
    }
  }

  return headers;
}

export async function fetchAiModelOptions(settings: AiSettings): Promise<AiModelOption[]> {
  if (settings.provider === "custom") {
    throw new Error("Custom AI does not expose a known model list endpoint.");
  }

  const providerConfig = MODEL_LIST_PROVIDERS[settings.provider];

  if (!providerConfig) {
    throw new Error("AI provider is not supported.");
  }

  if (providerConfig.auth !== "optional-bearer" && !settings.apiKey.trim()) {
    throw new Error(`${providerConfig.name} API key is missing.`);
  }

  const response = await fetch(providerConfig.endpoint, {
    method: "GET",
    headers: getModelListHeaders(providerConfig, settings.apiKey)
  });
  const body = await readGeminiResponseBody(response);

  if (!response.ok) {
    throw new Error(getAiErrorMessage(body) ?? `${providerConfig.name} model list request failed with status ${response.status}.`);
  }

  const models = normalizeListedModels(settings.provider, body);

  if (models.length === 0) {
    throw new Error(`${providerConfig.name} did not return usable chat models.`);
  }

  return models;
}

export function hasUsableAiSettings(settings: Partial<AiSettings> | undefined) {
  if (!settings || !settings.apiKey?.trim()) return false;

  if (settings.provider === "custom") {
    return Boolean(
      settings.connectionVerified &&
        typeof settings.customEndpoint === "string" &&
        settings.customEndpoint.trim() &&
        typeof settings.customModelName === "string" &&
        settings.customModelName.trim()
    );
  }

  if (settings.provider) {
    return Boolean(
      settings.connectionVerified &&
        typeof settings.model === "string" &&
        settings.model.trim()
    );
  }

  return false;
}

function getPromptConfig(questionType: string | null | undefined): PromptConfig {
  return questionType ? (PROMPTS_BY_QUESTION_TYPE[questionType] ?? defaultPrompt) : defaultPrompt;
}

function buildControlOptionsSummary(payload: GenerateAiAnswerPayload) {
  return (payload.controls ?? [])
    .filter((control) => Array.isArray(control.options) && control.options.length > 0)
    .map((control) => ({
      kind: control.kind,
      label: control.label,
      slotIndex: control.slotIndex ?? null,
      options: (control.options ?? []).map((option) => option.label).filter((label) => label.trim() !== "")
    }));
}

function buildImageSummary(payload: GenerateAiAnswerPayload) {
  return (payload.images ?? []).map((image) => ({
    label: image.label,
    url: image.url,
    width: image.width ?? null,
    height: image.height ?? null,
    naturalWidth: image.naturalWidth ?? null,
    naturalHeight: image.naturalHeight ?? null
  }));
}

export function buildQuizAnswerPrompt(payload: GenerateAiAnswerPayload) {
  const promptConfig = getPromptConfig(payload.questionType);
  const controlOptionsSummary = buildControlOptionsSummary(payload);
  const imageSummary = buildImageSummary(payload);
  const questionData = {
    questionId: payload.questionId,
    questionType: payload.questionType ?? "unknown",
    questionText: payload.questionText,
    visibleAnswerLabels: payload.answerLabels,
    availableOptionsByControl: controlOptionsSummary,
    images: imageSummary,
    controls: payload.controls ?? [],
    pageUrl: payload.pageUrl
  };

  return [
    "You help solve Moodle quiz questions. You must return ONLY valid JSON.",
    "Think carefully before answering, but do not include reasoning or markdown in the final response.",
    "Be honest about confidence: 95-100 only when you are almost certain; 60-85 for plausible but not fully verified; below 60 for uncertain guesses.",
    "Use exact visible labels from the provided controls whenever the extension needs to click/select/fill an option.",
    "",
    `Question prompt profile: ${promptConfig.title}`,
    ...promptConfig.instructions.map((instruction) => `- ${instruction}`),
    "",
    "Return JSON with this schema:",
    JSON.stringify(
      {
        answer: "human-readable final answer",
        confidence: 0,
        actions: [
          {
            label: "exact label/text to apply",
            slotIndex: null,
            position: null,
            coordinate: null
          }
        ]
      },
      null,
      2
    ),
    "",
    "Rules for actions:",
    "- For a single choice/text answer, return one action with label.",
    "- For slot-based questions, return one action per slotIndex.",
    "- For ordering, return one action per item with label and one-based position.",
    "- For marker questions, return coordinate as x,y and include the marker slotIndex.",
    "- For marker questions with an attached image: Coordinates must be CSS pixels from the top-left corner of the displayed background image/drop area.",
    "- If marker natural image dimensions differ from displayed dimensions, scale coordinates to the displayed width/height before returning them.",
    "- If no slotIndex applies, use null or omit it.",
    controlOptionsSummary.length > 0 ? "" : null,
    controlOptionsSummary.length > 0 ? "Allowed options by control. These are all valid choices, not only the currently selected value:" : null,
    controlOptionsSummary.length > 0 ? JSON.stringify(controlOptionsSummary, null, 2) : null,
    imageSummary.length > 0 ? "" : null,
    imageSummary.length > 0 ? "Attached question images. Use these images when solving visual marker/drop questions:" : null,
    imageSummary.length > 0 ? JSON.stringify(imageSummary, null, 2) : null,
    "",
    "Moodle question data:",
    JSON.stringify(questionData, null, 2)
  ].filter((part): part is string => part !== null).join("\n");
}

interface GoogleAiImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }

  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function fetchAiImagePart(image: AiQuestionImage): Promise<GoogleAiImagePart | null> {
  if (!image.url.trim()) {
    return null;
  }

  const response = await fetch(image.url, {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error(`Could not load question image for AI: ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || "image/png";

  if (!mimeType.startsWith("image/")) {
    throw new Error(`Question image has unsupported content type: ${mimeType}`);
  }

  return {
    inlineData: {
      mimeType,
      data: arrayBufferToBase64(await blob.arrayBuffer())
    }
  };
}

async function buildGoogleAiImageParts(payload: GenerateAiAnswerPayload) {
  const images = payload.images ?? [];
  const parts: GoogleAiImagePart[] = [];

  for (const image of images) {
    const part = await fetchAiImagePart(image);

    if (part) {
      parts.push(part);
    }
  }

  return parts;
}

export async function generateGoogleAiText(
  settings: AiSettings,
  prompt: string,
  options: {
    responseMimeType?: "text/plain" | "application/json";
    maxOutputTokens?: number;
    temperature?: number;
    imageParts?: GoogleAiImagePart[];
  } = {}
) {
  if (!settings.apiKey.trim()) {
    throw new Error("Google AI API key is missing.");
  }

  const response = await fetch(getGeminiGenerateContentUrl(settings.model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey.trim()
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }, ...(options.imageParts ?? [])]
        }
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        topP: 0.9,
        maxOutputTokens: options.maxOutputTokens ?? 1024,
        responseMimeType: options.responseMimeType ?? "text/plain"
      }
    })
  });

  const body = await readGeminiResponseBody(response);

  if (!response.ok) {
    throw new Error(getGeminiErrorMessage(body) ?? `Google AI request failed with status ${response.status}.`);
  }

  const text = extractGeminiText(body);

  if (!text) {
    throw new Error("Google AI returned an empty response.");
  }

  return text;
}

export async function generateCustomAiText(
  settings: AiSettings,
  prompt: string,
  options: {
    responseMimeType?: "text/plain" | "application/json";
    maxOutputTokens?: number;
    temperature?: number;
    imageParts?: GoogleAiImagePart[];
  } = {}
) {
  if (!settings.customEndpoint?.trim()) {
    throw new Error("Custom endpoint is missing.");
  }

  const modelName = settings.customModelName?.trim() || settings.model;

  return generateOpenAiCompatibleChatCompletion({
    providerName: "Custom AI",
    endpoint: settings.customEndpoint.trim(),
    apiKey: settings.apiKey,
    model: modelName,
    prompt,
    options
  });
}

function buildOpenAiCompatibleMessageContent(prompt: string, imageParts: GoogleAiImagePart[] = []) {
  const imageContent = imageParts.map((part) => ({
    type: "image_url",
    image_url: {
      url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
    }
  }));

  return imageContent.length > 0
    ? [
        {
          type: "text",
          text: prompt
        },
        ...imageContent
      ]
    : prompt;
}

async function generateOpenAiCompatibleChatCompletion({
  providerName,
  endpoint,
  apiKey,
  model,
  prompt,
  options,
  extraHeaders
}: {
  providerName: string;
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  options: {
    responseMimeType?: "text/plain" | "application/json";
    maxOutputTokens?: number;
    temperature?: number;
    imageParts?: GoogleAiImagePart[];
  };
  extraHeaders?: Record<string, string>;
}) {
  if (!apiKey.trim()) {
    throw new Error(`${providerName} API key is missing.`);
  }

  if (!model.trim()) {
    throw new Error(`${providerName} model is missing.`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model: model.trim(),
      messages: [
        {
          role: "user",
          content: buildOpenAiCompatibleMessageContent(prompt, options.imageParts ?? [])
        }
      ],
      max_tokens: options.maxOutputTokens ?? 1024,
      temperature: options.temperature ?? 0.2
    })
  });

  const body = await readGeminiResponseBody(response);

  if (!response.ok) {
    const errorMessage = getAiErrorMessage(body) ?? `${providerName} request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const text = extractOpenAiCompatibleText(body);

  if (!text) {
    throw new Error(`${providerName} returned an empty response.`);
  }

  return text;
}

export async function generateOpenAiCompatibleAiText(
  settings: AiSettings,
  prompt: string,
  options: {
    responseMimeType?: "text/plain" | "application/json";
    maxOutputTokens?: number;
    temperature?: number;
    imageParts?: GoogleAiImagePart[];
  } = {}
) {
  const providerConfig = OPENAI_COMPATIBLE_PROVIDERS[settings.provider];

  if (!providerConfig) {
    throw new Error("AI provider is not supported.");
  }

  return generateOpenAiCompatibleChatCompletion({
    providerName: providerConfig.name,
    endpoint: providerConfig.endpoint,
    apiKey: settings.apiKey,
    model: settings.model,
    prompt,
    options,
    extraHeaders: providerConfig.extraHeaders
  });
}

export async function generateAnthropicAiText(
  settings: AiSettings,
  prompt: string,
  options: {
    responseMimeType?: "text/plain" | "application/json";
    maxOutputTokens?: number;
    temperature?: number;
    imageParts?: GoogleAiImagePart[];
  } = {}
) {
  if (!settings.apiKey.trim()) {
    throw new Error("Anthropic API key is missing.");
  }

  if (!settings.model.trim()) {
    throw new Error("Anthropic model is missing.");
  }

  const imageContent = (options.imageParts ?? []).map((part) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: part.inlineData.mimeType,
      data: part.inlineData.data
    }
  }));
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey.trim(),
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: options.maxOutputTokens ?? 1024,
      temperature: options.temperature ?? 0.2,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            ...imageContent
          ]
        }
      ]
    })
  });

  const body = await readGeminiResponseBody(response);

  if (!response.ok) {
    throw new Error(getAiErrorMessage(body) ?? `Anthropic request failed with status ${response.status}.`);
  }

  const text = extractAnthropicText(body);

  if (!text) {
    throw new Error("Anthropic returned an empty response.");
  }

  return text;
}

function extractJsonObjectText(text: string) {
  const trimmedText = text.trim();

  if (trimmedText.startsWith("```")) {
    const fencedMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmedText);
    if (fencedMatch) {
      return fencedMatch[1].trim();
    }
  }

  const firstBrace = trimmedText.indexOf("{");
  const lastBrace = trimmedText.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmedText.slice(firstBrace, lastBrace + 1);
  }

  return trimmedText;
}

function unescapeLooseJsonString(value: string) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractLooseJsonStringField(text: string, fieldName: string) {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"|\\s*})`, "i");
  const match = pattern.exec(text);
  return match ? unescapeLooseJsonString(match[1]) : "";
}

function extractLooseJsonNumberField(text: string, fieldName: string) {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i");
  const match = pattern.exec(text);
  return match ? Number.parseFloat(match[1]) : 0;
}

function normalizeConfidence(value: unknown) {
  const numericValue = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : 0;

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function normalizeAiMatchKey(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aiLabelsLooselyMatch(left: string, right: string) {
  const leftKey = normalizeAiMatchKey(left);
  const rightKey = normalizeAiMatchKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function splitAiMatchPairText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split(/\n|;|,(?=\s*[^,;:\n]+(?:→|->|=>|=|:))/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseAiMatchPairs(text: string) {
  return splitAiMatchPairText(text)
    .map((segment) => {
      const match = /^(.+?)\s*(?:→|->|=>|=|:)\s*(.+)$/.exec(segment);
      if (!match) {
        return null;
      }

      return {
        prompt: match[1].replace(/^["'{\s]+|["'}]\s*$/g, "").trim(),
        answer: match[2].replace(/^["'\s]+|["'}]\s*$/g, "").trim()
      };
    })
    .filter((pair): pair is { prompt: string; answer: string } => Boolean(pair?.prompt && pair.answer));
}

function findVisibleOptionLabel(control: AiQuestionControl, label: string) {
  const options = control.options ?? [];
  return options.find((option) => aiLabelsLooselyMatch(option.label, label))?.label ?? null;
}

function findMappedMatchAnswerLabel(control: AiQuestionControl, texts: string[]) {
  for (const text of texts) {
    for (const pair of parseAiMatchPairs(text)) {
      if (aiLabelsLooselyMatch(pair.prompt, control.label)) {
        const optionLabel = findVisibleOptionLabel(control, pair.answer);
        if (optionLabel) {
          return optionLabel;
        }
      }
    }
  }

  return null;
}

export function normalizeStructuredAiAnswerForPayload(
  answer: StructuredAiAnswer,
  payload: GenerateAiAnswerPayload
): StructuredAiAnswer {
  if (payload.questionType !== "match") {
    return answer;
  }

  const selectControls = (payload.controls ?? []).filter((control) => control.kind === "select");
  if (selectControls.length === 0) {
    return answer;
  }

  const candidateTexts = [
    answer.answer,
    extractLooseJsonStringField(answer.rawText, "answer"),
    ...answer.actions.map((action) => action.label)
  ].filter((text) => text.trim() !== "");
  const normalizedActions: AiAnswerAction[] = [];

  for (const [controlIndex, control] of selectControls.entries()) {
    const slotIndex = typeof control.slotIndex === "number" && Number.isFinite(control.slotIndex)
      ? control.slotIndex
      : control.index ?? controlIndex + 1;
    const slottedAction = answer.actions.find((action) => action.slotIndex === slotIndex);
    const orderedAction = answer.actions[controlIndex] ?? null;
    const directLabel =
      (slottedAction ? findVisibleOptionLabel(control, slottedAction.label) : null) ??
      (orderedAction ? findVisibleOptionLabel(control, orderedAction.label) : null);
    const mappedLabel =
      directLabel ??
      (slottedAction ? findMappedMatchAnswerLabel(control, [slottedAction.label]) : null) ??
      (orderedAction ? findMappedMatchAnswerLabel(control, [orderedAction.label]) : null) ??
      findMappedMatchAnswerLabel(control, candidateTexts);

    if (!mappedLabel) {
      continue;
    }

    normalizedActions.push({
      label: mappedLabel,
      slotIndex
    });
  }

  if (normalizedActions.length === 0) {
    return answer;
  }

  const normalizedAnswer = selectControls
    .map((control, index) => {
      const action = normalizedActions[index];
      return action ? `${control.label}: ${action.label}` : "";
    })
    .filter(Boolean)
    .join(", ");

  return {
    ...answer,
    answer: normalizedAnswer || answer.answer,
    actions: normalizedActions
  };
}

function normalizeAiAction(value: unknown): AiAnswerAction | null {
  const record = getRecord(value);

  if (!record) {
    return typeof value === "string" && value.trim()
      ? {
          label: value.trim()
        }
      : null;
  }

  const rawLabel = record.label ?? record.answer ?? record.text ?? record.value;
  const rawCoordinate = record.coordinate ?? record.coordinates;
  const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
  const coordinate = typeof rawCoordinate === "string" ? rawCoordinate.trim() : null;
  const slotIndex = typeof record.slotIndex === "number" && Number.isFinite(record.slotIndex)
    ? record.slotIndex
    : typeof record.slotIndex === "string" && record.slotIndex.trim()
      ? Number.parseInt(record.slotIndex, 10)
      : null;
  const position = typeof record.position === "number" && Number.isFinite(record.position)
    ? record.position
    : typeof record.position === "string" && record.position.trim()
      ? Number.parseInt(record.position, 10)
      : null;

  if (!label && !coordinate) {
    return null;
  }

  return {
    label: label || coordinate || "",
    slotIndex: Number.isFinite(slotIndex) ? slotIndex : null,
    position: Number.isFinite(position) ? position : null,
    coordinate
  };
}

export interface StructuredAiAnswer {
  answer: string;
  confidence: number;
  actions: AiAnswerAction[];
  rawText: string;
}

export function parseStructuredAiAnswer(text: string): StructuredAiAnswer {
  let parsedValue: unknown = null;

  try {
    parsedValue = JSON.parse(extractJsonObjectText(text));
  } catch {
    parsedValue = null;
  }

  const record = getRecord(parsedValue);

  if (!record) {
    const looseAnswer = extractLooseJsonStringField(text, "answer");
    if (looseAnswer) {
      return {
        answer: looseAnswer,
        confidence: normalizeConfidence(extractLooseJsonNumberField(text, "confidence")),
        actions: [{ label: looseAnswer }],
        rawText: text
      };
    }

    return {
      answer: text.trim(),
      confidence: 0,
      actions: text.trim() ? [{ label: text.trim() }] : [],
      rawText: text
    };
  }

  const answer = typeof record.answer === "string"
    ? record.answer.trim()
    : typeof record.label === "string"
      ? record.label.trim()
      : "";
  const rawActions = Array.isArray(record.actions)
    ? record.actions
    : Array.isArray(record.answers)
      ? record.answers
      : [];
  const actions = rawActions.map(normalizeAiAction).filter((action): action is AiAnswerAction => action !== null);

  if (actions.length === 0 && answer) {
    actions.push({ label: answer });
  }

  return {
    answer: answer || actions.map((action) => action.label).filter(Boolean).join(" | ") || text.trim(),
    confidence: normalizeConfidence(record.confidence),
    actions,
    rawText: text
  };
}

export async function generateAiAnswer(settings: AiSettings, payload: GenerateAiAnswerPayload) {
  const prompt = buildQuizAnswerPrompt(payload);
  const maxOutputTokens = payload.questionType === "essay" ? 4096 : 1536;
  const temperature = payload.questionType === "essay" ? 0.35 : 0.15;
  const imageParts = payload.images?.length ? await buildGoogleAiImageParts(payload) : [];

  let text: string;

  if (settings.provider === "custom") {
    text = await generateCustomAiText(settings, prompt, {
      responseMimeType: "application/json",
      maxOutputTokens,
      temperature,
      imageParts
    });
  } else if (settings.provider === "google") {
    text = await generateGoogleAiText(settings, prompt, {
      responseMimeType: "application/json",
      maxOutputTokens,
      temperature,
      imageParts
    });
  } else if (settings.provider === "anthropic") {
    text = await generateAnthropicAiText(settings, prompt, {
      responseMimeType: "application/json",
      maxOutputTokens,
      temperature,
      imageParts
    });
  } else {
    text = await generateOpenAiCompatibleAiText(settings, prompt, {
      responseMimeType: "application/json",
      maxOutputTokens,
      temperature,
      imageParts
    });
  }

  return normalizeStructuredAiAnswerForPayload(parseStructuredAiAnswer(text), payload);
}

export async function testAiConnection(settings: AiSettings) {
  if (settings.provider === "custom") {
    if (!settings.customEndpoint?.trim()) {
      throw new Error("Custom endpoint is missing.");
    }
    return generateCustomAiText(settings, "Reply with exactly: OK");
  }

  if (settings.provider === "google") {
    return generateGoogleAiText(settings, "Reply with exactly: OK");
  }

  if (settings.provider === "anthropic") {
    return generateAnthropicAiText(settings, "Reply with exactly: OK");
  }

  return generateOpenAiCompatibleAiText(settings, "Reply with exactly: OK");
}
