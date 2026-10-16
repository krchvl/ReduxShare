export const OFFICIAL_AI_MODEL = "auto";
export const OFFICIAL_AI_CHAT_PATH = "/api/rpx-ai/v1/chat/completions";
export const OFFICIAL_AI_USAGE_PATH = "/api/rpx-ai/usage";

export const AI_PLANS = ["free", "low", "medium", "high"] as const;

export type AiPlan = (typeof AI_PLANS)[number];

export interface AiPlanLimits {
  minuteLimit: number;
  dayLimit: number;
}

export const AI_PLAN_LIMITS: Record<AiPlan, AiPlanLimits> = {
  free: { minuteLimit: 5, dayLimit: 30 },
  low: { minuteLimit: 10, dayLimit: 50 },
  medium: { minuteLimit: 20, dayLimit: 75 },
  high: { minuteLimit: 30, dayLimit: 150 },
};

export interface OfficialAiPlanModel {
  model: string;
  label: string;
}

export interface OfficialAiUsageState {
  plan: AiPlan;
  models: OfficialAiPlanModel[];
  minuteUsed: number;
  minuteLimit: number;
  dayUsed: number;
  dayLimit: number;
}

export const DEFAULT_OFFICIAL_AI_USAGE: OfficialAiUsageState = {
  plan: "free",
  models: [],
  minuteUsed: 0,
  minuteLimit: 5,
  dayUsed: 0,
  dayLimit: 30,
};

const OFFICIAL_MODEL_PROVIDER_PATTERNS: Array<[RegExp, string]> = [
  [/gemini/, "google"],
  [/(^|\/)(openai\/)?gpt/, "openai"],
  [/openai\//, "openai"],
  [/claude/, "anthropic"],
  [/grok/, "xai"],
  [/deepseek/, "deepseek"],
  [/mistral|magistral|ministral|codestral|voxtral/, "mistral"],
  [/openrouter/, "openrouter"],
];

export function detectOfficialModelProvider(model: string): string | null {
  const normalized = model.trim().toLowerCase();

  for (const [pattern, provider] of OFFICIAL_MODEL_PROVIDER_PATTERNS) {
    if (pattern.test(normalized)) {
      return provider;
    }
  }

  return null;
}
