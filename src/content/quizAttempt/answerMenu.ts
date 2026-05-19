import { DEFAULT_ACCENT_COLOR, type AiAnswerState, type AnswerData, type SourceAnswerData, type StoredStateLike, type SubmissionItem, type SuggestionItem } from "./model";
import { getContentTranslator, type TranslateFn } from "./contentI18n";

let currentT: TranslateFn = getContentTranslator(undefined);

export function setAnswerMenuTranslator(t: TranslateFn) {
  currentT = t;
}

function hasMenuAnswerData(answerData: AnswerData) {
  return (
    answerData.anchors.length > 0 ||
    answerData.suggestions.length > 0 ||
    answerData.submissions.length > 0 ||
    answerData.slots.some((slot) => slot.anchors.length > 0 || slot.suggestions.length > 0 || slot.submissions.length > 0)
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function correctnessColor(correctness: number): string {
  if (correctness === 2) return "#4ade80";
  if (correctness <= 0) return "#f87171";
  return "#ffffff";
}

function getFlyoutActionAttributes(item: { label: string; actionSlotIndex?: number | null }) {
  const attributes = [`data-answer-label="${escapeHtml(item.label)}"`];

  if (item.actionSlotIndex !== undefined && item.actionSlotIndex !== null) {
    attributes.push(`data-answer-slot-index="${escapeHtml(String(item.actionSlotIndex))}"`);
  }

  return attributes.join(" ");
}

function renderSuggestionFlyout(suggestions: SuggestionItem[]): string {
  const verifiedSuggestions = suggestions.filter((suggestion) => suggestion.correctness === 2);

  if (verifiedSuggestions.length === 0) {
    return renderEmptyFlyout();
  }

  return verifiedSuggestions
    .map(
      (s) => `
      <div class="flyout-option flyout-row" ${getFlyoutActionAttributes(s)}>
        <span class="flyout-label">${escapeHtml(s.displayLabel ?? s.label)}</span>
        <span class="flyout-pct" style="color:${correctnessColor(s.correctness)}">${Math.round(s.confidence * 100)}%</span>
      </div>`
    )
    .join("");
}

function renderSubmissionFlyout(submissions: SubmissionItem[]): string {
  if (submissions.length === 0) {
    return renderEmptyFlyout();
  }
  return submissions
    .map((s) => {
      return `
      <div class="flyout-option flyout-row" ${getFlyoutActionAttributes(s)}>
        <span class="flyout-label">${escapeHtml(s.displayLabel ?? s.label)}</span>
        <span class="flyout-pct" style="color:${correctnessColor(s.correctness)}">${s.count}</span>
      </div>`;
    })
    .join("");
}

function getStatsSubmissionItems(sourceData: AnswerData): SubmissionItem[] {
  if (sourceData.submissions.length > 0) {
    return sourceData.submissions;
  }

  return sourceData.suggestions
    .filter((suggestion) => suggestion.correctness === 2 && suggestion.label.trim())
    .map((suggestion): SubmissionItem => ({
      correctness: suggestion.correctness,
      count: suggestion.count ?? 1,
      label: suggestion.label,
      displayLabel: suggestion.displayLabel,
      actionSlotIndex: suggestion.actionSlotIndex
    }));
}

function getExactAnswerIconMarkup() {
  return `<svg viewBox="0 0 48 48"><path d="M7 24.5 18.3 35.8 41 13.2" /></svg>`;
}

function getStatsAnswerIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M18.5 21.6a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
      <path d="M32.5 21.6a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
      <path d="M25.5 32.2a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />
      <path d="M7 42v-7.2c0-5 4.1-9.1 9.1-9.1h.7" />
      <path d="M44 42v-7.2c0-5-4.1-9.1-9.1-9.1h-.7" />
      <path d="M16.5 44v-5.3c0-5 4.1-9.1 9.1-9.1s9.1 4.1 9.1 9.1V44" />
    </svg>
  `;
}

function getSourceTabIconMarkup(kind: "internal" | "external" | "ai") {
  if (kind === "internal") {
    return `
      <svg viewBox="0 0 48 48">
        <path d="M10 14c0-4.4 6.3-8 14-8s14 3.6 14 8-6.3 8-14 8-14-3.6-14-8Z" />
        <path d="M10 14v10c0 4.4 6.3 8 14 8s14-3.6 14-8V14" />
        <path d="M10 24v10c0 4.4 6.3 8 14 8s14-3.6 14-8V24" />
      </svg>
    `;
  }

  if (kind === "external") {
    return `
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="18" />
        <path d="M6 24h36" />
        <path d="M24 6c5 5.2 7.5 11.2 7.5 18S29 36.8 24 42" />
        <path d="M24 6c-5 5.2-7.5 11.2-7.5 18S19 36.8 24 42" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 48 48">
      <path d="M24 7 27 17.5 38 21 27 24.5 24 35 21 24.5 10 21 21 17.5 24 7Z" />
      <path d="M36 31 37.2 35 41 36.2 37.2 37.4 36 41 34.8 37.4 31 36.2 34.8 35 36 31Z" />
    </svg>
  `;
}

function getAiRequestIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M8 24h25" />
      <path d="m25 14 10 10-10 10" />
      <path d="M38 9 41 18 32 15 38 9Z" />
      <path d="M11 34 13 40 7 38 11 34Z" />
    </svg>
  `;
}

function getAiAnswerIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M10 12h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H22l-9 7v-7h-3a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4Z" />
      <path d="M17 22h14M17 28h9" />
    </svg>
  `;
}

function renderEmptyFlyout(message = currentT("quiz.menu.empty")) {
  return `<div class="flyout-option flyout-empty">${escapeHtml(message)}</div>`;
}

export function isAiSettingsSaved(settings: StoredStateLike["settings"] | undefined) {
  const ai = settings?.ai;

  if (!ai || !ai.connectionVerified || !ai.apiKey?.trim()) {
    return false;
  }

  if (ai.provider === "custom") {
    return Boolean(ai.customEndpoint?.trim() && ai.customModelName?.trim());
  }

  return Boolean(ai.model?.trim());
}

export function createIdleAiAnswerState(): AiAnswerState {
  return {
    status: "idle",
    answer: null,
    confidence: null,
    actions: [],
    error: null
  };
}

export function renderAiAnswerFlyout(state: AiAnswerState) {
  if (state.status === "loading") {
    return renderEmptyFlyout(currentT("quiz.menu.aiLoading"));
  }

  if (state.status === "error") {
    return `<div class="flyout-option flyout-text flyout-text--error">${escapeHtml(state.error ?? currentT("quiz.menu.empty"))}</div>`;
  }

  if (state.status === "success" && state.answer) {
    const confidence = Math.max(0, Math.min(100, Math.round(state.confidence ?? 0)));

    return `
      <div class="flyout-option flyout-row ai-answer-option" tabindex="0" data-ai-answer-action="apply">
        <span class="flyout-label">${escapeHtml(state.answer)}</span>
        <span class="flyout-pct" style="color:${getAiConfidenceColor(confidence)}">${confidence}%</span>
      </div>
    `;
  }

  return renderEmptyFlyout();
}

function getAiConfidenceColor(confidence: number) {
  if (confidence > 85) {
    return "#4ade80";
  }

  if (confidence >= 60) {
    return "#60a5fa";
  }

  if (confidence >= 25) {
    return "#facc15";
  }

  return "#f87171";
}

function renderAnswerMenuItem(label: string, iconMarkup: string, flyoutMarkup: string, menuKey: string) {
  return `
    <div class="menu-item" role="menuitem" tabindex="0" data-answer-menu="${escapeHtml(menuKey)}">
      <span class="icon" aria-hidden="true">${iconMarkup}</span>
      <span class="label">${escapeHtml(label)}</span>
      <span class="chevron" aria-hidden="true">
        <svg viewBox="0 0 24 34"><path d="M7 6 17 17 7 28" /></svg>
      </span>
      <div class="flyout" aria-hidden="true">${flyoutMarkup}</div>
    </div>
  `;
}

function renderAiRequestButton(isLoading: boolean) {
  return `
    <button class="menu-ai-button" type="button" data-ai-action="send" ${isLoading ? "disabled" : ""}>
      <span class="icon" aria-hidden="true">${getAiRequestIconMarkup()}</span>
      <span class="label">${escapeHtml(currentT("quiz.menu.sendAiRequest"))}</span>
    </button>
  `;
}

type AnswerMenuTabKey = "internal" | "external" | "ai";

function getVisibleAnswerMenuTabs(answerData: SourceAnswerData, aiToolsEnabled: boolean): AnswerMenuTabKey[] {
  const tabs: AnswerMenuTabKey[] = [];

  if (hasMenuAnswerData(answerData.reduxshare)) {
    tabs.push("internal");
  }

  if (hasMenuAnswerData(answerData.external)) {
    tabs.push("external");
  }

  if (aiToolsEnabled) {
    tabs.push("ai");
  }

  return tabs.length > 0 ? tabs : ["internal"];
}

function getAnswerMenuTabLabel(tabKey: AnswerMenuTabKey) {
  if (tabKey === "internal") {
    return currentT("quiz.menu.internalSources");
  }

  if (tabKey === "external") {
    return currentT("quiz.menu.externalSources");
  }

  return currentT("quiz.menu.aiTools");
}

function renderSourceMenuPanel(panelKey: "internal" | "external", sourceKey: keyof SourceAnswerData, sourceData: AnswerData, isActive: boolean) {
  const exactSuggestions = sourceData.suggestions.filter((suggestion) => suggestion.correctness === 2);
  const sourcePrefix = sourceKey === "reduxshare" ? "reduxshare" : "external";

  return `
    <div class="menu-panel" data-menu-panel="${panelKey}" data-active="${isActive ? "true" : "false"}">
      ${renderAnswerMenuItem(
        currentT("quiz.menu.exactAnswer"),
        getExactAnswerIconMarkup(),
        renderSuggestionFlyout(exactSuggestions),
        `${sourcePrefix}-exact`
      )}
      ${renderAnswerMenuItem(
        currentT("quiz.menu.statistics"),
        getStatsAnswerIconMarkup(),
        renderSubmissionFlyout(getStatsSubmissionItems(sourceData)),
        `${sourcePrefix}-stats`
      )}
    </div>
  `;
}

function renderAiMenuPanel(aiSettingsSaved: boolean, aiAnswerState: AiAnswerState, isActive: boolean) {
  if (!aiSettingsSaved) {
    return `
      <div class="menu-panel" data-menu-panel="ai" data-active="${isActive ? "true" : "false"}">
        <div class="ai-settings-missing">${escapeHtml(currentT("quiz.menu.aiSettingsMissing"))}</div>
      </div>
    `;
  }

  return `
    <div class="menu-panel" data-menu-panel="ai" data-active="${isActive ? "true" : "false"}">
      ${renderAiRequestButton(aiAnswerState.status === "loading")}
      ${renderAnswerMenuItem(
        currentT("quiz.menu.aiAnswer"),
        getAiAnswerIconMarkup(),
        renderAiAnswerFlyout(aiAnswerState),
        "ai-answer"
      )}
    </div>
  `;
}

function renderAnswerMenuTabs(answerData: SourceAnswerData, aiToolsEnabled: boolean) {
  const tabs = getVisibleAnswerMenuTabs(answerData, aiToolsEnabled);
  const activeTab = tabs[0] ?? "internal";

  return `
    <div
      class="menu-tabs"
      role="tablist"
      aria-label="ReduxShare"
      data-active-tab="${activeTab}"
      style="--menu-tab-count: ${tabs.length}; --active-tab-index: 0;"
    >
      ${tabs
        .map((tabKey) => {
          const isActive = tabKey === activeTab;

          return `
            <button class="menu-tab" type="button" role="tab" aria-selected="${isActive}" data-menu-tab="${tabKey}" data-active="${isActive}">
              <span class="menu-tab__icon" aria-hidden="true">${getSourceTabIconMarkup(tabKey)}</span>
              <span class="menu-tab__label">${escapeHtml(getAnswerMenuTabLabel(tabKey))}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAnswerMenuPanels(
  answerData: SourceAnswerData,
  aiSettingsSaved: boolean,
  aiAnswerState: AiAnswerState,
  aiToolsEnabled: boolean
) {
  const tabs = getVisibleAnswerMenuTabs(answerData, aiToolsEnabled);
  const activeTab = tabs[0] ?? "internal";

  return `
    ${tabs.includes("internal") ? renderSourceMenuPanel("internal", "reduxshare", answerData.reduxshare, activeTab === "internal") : ""}
    ${tabs.includes("external") ? renderSourceMenuPanel("external", "external", answerData.external, activeTab === "external") : ""}
    ${tabs.includes("ai") ? renderAiMenuPanel(aiSettingsSaved, aiAnswerState, activeTab === "ai") : ""}
  `;
}

export function getAnswerTriggerMarkup() {
  return `
    <style>
      :host {
        all: initial;
        --reduxshare-accent: ${DEFAULT_ACCENT_COLOR};
        display: block;
        position: relative;
        width: max-content;
        max-width: 100%;
        margin-top: 10px;
        font-family: Inter, Arial, sans-serif;
        z-index: auto;
      }

      :host([data-reduxshare-inline-widget="true"]) {
        display: inline-flex;
        width: auto;
        margin: 0 0 0 8px;
        vertical-align: middle;
      }

      * {
        box-sizing: border-box;
      }

      .widget {
        position: relative;
        display: inline-flex;
        align-items: flex-start;
      }

      .trigger {
        all: unset;
        display: inline-flex;
        min-width: 20px;
        height: 22px;
        align-items: center;
        justify-content: center;
        color: var(--reduxshare-accent);
        cursor: pointer;
        font-family: Inter, Arial, sans-serif;
        font-size: 18px;
        font-weight: 800;
        line-height: 22px;
        -webkit-text-stroke: 0.8px #000000;
        paint-order: stroke fill;
        text-shadow:
          -1px 0 #000000,
          0 1px #000000,
          1px 0 #000000,
          0 -1px #000000;
        transition:
          filter 160ms ease,
          transform 160ms ease;
        user-select: none;
      }

      .trigger:hover,
      .trigger:focus-visible {
        filter: brightness(1.2);
        outline: 0;
        transform: translateY(-1px);
      }
    </style>

    <div class="widget">
      <button class="trigger" type="button" aria-label="ReduxShare" aria-haspopup="menu" aria-expanded="false">R</button>
    </div>
  `;
}

export function getAnswerMenuMarkup(
  answerData: SourceAnswerData,
  aiSettingsSaved: boolean,
  aiAnswerState: AiAnswerState,
  aiToolsEnabled = true
) {
  return `
    <style>
      :host {
        all: initial;
        --reduxshare-accent: ${DEFAULT_ACCENT_COLOR};
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        overflow: visible;
        pointer-events: none;
        z-index: auto;
        font-family: Inter, Arial, sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      .menu {
        position: relative;
        width: 316px;
        max-width: calc(100vw - 24px);
        min-height: 100%;
        border: 1px solid rgba(32, 32, 32, 0.78);
        border-radius: 6px;
        background: #000000;
        box-shadow:
          0 12px 28px rgba(0, 0, 0, 0.22),
          0 2px 8px rgba(0, 0, 0, 0.14);
        opacity: 0;
        overflow: visible;
        pointer-events: auto;
        transform: translateY(-4px) scale(0.985);
        transform-origin: top left;
        transition:
          opacity 160ms ease,
          transform 160ms ease,
          visibility 160ms ease;
        visibility: hidden;
      }

      :host([data-open="true"]) .menu {
        opacity: 1;
        transform: translateY(0) scale(1);
        visibility: visible;
      }

      .menu-tabs {
        position: relative;
        display: grid;
        grid-template-columns: repeat(var(--menu-tab-count, 3), minmax(0, 1fr));
        min-height: 58px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }

      .menu-tabs::after {
        position: absolute;
        bottom: 0;
        left: 0;
        width: calc(100% / var(--menu-tab-count, 3));
        height: 2px;
        background: var(--reduxshare-accent);
        content: "";
        transform: translateX(calc(var(--active-tab-index, 0) * 100%));
        transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
        will-change: transform;
      }

      .menu-tab {
        all: unset;
        position: relative;
        display: grid;
        min-width: 0;
        grid-template-rows: 20px minmax(16px, auto);
        align-content: center;
        justify-items: center;
        gap: 4px;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        padding: 7px 6px 9px;
        color: rgba(255, 255, 255, 0.62);
        cursor: pointer;
        font-family: Inter, Arial, sans-serif;
        font-size: 10.5px;
        font-weight: 620;
        line-height: 1.06;
        letter-spacing: 0;
        text-align: center;
        transition:
          background 180ms ease,
          color 180ms ease;
      }

      .menu-tab:last-child {
        border-right: 0;
      }

      .menu-tab:not([data-active="true"]):hover,
      .menu-tab:not([data-active="true"]):focus-visible {
        background: rgba(255, 255, 255, 0.045);
        color: #ffffff;
        outline: 0;
      }

      .menu-tab[data-active="true"] {
        color: var(--reduxshare-accent);
        background: rgba(255, 255, 255, 0.03);
      }

      .menu-tab__icon {
        display: grid;
        width: 20px;
        height: 20px;
        place-items: center;
      }

      .menu-tab__icon svg {
        display: block;
        width: 20px;
        height: 20px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 3.2;
      }

      .menu-tab__label {
        display: -webkit-box;
        max-width: 100%;
        overflow: hidden;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .menu-panel {
        display: none;
        padding: 4px 0;
        animation: menu-panel-enter 180ms ease;
      }

      .menu-panel[data-active="true"] {
        display: block;
      }

      @keyframes menu-panel-enter {
        from {
          opacity: 0;
          transform: translateY(4px);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .menu-item {
        position: relative;
        display: grid;
        min-height: 38px;
        grid-template-columns: 25px minmax(0, 1fr) 14px;
        align-items: center;
        gap: 8px;
        padding: 7px 10px 7px 9px;
        background: #000000;
        color: #ffffff;
        cursor: pointer;
        overflow: visible;
        transition:
          background-color 180ms ease,
          box-shadow 180ms ease;
      }

      .menu-panel .menu-item:first-child {
        border-radius: 4px 4px 0 0;
      }

      .menu-panel .menu-item:last-child {
        border-radius: 0 0 4px 4px;
      }

      .menu-item::before {
        position: absolute;
        inset: 0;
        z-index: 0;
        background: #ffffff;
        content: "";
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease;
      }

      .menu-item + .menu-item {
        border-top: 1px solid rgba(32, 32, 32, 0.72);
      }

      .menu-ai-button {
        all: unset;
        box-sizing: border-box;
        position: relative;
        display: grid;
        width: 100%;
        grid-template-columns: 25px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        padding: 7px 10px 7px 9px;
        background: #000000;
        color: #ffffff;
        cursor: pointer;
        overflow: hidden;
        transition:
          background-color 180ms ease,
          box-shadow 180ms ease;
      }

      .menu-ai-button:disabled {
        cursor: default;
        opacity: 0.72;
      }

      .menu-ai-button:hover,
      .menu-ai-button:focus-visible {
        background: #181818;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        outline: 0;
      }

      .menu-ai-button:hover::before,
      .menu-ai-button:focus-visible::before {
        opacity: 0.08;
      }

      .menu-ai-button + .menu-item {
        border-top: 1px solid rgba(32, 32, 32, 0.72);
      }

      .menu-item:hover,
      .menu-item:focus-visible {
        background: #050505;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.045);
        outline: 0;
      }

      .menu-item:hover::before,
      .menu-item:focus-visible::before {
        opacity: 0.08;
      }

      .icon {
        display: grid;
        width: 23px;
        height: 23px;
        place-items: center;
        color: var(--reduxshare-accent);
      }

      .icon svg {
        display: block;
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 5.4;
      }

      .label {
        overflow: hidden;
        color: #ffffff;
        font-family: Inter, Arial, sans-serif;
        font-size: 14px;
        font-weight: 540;
        letter-spacing: 0;
        line-height: 1.12;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chevron {
        display: grid;
        width: 14px;
        height: 18px;
        place-items: center;
        color: var(--reduxshare-accent);
        transform-origin: 50% 50%;
        transition: transform 200ms ease;
      }

      .menu-ai-button > .icon,
      .menu-ai-button > .label,
      .menu-item > .icon,
      .menu-item > .label,
      .menu-item > .chevron {
        position: relative;
        z-index: 1;
      }

      .chevron svg {
        display: block;
        width: 14px;
        height: 18px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 5;
      }

      .flyout {
        position: absolute;
        top: -1px;
        left: calc(100% - 4px);
        width: 190px;
        min-height: calc(100% + 2px);
        border: 1px solid rgba(32, 32, 32, 0.78);
        border-radius: 5px;
        background: #000000;
        box-shadow:
          0 12px 28px rgba(0, 0, 0, 0.22),
          0 2px 8px rgba(0, 0, 0, 0.14);
        cursor: default;
        opacity: 0;
        padding: 6px;
        pointer-events: auto;
        transform: translateX(-6px);
        transition:
          opacity 180ms ease,
          transform 180ms ease,
          visibility 180ms ease;
        visibility: hidden;
      }

      .flyout-text {
        padding: 5px 7px;
        color: #ffffff;
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        font-weight: 400;
        line-height: 1.3;
        border-radius: 3px;
        word-break: break-word;
      }

      .flyout-text--answer {
        max-height: 210px;
        overflow: auto;
        white-space: pre-wrap;
      }

      .flyout-text--error {
        color: #f87171;
      }

      .flyout-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 5px 7px;
        border-radius: 3px;
      }

      .flyout-label {
        flex: 1;
        overflow: hidden;
        color: #ffffff;
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        font-weight: 400;
        line-height: 1.3;
        word-break: break-word;
      }

      .flyout-pct {
        flex-shrink: 0;
        font-family: Inter, Arial, sans-serif;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
      }

      .ai-answer-option {
        align-items: flex-start;
        cursor: pointer;
      }

      .ai-answer-option .flyout-label {
        max-height: 210px;
        overflow: auto;
        white-space: pre-wrap;
      }

      .flyout-option + .flyout-option {
        margin-top: 3px;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
      }

      .flyout-option {
        position: relative;
        overflow: hidden;
        transition:
          background-color 180ms ease,
          box-shadow 180ms ease,
          transform 160ms ease;
      }

      .flyout-option::before {
        position: absolute;
        inset: 0;
        z-index: 0;
        background: #ffffff;
        content: "";
        opacity: 0;
        pointer-events: none;
        transition: opacity 180ms ease;
      }

      .flyout-option:hover,
      .flyout-option:focus-visible {
        background: #050505;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.045);
        outline: 0;
        transform: translateY(-1px);
      }

      .flyout-option:hover::before,
      .flyout-option:focus-visible::before {
        opacity: 0.08;
      }

      .flyout-option > * {
        position: relative;
        z-index: 1;
      }

      .flyout-empty {
        padding: 5px 7px;
        color: rgba(255, 255, 255, 0.35);
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        pointer-events: none;
      }

      .flyout-empty::before {
        display: none;
      }

      .menu-empty {
        padding: 8px 10px;
        color: rgba(255, 255, 255, 0.42);
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.25;
        white-space: nowrap;
      }

      .ai-settings-missing {
        padding: 14px 12px;
        color: rgba(255, 255, 255, 0.58);
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        font-weight: 420;
        line-height: 1.25;
        text-align: center;
      }

      .menu-item[data-active="true"] .flyout {
        opacity: 1;
        transform: translateX(0);
        visibility: visible;
      }

      .menu-item[data-active="true"] .chevron {
        transform: rotate(180deg);
      }

      @media (max-width: 640px) {
        .menu {
          width: min(286px, calc(100vw - 24px));
        }

        .label {
          font-size: 13px;
        }

        .flyout {
          width: 170px;
        }
      }
    </style>

    <div class="menu" role="dialog" aria-label="ReduxShare">
      ${renderAnswerMenuTabs(answerData, aiToolsEnabled)}
      ${renderAnswerMenuPanels(answerData, aiSettingsSaved, aiAnswerState, aiToolsEnabled)}
    </div>
  `;
}
