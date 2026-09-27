import { hasAnswerData, getPreferredSuggestionLabels } from "../data/answerData";
import { currentStoredState, currentT } from "../state";
import { canUseQuizFeatures } from "../logic/settings";
import { EXTERNAL_TYPE_PROBE_ORDER } from "../lib/externalProvider";
import { QUIZ_ID_SCAN_DEFAULT_FROM, QUIZ_ID_SCAN_DEFAULT_TO } from "../lib/quizIdScan";
import { applyContentColorSchemeToHost, getAccentColor, getRgbCssValue } from "../logic/theme";
import { getQuestionTypeLabel } from "../shared/questionTypes";
import { getCheckIconMarkup, getQuestionTypeScanIconMarkup, getSourceTabIconMarkup } from "./icons";
import type { AnswerData, QuizPreviewQuestion, StoredStateLike } from "../model";

const QUIZ_PREVIEW_ROOT_ID = "reduxshare-quiz-preview-modal";

type QuizPreviewTabKey = "internal" | "external";

type QuizPreviewPanelState = {
  visible: boolean;
  loading: boolean;
  error: string | null;
  authRequired: boolean;
  questions: QuizPreviewQuestion[];
  quizTitle: string | null;
  activeTab: QuizPreviewTabKey;
};

const panelState: QuizPreviewPanelState = {
  visible: false,
  loading: false,
  error: null,
  authRequired: false,
  questions: [],
  quizTitle: null,
  activeTab: "internal",
};

const FONT_STACK = `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

const REFRESH_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M40 24a16 16 0 1 1-4.7-11.3" /><path d="M40 6v10H30" /></svg>`;

const CLOSE_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m10 10 28 28" /><path d="m38 10-28 28" /></svg>`;

const ANSWER_CHECK_ICON = getCheckIconMarkup();

const WARNING_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6 44 40H4L24 6Z" /><path d="M24 19v10" /><path d="M24 34.5v.5" /></svg>`;

const LOCK_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="21" width="28" height="20" rx="4" /><path d="M16 21v-5a8 8 0 0 1 16 0v5" /><path d="M24 29v5" /></svg>`;

const SEARCH_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="21" cy="21" r="13" /><path d="m31 31 11 11" /></svg>`;

const PREVIEW_STYLES = `
  :host {
    all: initial;
  }

  .rpx-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: grid;
    place-items: center;
    padding: 28px 16px;
    background: rgba(7, 9, 14, 0.62);
    backdrop-filter: blur(7px);
    -webkit-backdrop-filter: blur(7px);
    font-family: ${FONT_STACK};
    --reduxshare-accent-soft: color-mix(in srgb, var(--reduxshare-accent) 68%, #ffffff);
    animation: rpx-overlay-enter 200ms ease;
  }

  @keyframes rpx-overlay-enter {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes rpx-dialog-enter {
    from { opacity: 0; transform: translateY(14px) scale(0.975); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes rpx-spin {
    to { transform: rotate(360deg); }
  }

  .rpx-dialog {
    box-sizing: border-box;
    width: min(680px, 100%);
    max-height: min(720px, calc(100vh - 56px));
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(var(--reduxshare-accent-rgb), 0.26);
    border-radius: 16px;
    background:
      radial-gradient(circle at top right, rgba(var(--reduxshare-accent-rgb), 0.17), transparent 55%),
      linear-gradient(180deg, rgba(20, 21, 29, 0.98), rgba(15, 16, 22, 0.96));
    color: #f6f7fb;
    box-shadow:
      0 28px 72px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(var(--reduxshare-accent-rgb), 0.06) inset;
    overflow: hidden;
    outline: none;
    animation: rpx-dialog-enter 240ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .rpx-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    flex: none;
  }

  .rpx-brand {
    width: 38px;
    height: 38px;
    border-radius: 11px;
    object-fit: cover;
    flex: none;
    box-shadow:
      0 8px 24px rgba(var(--reduxshare-accent-rgb), 0.24),
      0 0 0 1px rgba(255, 255, 255, 0.08) inset;
  }

  .rpx-heading {
    display: grid;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .rpx-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--reduxshare-accent-soft);
    overflow-wrap: anywhere;
  }

  .rpx-subtitle {
    font-size: 12px;
    font-weight: 500;
    color: rgba(246, 247, 251, 0.55);
  }

  .rpx-header-actions {
    display: inline-flex;
    gap: 8px;
    flex: none;
  }

  .rpx-icon-btn {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid rgba(var(--reduxshare-accent-rgb), 0.2);
    border-radius: 10px;
    background: rgba(var(--reduxshare-accent-rgb), 0.09);
    color: #f6f7fb;
    cursor: pointer;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      color 140ms ease,
      transform 120ms ease,
      box-shadow 160ms ease,
      opacity 140ms ease;
  }

  .rpx-icon-btn svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 3.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .rpx-icon-btn:hover {
    background: rgba(var(--reduxshare-accent-rgb), 0.17);
  }

  .rpx-icon-btn:active {
    transform: scale(0.96);
  }

  .rpx-icon-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .reduxshare-preview-close:hover {
    background: rgba(217, 72, 79, 0.18);
    border-color: rgba(217, 72, 79, 0.5);
    color: #ff9aa0;
    box-shadow: 0 8px 20px rgba(217, 72, 79, 0.18);
  }

  .rpx-body {
    padding: 14px 18px 18px;
    overflow-y: auto;
    flex: 1;
    min-height: 120px;
  }

  .rpx-body::-webkit-scrollbar {
    width: 10px;
  }

  .rpx-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    border: 3px solid transparent;
    background-clip: content-box;
  }

  .rpx-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .rpx-tabs {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    margin-bottom: 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .rpx-tabs-indicator {
    position: absolute;
    bottom: -1px;
    left: 0;
    width: 50%;
    height: 2px;
    border-radius: 999px;
    background: var(--reduxshare-accent);
    box-shadow: 0 0 12px rgba(var(--reduxshare-accent-rgb), 0.5);
    transform: translateX(calc(var(--rpx-active-tab-index, 0) * 100%));
    transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  }

  .reduxshare-preview-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 38px;
    padding: 6px 10px 10px;
    border: none;
    background: transparent;
    color: rgba(246, 247, 251, 0.55);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 620;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: color 160ms ease;
  }

  .reduxshare-preview-tab svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 3.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }

  .reduxshare-preview-tab:hover:not(.active) {
    color: rgba(246, 247, 251, 0.82);
  }

  .reduxshare-preview-tab.active {
    color: var(--reduxshare-accent-soft);
  }

  .rpx-tab-count {
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }

  .reduxshare-preview-tab.active .rpx-tab-count {
    background: rgba(var(--reduxshare-accent-rgb), 0.18);
    color: var(--reduxshare-accent-soft);
  }

  .reduxshare-preview-tab[data-empty="true"] .rpx-tab-count {
    opacity: 0.55;
  }

  .reduxshare-preview-list {
    display: grid;
    gap: 12px;
  }

  .reduxshare-preview-question {
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.035);
    overflow: hidden;
  }

  .rpx-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    background: rgba(255, 255, 255, 0.03);
  }

  .rpx-card-title {
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: rgba(246, 247, 251, 0.85);
  }

  .rpx-type-badge {
    padding: 2px 9px;
    border: 1px solid rgba(var(--reduxshare-accent-rgb), 0.3);
    border-radius: 999px;
    background: rgba(var(--reduxshare-accent-rgb), 0.1);
    color: var(--reduxshare-accent-soft);
    font-size: 10.5px;
    font-weight: 650;
    white-space: nowrap;
    flex: none;
  }

  .rpx-card-body {
    padding: 12px 14px 13px;
  }

  .reduxshare-preview-condition {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin-bottom: 10px;
    font-size: 13.5px;
    line-height: 1.45;
    color: rgba(246, 247, 251, 0.92);
  }

  .reduxshare-preview-condition--missing {
    font-size: 12px;
    font-style: italic;
    color: rgba(246, 247, 251, 0.5);
  }

  .reduxshare-preview-answers {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .reduxshare-preview-answer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    padding: 6px 9px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
  }

  .reduxshare-preview-answer--exact {
    background: rgba(74, 222, 128, 0.09);
    border-color: rgba(74, 222, 128, 0.22);
  }

  .reduxshare-preview-answer--exact .reduxshare-preview-answer-label {
    font-weight: 700;
    color: #4ade80;
  }

  .rpx-answer-check {
    display: inline-grid;
    place-items: center;
    flex: none;
  }

  .rpx-answer-check svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: #4ade80;
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .reduxshare-preview-answer-label {
    overflow-wrap: anywhere;
  }

  .reduxshare-preview-answer-meta {
    font-size: 11.5px;
    color: rgba(246, 247, 251, 0.5);
  }

  .reduxshare-preview-empty {
    margin: 0;
    font-size: 12.5px;
    color: rgba(246, 247, 251, 0.5);
  }

  .reduxshare-preview-options {
    margin-top: 11px;
    padding-top: 11px;
    border-top: 1px dashed rgba(255, 255, 255, 0.1);
  }

  .reduxshare-preview-external-header {
    font-size: 10.5px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(246, 247, 251, 0.5);
    margin-bottom: 7px;
  }

  .reduxshare-preview-option-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .reduxshare-preview-option {
    display: inline-block;
    padding: 3px 10px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.045);
    font-size: 12px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .reduxshare-preview-option--exact {
    border-color: rgba(74, 222, 128, 0.5);
    background: rgba(74, 222, 128, 0.1);
    color: #4ade80;
    font-weight: 700;
  }

  .reduxshare-preview-scan {
    margin-top: 14px;
    padding: 13px 14px 14px;
    border: 1px solid rgba(var(--reduxshare-accent-rgb), 0.2);
    border-radius: 12px;
    background: linear-gradient(
      180deg,
      rgba(var(--reduxshare-accent-rgb), 0.06),
      rgba(255, 255, 255, 0.02)
    );
    display: grid;
    gap: 11px;
  }

  .rpx-scan-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 11px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .rpx-scan-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    flex: none;
    border: 1px solid rgba(var(--reduxshare-accent-rgb), 0.3);
    border-radius: 9px;
    background: rgba(var(--reduxshare-accent-rgb), 0.12);
    color: var(--reduxshare-accent-soft);
  }

  .rpx-scan-icon svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 3.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .rpx-scan-heading {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .rpx-scan-title {
    font-size: 12.5px;
    font-weight: 700;
    color: rgba(246, 247, 251, 0.9);
  }

  .rpx-scan-hint {
    font-size: 11px;
    line-height: 1.35;
    color: rgba(246, 247, 251, 0.5);
  }

  .reduxshare-preview-scan-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .reduxshare-preview-scan-row label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(246, 247, 251, 0.65);
    margin-bottom: 0;
  }

  .reduxshare-preview-scan-row input[type="number"] {
    box-sizing: border-box;
    width: 76px;
    padding: 5px 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    color: #f6f7fb;
    font-family: inherit;
    font-size: 12.5px;
  }

  .reduxshare-preview-scan-row input[type="number"]:focus {
    outline: none;
    border-color: rgba(var(--reduxshare-accent-rgb), 0.55);
    box-shadow: 0 0 0 3px rgba(var(--reduxshare-accent-rgb), 0.16);
  }

  .rpx-btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: none;
    border-radius: 9px;
    background: var(--reduxshare-accent);
    color: #14151b;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition:
      filter 140ms ease,
      transform 120ms ease,
      box-shadow 160ms ease,
      opacity 140ms ease;
  }

  .rpx-btn-primary svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }

  .rpx-btn-primary:hover {
    filter: brightness(1.12);
    box-shadow: 0 6px 18px rgba(var(--reduxshare-accent-rgb), 0.3);
  }

  .rpx-btn-primary:active {
    transform: scale(0.97);
  }

  .rpx-btn-primary:disabled {
    opacity: 0.45;
    cursor: default;
    filter: none;
    box-shadow: none;
  }

  .rpx-btn-ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 9px;
    background: transparent;
    color: #f6f7fb;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 650;
    cursor: pointer;
    transition:
      background-color 140ms ease,
      transform 120ms ease;
  }

  .rpx-btn-ghost:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .rpx-btn-ghost:active {
    transform: scale(0.97);
  }

  .rpx-link-btn {
    border: none;
    background: transparent;
    padding: 2px 4px;
    color: var(--reduxshare-accent-soft);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .rpx-link-btn:hover {
    text-decoration: underline;
  }

  .reduxshare-preview-scan-types {
    display: grid;
    gap: 8px;
  }

  .rpx-scan-types-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .reduxshare-preview-scan-types-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(246, 247, 251, 0.55);
  }

  .rpx-scan-types-actions {
    display: inline-flex;
    gap: 10px;
  }

  .reduxshare-preview-scan-types-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
    gap: 7px;
  }

  .reduxshare-preview-scan-type-option {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 5px;
    padding: 9px 7px 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    background: transparent;
    color: rgba(246, 247, 251, 0.6);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    cursor: pointer;
    margin-bottom: 0;
    user-select: none;
    -webkit-user-select: none;
    transition:
      border-color 160ms ease,
      background-color 160ms ease,
      color 160ms ease;
  }

  .reduxshare-preview-scan-type-option:hover {
    background: rgba(255, 255, 255, 0.045);
    color: rgba(246, 247, 251, 0.9);
  }

  .reduxshare-preview-scan-type-option:focus-within {
    outline: 2px solid var(--reduxshare-accent);
    outline-offset: 1px;
  }

  .reduxshare-preview-scan-type-option:has(input:checked) {
    border-color: rgba(var(--reduxshare-accent-rgb), 0.55);
    background: rgba(var(--reduxshare-accent-rgb), 0.07);
    color: var(--reduxshare-accent-soft);
  }

  .reduxshare-preview-scan-type-option:has(input:checked):hover {
    background: rgba(var(--reduxshare-accent-rgb), 0.07);
    color: var(--reduxshare-accent-soft);
  }

  .reduxshare-preview-scan-type-option input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    clip: rect(0 0 0 0);
    overflow: hidden;
    white-space: nowrap;
  }

  .rpx-type-icon {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
  }

  .rpx-type-icon svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 3.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .rpx-type-label {
    overflow-wrap: anywhere;
  }

  .rpx-scan-progress {
    display: grid;
    gap: 6px;
  }

  .rpx-progress-track {
    height: 5px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.09);
    overflow: hidden;
  }

  .rpx-progress-fill {
    height: 100%;
    width: 0;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      rgba(var(--reduxshare-accent-rgb), 0.65),
      var(--reduxshare-accent)
    );
    transition: width 200ms ease;
  }

  .reduxshare-preview-scan-progress {
    font-size: 11.5px;
    color: rgba(246, 247, 251, 0.65);
    min-height: 1.2em;
  }

  .reduxshare-preview-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 110px;
    font-size: 13px;
    color: rgba(246, 247, 251, 0.6);
    text-align: center;
  }

  .reduxshare-preview-placeholder--error {
    color: #f87171;
  }

  .rpx-spinner {
    width: 18px;
    height: 18px;
    flex: none;
    border: 2.5px solid rgba(255, 255, 255, 0.15);
    border-top-color: var(--reduxshare-accent);
    border-radius: 50%;
    animation: rpx-spin 700ms linear infinite;
  }

  .rpx-placeholder-icon {
    display: inline-grid;
    place-items: center;
    flex: none;
  }

  .rpx-placeholder-icon svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.75;
  }

  :host([data-theme="light"]) .rpx-overlay {
    background: rgba(15, 20, 35, 0.38);
    --reduxshare-accent-soft: color-mix(in srgb, var(--reduxshare-accent) 62%, #16213c);
  }

  :host([data-theme="light"]) .rpx-dialog {
    border-color: rgba(15, 20, 35, 0.14);
    background:
      radial-gradient(circle at top right, rgba(var(--reduxshare-accent-rgb), 0.1), transparent 55%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 250, 253, 0.97));
    color: #14171d;
    box-shadow: 0 24px 64px rgba(15, 20, 35, 0.22);
  }

  :host([data-theme="light"]) .rpx-header {
    border-bottom-color: rgba(15, 20, 35, 0.09);
  }

  :host([data-theme="light"]) .rpx-brand {
    box-shadow:
      0 8px 24px rgba(var(--reduxshare-accent-rgb), 0.2),
      0 0 0 1px rgba(15, 20, 35, 0.06) inset;
  }

  :host([data-theme="light"]) .rpx-subtitle {
    color: rgba(20, 23, 29, 0.55);
  }

  :host([data-theme="light"]) .rpx-icon-btn {
    background: rgba(var(--reduxshare-accent-rgb), 0.08);
    border-color: rgba(var(--reduxshare-accent-rgb), 0.2);
    color: #14171d;
  }

  :host([data-theme="light"]) .rpx-icon-btn:hover {
    background: rgba(var(--reduxshare-accent-rgb), 0.15);
  }

  :host([data-theme="light"]) .reduxshare-preview-close:hover {
    background: rgba(217, 72, 79, 0.12);
    border-color: rgba(217, 72, 79, 0.42);
    color: #d9484f;
    box-shadow: 0 8px 20px rgba(217, 72, 79, 0.14);
  }

  :host([data-theme="light"]) .rpx-body::-webkit-scrollbar-thumb {
    background: rgba(15, 20, 35, 0.18);
    border: 3px solid transparent;
    background-clip: content-box;
  }

  :host([data-theme="light"]) .rpx-tabs {
    border-bottom-color: rgba(15, 20, 35, 0.1);
  }

  :host([data-theme="light"]) .reduxshare-preview-tab {
    color: rgba(20, 23, 29, 0.55);
  }

  :host([data-theme="light"]) .reduxshare-preview-tab:hover:not(.active) {
    color: rgba(20, 23, 29, 0.82);
  }

  :host([data-theme="light"]) .reduxshare-preview-tab.active {
    color: color-mix(in srgb, var(--reduxshare-accent) 62%, #1b2a52);
  }

  :host([data-theme="light"]) .rpx-tab-count {
    background: rgba(15, 20, 35, 0.07);
    color: rgba(20, 23, 29, 0.7);
  }

  :host([data-theme="light"]) .reduxshare-preview-tab.active .rpx-tab-count {
    background: rgba(var(--reduxshare-accent-rgb), 0.14);
    color: color-mix(in srgb, var(--reduxshare-accent) 62%, #1b2a52);
  }

  :host([data-theme="light"]) .reduxshare-preview-question {
    border-color: rgba(15, 20, 35, 0.12);
    background: #ffffff;
  }

  :host([data-theme="light"]) .rpx-card-header {
    border-bottom-color: rgba(15, 20, 35, 0.08);
    background: rgba(15, 20, 35, 0.02);
  }

  :host([data-theme="light"]) .rpx-card-title {
    color: rgba(20, 23, 29, 0.85);
  }

  :host([data-theme="light"]) .rpx-type-badge {
    background: rgba(var(--reduxshare-accent-rgb), 0.08);
  }

  :host([data-theme="light"]) .reduxshare-preview-condition {
    color: rgba(20, 23, 29, 0.92);
  }

  :host([data-theme="light"]) .reduxshare-preview-condition--missing {
    color: rgba(20, 23, 29, 0.5);
  }

  :host([data-theme="light"]) .reduxshare-preview-answer--exact {
    background: rgba(31, 157, 77, 0.08);
    border-color: rgba(31, 157, 77, 0.25);
  }

  :host([data-theme="light"]) .reduxshare-preview-answer--exact .reduxshare-preview-answer-label {
    color: #1f9d4d;
  }

  :host([data-theme="light"]) .rpx-answer-check svg {
    stroke: #1f9d4d;
  }

  :host([data-theme="light"]) .reduxshare-preview-answer-meta {
    color: rgba(20, 23, 29, 0.5);
  }

  :host([data-theme="light"]) .reduxshare-preview-empty {
    color: rgba(20, 23, 29, 0.5);
  }

  :host([data-theme="light"]) .reduxshare-preview-options {
    border-top-color: rgba(15, 20, 35, 0.1);
  }

  :host([data-theme="light"]) .reduxshare-preview-external-header {
    color: rgba(20, 23, 29, 0.5);
  }

  :host([data-theme="light"]) .reduxshare-preview-option {
    border-color: rgba(15, 20, 35, 0.14);
    background: rgba(15, 20, 35, 0.03);
  }

  :host([data-theme="light"]) .reduxshare-preview-option--exact {
    border-color: rgba(31, 157, 77, 0.45);
    background: rgba(31, 157, 77, 0.08);
    color: #1f9d4d;
  }

  :host([data-theme="light"]) .reduxshare-preview-scan {
    border-color: rgba(15, 20, 35, 0.12);
    background: linear-gradient(
      180deg,
      rgba(var(--reduxshare-accent-rgb), 0.05),
      rgba(15, 20, 35, 0.015)
    );
  }

  :host([data-theme="light"]) .rpx-scan-header {
    border-bottom-color: rgba(15, 20, 35, 0.09);
  }

  :host([data-theme="light"]) .rpx-scan-title {
    color: rgba(20, 23, 29, 0.9);
  }

  :host([data-theme="light"]) .rpx-scan-hint {
    color: rgba(20, 23, 29, 0.5);
  }

  :host([data-theme="light"]) .reduxshare-preview-scan-row label {
    color: rgba(20, 23, 29, 0.65);
  }

  :host([data-theme="light"]) .reduxshare-preview-scan-row input[type="number"] {
    background: #ffffff;
    border-color: rgba(15, 20, 35, 0.16);
    color: #14171d;
  }

  :host([data-theme="light"]) .rpx-btn-ghost {
    border-color: rgba(15, 20, 35, 0.18);
    color: #14171d;
  }

  :host([data-theme="light"]) .rpx-btn-ghost:hover {
    background: rgba(15, 20, 35, 0.05);
  }

  :host([data-theme="light"]) .reduxshare-preview-scan-types-label {
    color: rgba(20, 23, 29, 0.7);
  }

  :host([data-theme="light"]) .reduxshare-preview-scan-type-option {
    border-color: rgba(15, 20, 35, 0.14);
    background: transparent;
    color: rgba(20, 23, 29, 0.65);
  }

  :host([data-theme="light"]) .reduxshare-preview-scan-type-option:hover {
    background: rgba(15, 20, 35, 0.04);
    color: rgba(20, 23, 29, 0.9);
  }

  :host([data-theme="light"]) .reduxshare-preview-scan-type-option:has(input:checked) {
    border-color: rgba(var(--reduxshare-accent-rgb), 0.55);
    background: rgba(var(--reduxshare-accent-rgb), 0.06);
    color: color-mix(in srgb, var(--reduxshare-accent) 62%, #1b2a52);
  }

  :host([data-theme="light"]) .rpx-progress-track {
    background: rgba(15, 20, 35, 0.08);
  }

  :host([data-theme="light"]) .reduxshare-preview-scan-progress {
    color: rgba(20, 23, 29, 0.65);
  }

  :host([data-theme="light"]) .reduxshare-preview-placeholder {
    color: rgba(20, 23, 29, 0.6);
  }

  :host([data-theme="light"]) .reduxshare-preview-placeholder--error {
    color: #d9484f;
  }

  :host([data-theme="light"]) .rpx-spinner {
    border-color: rgba(15, 20, 35, 0.15);
    border-top-color: var(--reduxshare-accent);
  }
`;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resetQuizPreviewPanelState() {
  panelState.visible = false;
  panelState.loading = false;
  panelState.error = null;
  panelState.authRequired = false;
  panelState.questions = [];
  panelState.quizTitle = null;
  panelState.activeTab = "internal";
  quizPreviewScanRunning = false;
  quizPreviewScanProgress = null;
  removeQuizPreviewPanel();
}

export function getQuizPreviewPanelState(): QuizPreviewPanelState {
  return { ...panelState };
}

const QUIZ_PREVIEW_MAX_TITLE_LENGTH = 64;

export function setQuizPreviewPanelQuizTitle(title: string | null) {
  panelState.quizTitle = title;
}

function getQuizPreviewHeading() {
  const quizTitle = panelState.quizTitle?.trim() || "";

  if (!quizTitle) {
    return currentT("quiz.preview.title");
  }

  return quizTitle.length > QUIZ_PREVIEW_MAX_TITLE_LENGTH
    ? `${quizTitle.slice(0, QUIZ_PREVIEW_MAX_TITLE_LENGTH).trimEnd()}…`
    : quizTitle;
}

export function isQuizPreviewPanelVisible() {
  return panelState.visible;
}

export function hideQuizPreviewPanel() {
  if (!panelState.visible) {
    return;
  }

  panelState.visible = false;
  removeQuizPreviewPanel();
}

export function beginQuizPreviewLoading() {
  panelState.visible = true;
  panelState.loading = true;
  panelState.error = null;
  panelState.authRequired = false;
  panelState.questions = [];
  renderQuizPreviewPanel();
}

export function showQuizPreviewError(message: string) {
  panelState.visible = true;
  panelState.loading = false;
  panelState.error = message;
  panelState.questions = [];
  renderQuizPreviewPanel();
}

export function showQuizPreviewQuestions(questions: QuizPreviewQuestion[], authRequired: boolean) {
  panelState.visible = true;
  panelState.loading = false;
  panelState.error = null;
  panelState.authRequired = authRequired;
  panelState.questions = questions;

  panelState.activeTab = questions.some((question) => hasAnswerData(question.reduxshare))
    ? "internal"
    : "external";
  renderQuizPreviewPanel();
}

export function removeQuizPreviewPanel() {
  document.getElementById(QUIZ_PREVIEW_ROOT_ID)?.remove();
  document.body?.classList.remove("modal-open");
}

let quizPreviewRefreshHandler: (() => void) | null = null;

export function setQuizPreviewRefreshHandler(handler: (() => void) | null) {
  quizPreviewRefreshHandler = handler;
}

export interface QuizPreviewScanHandlers {
  onStartScan: (from: string, to: string, questionTypes: string[]) => void;
  onCancelScan: () => void;
}

export interface QuizPreviewScanProgress {
  checked: number;
  total: number;
  found: number;
}

let quizPreviewScanHandlers: QuizPreviewScanHandlers | null = null;
let quizPreviewScanRunning = false;
let quizPreviewScanProgress: QuizPreviewScanProgress | null = null;

export function setQuizPreviewScanHandlers(handlers: QuizPreviewScanHandlers | null) {
  quizPreviewScanHandlers = handlers;
}

export function setQuizPreviewScanRunning(running: boolean) {
  quizPreviewScanRunning = running;

  if (!running) {
    quizPreviewScanProgress = null;
  }

  renderQuizPreviewPanel();
}

export function updateQuizPreviewScanProgress(progress: QuizPreviewScanProgress) {
  quizPreviewScanProgress = progress;
  const shadow = document.getElementById(QUIZ_PREVIEW_ROOT_ID)?.shadowRoot;
  const percent = getQuizPreviewScanProgressPercent();

  shadow
    ?.querySelector<HTMLElement>(".rpx-progress-fill")
    ?.style.setProperty("width", `${percent}%`);
  shadow
    ?.querySelector<HTMLElement>(".rpx-progress-track")
    ?.setAttribute("aria-valuenow", String(percent));
  shadow?.querySelector("#reduxshare-preview-scan-progress")?.replaceChildren(
    document.createTextNode(
      currentT("quiz.preview.scanProgress", {
        checked: progress.checked,
        total: progress.total,
        found: progress.found,
      }),
    ),
  );
}

export function refreshQuizPreviewPanelTheme() {
  if (!panelState.visible) {
    return;
  }

  renderQuizPreviewPanel();
}

function formatQuizPreviewScanProgress() {
  if (!quizPreviewScanProgress) {
    return "";
  }

  return currentT("quiz.preview.scanProgress", {
    checked: quizPreviewScanProgress.checked,
    total: quizPreviewScanProgress.total,
    found: quizPreviewScanProgress.found,
  });
}

function getQuizPreviewScanProgressPercent() {
  if (!quizPreviewScanProgress || quizPreviewScanProgress.total <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.round((quizPreviewScanProgress.checked / quizPreviewScanProgress.total) * 100),
  );
}

function getMetaText(
  contributor: string | null | undefined,
  count: number | null | undefined,
  updatedAt: string | null | undefined,
) {
  const parts: string[] = [];

  if (contributor) {
    parts.push(contributor);
  }

  if (typeof count === "number" && count > 1) {
    parts.push(`×${count}`);
  }

  if (updatedAt) {
    const parsedAt = new Date(updatedAt);

    if (!Number.isNaN(parsedAt.getTime())) {
      parts.push(parsedAt.toLocaleDateString());
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

type PreviewAnswerRow = {
  label: string;
  exact: boolean;
  meta: string | null;
};

function getAnswerRows(answerData: AnswerData): PreviewAnswerRow[] {
  const rows: PreviewAnswerRow[] = [];

  for (const slot of answerData.slots) {
    const slotSuggestions = slot.suggestions.filter((suggestion) => suggestion.label.trim() !== "");
    const slotSubmissions = slot.submissions.filter((submission) => submission.label.trim() !== "");

    if (slotSuggestions.length === 0 && slotSubmissions.length === 0) {
      continue;
    }

    const exactLabels = new Set(slotSuggestions.map((suggestion) => suggestion.label));

    for (const submission of slotSubmissions) {
      rows.push({
        label: submission.label,
        exact: exactLabels.has(submission.label),
        meta: getMetaText(submission.contributor, submission.count, submission.updatedAt),
      });
    }

    for (const suggestion of slotSuggestions) {
      if (slotSubmissions.some((submission) => submission.label === suggestion.label)) {
        continue;
      }

      rows.push({
        label: suggestion.label,
        exact: suggestion.correctness === 2,
        meta: getMetaText(suggestion.contributor, null, suggestion.updatedAt),
      });
    }
  }

  if (
    rows.length === 0 &&
    (answerData.suggestions.length > 0 || answerData.submissions.length > 0)
  ) {
    const exactLabels = new Set(answerData.suggestions.map((suggestion) => suggestion.label));

    for (const submission of answerData.submissions) {
      rows.push({
        label: submission.label,
        exact: exactLabels.has(submission.label),
        meta: getMetaText(submission.contributor, submission.count, submission.updatedAt),
      });
    }

    for (const suggestion of answerData.suggestions) {
      if (answerData.submissions.some((submission) => submission.label === suggestion.label)) {
        continue;
      }

      rows.push({
        label: suggestion.label,
        exact: suggestion.correctness === 2,
        meta: getMetaText(suggestion.contributor, null, suggestion.updatedAt),
      });
    }
  }

  return rows;
}

function renderAnswerRows(answerData: AnswerData) {
  const rows = getAnswerRows(answerData);

  if (rows.length === 0) {
    return `<p class="reduxshare-preview-empty">${escapeHtml(currentT("quiz.menu.empty"))}</p>`;
  }

  return `<ul class="reduxshare-preview-answers">${rows
    .map(
      (row) =>
        `<li class="reduxshare-preview-answer${row.exact ? " reduxshare-preview-answer--exact" : ""}">${
          row.exact
            ? `<span class="rpx-answer-check" aria-hidden="true">${ANSWER_CHECK_ICON}</span>`
            : ""
        }<span class="reduxshare-preview-answer-label">${escapeHtml(row.label)}</span>${
          row.meta
            ? `<span class="reduxshare-preview-answer-meta">${escapeHtml(row.meta)}</span>`
            : ""
        }</li>`,
    )
    .join("")}</ul>`;
}

function renderQuestionCard(
  question: QuizPreviewQuestion,
  questionNumber: number,
  tab: QuizPreviewTabKey,
) {
  const questionType = getQuestionTypeLabel(
    question.questionType,
    currentStoredState?.settings?.language,
  );
  const condition = question.questionText?.trim() || "";
  const answers = tab === "internal" ? question.reduxshare : question.external;

  const conditionMarkup = condition
    ? `<div class="reduxshare-preview-condition">${escapeHtml(condition)}</div>`
    : tab === "external"
      ? `<div class="reduxshare-preview-condition reduxshare-preview-condition--missing">${escapeHtml(currentT("quiz.preview.conditionMissing"))}</div>`
      : "";

  return `
    <div class="reduxshare-preview-question">
      <div class="rpx-card-header">
        <span class="rpx-card-title">${escapeHtml(currentT("quiz.preview.question", { number: questionNumber }))}</span>
        <span class="rpx-type-badge">${escapeHtml(questionType)}</span>
      </div>
      <div class="rpx-card-body">
        ${conditionMarkup}
        ${renderAnswerRows(answers)}
        ${tab === "internal" ? renderAnswerOptionsSection(question) : ""}
      </div>
    </div>
  `;
}

function renderAnswerOptionsSection(question: QuizPreviewQuestion) {
  const options = question.answerOptions ?? [];

  if (options.length === 0) {
    return "";
  }

  const exactLabels = new Set<string>(
    [
      question.reduxshare.suggestions,
      ...question.reduxshare.slots.map((slot) => slot.suggestions),
    ].flatMap((suggestions) =>
      getPreferredSuggestionLabels(suggestions).map((label) => label.toLowerCase()),
    ),
  );

  return `
    <div class="reduxshare-preview-options">
      <div class="reduxshare-preview-external-header">${escapeHtml(currentT("quiz.preview.options"))}</div>
      <div class="reduxshare-preview-option-list">
        ${options
          .map((option) => {
            const isExact = exactLabels.has(option.trim().toLowerCase());

            return `<span class="reduxshare-preview-option${isExact ? " reduxshare-preview-option--exact" : ""}">${escapeHtml(option)}</span>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function getTabQuestions(tab: QuizPreviewTabKey) {
  if (tab === "external") {
    return panelState.questions.filter((question) => hasAnswerData(question.external));
  }

  return panelState.questions;
}

function renderTabButton(
  tabKey: QuizPreviewTabKey,
  label: string,
  count: number,
  isActive: boolean,
) {
  return `
    <button
      class="reduxshare-preview-tab${isActive ? " active" : ""}"
      type="button"
      data-tab="${tabKey}"
      ${count === 0 ? 'data-empty="true"' : ""}
    >
      <span class="rpx-tab-icon" aria-hidden="true">${getSourceTabIconMarkup(tabKey)}</span>
      <span>${escapeHtml(label)}</span>
      <span class="rpx-tab-count">${count}</span>
    </button>
  `;
}

function renderModalBody() {
  if (panelState.loading) {
    return `
      <div class="reduxshare-preview-placeholder">
        <span class="rpx-spinner" aria-hidden="true"></span>
        <span>${escapeHtml(currentT("quiz.preview.loading"))}</span>
      </div>
    `;
  }

  if (panelState.error) {
    return `<div class="reduxshare-preview-placeholder reduxshare-preview-placeholder--error"><span class="rpx-placeholder-icon" aria-hidden="true">${WARNING_ICON}</span><span>${escapeHtml(panelState.error)}</span></div>`;
  }

  if (panelState.authRequired) {
    return `<div class="reduxshare-preview-placeholder"><span class="rpx-placeholder-icon" aria-hidden="true">${LOCK_ICON}</span><span>${escapeHtml(currentT("quiz.preview.authRequired"))}</span></div>`;
  }

  const internalCount = getTabQuestions("internal").filter((question) =>
    hasAnswerData(question.reduxshare),
  ).length;
  const externalCount = getTabQuestions("external").length;
  const tabQuestions = getTabQuestions(panelState.activeTab);

  const tabEmptyPlaceholder =
    panelState.questions.length === 0
      ? currentT("quiz.preview.externalDiscovery")
      : currentT("quiz.menu.empty");

  // Скан ID относится только к внешним источникам — на внутренних вкладке он не нужен.
  const scanBlock = panelState.activeTab === "external" ? renderQuizPreviewScanBlock() : "";

  return `
    <div class="rpx-tabs" style="--rpx-active-tab-index: ${panelState.activeTab === "internal" ? 0 : 1}">
      ${renderTabButton("internal", currentT("quiz.menu.internalSources"), internalCount, panelState.activeTab === "internal")}
      ${renderTabButton("external", currentT("quiz.menu.externalSources"), externalCount, panelState.activeTab === "external")}
      <div class="rpx-tabs-indicator" aria-hidden="true"></div>
    </div>
    ${
      tabQuestions.length === 0
        ? `<div class="reduxshare-preview-placeholder"><span class="rpx-placeholder-icon" aria-hidden="true">${SEARCH_ICON}</span><span>${escapeHtml(tabEmptyPlaceholder)}</span></div>${scanBlock}`
        : `<div class="reduxshare-preview-list">
            ${tabQuestions.map((question, index) => renderQuestionCard(question, index + 1, panelState.activeTab)).join("")}
          </div>${scanBlock}`
    }
  `;
}

function renderQuizPreviewScanBlock() {
  if (!quizPreviewScanHandlers) {
    return "";
  }

  const actionButton = quizPreviewScanRunning
    ? `<button type="button" class="rpx-btn-ghost reduxshare-preview-scan-cancel">${escapeHtml(currentT("quiz.preview.scanCancel"))}</button>`
    : `<button type="button" class="rpx-btn-primary reduxshare-preview-scan-start">${SEARCH_ICON}<span>${escapeHtml(currentT("quiz.preview.scanStart"))}</span></button>`;

  const language = currentStoredState?.settings?.language;
  const typeOptions = EXTERNAL_TYPE_PROBE_ORDER.map(
    (type) => `
      <label class="reduxshare-preview-scan-type-option" title="${escapeHtml(type)}">
        <input type="checkbox" class="reduxshare-preview-scan-type" value="${escapeHtml(type)}" checked />
        <span class="rpx-type-icon" aria-hidden="true">${getQuestionTypeScanIconMarkup(type)}</span>
        <span class="rpx-type-label">${escapeHtml(getQuestionTypeLabel(type, language))}</span>
      </label>
    `,
  ).join("");

  const progressPercent = getQuizPreviewScanProgressPercent();
  const showProgressBar = quizPreviewScanRunning || progressPercent > 0;

  return `
    <div class="reduxshare-preview-scan">
      <div class="rpx-scan-header">
        <span class="rpx-scan-icon" aria-hidden="true">${SEARCH_ICON}</span>
        <span class="rpx-scan-heading">
          <span class="rpx-scan-title">${escapeHtml(currentT("quiz.preview.scanTitle"))}</span>
          <span class="rpx-scan-hint">${escapeHtml(currentT("quiz.preview.scanHint"))}</span>
        </span>
      </div>
      <div class="reduxshare-preview-scan-row">
        <label>${escapeHtml(currentT("quiz.preview.scanRangeFrom"))}
          <input
            type="number"
            min="1"
            id="reduxshare-preview-scan-from"
            value="${QUIZ_ID_SCAN_DEFAULT_FROM}"
          />
        </label>
        <label>${escapeHtml(currentT("quiz.preview.scanRangeTo"))}
          <input
            type="number"
            min="1"
            id="reduxshare-preview-scan-to"
            value="${QUIZ_ID_SCAN_DEFAULT_TO}"
          />
        </label>
        ${actionButton}
      </div>
      <div class="reduxshare-preview-scan-types">
        <div class="rpx-scan-types-header">
          <span class="reduxshare-preview-scan-types-label">${escapeHtml(currentT("quiz.preview.scanTypes"))}</span>
          <span class="rpx-scan-types-actions">
            <button type="button" class="rpx-link-btn reduxshare-preview-scan-select-all">${escapeHtml(currentT("quiz.preview.scanSelectAll"))}</button>
            <button type="button" class="rpx-link-btn reduxshare-preview-scan-select-none">${escapeHtml(currentT("quiz.preview.scanClearAll"))}</button>
          </span>
        </div>
        <div class="reduxshare-preview-scan-types-list">${typeOptions}</div>
      </div>
      <div class="rpx-scan-progress">
        ${
          showProgressBar
            ? `<div class="rpx-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPercent}"><div class="rpx-progress-fill" style="width:${progressPercent}%"></div></div>`
            : ""
        }
        <div class="reduxshare-preview-scan-progress" id="reduxshare-preview-scan-progress">${escapeHtml(formatQuizPreviewScanProgress())}</div>
      </div>
    </div>
  `;
}

function getBrandIconUrl() {
  try {
    return chrome.runtime.getURL("icons/reduxshare-icon-48.png");
  } catch {
    return "";
  }
}

function applyQuizPreviewHostTheme(host: HTMLElement) {
  const accentColor = getAccentColor(currentStoredState?.settings);

  host.style.setProperty("--reduxshare-accent", accentColor);
  host.style.setProperty("--reduxshare-accent-rgb", getRgbCssValue(accentColor));
  applyContentColorSchemeToHost(host);
}

function ensureQuizPreviewRoot(): HTMLDivElement {
  const existing = document.getElementById(QUIZ_PREVIEW_ROOT_ID);

  if (existing instanceof HTMLDivElement && existing.shadowRoot) {
    return existing;
  }

  existing?.remove();

  const root = document.createElement("div");
  root.id = QUIZ_PREVIEW_ROOT_ID;
  document.body.append(root);
  root.attachShadow({ mode: "open" });

  return root;
}

let quizPreviewEscapeListenerInstalled = false;

function ensureQuizPreviewEscapeListener() {
  if (quizPreviewEscapeListenerInstalled) {
    return;
  }

  quizPreviewEscapeListenerInstalled = true;
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !isQuizPreviewPanelVisible()) {
        return;
      }

      event.preventDefault();
      hideQuizPreviewPanel();
    },
    true,
  );
}

let quizPreviewSchemeWatcherInstalled = false;

function ensureQuizPreviewSchemeWatcher() {
  if (quizPreviewSchemeWatcherInstalled) {
    return;
  }

  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }

  quizPreviewSchemeWatcherInstalled = true;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");

  const handleChange = () => {
    if ((currentStoredState?.settings?.colorScheme ?? "system") !== "system") {
      return;
    }

    if (panelState.visible) {
      renderQuizPreviewPanel();
    }
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", handleChange);
  }
}

function renderQuizPreviewPanel() {
  if (
    !panelState.visible ||
    !canUseQuizFeatures(currentStoredState as StoredStateLike | undefined)
  ) {
    removeQuizPreviewPanel();
    return;
  }

  ensureQuizPreviewEscapeListener();
  ensureQuizPreviewSchemeWatcher();

  const host = ensureQuizPreviewRoot();
  applyQuizPreviewHostTheme(host);
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });

  const closeLabel = currentT("quiz.panel.close");
  const refreshLabel = currentT("quiz.preview.refreshQuestions");
  const brandUrl = getBrandIconUrl();

  shadow.innerHTML = `
    <style>${PREVIEW_STYLES}</style>
    <div class="rpx-overlay">
      <div class="rpx-dialog" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="reduxshare-quiz-preview-title">
        <header class="rpx-header">
          ${brandUrl ? `<img class="rpx-brand" src="${escapeHtml(brandUrl)}" alt="" />` : ""}
          <div class="rpx-heading">
            <h2 class="rpx-title" id="reduxshare-quiz-preview-title">${escapeHtml(getQuizPreviewHeading())}</h2>
            <span class="rpx-subtitle">${escapeHtml(currentT("quiz.preview.subtitle"))}</span>
          </div>
          <div class="rpx-header-actions">
            <button type="button" class="rpx-icon-btn reduxshare-preview-refresh" aria-label="${escapeHtml(refreshLabel)}" title="${escapeHtml(refreshLabel)}" ${panelState.loading ? "disabled" : ""}>${REFRESH_ICON}</button>
            <button type="button" class="rpx-icon-btn reduxshare-preview-close" aria-label="${escapeHtml(closeLabel)}" title="${escapeHtml(closeLabel)}">${CLOSE_ICON}</button>
          </div>
        </header>
        <div class="rpx-body">${renderModalBody()}</div>
      </div>
    </div>
  `;

  document.body.classList.add("modal-open");

  shadow.querySelector<HTMLElement>(".reduxshare-preview-close")?.addEventListener("click", () => {
    hideQuizPreviewPanel();
  });

  shadow
    .querySelector<HTMLElement>(".reduxshare-preview-refresh")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      quizPreviewRefreshHandler?.();
    });

  shadow
    .querySelector<HTMLElement>(".reduxshare-preview-scan-start")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const fromInput = shadow.querySelector<HTMLInputElement>("#reduxshare-preview-scan-from");
      const toInput = shadow.querySelector<HTMLInputElement>("#reduxshare-preview-scan-to");
      const selectedTypes = Array.from(
        shadow.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type:checked"),
      ).map((checkbox) => checkbox.value);
      quizPreviewScanHandlers?.onStartScan(
        fromInput?.value ?? "",
        toInput?.value ?? "",
        selectedTypes,
      );
    });

  const syncScanStartAvailability = () => {
    const startButton = shadow.querySelector<HTMLButtonElement>(".reduxshare-preview-scan-start");

    if (!startButton) {
      return;
    }

    startButton.disabled =
      shadow.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type:checked").length ===
      0;
  };

  for (const typeCheckbox of Array.from(
    shadow.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type"),
  )) {
    typeCheckbox.addEventListener("change", () => {
      syncScanStartAvailability();
    });
  }

  shadow
    .querySelector<HTMLElement>(".reduxshare-preview-scan-select-all")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      for (const typeCheckbox of Array.from(
        shadow.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type"),
      )) {
        typeCheckbox.checked = true;
      }

      syncScanStartAvailability();
    });

  shadow
    .querySelector<HTMLElement>(".reduxshare-preview-scan-select-none")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      for (const typeCheckbox of Array.from(
        shadow.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type"),
      )) {
        typeCheckbox.checked = false;
      }

      syncScanStartAvailability();
    });

  shadow
    .querySelector<HTMLElement>(".reduxshare-preview-scan-cancel")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      quizPreviewScanHandlers?.onCancelScan();
    });

  shadow.querySelector<HTMLElement>(".rpx-overlay")?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".rpx-dialog")) {
      return;
    }

    hideQuizPreviewPanel();
  });

  shadow.querySelector<HTMLElement>(".rpx-dialog")?.focus();

  for (const tabButton of Array.from(
    shadow.querySelectorAll<HTMLButtonElement>(".reduxshare-preview-tab"),
  )) {
    tabButton.addEventListener("click", () => {
      const tabKey = tabButton.dataset.tab;

      if (tabKey === "internal" || tabKey === "external") {
        panelState.activeTab = tabKey;
        renderQuizPreviewPanel();
      }
    });
  }
}

export function isQuizPreviewPanelMounted() {
  return document.getElementById(QUIZ_PREVIEW_ROOT_ID) !== null;
}
