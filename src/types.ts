import {
  DEFAULT_HOTKEY,
  DEFAULT_HOTKEY_CODE,
  normalizeHotkeyCode,
  normalizeHotkeyValue,
} from "./lib/hotkeys";
import { BUILTIN_SERVER_ID, getBuiltinServerConfig, type DataProviderId } from "./lib/envConfig";
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_THEME_ID,
  THEMES,
  customPaletteFromPalette,
  isThemeId,
  normalizeCustomThemePalette,
  resolveLegacyColorSchemeKind,
  resolveThemeId,
  type CustomThemePalette,
  type ThemeId,
  type ThemeSettingsLike,
} from "./shared/themePalettes";

export { DEFAULT_ACCENT_COLOR };

export type ViewName = "login" | "register" | "main";

export type LegacyTheme = "Night" | "Devil" | "Peace";

export interface LegacyStoredSettings {
  theme?: LegacyTheme;
  accentColor?: string;
  colorScheme?: string;
}

export type AutoSelectTempoPreset = "realistic" | "balanced" | "brisk";

export const AUTO_SELECT_TEMPO_PRESETS = {
  realistic: 12,
  balanced: 4,
  brisk: 1.5,
} as const satisfies Record<AutoSelectTempoPreset, number>;

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
  { value: "custom", label: "Custom" },
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
  deepseek: [],
};

export type AiAccessModeSetting = "official" | "custom";

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
  connectionVerified: boolean;
  verifiedAt: string | null;
  customEndpoint?: string;
  customModelName?: string;
  accessMode: AiAccessModeSetting;
  officialModels?: string[];
}

export interface ServerConfig {
  id: string;
  url: string;
  label: string;
  builtIn?: boolean;
}

export interface Settings {
  extensionEnabled: boolean;
  autoSelect: boolean;
  autoSelectAvgSeconds: number;
  humanTyping: boolean;
  humanPrecursors: boolean;

  attemptStatusPanelClosed: boolean;
  hotkey: string;
  hotkeyCode: string;
  themeId: ThemeId;
  customTheme: CustomThemePalette;
  language: LanguageSetting;
  popupOpacity: number;
  pageOverlayOpacity: number;
  servers: ServerConfig[];
  activeServerId: string;
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
  provider?: DataProviderId;
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
  importedQuestionsCount: number;
  attemptCorrectCount: number;
  attemptIncorrectCount: number;
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

export type PopupTab = "main" | "stats" | "ui" | "security" | "ai" | "extra";

export interface AiSettingsDraft {
  provider: AiProvider;
  model: string;
  apiKey: string;
  customEndpoint: string;
  customModelName: string;
}

export interface PopupState {
  activeTab: PopupTab;
  menuOpen?: boolean;
  aiDraft: AiSettingsDraft | null;
}

export interface StoredState {
  settings: Settings & Partial<LegacyStoredSettings>;
  authSession: AuthSession | null;
  userProfile: UserProfile | null;
  latestQuizAttemptContext?: QuizAttemptContext | null;
  updateState?: UpdateState | null;
  popupState?: PopupState | null;
  guestMode?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  extensionEnabled: true,
  autoSelect: true,
  autoSelectAvgSeconds: 4,
  humanTyping: true,
  humanPrecursors: true,
  attemptStatusPanelClosed: false,
  hotkey: DEFAULT_HOTKEY,
  hotkeyCode: DEFAULT_HOTKEY_CODE,
  themeId: DEFAULT_THEME_ID,
  customTheme: customPaletteFromPalette(THEMES.standard.palette),
  language: "auto",
  popupOpacity: 1,
  pageOverlayOpacity: 1,
  servers: normalizeServerConfigs(undefined),
  activeServerId: BUILTIN_SERVER_ID,
  ai: {
    provider: "google",
    model: "",
    apiKey: "",
    connectionVerified: false,
    verifiedAt: null,
    accessMode: "official",
  },
};

export const DEFAULT_UPDATE_STATE: UpdateState = {
  status: "idle",
  source: "github",
  currentVersion: "0.1.0",
  latestVersion: null,
  checkedAt: null,
  nextCheckAt: null,
  releaseUrl: null,
  error: null,
};

export const DEFAULT_STORED_STATE: StoredState = {
  settings: DEFAULT_SETTINGS,
  authSession: null,
  userProfile: null,
  latestQuizAttemptContext: null,
  updateState: DEFAULT_UPDATE_STATE,
  guestMode: false,
};

export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === "auto" || value === "ru" || value === "en";
}

export function normalizeThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : resolveThemeId(value as ThemeSettingsLike);
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

export function normalizeAiSettings(settings: Partial<AiSettings> | undefined): AiSettings {
  const provider = isAiProvider(settings?.provider)
    ? settings.provider
    : DEFAULT_SETTINGS.ai.provider;
  const rawModel = typeof settings?.model === "string" ? settings.model.trim() : "";
  const model =
    provider === "custom"
      ? rawModel || DEFAULT_SETTINGS.ai.model
      : rawModel || getDefaultAiModelForProvider(provider);
  const apiKey = typeof settings?.apiKey === "string" ? settings.apiKey.trim() : "";
  const verifiedAt =
    typeof settings?.verifiedAt === "string" && settings.verifiedAt ? settings.verifiedAt : null;
  const customEndpoint =
    provider === "custom" && typeof settings?.customEndpoint === "string"
      ? settings.customEndpoint.trim()
      : undefined;
  const customModelName =
    provider === "custom" && typeof settings?.customModelName === "string"
      ? settings.customModelName.trim()
      : undefined;
  const hasConnectionTarget =
    provider === "custom" ? Boolean(customEndpoint && customModelName) : Boolean(model.trim());
  const connectionVerified = Boolean(
    settings?.connectionVerified && apiKey && verifiedAt && hasConnectionTarget,
  );

  const accessMode: AiAccessModeSetting = settings?.accessMode === "custom" ? "custom" : "official";

  const officialModelsRaw = Array.isArray(settings?.officialModels) ? settings.officialModels : [];
  const officialModels = officialModelsRaw
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
  const officialModelsUnique = Array.from(new Set(officialModels));

  return {
    provider,
    model,
    apiKey,
    connectionVerified,
    verifiedAt: connectionVerified ? verifiedAt : null,
    customEndpoint,
    customModelName,
    accessMode,
    officialModels: Array.isArray(settings?.officialModels) ? officialModelsUnique : undefined,
  };
}

const POPUP_TABS: PopupTab[] = ["main", "stats", "ui", "security", "ai", "extra"];

function normalizeAiDraft(value: unknown): AiSettingsDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<AiSettingsDraft>;

  return {
    provider: isAiProvider(raw.provider) ? raw.provider : DEFAULT_SETTINGS.ai.provider,
    model: typeof raw.model === "string" ? raw.model : "",
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    customEndpoint: typeof raw.customEndpoint === "string" ? raw.customEndpoint : "",
    customModelName: typeof raw.customModelName === "string" ? raw.customModelName : "",
  };
}

export function normalizePopupState(value: unknown): PopupState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<PopupState>;
  const activeTab = POPUP_TABS.find((tab) => tab === raw.activeTab) ?? "main";

  return {
    activeTab,
    menuOpen: raw.menuOpen === true,
    aiDraft: normalizeAiDraft(raw.aiDraft),
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

  return Math.min(
    AUTO_SELECT_TEMPO_PRESETS.realistic,
    Math.max(AUTO_SELECT_TEMPO_PRESETS.brisk, Math.round(value * 10) / 10),
  );
}

function isValidServerUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getServerOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function normalizeServerConfigs(rawServers: unknown): ServerConfig[] {
  const servers: ServerConfig[] = [];
  const seenOrigins = new Set<string>();

  const push = (server: ServerConfig) => {
    if (!isValidServerUrl(server.url)) {
      return;
    }

    const origin = getServerOrigin(server.url);

    if (!origin || seenOrigins.has(origin)) {
      return;
    }

    seenOrigins.add(origin);
    servers.push({ ...server, url: server.url.replace(/\/+$/, "") });
  };

  const builtin = getBuiltinServerConfig();

  if (builtin) {
    push(builtin);
  }

  if (Array.isArray(rawServers)) {
    for (const raw of rawServers) {
      if (!raw || typeof raw !== "object") {
        continue;
      }

      const candidate = raw as Partial<ServerConfig>;

      if (typeof candidate.id !== "string" || candidate.id === BUILTIN_SERVER_ID) {
        continue;
      }

      if (typeof candidate.label !== "string" || !candidate.label.trim()) {
        continue;
      }

      push({ id: candidate.id, url: candidate.url ?? "", label: candidate.label.trim() });
    }
  }

  return servers;
}

export function resolveActiveServerId(rawId: unknown, servers: ServerConfig[]): string {
  if (typeof rawId === "string" && servers.some((server) => server.id === rawId)) {
    return rawId;
  }

  return servers[0]?.id ?? BUILTIN_SERVER_ID;
}

function migrateThemeSettings(
  settings: (Partial<Settings> & Partial<LegacyStoredSettings>) | undefined,
) {
  if (isThemeId(settings?.themeId)) {
    return {
      themeId: settings.themeId,
      customTheme: normalizeCustomThemePalette(settings?.customTheme),
    };
  }

  const themeId = resolveThemeId(settings);
  const customTheme = normalizeCustomThemePalette(undefined);

  if (themeId !== "custom") {
    const hadLegacyThemeName = typeof settings?.theme === "string";

    if (
      !hadLegacyThemeName &&
      themeId === "standard" &&
      resolveLegacyColorSchemeKind(settings?.colorScheme) === "light"
    ) {
      return { themeId: "daylight" as ThemeId, customTheme };
    }

    return { themeId, customTheme };
  }

  const legacyPalette =
    resolveLegacyColorSchemeKind(settings?.colorScheme) === "light"
      ? THEMES.daylight.palette
      : THEMES.standard.palette;
  const legacyAccent =
    typeof settings?.accentColor === "string" ? settings.accentColor.trim().toLowerCase() : "";

  return {
    themeId,
    customTheme: normalizeCustomThemePalette({
      ...customPaletteFromPalette(legacyPalette),
      accent: /^#[0-9a-f]{6}$/.test(legacyAccent) ? legacyAccent : undefined,
    }),
  };
}

export function normalizeSettings(
  settings: (Partial<Settings> & Partial<LegacyStoredSettings>) | undefined,
): Settings {
  const servers = normalizeServerConfigs(settings?.servers);
  const theme = migrateThemeSettings(settings);

  return {
    extensionEnabled: settings?.extensionEnabled ?? DEFAULT_SETTINGS.extensionEnabled,
    autoSelect: settings?.autoSelect ?? DEFAULT_SETTINGS.autoSelect,
    attemptStatusPanelClosed: settings?.attemptStatusPanelClosed === true,
    autoSelectAvgSeconds: normalizeAutoSelectAvgSeconds(settings?.autoSelectAvgSeconds),
    humanTyping: settings?.humanTyping ?? DEFAULT_SETTINGS.humanTyping,
    humanPrecursors: settings?.humanPrecursors ?? DEFAULT_SETTINGS.humanPrecursors,
    hotkey: normalizeHotkeyValue(settings?.hotkey),
    hotkeyCode: normalizeHotkeyCode(settings?.hotkeyCode, settings?.hotkey),
    themeId: theme.themeId,
    customTheme: theme.customTheme,
    language: isLanguageSetting(settings?.language) ? settings.language : DEFAULT_SETTINGS.language,
    popupOpacity: settings?.popupOpacity ?? DEFAULT_SETTINGS.popupOpacity,
    pageOverlayOpacity: settings?.pageOverlayOpacity ?? DEFAULT_SETTINGS.pageOverlayOpacity,
    servers,
    activeServerId: resolveActiveServerId(settings?.activeServerId, servers),
    ai: normalizeAiSettings(settings?.ai),
  };
}
