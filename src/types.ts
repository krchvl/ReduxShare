import { DEFAULT_HOTKEY, DEFAULT_HOTKEY_CODE, normalizeHotkeyCode, normalizeHotkeyValue } from "./lib/hotkeys";

export type ViewName = "login" | "register" | "main";

const LEGACY_THEME_OPTIONS = [
  { name: "Night", accent: "#9cb9f6" },
  { name: "Devil", accent: "#ff6b6f" },
  { name: "Peace", accent: "#76d982" }
] as const;

export const DEFAULT_ACCENT_COLOR = "#9cb9f6";

export type LanguageSetting = "auto" | "ru" | "en";

export const AI_PROVIDER_OPTIONS = [
  { value: "google", label: "Google" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "groq", label: "Groq" },
  { value: "mistral", label: "Mistral" },
  { value: "xai", label: "xAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "custom", label: "Custom" }
] as const;

export type AiProvider = (typeof AI_PROVIDER_OPTIONS)[number]["value"];
export type BuiltInAiProvider = Exclude<AiProvider, "custom">;

export interface AiModelOption {
  value: string;
  label: string;
}

export const AI_MODEL_OPTIONS_BY_PROVIDER = {
  google: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" }
  ],
  openrouter: [
    { value: "openrouter/auto", label: "Auto Router" },
    { value: "openai/gpt-5.5", label: "GPT-5.5" },
    { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" }
  ],
  openai: [
    { value: "gpt-5.5", label: "GPT-5.5" },
    { value: "gpt-5.5-pro", label: "GPT-5.5 Pro" },
    { value: "chat-latest", label: "ChatGPT Latest" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" }
  ],
  anthropic: [
    { value: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-5-haiku-latest", label: "Claude Haiku 3.5" }
  ],
  groq: [
    { value: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
    { value: "qwen/qwen3-32b", label: "Qwen3 32B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" }
  ],
  mistral: [
    { value: "mistral-medium-latest", label: "Mistral Medium 3.1" },
    { value: "mistral-large-latest", label: "Mistral Large" },
    { value: "mistral-small-latest", label: "Mistral Small" }
  ],
  xai: [
    { value: "grok-4.3", label: "Grok 4.3" },
    { value: "grok-4.3-latest", label: "Grok 4.3 Latest" },
    { value: "grok-latest", label: "Grok Latest" }
  ],
  deepseek: [
    { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" }
  ]
} as const satisfies Record<BuiltInAiProvider, readonly AiModelOption[]>;

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
  connectionVerified: boolean;
  verifiedAt: string | null;
  customEndpoint?: string;
  customModelName?: string;
}

export interface Settings {
  extensionEnabled: boolean;
  stealthMode: boolean;
  autoSelect: boolean;
  hotkey: string;
  hotkeyCode: string;
  accentColor: string;
  language: LanguageSetting;
  ai: AiSettings;
}

export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "error";
export type UpdateSource = "github";

export interface UpdateState {
  status: UpdateStatus;
  source: UpdateSource;
  currentVersion: string;
  latestVersion: string | null;
  checkedAt: string | null;
  nextCheckAt: string | null;
  releaseUrl: string | null;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  username: string;
  password: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  user: {
    id: string;
    email: string | null;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  moodleDomain: string | null;
  solvedTestsCount: number;
  solvedTasksCount: number;
}

export interface QuizQuestionSummary {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  questionText: string;
  answerLabels: string[];
}

export interface QuizAttemptContext {
  domain: string;
  pageUrl: string;
  detectedAt: string;
  courseId: number | null;
  contextInstanceId: number | null;
  questionCount: number;
  questions: QuizQuestionSummary[];
}

export interface StoredState {
  settings: Settings;
  authSession: AuthSession | null;
  userProfile: UserProfile | null;
  latestQuizAttemptContext?: QuizAttemptContext | null;
  updateState?: UpdateState | null;
}

export const DEFAULT_SETTINGS: Settings = {
  extensionEnabled: true,
  stealthMode: true,
  autoSelect: true,
  hotkey: DEFAULT_HOTKEY,
  hotkeyCode: DEFAULT_HOTKEY_CODE,
  accentColor: DEFAULT_ACCENT_COLOR,
  language: "auto",
  ai: {
    provider: "google",
    model: "gemini-2.5-flash",
    apiKey: "",
    connectionVerified: false,
    verifiedAt: null
  }
};

export const DEFAULT_UPDATE_STATE: UpdateState = {
  status: "idle",
  source: "github",
  currentVersion: "0.1.0",
  latestVersion: null,
  checkedAt: null,
  nextCheckAt: null,
  releaseUrl: null,
  error: null
};

export const DEFAULT_STORED_STATE: StoredState = {
  settings: DEFAULT_SETTINGS,
  authSession: null,
  userProfile: null,
  latestQuizAttemptContext: null,
  updateState: DEFAULT_UPDATE_STATE
};

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === "auto" || value === "ru" || value === "en";
}

export function normalizeAccentColor(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_ACCENT_COLOR;
  }

  const trimmedValue = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmedValue)) {
    return trimmedValue.toLowerCase();
  }

  const legacyTheme = LEGACY_THEME_OPTIONS.find((theme) => theme.name === trimmedValue);

  return legacyTheme?.accent ?? DEFAULT_ACCENT_COLOR;
}

export function isAiProvider(value: unknown): value is AiProvider {
  return AI_PROVIDER_OPTIONS.some((provider) => provider.value === value);
}

export function isBuiltInAiProvider(value: unknown): value is BuiltInAiProvider {
  return isAiProvider(value) && value !== "custom";
}

export function getAiModelOptionsForProvider(provider: AiProvider) {
  return isBuiltInAiProvider(provider) ? AI_MODEL_OPTIONS_BY_PROVIDER[provider] : [];
}

export function getDefaultAiModelForProvider(provider: AiProvider) {
  return getAiModelOptionsForProvider(provider)[0]?.value ?? DEFAULT_SETTINGS.ai.model;
}

export function isAiModelForProvider(provider: AiProvider, value: unknown) {
  return typeof value === "string" && getAiModelOptionsForProvider(provider).some((model) => model.value === value);
}

export function normalizeAiSettings(settings: Partial<AiSettings> | undefined): AiSettings {
  const provider = isAiProvider(settings?.provider) ? settings.provider : DEFAULT_SETTINGS.ai.provider;
  const rawModel = typeof settings?.model === "string" ? settings.model.trim() : "";
  const model = provider === "custom"
    ? (rawModel || DEFAULT_SETTINGS.ai.model)
    : rawModel || getDefaultAiModelForProvider(provider);
  const apiKey = typeof settings?.apiKey === "string" ? settings.apiKey.trim() : "";
  const verifiedAt = typeof settings?.verifiedAt === "string" && settings.verifiedAt ? settings.verifiedAt : null;
  const customEndpoint = provider === "custom" && typeof settings?.customEndpoint === "string"
    ? settings.customEndpoint.trim()
    : undefined;
  const customModelName = provider === "custom" && typeof settings?.customModelName === "string"
    ? settings.customModelName.trim()
    : undefined;
  const hasConnectionTarget = provider === "custom" ? Boolean(customEndpoint && customModelName) : Boolean(model.trim());
  const connectionVerified = Boolean(settings?.connectionVerified && apiKey && verifiedAt && hasConnectionTarget);

  return {
    provider,
    model,
    apiKey,
    connectionVerified,
    verifiedAt: connectionVerified ? verifiedAt : null,
    customEndpoint,
    customModelName
  };
}

export function normalizeSettings(settings: Partial<Settings> | undefined): Settings {
  return {
    extensionEnabled: settings?.extensionEnabled ?? DEFAULT_SETTINGS.extensionEnabled,
    stealthMode: settings?.stealthMode ?? DEFAULT_SETTINGS.stealthMode,
    autoSelect: settings?.autoSelect ?? DEFAULT_SETTINGS.autoSelect,
    hotkey: normalizeHotkeyValue(settings?.hotkey),
    hotkeyCode: normalizeHotkeyCode(settings?.hotkeyCode, settings?.hotkey),
    accentColor: normalizeAccentColor(settings?.accentColor ?? (settings as Partial<Settings> & { theme?: unknown })?.theme),
    language: isLanguageSetting(settings?.language) ? settings.language : DEFAULT_SETTINGS.language,
    ai: normalizeAiSettings(settings?.ai)
  };
}
