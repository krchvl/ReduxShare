import { DEFAULT_HOTKEY, DEFAULT_HOTKEY_CODE, normalizeHotkeyCode, normalizeHotkeyValue } from "./lib/hotkeys";

export type ViewName = "login" | "register" | "main";

const LEGACY_THEME_OPTIONS = [
  { name: "Night", accent: "#9cb9f6" },
  { name: "Devil", accent: "#ff6b6f" },
  { name: "Peace", accent: "#76d982" }
] as const;

export type LegacyTheme = "Night" | "Devil" | "Peace";

export interface LegacyStoredSettings {
  theme?: LegacyTheme;
}

export type AutoSelectTempoPreset = "realistic" | "balanced" | "brisk";

// Avg answer time per tempo. `autoSelectAvgSeconds` stays the source of truth in storage, so a
// manual slider value simply stops matching any preset (and no chip renders as active).
// Avg answer time per tempo. "Balanced" doubles as the default, so a fresh install highlights it.
export const AUTO_SELECT_TEMPO_PRESETS = {
  realistic: 12,
  balanced: 4,
  brisk: 1.5
} as const satisfies Record<AutoSelectTempoPreset, number>;

export const DEFAULT_ACCENT_COLOR = "#9cb9f6";

export type LanguageSetting = "auto" | "ru" | "en";
export type ColorSchemeSetting = "light" | "dark" | "system";

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

export const AI_MODEL_OPTIONS_BY_PROVIDER: Record<BuiltInAiProvider, readonly AiModelOption[]> = {
  google: [],
  openrouter: [],
  openai: [],
  anthropic: [],
  groq: [],
  mistral: [],
  xai: [],
  deepseek: []
};

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
  copyUnlock: boolean;
  autoSelect: boolean;
  autoSelectAvgSeconds: number;
  // Turned off by closing the attempt status panel with its close button; flipping it back on
  // in the popup re-renders the panel on the open attempt page. Not persisted.
  attemptStatusPanelClosed: boolean;
  hotkey: string;
  hotkeyCode: string;
  accentColor: string;
  language: LanguageSetting;
  colorScheme: ColorSchemeSetting;
  popupOpacity: number;
  pageOverlayOpacity: number;
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
  settings: Settings & Partial<LegacyStoredSettings>;
  authSession: AuthSession | null;
  userProfile: UserProfile | null;
  latestQuizAttemptContext?: QuizAttemptContext | null;
  updateState?: UpdateState | null;
}

export const DEFAULT_SETTINGS: Settings = {
  extensionEnabled: true,
  stealthMode: false,
  copyUnlock: false,
  autoSelect: true,
  autoSelectAvgSeconds: 4,
  attemptStatusPanelClosed: false,
  hotkey: DEFAULT_HOTKEY,
  hotkeyCode: DEFAULT_HOTKEY_CODE,
  accentColor: DEFAULT_ACCENT_COLOR,
  language: "auto",
  colorScheme: "system",
  popupOpacity: 1,
  pageOverlayOpacity: 1,
  ai: {
    provider: "google",
    model: "",
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

export function isColorSchemeSetting(value: unknown): value is ColorSchemeSetting {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveColorScheme(setting: ColorSchemeSetting | undefined): "light" | "dark" {
  if (setting === "light" || setting === "dark") {
    return setting;
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  return "dark";
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
  return getAiModelOptionsForProvider(provider)[0]?.value ?? "";
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

export function normalizeOpacity(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.min(1, Math.max(0.4, value));
}

export function normalizeAutoSelectAvgSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.autoSelectAvgSeconds;
  }

  return Math.min(30, Math.max(1, Math.round(value * 10) / 10));
}

export function normalizeSettings(settings: Partial<Settings> & Partial<LegacyStoredSettings> | undefined): Settings {
  return {
    extensionEnabled: settings?.extensionEnabled ?? DEFAULT_SETTINGS.extensionEnabled,
    stealthMode: settings?.stealthMode ?? DEFAULT_SETTINGS.stealthMode,
    copyUnlock: settings?.copyUnlock ?? DEFAULT_SETTINGS.copyUnlock,
    autoSelect: settings?.autoSelect ?? DEFAULT_SETTINGS.autoSelect,
    attemptStatusPanelClosed: settings?.attemptStatusPanelClosed === true,
    autoSelectAvgSeconds: normalizeAutoSelectAvgSeconds(settings?.autoSelectAvgSeconds),
    hotkey: normalizeHotkeyValue(settings?.hotkey),
    hotkeyCode: normalizeHotkeyCode(settings?.hotkeyCode, settings?.hotkey),
    accentColor: normalizeAccentColor(settings?.accentColor ?? (settings as Partial<LegacyStoredSettings>)?.theme),
    language: isLanguageSetting(settings?.language) ? settings.language : DEFAULT_SETTINGS.language,
    colorScheme: isColorSchemeSetting(settings?.colorScheme) ? settings.colorScheme : DEFAULT_SETTINGS.colorScheme,
    popupOpacity: settings?.popupOpacity ?? DEFAULT_SETTINGS.popupOpacity,
    pageOverlayOpacity: settings?.pageOverlayOpacity ?? DEFAULT_SETTINGS.pageOverlayOpacity,
    ai: normalizeAiSettings(settings?.ai)
  };
}
