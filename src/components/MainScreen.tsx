import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { TranslateFn, TranslationKey } from "../i18n";
import { useI18n } from "../i18n/react";
import {
  AI_PROVIDER_OPTIONS,
  getAiModelOptionsForProvider,
  getDefaultAiModelForProvider,
  normalizeAiSettings,
  type AiModelOption,
  type AiSettings,
  type Settings,
  type UpdateState
} from "../types";
import { AccentColorPicker } from "./AccentColorPicker";
import { Button } from "./Button";
import { LanguageSelect } from "./LanguageSelect";
import { Switch } from "./Switch";
import { requestAiConnectionTest, requestAiModels } from "../lib/ai";
import { formatHotkeyBindingFromKeyboardEvent } from "../lib/hotkeys";
import githubIcon from "../assets/github.svg";
import telegramIcon from "../assets/telegram.svg";

interface MainScreenProps {
  settings: Settings;
  updateState: UpdateState;
  isCheckingUpdates: boolean;
  onSettingsChange: (settings: Settings) => void;
  onCheckUpdates: () => void;
  onResetSettings: () => void;
  onLogout: () => void;
}

type SettingsTab = "main" | "ui" | "security" | "ai" | "extra";

interface TabConfig {
  key: SettingsTab;
  label: TranslationKey;
  icon: ReactNode;
}

interface SettingPanelRowProps {
  title: string;
  lines: [string, string];
  control: ReactNode;
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
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M20.7 5.8h6.6l1.4 5.6c1.2.4 2.3.8 3.3 1.4l5-3 4.7 4.7-3 5c.6 1.1 1.1 2.2 1.4 3.4l5.6 1.3v6.6l-5.6 1.4a18 18 0 0 1-1.4 3.3l3 5-4.7 4.7-5-3c-1 .6-2.1 1.1-3.3 1.4l-1.4 5.6h-6.6l-1.4-5.6a18 18 0 0 1-3.3-1.4l-5 3-4.7-4.7 3-5a18 18 0 0 1-1.4-3.3l-5.6-1.4v-6.6l5.6-1.3c.4-1.2.8-2.3 1.4-3.4l-3-5L11 9.8l5 3c1.1-.6 2.2-1 3.3-1.4l1.4-5.6Z" />
      <circle cx="24" cy="27" r="7" />
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
  { key: "main", label: "main.tabs.basic", icon: <GearIcon /> },
  { key: "ui", label: "main.tabs.ui", icon: <PaletteIcon /> },
  { key: "security", label: "main.tabs.security", icon: <ShieldIcon /> },
  { key: "ai", label: "main.tabs.ai", icon: <AiIcon /> },
  { key: "extra", label: "main.tabs.extra", icon: <DotsIcon /> }
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

function formatUpdateDate(value: string | null, locale: string, t: TranslateFn) {
  if (!value) {
    return t("updates.date.never");
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getUpdateLines(updateState: UpdateState, locale: string, t: TranslateFn): [string, string] {
  if (updateState.status === "checking") {
    return [t("updates.checking.line1"), t("updates.checking.line2")];
  }

  if (updateState.status === "available") {
    return [
      t("updates.available.line1", { version: updateState.latestVersion ?? updateState.currentVersion }),
      t("updates.available.line2", {
        currentVersion: updateState.currentVersion,
        date: formatUpdateDate(updateState.checkedAt, locale, t)
      })
    ];
  }

  if (updateState.status === "error") {
    return [
      updateState.error ?? t("updates.error.fallback"),
      t("updates.error.line2", { date: formatUpdateDate(updateState.nextCheckAt, locale, t) })
    ];
  }

  if (updateState.status === "up-to-date") {
    return [
      t("updates.uptodate.line1", { version: updateState.currentVersion }),
      t("updates.uptodate.line2", { date: formatUpdateDate(updateState.checkedAt, locale, t) })
    ];
  }

  return [t("updates.idle.line1"), t("updates.idle.line2")];
}

function getAiProviderLabel(provider: AiSettings["provider"], t: TranslateFn) {
  if (provider === "custom") {
    return t("settings.ai.provider.custom");
  }

  return AI_PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider;
}

function getAiModelLabel(provider: AiSettings["provider"], model: AiSettings["model"], dynamicModels: AiModelOption[] = []) {
  const modelOption = [...dynamicModels, ...getAiModelOptionsForProvider(provider)].find((option) => option.value === model);
  return modelOption?.label ?? model;
}

function mergeAiModelOptions(dynamicModels: AiModelOption[], fallbackModels: readonly AiModelOption[], currentModel: string) {
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
      label: currentModel
    });
  }

  return mergedModels;
}

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
  onSettingsChange,
  onCheckUpdates,
  onResetSettings,
  onLogout
}: MainScreenProps) {
  const { resolvedLanguage, t } = useI18n();
  const [activeTab, setActiveTab] = useState<SettingsTab>("main");
  const [isBindingHotkey, setIsBindingHotkey] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiSettings>(() => normalizeAiSettings(settings.ai));
  const [aiTestState, setAiTestState] = useState<AiTestState>({
    status: settings.ai.connectionVerified ? "saved" : "idle",
    message: null,
    verifiedAt: settings.ai.verifiedAt
  });
  const [aiModelsState, setAiModelsState] = useState<AiModelsState>({
    provider: null,
    requestKey: null,
    status: "idle",
    models: [],
    message: null
  });

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  useEffect(() => {
    setAiDraft(normalizeAiSettings(settings.ai));
    setAiTestState({
      status: settings.ai.connectionVerified ? "saved" : "idle",
      message: null,
      verifiedAt: settings.ai.verifiedAt
    });
  }, [settings.ai]);

  useEffect(() => {
    if (!isBindingHotkey) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
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
  const hasAiConnectionTarget = aiDraft.provider === "custom"
    ? Boolean(aiDraft.customEndpoint?.trim() && aiDraft.customModelName?.trim())
    : Boolean(aiDraft.model.trim());
  const isAiModelsLoading = aiModelsState.status === "loading";
  const aiModelsAutoRequestKey = activeTab === "ai" &&
    aiDraft.provider !== "custom" &&
    (
      aiDraft.provider === "openrouter" ||
      (Boolean(aiDraft.apiKey.trim()) && (aiTestState.status === "success" || aiTestState.status === "saved"))
    )
    ? `${aiDraft.provider}:${aiDraft.provider === "openrouter" ? "public" : aiDraft.apiKey.trim()}`
    : null;
  const canTestAiConnection = Boolean(aiDraft.apiKey.trim()) && hasAiConnectionTarget && !isAiConnectionChecking;
  const canSaveAiSettings = aiTestState.status === "success" && Boolean(aiDraft.apiKey.trim()) && hasAiConnectionTarget;
  const hasSavedAiKey = settings.ai.connectionVerified && Boolean(settings.ai.apiKey.trim());

  function updateAiDraft(patch: Partial<AiSettings>) {
    setAiDraft((draft) => ({
      ...draft,
      ...patch,
      apiKey: patch.apiKey ?? draft.apiKey,
      connectionVerified: false,
      verifiedAt: null
    }));
    setAiTestState({ status: "idle", message: null, verifiedAt: null });
  }

  function updateAiProvider(provider: AiSettings["provider"]) {
    setAiModelsState({
      provider: null,
      requestKey: null,
      status: "idle",
      models: [],
      message: null
    });
    updateAiDraft({
      provider,
      model: getDefaultAiModelForProvider(provider),
      customEndpoint: provider === "custom" ? aiDraft.customEndpoint : undefined,
      customModelName: provider === "custom" ? aiDraft.customModelName : undefined
    });
  }

  async function handleFetchAiModels(requestKey: string) {
    if (aiDraft.provider === "custom") {
      return;
    }

    setAiModelsState({
      provider: aiDraft.provider,
      requestKey,
      status: "loading",
      models: [],
      message: null
    });

    try {
      const response = await requestAiModels({
        ...aiDraft,
        apiKey: aiDraft.apiKey.trim()
      });

      if (!response.ok || !response.models?.length) {
        setAiModelsState({
          provider: aiDraft.provider,
          requestKey,
          status: "error",
          models: [],
          message: response.error ?? t("settings.ai.status.modelsError")
        });
        return;
      }

      setAiModelsState({
        provider: aiDraft.provider,
        requestKey,
        status: "success",
        models: response.models,
        message: t("settings.ai.status.modelsLoaded", { count: String(response.models.length) })
      });

      if (!response.models.some((model) => model.value === aiDraft.model)) {
        updateAiDraft({ model: response.models[0].value });
      }
    } catch (error) {
      setAiModelsState({
        provider: aiDraft.provider,
        requestKey,
        status: "error",
        models: [],
        message: error instanceof Error ? error.message : t("settings.ai.status.modelsError")
      });
    }
  }

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

  async function handleTestAiConnection() {
    setAiTestState({ status: "checking", message: t("settings.ai.status.checking"), verifiedAt: null });

    try {
      const verifiedAt = new Date().toISOString();
      const response = await requestAiConnectionTest({
        ...aiDraft,
        apiKey: aiDraft.apiKey.trim(),
        connectionVerified: true,
        verifiedAt
      });

      if (!response.ok) {
        setAiTestState({
          status: "error",
          message: response.error ?? t("settings.ai.status.error"),
          verifiedAt: null
        });
        return;
      }

      setAiTestState({
        status: "success",
        message: t("settings.ai.status.success"),
        verifiedAt
      });
    } catch (error) {
      setAiTestState({
        status: "error",
        message: error instanceof Error ? error.message : t("settings.ai.status.error"),
        verifiedAt: null
      });
    }
  }

  function handleSaveAiSettings() {
    if (!canSaveAiSettings || !aiTestState.verifiedAt) {
      return;
    }

    const nextAiSettings = normalizeAiSettings({
      ...aiDraft,
      apiKey: aiDraft.apiKey.trim(),
      connectionVerified: true,
      verifiedAt: aiTestState.verifiedAt
    });

    onSettingsChange({ ...settings, ai: nextAiSettings });
    setAiTestState({
      status: "saved",
      message: t("settings.ai.status.saved"),
      verifiedAt: nextAiSettings.verifiedAt
    });
  }

  function renderActivePanel() {
    if (activeTab === "ui") {
      return (
        <div className="settings-panel__rows">
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
            title={t("settings.stealth.title")}
            lines={
              settings.stealthMode
                ? [t("settings.stealth.on.line1"), t("settings.stealth.on.line2")]
                : [t("settings.stealth.off.line1"), t("settings.stealth.off.line2")]
            }
            control={
              <Switch
                checked={settings.stealthMode}
                label={t("settings.stealth.title")}
                onChange={(checked) => updateSetting("stealthMode", checked)}
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
      const dynamicAiModelOptions = aiModelsState.status === "success" && aiModelsState.provider === aiDraft.provider
        ? aiModelsState.models
        : [];
      const aiModelOptions = mergeAiModelOptions(
        dynamicAiModelOptions,
        getAiModelOptionsForProvider(aiDraft.provider),
        aiDraft.model
      );

      return (
        <div className="settings-panel__rows">
          <section className="ai-settings-card">
            <div className="ai-settings-card__header">
              <h2>{t("settings.ai.title")}</h2>
              <p>{t("settings.ai.line1")}</p>
              <p>{t("settings.ai.line2")}</p>
              <div className="ai-settings-summary" aria-label={t("settings.ai.summary.title")}>
                <span className={hasSavedAiKey ? "ai-settings-summary__ok" : "ai-settings-summary__not-stated"}>
                  {hasSavedAiKey ? t("settings.ai.summary.keySaved") : t("settings.ai.summary.keyMissing")}
                </span>
                {hasSavedAiKey && (
                  <>
                    <span>
                      {t("settings.ai.provider")}:{" "}
                      <span className="ai-settings-summary__name">{getAiProviderLabel(settings.ai.provider, t)}</span>
                    </span>
                    <span>
                      {t("settings.ai.model")}:{" "}
                      <span className="ai-settings-summary__name">
                        {settings.ai.provider === "custom"
                          ? settings.ai.customModelName?.trim() || t("settings.ai.customModelPlaceholder")
                          : getAiModelLabel(settings.ai.provider, settings.ai.model, dynamicAiModelOptions)}
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="ai-settings-form">
              <label className="ai-field">
                <span>{t("settings.ai.provider")}</span>
                <select
                  className="ai-select"
                  value={aiDraft.provider}
                  onChange={(event) => updateAiProvider(event.target.value as AiSettings["provider"])}
                >
                  {AI_PROVIDER_OPTIONS.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {getAiProviderLabel(provider.value, t)}
                    </option>
                  ))}
                </select>
              </label>
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
                <label className="ai-field">
                  <span>{t("settings.ai.model")}</span>
                  <select
                    className="ai-select"
                    value={aiDraft.model}
                    onChange={(event) => updateAiDraft({ model: event.target.value })}
                  >
                    {aiModelOptions.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                  {isAiConnectionChecking ? t("settings.ai.actions.checking") : t("settings.ai.actions.test")}
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
                <p className={`ai-status ai-status--${aiTestState.status}`}>{aiTestState.message}</p>
              )}
              {aiModelsState.provider === aiDraft.provider && aiModelsState.message && (
                <p className={`ai-status ai-status--${aiModelsState.status === "error" ? "error" : "success"}`}>
                  {aiModelsState.message}
                </p>
              )}
            </div>
          </section>
        </div>
      );
    }

    if (activeTab === "extra") {
      const releaseUrl = updateState.status === "available" ? updateState.releaseUrl : null;
      const isUpdateCheckInProgress = isCheckingUpdates || updateState.status === "checking";

      return (
        <div className="settings-panel__rows">
          <SettingPanelRow
            title={t("updates.title")}
            lines={getUpdateLines(updateState, resolvedLanguage, t)}
            control={
              <Button
                className="secondary-wide-button"
                variant="outline"
                disabled={isUpdateCheckInProgress}
                onClick={() => {
                  if (releaseUrl) {
                    openExternalUrl(releaseUrl);
                    return;
                  }

                  onCheckUpdates();
                }}
              >
                {isUpdateCheckInProgress
                  ? t("updates.action.checking")
                  : releaseUrl
                    ? t("updates.action.openRelease")
                    : t("updates.action.check")}
              </Button>
            }
          />
          <div className="settings-panel__account-actions">
            <Button className="secondary-wide-button" variant="outline" onClick={onResetSettings}>
              {t("settings.actions.reset")}
            </Button>
            <Button className="secondary-wide-button" variant="outline" onClick={onLogout}>
              {t("settings.actions.logout")}
            </Button>
            <a href="https://github.com/krchvl/ReduxShare" target="_blank">
            <button className="social-button" type="button" aria-label={t("settings.social.github")}>
              <img src={githubIcon} alt="" />
            </button>
            </a>
            <a href="https://t.me/a1b2c3d4e5f6g7h8i9j10k11l12m17" target="_blank">
              <button className="social-button" type="button" aria-label={t("settings.social.telegram")}>
                <img src={telegramIcon} alt="" />
              </button>
            </a>
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
      </div>
    );
  }

  return (
    <div className="main-content">
      <nav className="settings-tabs" data-active-tab={activeTab} aria-label={t("main.tabs.aria")}>
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`settings-tab ${activeTab === tab.key ? "settings-tab--active" : ""}`}
            type="button"
            aria-pressed={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="settings-tab__icon">{tab.icon}</span>
            <span>{t(tab.label)}</span>
          </button>
        ))}
      </nav>
      <section className="settings-panel" aria-label={t("main.panel.aria")}>
        <div key={activeTab} className="settings-panel__view">
          {renderActivePanel()}
        </div>
      </section>
    </div>
  );
}
