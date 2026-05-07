import type { AiSettings } from "../types";
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
  const bodyRecord = getRecord(body);
  const errorRecord = getRecord(bodyRecord?.error);
  const message = errorRecord?.message;

  return typeof message === "string" && message.trim() ? message : null;
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

export function hasUsableAiSettings(settings: Partial<AiSettings> | undefined) {
  if (!settings || !settings.apiKey?.trim()) return false;

  if (settings.provider === "google") {
    return Boolean(
      settings.connectionVerified &&
        typeof settings.model === "string" &&
        settings.model.trim()
    );
  }

  if (settings.provider === "custom") {
    return Boolean(
      settings.connectionVerified &&
        typeof settings.customEndpoint === "string" &&
        settings.customEndpoint.trim() &&
        typeof settings.customModelName === "string" &&
        settings.customModelName.trim()
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
  if (!settings.apiKey.trim()) {
    throw new Error("API key is missing.");
  }

  if (!settings.customEndpoint?.trim()) {
    throw new Error("Custom endpoint is missing.");
  }

  const modelName = settings.customModelName?.trim() || settings.model;

  const imageContent = (options.imageParts ?? []).map((part) => ({
    type: "image_url",
    image_url: {
      url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
    }
  }));
  const messageContent = imageContent.length > 0
    ? [
        {
          type: "text",
          text: prompt
        },
        ...imageContent
      ]
    : prompt;

  const response = await fetch(settings.customEndpoint.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "user",
          content: messageContent
        }
      ],
      max_tokens: options.maxOutputTokens ?? 1024,
      temperature: options.temperature ?? 0.2
    })
  });

  const body = await readGeminiResponseBody(response);

  if (!response.ok) {
    const errorMessage = getGeminiErrorMessage(body) ?? `Custom AI request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  const bodyRecord = getRecord(body);
  const choices = Array.isArray(bodyRecord?.choices) ? bodyRecord.choices : [];
  const firstChoice = getRecord(choices[0]);
  const message = getRecord(firstChoice?.message);
  const text = typeof message?.content === "string" ? message.content : "";

  if (!text) {
    throw new Error("Custom AI returned an empty response.");
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
  } else {
    text = await generateGoogleAiText(settings, prompt, {
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

  return generateGoogleAiText(settings, "Reply with exactly: OK");
}
