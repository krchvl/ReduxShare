export const OFFICIAL_AI_MODEL = "auto";
export const OFFICIAL_AI_CHAT_PATH = "/api/rpx-ai/v1/chat/completions";
export const OFFICIAL_AI_USAGE_PATH = "/api/rpx-ai/usage";

export interface OfficialAiUsageState {
  minuteUsed: number;
  minuteLimit: number;
  dayUsed: number;
  dayLimit: number;
}

export const DEFAULT_OFFICIAL_AI_USAGE: OfficialAiUsageState = {
  minuteUsed: 0,
  minuteLimit: 5,
  dayUsed: 0,
  dayLimit: 30,
};
