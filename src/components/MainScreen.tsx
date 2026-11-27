import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TranslateFn, TranslationKey } from "../i18n";
import { useI18n } from "../i18n/react";
import {
  AI_PROVIDER_OPTIONS,
  AUTO_SELECT_TEMPO_PRESETS,
  getAiModelOptionsForProvider,
  getDefaultAiModelForProvider,
  normalizeAiSettings,
  type AiModelOption,
  type AiSettingsDraft,
  type AutoSelectTempoPreset,
  type AiSettings,
  type PopupState,
  type Settings,
  type UpdateState,
  type UserProfile,
} from "../types";
import { AccentColorPicker } from "./AccentColorPicker";
import { AiAccessModeIcon, type AiAccessMode } from "./AiAccessModeIcon";
import { AiProviderIcon, OfficialModelIcon, TrashIcon } from "./AiProviderIcon";
import { AuthGateOverlay } from "./AuthGateOverlay";
import { HumanizationIcon } from "./HumanizationIcon";
import { Button } from "./Button";
import { ColorSchemeSelect } from "./ColorSchemeSelect";
import { CustomSelect, getAnchoredFloatingStyle } from "./CustomSelect";
import { ServerPicker } from "./ServerPicker";
import { StatsPanel } from "./StatsPanel";
import { TabCard, TabCardGroup } from "./TabCard";
import { LanguageSelect } from "./LanguageSelect";
import { Switch } from "./Switch";
import { requestAiConnectionTest, requestAiModels, requestOfficialAiUsage } from "../lib/ai";
import { isOfficialAiAvailable } from "../lib/envConfig";
import { AI_PLAN_LIMITS, AI_PLANS, type OfficialAiUsageState } from "../shared/aiOfficial";

const AI_PLAN_LABEL_KEYS = {
  free: "settings.ai.plan.free",
  low: "settings.ai.plan.low",
  medium: "settings.ai.plan.medium",
  high: "settings.ai.plan.high",
} as const;
import {
  isBroadHostPermissionGrantedSync,
  needsBroadHostPermission,
  refreshBroadPermissionCache,
  requestBroadHostPermission,
  requestOriginHostPermission,
  toOriginPermission,
} from "../lib/optionalPermissions";
import { formatHotkeyBindingFromKeyboardEvent } from "../lib/hotkeys";
import { patchStoredState } from "../lib/storage";
import {
  AUTO_SELECT_SLIDER_POSITION_MAX,
  AUTO_SELECT_SLIDER_POSITION_MIN,
  autoSelectTempoPositionToSeconds,
  autoSelectTempoSecondsToPosition,
} from "../logic/settings";
import { UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY } from "../shared/storageKeys";
import githubIcon from "../assets/github.svg";
import telegramIcon from "../assets/telegram.svg";

interface MainScreenProps {
  settings: Settings;
  updateState: UpdateState;
  isCheckingUpdates: boolean;
  userProfile?: UserProfile | null;
  isAuthenticated?: boolean;
  popupState?: PopupState | null;
  onSettingsChange: (settings: Settings) => void;
  onPopupStateChange?: (popupState: PopupState) => void;
  onCheckUpdates: () => void;
  onResetSettings: () => void;
  onLogout: () => void;
  onOpenLogin?: () => void;
}

type SettingsTab = "main" | "stats" | "ui" | "security" | "ai" | "extra";

const POPUP_STATE_PERSIST_DELAY_MS = 300;

function toAiDraft(draft: AiSettings): AiSettingsDraft {
  return {
    provider: draft.provider,
    model: draft.model,
    apiKey: draft.apiKey,
    customEndpoint: draft.customEndpoint ?? "",
    customModelName: draft.customModelName ?? "",
  };
}

export function createRestoredAiDraft(
  settings: Settings,
  restored: AiSettingsDraft | null,
): AiSettings {
  const normalized = normalizeAiSettings(settings.ai);

  if (!restored) {
    return normalized;
  }

  const restoredModel = restored.model.trim();
  const restoredEndpoint = restored.customEndpoint.trim();
  const restoredModelName = restored.customModelName.trim();
  const connectionVerified =
    normalized.connectionVerified &&
    normalized.provider === restored.provider &&
    normalized.apiKey === restored.apiKey.trim() &&
    normalized.model.trim() === restoredModel &&
    (normalized.customEndpoint ?? "") === restoredEndpoint &&
    (normalized.customModelName ?? "") === restoredModelName &&
    restored.apiKey.trim() !== "";

  return normalizeAiSettings({
    ...normalized,
    provider: restored.provider,
    model: restoredModel || getDefaultAiModelForProvider(restored.provider),
    apiKey: restored.apiKey,
    customEndpoint: restored.customEndpoint,
    customModelName: restored.customModelName,
    connectionVerified,
    verifiedAt: connectionVerified ? normalized.verifiedAt : null,
  });
}

function forceCustomAccessMode(draft: AiSettings): AiSettings {
  if (draft.accessMode === "custom") {
    return draft;
  }

  return { ...draft, accessMode: "custom", connectionVerified: false, verifiedAt: null };
}

function resolveInitialAiDraft(
  settings: Settings,
  restored: AiSettingsDraft | null,
  officialAiAvailable: boolean,
): AiSettings {
  const draft = createRestoredAiDraft(settings, restored);

  return officialAiAvailable ? draft : forceCustomAccessMode(draft);
}

interface TabConfig {
  key: SettingsTab;
  label: TranslationKey;
  description: TranslationKey;
  icon: ReactNode;
}

interface SettingPanelRowProps {
  title: string;
  lines: [string, string];
  control: ReactNode;
}

function isCustomProviderFlow(draft: AiSettings): boolean {
  return draft.provider === "custom" && Boolean(draft.customEndpoint?.trim());
}

type AiTestStatus = "idle" | "checking" | "success" | "error" | "saved";

interface AiTestState {
  status: AiTestStatus;
  message: string | null;
  verifiedAt: string | null;
}

interface AiModelsState {
  provider: AiSettings["provider"] | null;
  requestKey: string | null;
  status: "idle" | "loading" | "success" | "error";
  models: AiModelOption[];
  message: string | null;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="settings-gear">
      <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="10" y="25" width="7" height="15" rx="2.4" />
      <rect x="20.5" y="12" width="7" height="28" rx="2.4" />
      <rect x="31" y="19" width="7" height="21" rx="2.4" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6C14 6 6 13.3 6 22.4c0 8 6.2 15.1 14.7 15.1h2.4c2.4 0 3.4 2.9 1.7 4.5-.8.8-.2 2 1 2 9.2-.7 16.2-7.7 16.2-17.2C42 15.3 34 6 24 6Z" />
      <circle cx="16" cy="20" r="2.6" />
      <circle cx="22" cy="15" r="2.6" />
      <circle cx="31" cy="16.5" r="2.6" />
      <circle cx="34" cy="25" r="2.6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 5.5 39 12v10.5C39 32.6 32.8 40 24 44 15.2 40 9 32.6 9 22.5V12l15-6.5Z" />
      <path d="m18 25 4 4 9-10" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6.5 27.2 17 38 20.2 27.2 23.4 24 34 20.8 23.4 10 20.2 20.8 17 24 6.5Z" />
      <path d="M36 30.5 37.3 35 42 36.3 37.3 37.7 36 42.5 34.7 37.7 30 36.3 34.7 35 36 30.5Z" />
      <path d="M11 31.5 12 35 15.5 36 12 37 11 40.5 10 37 6.5 36 10 35 11 31.5Z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.4 12 4l8 6.4" />
      <path d="M6.5 9.4V19h11V9.4" />
      <path d="M10 19v-4.4h4V19" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 5 7.5 12l7 7" />
      <path d="M8 12h9" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle className="icon-dot" cx="14" cy="24" r="2.8" />
      <circle className="icon-dot" cx="24" cy="24" r="2.8" />
      <circle className="icon-dot" cx="34" cy="24" r="2.8" />
    </svg>
  );
}

const SETTINGS_TABS: TabConfig[] = [
  {
    key: "stats",
    label: "main.tabs.stats",
    description: "main.tabs.stats.desc",
    icon: <ChartIcon />,
  },
  {
    key: "main",
    label: "main.tabs.basic",
    description: "main.tabs.basic.desc",
    icon: <GearIcon />,
  },
  {
    key: "ui",
    label: "main.tabs.ui",
    description: "main.tabs.ui.desc",
    icon: <PaletteIcon />,
  },
  {
    key: "security",
    label: "main.tabs.security",
    description: "main.tabs.security.desc",
    icon: <ShieldIcon />,
  },
  { key: "ai", label: "main.tabs.ai", description: "main.tabs.ai.desc", icon: <AiIcon /> },
  {
    key: "extra",
    label: "main.tabs.extra",
    description: "main.tabs.extra.desc",
    icon: <DotsIcon />,
  },
];

function SettingPanelRow({ title, lines, control }: SettingPanelRowProps) {
  return (
    <section className="settings-row">
      <div className="settings-row__text">
        <h2>{title}</h2>
        <p>{lines[0]}</p>
        <p>{lines[1]}</p>
      </div>
      <div className="settings-row__control">{control}</div>
    </section>
  );
}

function getAiProviderLabel(provider: AiSettings["provider"], t: TranslateFn) {
  if (provider === "custom") {
    return t("settings.ai.provider.custom");
  }

  return AI_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

function getAiModelLabel(
  provider: AiSettings["provider"],
  model: AiSettings["model"],
  dynamicModels: AiModelOption[] = [],
) {
  const modelOption = [...dynamicModels, ...getAiModelOptionsForProvider(provider)].find(
    (option) => option.value === model,
  );
  return modelOption?.label ?? model;
}

function mergeAiModelOptions(
  dynamicModels: AiModelOption[],
  fallbackModels: readonly AiModelOption[],
  currentModel: string,
) {
  const mergedModels: AiModelOption[] = [];
  const seenModelIds = new Set<string>();

  for (const model of [...dynamicModels, ...fallbackModels]) {
    if (!model.value.trim() || seenModelIds.has(model.value)) {
      continue;
    }

    seenModelIds.add(model.value);
    mergedModels.push(model);
  }

  if (currentModel.trim() && !seenModelIds.has(currentModel)) {
    mergedModels.unshift({
      value: currentModel,
      label: currentModel,
    });
  }

  return mergedModels;
}

const isDevBuild = import.meta.env.DEV || __REDUXSHARE_DEV_BUILD__;

function openExternalUrl(url: string) {
  if (typeof chrome !== "undefined" && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function MainScreen({
  settings,
  updateState,
  isCheckingUpdates,
  userProfile,
  isAuthenticated = true,
  popupState = null,
  onSettingsChange,
  onPopupStateChange,
  onCheckUpdates,
  onResetSettings,
  onLogout,
  onOpenLogin = () => {},
}: MainScreenProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>(popupState?.activeTab ?? "main");
  const [menuOpen, setMenuOpen] = useState(!popupState?.activeTab);
  const [isBindingHotkey, setIsBindingHotkey] = useState(false);
  const [aiAccessMode, setAiAccessMode] = useState<AiAccessMode>(
    popupState?.aiDraft ? "custom" : settings.ai.accessMode,
  );
  const officialAiAvailable = isOfficialAiAvailable();
  const effectiveAiAccessMode = officialAiAvailable ? aiAccessMode : "custom";
  const [aiDraft, setAiDraft] = useState<AiSettings>(() =>
    resolveInitialAiDraft(settings, popupState?.aiDraft ?? null, officialAiAvailable),
  );
  const [aiTestState, setAiTestState] = useState<AiTestState>({
    status: aiDraft.connectionVerified ? "saved" : "idle",
    message: null,
    verifiedAt: aiDraft.verifiedAt,
  });
  const [aiModelsState, setAiModelsState] = useState<AiModelsState>({
    provider: null,
    requestKey: null,
    status: "idle",
    models: [],
    message: null,
  });
  const [officialUsage, setOfficialUsage] = useState<OfficialAiUsageState | null>(null);
  const [officialUsageError, setOfficialUsageError] = useState<string | null>(null);
  const [modelsPopoverOpen, setModelsPopoverOpen] = useState(false);
  const [modelsPopoverStyle, setModelsPopoverStyle] = useState<CSSProperties | undefined>(
    undefined,
  );
  const [modelsPopoverTarget, setModelsPopoverTarget] = useState<HTMLElement | null>(null);
  const [modelsActiveIndex, setModelsActiveIndex] = useState(0);
  const modelsAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const modelsPopoverRef = useRef<HTMLDivElement | null>(null);
  const [dismissedUpdateToast, setDismissedUpdateToast] = useState<string | null>(null);

  const aiDraftRef = useRef(aiDraft);
  const aiTestRequestRef = useRef(0);
  const effectiveAiAccessModeRef = useRef(effectiveAiAccessMode);
  const aiModelsStateRef = useRef(aiModelsState);
  const appliedPopupStateRef = useRef<PopupState | null>(popupState ?? null);
  const reportedPopupStateRef = useRef<PopupState | null>(null);
  const latestPopupStateRef = useRef<PopupState>({ activeTab, aiDraft: toAiDraft(aiDraft) });

  useEffect(() => {
    refreshBroadPermissionCache().catch(() => {});
  }, []);

  const prevAiSettingsRef = useRef<AiSettings>(settings.ai);

  const hasAiConnectionTarget =
    aiDraft.provider === "custom"
      ? Boolean(aiDraft.customEndpoint?.trim() && aiDraft.customModelName?.trim())
      : Boolean(aiDraft.model.trim());

  const canSaveAiSettings =
    aiTestState.status === "success" && Boolean(aiDraft.apiKey.trim()) && hasAiConnectionTarget;

  useEffect(() => {
    prevAiSettingsRef.current = settings.ai;
  }, [settings.ai]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (
        canSaveAiSettings &&
        JSON.stringify(prevAiSettingsRef.current) !== JSON.stringify(aiDraft)
      ) {
        const nextAiSettings = normalizeAiSettings({
          ...aiDraft,
          accessMode: effectiveAiAccessMode,
          apiKey: aiDraft.apiKey.trim(),
          connectionVerified: true,
          verifiedAt: aiTestState.verifiedAt,
        });
        onSettingsChange({ ...settings, ai: nextAiSettings });
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [aiDraft, aiTestState, canSaveAiSettings, effectiveAiAccessMode, settings, onSettingsChange]);

  useEffect(() => {
    aiDraftRef.current = aiDraft;
  }, [aiDraft]);

  useEffect(() => {
    effectiveAiAccessModeRef.current = effectiveAiAccessMode;
  }, [effectiveAiAccessMode]);

  useEffect(() => {
    if (
      !popupState ||
      popupState === appliedPopupStateRef.current ||
      popupState === reportedPopupStateRef.current
    ) {
      return;
    }

    appliedPopupStateRef.current = popupState;
    setActiveTab(popupState.activeTab);
    setMenuOpen(false);

    if (!popupState.aiDraft) {
      return;
    }

    setAiAccessMode("custom");
    const restoredDraft = resolveInitialAiDraft(settings, popupState.aiDraft, officialAiAvailable);
    setAiDraft(restoredDraft);
    setAiTestState({
      status: restoredDraft.connectionVerified ? "saved" : "idle",
      message: null,
      verifiedAt: restoredDraft.verifiedAt,
    });
  }, [officialAiAvailable, popupState, settings]);

  useEffect(() => {
    const nextPopupState: PopupState = { activeTab, aiDraft: toAiDraft(aiDraft) };
    latestPopupStateRef.current = nextPopupState;

    const timeoutId = window.setTimeout(() => {
      reportedPopupStateRef.current = nextPopupState;
      onPopupStateChange?.(nextPopupState);
      void patchStoredState({ popupState: nextPopupState });
    }, POPUP_STATE_PERSIST_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, aiDraft, onPopupStateChange]);

  useEffect(() => {
    return () => {
      if (latestPopupStateRef.current !== reportedPopupStateRef.current) {
        void patchStoredState({ popupState: latestPopupStateRef.current });
      }
    };
  }, []);

  useEffect(() => {
    aiModelsStateRef.current = aiModelsState;
  }, [aiModelsState]);

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const changeAiAccessMode = (mode: AiAccessMode) => {
    setAiAccessMode(mode);
    setAiDraft((draft) => ({ ...draft, accessMode: mode }));
    setAiTestState({ status: "idle", message: null, verifiedAt: null });
    updateSetting("ai", normalizeAiSettings({ ...settings.ai, accessMode: mode }));
  };

  useEffect(() => {
    const normalizedAi = normalizeAiSettings(settings.ai);
    const draftDiffersFromSettings =
      JSON.stringify(toAiDraft(aiDraftRef.current)) !== JSON.stringify(toAiDraft(normalizedAi));

    if (draftDiffersFromSettings) {
      return;
    }

    const nextDraft = officialAiAvailable ? normalizedAi : forceCustomAccessMode(normalizedAi);

    setAiDraft(nextDraft);
    setAiTestState({
      status: nextDraft.connectionVerified ? "saved" : "idle",
      message: null,
      verifiedAt: nextDraft.verifiedAt,
    });
  }, [officialAiAvailable, settings.ai]);

  useEffect(() => {
    if (!isBindingHotkey) {
      return undefined;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setIsBindingHotkey(false);
        return;
      }

      const nextHotkey = formatHotkeyBindingFromKeyboardEvent(event);

      if (!nextHotkey) {
        return;
      }

      onSettingsChange({ ...settings, hotkey: nextHotkey.label, hotkeyCode: nextHotkey.code });
      setIsBindingHotkey(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isBindingHotkey, onSettingsChange, settings]);

  useEffect(() => {
    if (activeTab !== "security" && isBindingHotkey) {
      setIsBindingHotkey(false);
    }
  }, [activeTab, isBindingHotkey]);

  const hotkeyLines: [string, string] = isBindingHotkey
    ? [t("settings.hotkey.binding.line1"), t("settings.hotkey.binding.line2")]
    : [t("settings.hotkey.line1"), t("settings.hotkey.line2")];

  const isAiConnectionChecking = aiTestState.status === "checking";

  const aiModelsAutoRequestKey =
    activeTab === "ai" &&
    aiDraft.provider !== "custom" &&
    (aiDraft.provider === "openrouter" || Boolean(aiDraft.apiKey.trim()))
      ? `${aiDraft.provider}:${aiDraft.provider === "openrouter" ? "public" : aiDraft.apiKey.trim()}`
      : null;
  const canTestAiConnection =
    Boolean(aiDraft.apiKey.trim()) && hasAiConnectionTarget && !isAiConnectionChecking;
  const hasSavedAiKey = settings.ai.connectionVerified && Boolean(settings.ai.apiKey.trim());
  const aiSummaryState =
    effectiveAiAccessMode === "official" ? "official" : hasSavedAiKey ? "saved" : "missing";

  function updateAiDraft(patch: Partial<AiSettings>) {
    setAiDraft((draft) => ({
      ...draft,
      ...patch,
      apiKey: patch.apiKey ?? draft.apiKey,
      connectionVerified: false,
      verifiedAt: null,
    }));
    setAiTestState({ status: "idle", message: null, verifiedAt: null });
  }

  function updateAiProvider(provider: AiSettings["provider"]) {
    setAiModelsState({
      provider: null,
      requestKey: null,
      status: "idle",
      models: [],
      message: null,
    });
    updateAiDraft({
      provider,
      model: getDefaultAiModelForProvider(provider),
      customEndpoint: provider === "custom" ? aiDraft.customEndpoint : undefined,
      customModelName: provider === "custom" ? aiDraft.customModelName : undefined,
    });
  }

  const handleFetchAiModels = useEffectEvent(async (requestKey: string) => {
    if (aiDraft.provider === "custom") {
      return;
    }

    const requestProvider = aiDraft.provider;
    const requestDraft = { ...aiDraft, apiKey: aiDraft.apiKey.trim() };

    setAiModelsState({
      provider: requestProvider,
      requestKey,
      status: "loading",
      models: [],
      message: null,
    });

    try {
      const response = await requestAiModels(requestDraft);

      if (!response.ok || !response.models?.length) {
        setAiModelsState((current) =>
          current.requestKey === requestKey
            ? {
                provider: requestProvider,
                requestKey,
                status: "error",
                models: [],
                message: response.error ?? t("settings.ai.status.modelsError"),
              }
            : current,
        );
        return;
      }

      const models = response.models;

      setAiModelsState((current) =>
        current.requestKey === requestKey
          ? {
              provider: requestProvider,
              requestKey,
              status: "success",
              models,
              message: t("settings.ai.status.modelsLoaded", { count: String(models.length) }),
            }
          : current,
      );

      if (
        aiDraftRef.current.provider === requestProvider &&
        !models.some((model) => model.value === aiDraftRef.current.model)
      ) {
        updateAiDraft({ model: models[0].value });
      }
    } catch (error) {
      setAiModelsState((current) =>
        current.requestKey === requestKey
          ? {
              provider: requestProvider,
              requestKey,
              status: "error",
              models: [],
              message: error instanceof Error ? error.message : t("settings.ai.status.modelsError"),
            }
          : current,
      );
    }
  });

  useEffect(() => {
    if (!aiModelsAutoRequestKey || aiModelsState.requestKey === aiModelsAutoRequestKey) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void handleFetchAiModels(aiModelsAutoRequestKey);
    }, 200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [aiModelsAutoRequestKey, aiModelsState.requestKey]);

  const loadOfficialAiUsage = useCallback(async () => {
    const response = await requestOfficialAiUsage();

    if (response.ok && response.usage) {
      setOfficialUsage(response.usage);
      setOfficialUsageError(null);
    } else {
      setOfficialUsage(null);
      setOfficialUsageError(response.error ?? null);
    }
  }, []);

  useEffect(() => {
    if (
      officialAiAvailable &&
      isAuthenticated &&
      activeTab === "ai" &&
      aiAccessMode === "official"
    ) {
      void loadOfficialAiUsage();
    }
  }, [activeTab, aiAccessMode, isAuthenticated, officialAiAvailable, loadOfficialAiUsage]);

  const serverOfficialModels = officialUsage?.models ?? [];
  const selectedOfficialModels =
    settings.ai.officialModels ?? serverOfficialModels.map((model) => model.model);
  const selectedOfficialModelSet = useMemo(
    () => new Set(selectedOfficialModels),
    [selectedOfficialModels],
  );

  const changeOfficialModels = useCallback(
    (next: string[]) => {
      const uniqueNext = Array.from(new Set(next));

      onSettingsChange({
        ...settings,
        ai: normalizeAiSettings({
          ...settings.ai,
          officialModels: uniqueNext,
        }),
      });
    },
    [onSettingsChange, settings],
  );

  const closeModelsPopover = useCallback(() => {
    setModelsPopoverOpen(false);
    modelsAddButtonRef.current?.focus();
  }, []);

  const focusModelOption = useCallback((index: number) => {
    setModelsActiveIndex(index);
    window.requestAnimationFrame(() => {
      modelsPopoverRef.current
        ?.querySelectorAll<HTMLInputElement>("input[type='checkbox']")
        [index]?.focus();
    });
  }, []);

  const clampModelIndex = useCallback(
    (index: number) => {
      if (serverOfficialModels.length === 0) {
        return 0;
      }

      return Math.min(Math.max(index, 0), serverOfficialModels.length - 1);
    },
    [serverOfficialModels.length],
  );

  const updateModelsPopoverPosition = useCallback(() => {
    const anchorRect = modelsAddButtonRef.current?.getBoundingClientRect();

    if (!anchorRect) {
      return;
    }

    setModelsPopoverStyle(
      getAnchoredFloatingStyle(
        anchorRect,
        modelsPopoverRef.current?.getBoundingClientRect() ?? null,
        {
          align: "end",
          minWidth: 240,
        },
      ),
    );
  }, []);

  useEffect(() => {
    if (!modelsPopoverOpen) {
      return undefined;
    }

    updateModelsPopoverPosition();

    const handleResizeOrScroll = () => updateModelsPopoverPosition();

    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);

    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
    };
  }, [modelsPopoverOpen, updateModelsPopoverPosition]);

  const openModelsPopover = useCallback(() => {
    setModelsPopoverTarget(
      (modelsAddButtonRef.current?.closest(".popup-shell") as HTMLElement | null) ?? document.body,
    );
    setModelsPopoverStyle(undefined);
    setModelsPopoverOpen(true);
  }, []);

  const handleModelsPopoverKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const total = serverOfficialModels.length;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeModelsPopover();
        return;
      }

      if (total === 0) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusModelOption(clampModelIndex(modelsActiveIndex + 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        focusModelOption(clampModelIndex(modelsActiveIndex - 1));
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focusModelOption(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        focusModelOption(total - 1);
      }
    },
    [
      clampModelIndex,
      closeModelsPopover,
      focusModelOption,
      modelsActiveIndex,
      serverOfficialModels.length,
    ],
  );

  const toggleOfficialModel = useCallback(
    (modelId: string) => {
      if (selectedOfficialModelSet.has(modelId)) {
        changeOfficialModels(selectedOfficialModels.filter((value) => value !== modelId));
        return;
      }

      changeOfficialModels([...selectedOfficialModels, modelId]);
    },
    [changeOfficialModels, selectedOfficialModelSet, selectedOfficialModels],
  );

  async function handleTestOfficialAi() {
    await handleTestAiConnection();
    void loadOfficialAiUsage();
  }

  async function handleTestAiConnection() {
    const isOfficialFlow = effectiveAiAccessMode === "official";
    const requestedMode = effectiveAiAccessMode;
    const requestedDraft = JSON.stringify(toAiDraft(aiDraft));
    const requestId = ++aiTestRequestRef.current;
    const broadRequired =
      !isOfficialFlow &&
      (isCustomProviderFlow(aiDraft) || needsBroadHostPermission(aiDraft.customEndpoint));
    const activeServer = isOfficialFlow
      ? (settings.servers.find((server) => server.id === settings.activeServerId) ??
        settings.servers[0])
      : null;
    const originPermission = isOfficialFlow ? toOriginPermission(activeServer?.url) : null;
    const requiresBroadPermission = !isOfficialFlow && broadRequired;

    if (
      (isOfficialFlow &&
        originPermission &&
        !(await requestOriginHostPermission(originPermission))) ||
      (requiresBroadPermission && !(await requestBroadHostPermission()))
    ) {
      setAiTestState({
        status: "error",
        message: t("settings.ai.status.permissionDenied"),
        verifiedAt: null,
      });
      return;
    }

    setAiTestState({
      status: "checking",
      message: t("settings.ai.status.checking"),
      verifiedAt: null,
    });

    try {
      const verifiedAt = new Date().toISOString();
      const response = await requestAiConnectionTest({
        ...aiDraft,
        accessMode: effectiveAiAccessMode,
        apiKey: aiDraft.apiKey.trim(),
        connectionVerified: true,
        verifiedAt,
      });

      if (!response.ok) {
        if (isAiTestStale(requestId, requestedMode, requestedDraft)) {
          return;
        }

        setAiTestState({
          status: "error",
          message: response.error ?? t("settings.ai.status.error"),
          verifiedAt: null,
        });
        return;
      }

      if (isAiTestStale(requestId, requestedMode, requestedDraft)) {
        return;
      }

      setAiTestState({
        status: "success",
        message: t("settings.ai.status.success"),
        verifiedAt,
      });
    } catch (error) {
      if (isAiTestStale(requestId, requestedMode, requestedDraft)) {
        return;
      }

      setAiTestState({
        status: "error",
        message: error instanceof Error ? error.message : t("settings.ai.status.error"),
        verifiedAt: null,
      });
    }
  }

  function isAiTestStale(requestId: number, requestedMode: AiAccessMode, requestedDraft: string) {
    const stale =
      requestedMode !== effectiveAiAccessModeRef.current ||
      requestedDraft !== JSON.stringify(toAiDraft(aiDraftRef.current));

    if (stale && requestId === aiTestRequestRef.current) {
      setAiTestState({ status: "idle", message: null, verifiedAt: null });
    }

    return stale;
  }

  function handleSaveAiSettings() {
    if (!canSaveAiSettings || !aiTestState.verifiedAt) {
      return;
    }

    if (
      effectiveAiAccessMode === "custom" &&
      isCustomProviderFlow(aiDraft) &&
      !isBroadHostPermissionGrantedSync()
    ) {
      setAiTestState({
        status: "error",
        message: t("settings.ai.status.permissionDenied"),
        verifiedAt: null,
      });
      return;
    }

    const nextAiSettings = normalizeAiSettings({
      ...aiDraft,
      accessMode: effectiveAiAccessMode,
      apiKey: aiDraft.apiKey.trim(),
      connectionVerified: true,
      verifiedAt: aiTestState.verifiedAt,
    });

    onSettingsChange({ ...settings, ai: nextAiSettings });
    setAiTestState({
      status: "saved",
      message: t("settings.ai.status.saved"),
      verifiedAt: nextAiSettings.verifiedAt,
    });
  }

  function openSection(tab: SettingsTab) {
    setActiveTab(tab);
    setMenuOpen(false);
  }

  function renderActivePanel() {
    if (activeTab === "stats") {
      return (
        <div className="settings-panel__rows">
          <AuthGateOverlay requiresAuth={!isAuthenticated} onOpenLogin={onOpenLogin}>
            <StatsPanel userProfile={userProfile} isAuthenticated={isAuthenticated} />
          </AuthGateOverlay>
        </div>
      );
    }

    if (activeTab === "ui") {
      return (
        <div className="settings-panel__rows">
          <SettingPanelRow
            title={t("settings.theme.title")}
            lines={[t("settings.theme.line1"), t("settings.theme.line2")]}
            control={
              <ColorSchemeSelect
                value={settings.colorScheme}
                onChange={(colorScheme) => updateSetting("colorScheme", colorScheme)}
              />
            }
          />
          <SettingPanelRow
            title={t("settings.accent.title")}
            lines={[t("settings.accent.line1"), t("settings.accent.line2")]}
            control={
              <AccentColorPicker
                value={settings.accentColor}
                onChange={(accentColor) => updateSetting("accentColor", accentColor)}
              />
            }
          />
          <SettingPanelRow
            title={t("settings.language.title")}
            lines={[t("settings.language.line1"), t("settings.language.line2")]}
            control={
              <LanguageSelect
                value={settings.language}
                onChange={(language) => updateSetting("language", language)}
              />
            }
          />
        </div>
      );
    }

    if (activeTab === "security") {
      return (
        <div className="settings-panel__rows">
          <SettingPanelRow
            title={t("settings.copyUnlock.title")}
            lines={
              settings.copyUnlock
                ? [t("settings.copyUnlock.on.line1"), t("settings.copyUnlock.on.line2")]
                : [t("settings.copyUnlock.off.line1"), t("settings.copyUnlock.off.line2")]
            }
            control={
              <Switch
                checked={settings.copyUnlock}
                label={t("settings.copyUnlock.title")}
                onChange={(checked) => updateSetting("copyUnlock", checked)}
              />
            }
          />
          <SettingPanelRow
            title={t("settings.hotkey.title")}
            lines={hotkeyLines}
            control={
              <Button
                className={`hotkey-button ${isBindingHotkey ? "hotkey-button--binding" : ""}`}
                variant="outline"
                aria-label={t("settings.hotkey.title")}
                aria-pressed={isBindingHotkey}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setIsBindingHotkey(true)}
              >
                {isBindingHotkey ? "..." : settings.hotkey}
              </Button>
            }
          />
        </div>
      );
    }

    if (activeTab === "ai") {
      const isCustomProvider = aiDraft.provider === "custom";
      const dynamicAiModelOptions =
        aiModelsState.status === "success" && aiModelsState.provider === aiDraft.provider
          ? aiModelsState.models
          : [];
      const aiModelOptions = mergeAiModelOptions(
        dynamicAiModelOptions,
        getAiModelOptionsForProvider(aiDraft.provider),
        aiDraft.model,
      );

      return (
        <div className="settings-panel__rows">
          <section className="ai-settings-card">
            <div className="ai-settings-card__header">
              <h2>{t("settings.ai.title")}</h2>
              <p>{t("settings.ai.line1")}</p>
              <p>{t("settings.ai.line2")}</p>
              <div className="ai-settings-summary" aria-label={t("settings.ai.summary.title")}>
                <span
                  className={
                    aiSummaryState === "missing"
                      ? "ai-settings-summary__not-stated"
                      : "ai-settings-summary__ok"
                  }
                >
                  {aiSummaryState === "official"
                    ? t("settings.ai.summary.officialActive")
                    : aiSummaryState === "saved"
                      ? t("settings.ai.summary.keySaved")
                      : t("settings.ai.summary.keyMissing")}
                </span>
                {aiSummaryState === "saved" && (
                  <>
                    <span>
                      {t("settings.ai.provider")}:{" "}
                      <span className="ai-settings-summary__name">
                        {getAiProviderLabel(settings.ai.provider, t)}
                      </span>
                    </span>
                    <span>
                      {t("settings.ai.model")}:{" "}
                      <span className="ai-settings-summary__name">
                        {settings.ai.provider === "custom"
                          ? settings.ai.customModelName?.trim() ||
                            t("settings.ai.customModelPlaceholder")
                          : getAiModelLabel(
                              settings.ai.provider,
                              settings.ai.model,
                              dynamicAiModelOptions,
                            )}
                      </span>
                    </span>
                  </>
                )}
              </div>
              {officialAiAvailable && (
                <TabCardGroup label={t("settings.ai.mode.title")} columns={2}>
                  <TabCard
                    icon={<AiAccessModeIcon mode="official" />}
                    label={t("settings.ai.mode.official")}
                    active={aiAccessMode === "official"}
                    onClick={() => changeAiAccessMode("official")}
                  />
                  <TabCard
                    icon={<AiAccessModeIcon mode="custom" />}
                    label={t("settings.ai.mode.custom")}
                    active={aiAccessMode === "custom"}
                    onClick={() => changeAiAccessMode("custom")}
                  />
                </TabCardGroup>
              )}
              {officialAiAvailable && isAuthenticated && effectiveAiAccessMode === "official" && (
                <div className="ai-official__models">
                  <span className="ai-official__models-title">
                    {t("settings.ai.official.models.title")}
                  </span>
                  {serverOfficialModels.length > 0 ? (
                    <>
                      {selectedOfficialModels.length > 0 ? (
                        <ul className="ai-official__model-list">
                          {serverOfficialModels
                            .filter((model) => selectedOfficialModelSet.has(model.model))
                            .map((model) => (
                              <li key={model.model}>
                                <button
                                  type="button"
                                  className="ai-official__model-item"
                                  aria-label={t("settings.ai.official.models.remove", {
                                    model: model.label,
                                  })}
                                  title={t("settings.ai.official.models.remove", {
                                    model: model.label,
                                  })}
                                  onClick={() => toggleOfficialModel(model.model)}
                                >
                                  <span className="ai-official__model-icon" aria-hidden="true">
                                    <OfficialModelIcon model={model.model} label={model.label} />
                                  </span>
                                  <span className="ai-official__model-text">
                                    <span className="ai-official__model-name">{model.label}</span>
                                    <span className="ai-official__model-id">{model.model}</span>
                                  </span>
                                  <span className="ai-official__model-trash" aria-hidden="true">
                                    <TrashIcon />
                                  </span>
                                </button>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <div className="ai-official__models-empty">
                          <span>{t("settings.ai.official.models.emptySelection")}</span>
                          <span className="ai-official__models-hint">
                            {t("settings.ai.official.models.keepOne")}
                          </span>
                        </div>
                      )}
                      <button
                        ref={modelsAddButtonRef}
                        type="button"
                        className="ai-official__model-add"
                        aria-haspopup="dialog"
                        aria-expanded={modelsPopoverOpen}
                        aria-controls="reduxshare-official-models-popover"
                        aria-label={t("settings.ai.official.models.add")}
                        onClick={() => {
                          if (modelsPopoverOpen) {
                            closeModelsPopover();
                          } else {
                            openModelsPopover();
                          }
                        }}
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    </>
                  ) : (
                    <span className="ai-official__models-empty">
                      {officialUsageError ?? t("settings.ai.official.models.empty")}
                    </span>
                  )}
                </div>
              )}
            </div>
            {effectiveAiAccessMode === "custom" ? (
              <div className="ai-settings-form">
                <div className="ai-field">
                  <span>{t("settings.ai.provider")}</span>
                  <div
                    className="ai-provider-tabs"
                    role="radiogroup"
                    aria-label={t("settings.ai.provider")}
                  >
                    {AI_PROVIDER_OPTIONS.map((provider) => {
                      const active = aiDraft.provider === provider.value;

                      return (
                        <button
                          key={provider.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={getAiProviderLabel(provider.value, t)}
                          className={`ai-provider-tab${active ? " ai-provider-tab--active" : ""}`}
                          onClick={() => {
                            if (!active) {
                              updateAiProvider(provider.value);
                            }
                          }}
                        >
                          <span className="ai-provider-tab__icon" aria-hidden="true">
                            <AiProviderIcon provider={provider.value} />
                          </span>
                          <span className="ai-provider-tab__label">
                            {getAiProviderLabel(provider.value, t)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {isCustomProvider ? (
                  <>
                    <label className="ai-field">
                      <span>{t("settings.ai.customEndpoint")}</span>
                      <input
                        className="ai-input"
                        type="text"
                        value={aiDraft.customEndpoint ?? ""}
                        placeholder="https://api.example.com/v1/chat/completions"
                        autoComplete="off"
                        onChange={(event) => updateAiDraft({ customEndpoint: event.target.value })}
                      />
                    </label>
                    <label className="ai-field">
                      <span>{t("settings.ai.customModelName")}</span>
                      <input
                        className="ai-input"
                        type="text"
                        value={aiDraft.customModelName ?? ""}
                        placeholder={t("settings.ai.customModelPlaceholder")}
                        autoComplete="off"
                        onChange={(event) => updateAiDraft({ customModelName: event.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <div className="ai-field">
                    <span>{t("settings.ai.model")}</span>
                    <CustomSelect
                      value={aiDraft.model}
                      options={
                        aiModelOptions.length === 0
                          ? [{ value: "", label: t("settings.ai.modelEmpty"), disabled: true }]
                          : aiModelOptions.map((model) => ({
                              value: model.value,
                              label: model.label,
                            }))
                      }
                      onChange={(model) => updateAiDraft({ model })}
                      ariaLabel={t("settings.ai.model")}
                      listLabel={t("settings.ai.model")}
                    />
                  </div>
                )}
                <label className="ai-field ai-field--key">
                  <span>{t("settings.ai.apiKey")}</span>
                  <input
                    className="ai-input"
                    type="password"
                    value={aiDraft.apiKey}
                    placeholder={t("settings.ai.apiKeyPlaceholder")}
                    autoComplete="off"
                    onChange={(event) => updateAiDraft({ apiKey: event.target.value })}
                  />
                </label>
                <div className="ai-settings-actions">
                  <Button
                    className="secondary-wide-button"
                    variant="outline"
                    disabled={!canTestAiConnection}
                    onClick={handleTestAiConnection}
                  >
                    {isAiConnectionChecking
                      ? t("settings.ai.actions.checking")
                      : t("settings.ai.actions.test")}
                  </Button>
                  <Button
                    className="secondary-wide-button"
                    variant="outline"
                    disabled={!canSaveAiSettings}
                    onClick={handleSaveAiSettings}
                  >
                    {t("settings.ai.actions.save")}
                  </Button>
                </div>
                {aiTestState.message && (
                  <p className={`ai-status ai-status--${aiTestState.status}`}>
                    {aiTestState.message}
                  </p>
                )}
                {aiModelsState.provider === aiDraft.provider && aiModelsState.message && (
                  <p
                    className={`ai-status ai-status--${aiModelsState.status === "error" ? "error" : "success"}`}
                  >
                    {aiModelsState.message}
                  </p>
                )}
              </div>
            ) : (
              <AuthGateOverlay
                requiresAuth={!isAuthenticated}
                onOpenLogin={onOpenLogin}
                contentClassName="ai-settings-form ai-official"
              >
                <div className="ai-official__head">
                  <h3>{t("settings.ai.official.title")}</h3>
                </div>
                <p className="ai-official__desc">{t("settings.ai.official.line1")}</p>
                <p className="ai-official__desc">{t("settings.ai.official.modelLine")}</p>
                <div className="ai-official__plans">
                  <span className="ai-official__plans-title">
                    {t("settings.ai.official.plan.title")}
                  </span>
                  <div
                    className="ai-official__plan-cards"
                    role="list"
                    aria-label={t("settings.ai.official.plan.title")}
                  >
                    {AI_PLANS.map((plan) => {
                      const isActive = (officialUsage?.plan ?? "free") === plan;
                      const limits = AI_PLAN_LIMITS[plan];

                      return (
                        <div
                          key={plan}
                          role="listitem"
                          className={`ai-official__plan-card${isActive ? " ai-official__plan-card--active" : ""}`}
                        >
                          <span className="ai-official__plan-head">
                            <span className="ai-official__plan-name">
                              {t(AI_PLAN_LABEL_KEYS[plan])}
                            </span>
                            {isActive && (
                              <span className="ai-official__plan-current">
                                {t("settings.ai.official.plan.current")}
                              </span>
                            )}
                          </span>
                          <span className="ai-official__plan-limits">
                            {t("settings.ai.official.plan.limits", {
                              minute: limits.minuteLimit,
                              day: limits.dayLimit,
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="ai-official__quota">
                  <span className="ai-official__quota-label">
                    {t("settings.ai.official.quotaTitle")}
                  </span>
                  <span className="ai-official__quota-value">
                    {officialUsage
                      ? t("settings.ai.official.quotaValue", {
                          used: officialUsage.dayUsed,
                          limit: officialUsage.dayLimit,
                        })
                      : "—"}
                  </span>
                  <div className="ai-official__bar">
                    <div
                      className="ai-official__bar-fill"
                      style={{
                        width: `${officialUsage ? Math.min(100, Math.round((officialUsage.dayUsed / Math.max(1, officialUsage.dayLimit)) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="ai-official__quota-hint">
                    {officialUsageError ??
                      t("settings.ai.official.quotaHint", {
                        minute: officialUsage?.minuteLimit ?? 5,
                      })}
                  </span>
                </div>
                <div className="ai-settings-actions">
                  <Button
                    className="secondary-wide-button"
                    variant="outline"
                    disabled={aiTestState.status === "checking"}
                    onClick={() => void handleTestOfficialAi()}
                  >
                    {t("settings.ai.actions.test")}
                  </Button>
                </div>
                {aiTestState.message && (
                  <p className={`ai-status ai-status--${aiTestState.status}`}>
                    {aiTestState.message}
                  </p>
                )}
              </AuthGateOverlay>
            )}
            {modelsPopoverOpen &&
              modelsPopoverTarget &&
              createPortal(
                <div
                  className="ai-official__models-backdrop"
                  aria-hidden="true"
                  onClick={closeModelsPopover}
                >
                  <div
                    ref={modelsPopoverRef}
                    id="reduxshare-official-models-popover"
                    role="dialog"
                    aria-modal="false"
                    aria-label={t("settings.ai.official.models.popoverTitle")}
                    className="ai-official__models-popover"
                    style={modelsPopoverStyle}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={handleModelsPopoverKeyDown}
                  >
                    <span className="ai-official__models-popover-title">
                      {t("settings.ai.official.models.popoverTitle")}
                    </span>
                    <ul className="ai-official__models-options">
                      {serverOfficialModels.map((model, index) => {
                        const checked = selectedOfficialModelSet.has(model.model);

                        return (
                          <li key={model.model}>
                            <label
                              className={`ai-official__model-option${checked ? " ai-official__model-option--checked" : ""}${index === modelsActiveIndex ? " ai-official__model-option--active" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onFocus={() => setModelsActiveIndex(index)}
                                onChange={() => toggleOfficialModel(model.model)}
                              />
                              <span className="ai-official__model-icon" aria-hidden="true">
                                <OfficialModelIcon model={model.model} label={model.label} />
                              </span>
                              <span className="ai-official__model-text">
                                <span className="ai-official__model-name">{model.label}</span>
                                <span className="ai-official__model-id">{model.model}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="ai-official__models-actions">
                      <button
                        type="button"
                        className="ai-official__model-action ai-official__model-action--select-all"
                        aria-label={t("settings.ai.official.models.selectAll")}
                        onClick={() => {
                          const allModelIds = serverOfficialModels.map((m) => m.model);
                          changeOfficialModels(allModelIds);
                        }}
                      >
                        {t("settings.ai.official.models.selectAll")}
                      </button>
                      <button
                        type="button"
                        className="ai-official__model-action ai-official__model-action--select-none"
                        aria-label={t("settings.ai.official.models.selectNone")}
                        onClick={() => changeOfficialModels([])}
                      >
                        {t("settings.ai.official.models.selectNone")}
                      </button>
                    </div>
                  </div>
                </div>,
                modelsPopoverTarget,
              )}
          </section>
        </div>
      );
    }

    if (activeTab === "extra") {
      return (
        <div className="settings-panel__rows">
          {officialAiAvailable && (
            <SettingPanelRow
              title={t("settings.server.title")}
              lines={[t("settings.server.line1"), t("settings.server.line2")]}
              control={
                <ServerPicker
                  settings={settings}
                  onSettingsChange={onSettingsChange}
                  onLogout={onLogout}
                />
              }
            />
          )}
          <div className="settings-panel__actions">
            <div className="settings-panel__action-row">
              <Button
                className="secondary-wide-button"
                variant="outline"
                disabled={isUpdateCheckInProgress}
                onClick={() => {
                  if (updateState.releaseUrl) {
                    openExternalUrl(updateState.releaseUrl);
                    return;
                  }

                  onCheckUpdates();
                }}
              >
                {isUpdateCheckInProgress
                  ? t("updates.action.checking")
                  : updateState.releaseUrl
                    ? t("updates.action.openRelease")
                    : t("updates.action.check")}
              </Button>
              <Button
                className="secondary-wide-button"
                variant="outline"
                onClick={isAuthenticated ? onLogout : onOpenLogin}
              >
                {isAuthenticated ? t("settings.actions.logout") : t("auth.gate.action")}
              </Button>
            </div>
            <div className="settings-panel__action-row">
              <Button className="secondary-wide-button" variant="outline" onClick={onResetSettings}>
                {t("settings.actions.reset")}
              </Button>
              <a href="https://github.com/krchvl/ReduxShare" target="_blank">
                <button
                  className="social-button"
                  type="button"
                  aria-label={t("settings.social.github")}
                >
                  <img src={githubIcon} alt="" />
                </button>
              </a>
              <a href="https://t.me/a1b2c3d4e5f6g7h8i9j10k11l12m17" target="_blank">
                <button
                  className="social-button"
                  type="button"
                  aria-label={t("settings.social.telegram")}
                >
                  <img src={telegramIcon} alt="" />
                </button>
              </a>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="settings-panel__rows">
        <SettingPanelRow
          title={t("settings.extension.title")}
          lines={
            settings.extensionEnabled
              ? [t("settings.extension.on.line1"), t("settings.extension.on.line2")]
              : [t("settings.extension.off.line1"), t("settings.extension.off.line2")]
          }
          control={
            <Switch
              checked={settings.extensionEnabled}
              label={t("settings.extension.title")}
              onChange={(checked) => updateSetting("extensionEnabled", checked)}
            />
          }
        />
        <SettingPanelRow
          title={t("settings.autoselect.title")}
          lines={
            settings.autoSelect
              ? [t("settings.autoselect.on.line1"), t("settings.autoselect.on.line2")]
              : [t("settings.autoselect.off.line1"), t("settings.autoselect.off.line2")]
          }
          control={
            <Switch
              checked={settings.autoSelect}
              label={t("settings.autoselect.title")}
              onChange={(checked) => updateSetting("autoSelect", checked)}
            />
          }
        />
        {settings.autoSelect && (
          <SettingPanelRow
            title={t("settings.autoselectAvg.title")}
            lines={[t("settings.autoselectAvg.line"), ""]}
            control={
              <div className="autoselect-timing">
                <div
                  className="autoselect-timing__chips"
                  role="group"
                  aria-label={t("settings.autoselectAvg.title")}
                >
                  {(Object.keys(AUTO_SELECT_TEMPO_PRESETS) as AutoSelectTempoPreset[]).map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`autoselect-timing__chip ${
                          settings.autoSelectAvgSeconds === AUTO_SELECT_TEMPO_PRESETS[preset]
                            ? "autoselect-timing__chip--active"
                            : ""
                        }`}
                        onClick={() =>
                          updateSetting("autoSelectAvgSeconds", AUTO_SELECT_TEMPO_PRESETS[preset])
                        }
                      >
                        {t(`settings.autoselectTempo.${preset}`)}
                      </button>
                    ),
                  )}
                </div>
                <div className="autoselect-timing__slider">
                  <div className="autoselect-timing__field">
                    <input
                      className="opacity-slider"
                      type="range"
                      min={AUTO_SELECT_SLIDER_POSITION_MIN}
                      max={AUTO_SELECT_SLIDER_POSITION_MAX}
                      step={1}
                      value={autoSelectTempoSecondsToPosition(settings.autoSelectAvgSeconds)}
                      aria-label={t("settings.autoselectAvg.title")}
                      style={
                        {
                          "--slider-fill": `${
                            ((autoSelectTempoSecondsToPosition(settings.autoSelectAvgSeconds) -
                              AUTO_SELECT_SLIDER_POSITION_MIN) *
                              100) /
                            (AUTO_SELECT_SLIDER_POSITION_MAX - AUTO_SELECT_SLIDER_POSITION_MIN)
                          }%`,
                        } as CSSProperties
                      }
                      onChange={(event) =>
                        updateSetting(
                          "autoSelectAvgSeconds",
                          autoSelectTempoPositionToSeconds(Number(event.target.value)),
                        )
                      }
                    />
                    <div className="autoselect-timing__scale" aria-hidden="true">
                      {(
                        [
                          ["brisk", "10px"],
                          ["balanced", "calc(10px + (100% - 16px) * 0.5)"],
                          ["realistic", "calc(100% - 6px)"],
                        ] as const
                      ).map(([preset, position]) => (
                        <span
                          key={preset}
                          className="autoselect-timing__tick"
                          style={{ left: position }}
                        >
                          {t(`settings.autoselectTempo.${preset}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="opacity-value">{`${settings.autoSelectAvgSeconds} ${t("settings.autoselectAvg.unit")}`}</span>
                </div>
              </div>
            }
          />
        )}
        {settings.autoSelect && (
          <SettingPanelRow
            title={t("settings.human.title")}
            lines={[t("settings.human.line1"), t("settings.human.line2")]}
            control={
              <TabCardGroup label={t("settings.human.title")} columns={2}>
                {(
                  [
                    ["humanTyping", "settings.humanTyping"],
                    ["humanPrecursors", "settings.humanPrecursors"],
                  ] as const
                ).map(([settingKey, keyPrefix]) => (
                  <TabCard
                    key={settingKey}
                    icon={<HumanizationIcon option={settingKey} />}
                    label={t(`${keyPrefix}.title`)}
                    role="switch"
                    active={settings[settingKey]}
                    onClick={() => updateSetting(settingKey, !settings[settingKey])}
                  />
                ))}
              </TabCardGroup>
            }
          />
        )}
        <SettingPanelRow
          title={t("settings.attemptStatusPanel.title")}
          lines={
            settings.attemptStatusPanelClosed
              ? [
                  t("settings.attemptStatusPanel.off.line1"),
                  t("settings.attemptStatusPanel.off.line2"),
                ]
              : [
                  t("settings.attemptStatusPanel.on.line1"),
                  t("settings.attemptStatusPanel.on.line2"),
                ]
          }
          control={
            <Switch
              checked={!settings.attemptStatusPanelClosed}
              label={t("settings.attemptStatusPanel.title")}
              onChange={(visible) => updateSetting("attemptStatusPanelClosed", !visible)}
            />
          }
        />
      </div>
    );
  }

  const activeTabConfig = SETTINGS_TABS.find((tab) => tab.key === activeTab) ?? SETTINGS_TABS[1]!;
  const isUpdateCheckInProgress = isCheckingUpdates || updateState.status === "checking";
  const previewUpdateState: UpdateState =
    isDevBuild && !isUpdateCheckInProgress && updateState.status !== "available"
      ? {
          ...updateState,
          status: "available",
          latestVersion: "9.9.9-dev",
          releaseUrl: null,
        }
      : updateState;
  const updateToastStatus = isUpdateCheckInProgress ? "checking" : previewUpdateState.status;
  const updateToastSignature = `${updateToastStatus}:${previewUpdateState.checkedAt ?? ""}:${
    previewUpdateState.latestVersion ?? ""
  }`;
  const updateToastReleaseUrl =
    updateToastStatus === "available" ? previewUpdateState.releaseUrl : null;
  const showUpdateToast =
    updateToastStatus !== "idle" && dismissedUpdateToast !== updateToastSignature;

  const dismissUpdateToast = (dismissedFor: string) => {
    setDismissedUpdateToast(dismissedFor);

    if (
      updateToastStatus === "available" &&
      previewUpdateState.checkedAt !== null &&
      typeof chrome !== "undefined" &&
      chrome.storage?.local
    ) {
      void chrome.storage.local.set({
        [UPDATE_NOTICE_DISMISSED_CHECK_STORAGE_KEY]: previewUpdateState.checkedAt,
      });
    }
  };

  return (
    <div className="main-content" data-view={menuOpen ? "menu" : "panel"}>
      {showUpdateToast && (
        <div className={`update-pill update-pill--${updateToastStatus}`} role="status">
          <span className="update-pill__text">
            {updateToastStatus === "checking" && t("updates.toast.checking")}
            {updateToastStatus === "available" &&
              t("updates.toast.body", { version: previewUpdateState.latestVersion ?? "" })}
            {updateToastStatus === "error" &&
              (previewUpdateState.error ?? t("updates.error.fallback"))}
            {updateToastStatus === "up-to-date" &&
              t("updates.toast.uptodate", { version: previewUpdateState.currentVersion })}
          </span>
          {updateToastReleaseUrl && (
            <button
              type="button"
              className="update-pill__action"
              onClick={() => openExternalUrl(updateToastReleaseUrl)}
            >
              {t("updates.toast.open")}
            </button>
          )}
          {updateToastStatus === "error" && (
            <button type="button" className="update-pill__action" onClick={onCheckUpdates}>
              {t("updates.action.check")}
            </button>
          )}
          <button
            type="button"
            className="update-pill__close"
            aria-label={t("updates.toast.dismiss")}
            onClick={() => dismissUpdateToast(updateToastSignature)}
          >
            ✕
          </button>
        </div>
      )}
      <nav
        className="settings-tabs"
        data-view={menuOpen ? "menu" : "panel"}
        data-active-tab={activeTab}
        aria-label={t("main.tabs.aria")}
      >
        {!menuOpen && (
          <button
            type="button"
            className="settings-tabs__home"
            aria-label={t("main.menu.home")}
            title={t("main.menu.home")}
            onClick={() => setMenuOpen(true)}
          >
            <HomeIcon />
          </button>
        )}
        {SETTINGS_TABS.map((tab, index) => {
          const isActive = activeTab === tab.key;
          const label = t(tab.label);

          return (
            <button
              key={tab.key}
              className={`settings-tab ${isActive ? "settings-tab--active" : ""}`}
              type="button"
              aria-pressed={isActive}
              aria-current={isActive ? "true" : undefined}
              title={menuOpen ? undefined : label}
              style={{ "--index": index } as CSSProperties}
              onClick={() => openSection(tab.key)}
            >
              <span className="settings-tab__icon">{tab.icon}</span>
              <span className="settings-tab__text">
                <span className="settings-tab__label">{label}</span>
                <span className="settings-tab__desc">{t(tab.description)}</span>
              </span>
              <span className="settings-tab__chevron" aria-hidden="true">
                <ArrowLeftIcon />
              </span>
            </button>
          );
        })}
      </nav>
      {!menuOpen && (
        <section className="settings-panel" aria-label={t("main.panel.aria")}>
          <div className="settings-panel__head">
            <div className="settings-panel__heading">
              <span className="settings-panel__icon">{activeTabConfig.icon}</span>
              <h1>{t(activeTabConfig.label)}</h1>
            </div>
          </div>
          <div key={activeTab} className="settings-panel__view">
            {renderActivePanel()}
          </div>
        </section>
      )}
    </div>
  );
}
