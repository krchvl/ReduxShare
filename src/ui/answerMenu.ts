import {
  DEFAULT_ACCENT_COLOR,
  type AiAnswerState,
  type AnswerData,
  type EssayExampleEntry,
  type SourceAnswerData,
  type StoredStateLike,
  type SubmissionItem,
  type SuggestionItem,
} from "../model";
import { getContentTranslator, type TranslateFn } from "../i18n/contentI18n";
import { getBooleanSuggestionValue } from "../shared/answerParsing";
import { isDownvotedAnswerItem } from "../data/answerData";
import { getCheckIconMarkup, getQuestionTypeScanIconMarkup, getSourceTabIconMarkup } from "./icons";

let currentT: TranslateFn = getContentTranslator(undefined);

export function setAnswerMenuTranslator(t: TranslateFn) {
  currentT = t;
}

export interface EssayMenuState {
  examples: EssayExampleEntry[];
  canSave: boolean;
}

function hasMenuAnswerData(answerData: AnswerData) {
  return (
    answerData.anchors.length > 0 ||
    answerData.suggestions.length > 0 ||
    answerData.submissions.length > 0 ||
    answerData.slots.some(
      (slot) =>
        slot.anchors.length > 0 || slot.suggestions.length > 0 || slot.submissions.length > 0,
    )
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

const VOTE_UP_ICON_MARKUP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10.5v9.5H4.5A1.5 1.5 0 0 1 3 18.5V12a1.5 1.5 0 0 1 1.5-1.5H7Zm0 0 3.9-6.8a1.7 1.7 0 0 1 3.1 1.2L13.4 8.8h5.3a2 2 0 0 1 2 2.3l-.9 5.9a2.4 2.4 0 0 1-2.4 2H7" /></svg>`;

const VOTE_DOWN_ICON_MARKUP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 13.5V4h2.5A1.5 1.5 0 0 1 21 5.5V12a1.5 1.5 0 0 1-1.5 1.5H17Zm0 0-3.9 6.8a1.7 1.7 0 0 1-3.1-1.2l.6-4.3H5.3a2 2 0 0 1-2-2.3l.9-5.9a2.4 2.4 0 0 1 2.4-2H17" /></svg>`;

function formatAnswerMetaDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const time = Date.parse(value);

  if (!Number.isFinite(time)) {
    return null;
  }

  return new Date(time).toLocaleDateString();
}

export interface AnswerMetaParts {
  user: string | null;
  added: string | null;
  updated: string | null;
}

export function getAnswerMetaParts(item: {
  contributor?: string | null;
  addedAt?: string | null;
  updatedAt?: string | null;
}): AnswerMetaParts {
  return {
    user: item.contributor ?? null,
    added: formatAnswerMetaDate(item.addedAt),
    updated: formatAnswerMetaDate(item.updatedAt),
  };
}

function getAnswerMetaDataAttributes(item: {
  contributor?: string | null;
  addedAt?: string | null;
  updatedAt?: string | null;
}) {
  const { user, added, updated } = getAnswerMetaParts(item);
  const attributes: string[] = [];

  if (user) {
    attributes.push(`data-meta-user="${escapeHtml(user)}"`);
  }

  if (added) {
    attributes.push(`data-meta-added="${escapeHtml(added)}"`);
  }

  if (updated && updated !== added) {
    attributes.push(`data-meta-updated="${escapeHtml(updated)}"`);
  }

  return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
}

function getRenderableExactSuggestions(suggestions: SuggestionItem[]) {
  const verifiedSuggestions = suggestions.filter((suggestion) => suggestion.correctness === 2);

  if (verifiedSuggestions.length === 0) {
    return [];
  }

  const booleanSuggestions = verifiedSuggestions.filter(
    (suggestion) => getBooleanSuggestionValue(suggestion.label) !== null,
  );

  if (booleanSuggestions.length !== verifiedSuggestions.length) {
    return verifiedSuggestions;
  }

  const sumWeight = (targetValue: boolean) => {
    return booleanSuggestions
      .filter((suggestion) => getBooleanSuggestionValue(suggestion.label) === targetValue)
      .reduce(
        (totals, suggestion) => {
          totals.entries.push(suggestion);
          totals.count += suggestion.count ?? 1;
          totals.confidence += suggestion.confidence ?? 0;
          return totals;
        },
        {
          entries: [] as SuggestionItem[],
          count: 0,
          confidence: 0,
        },
      );
  };

  const trueTotals = sumWeight(true);
  const falseTotals = sumWeight(false);

  if (trueTotals.entries.length === 0 || falseTotals.entries.length === 0) {
    return verifiedSuggestions;
  }

  if (trueTotals.count !== falseTotals.count) {
    return trueTotals.count > falseTotals.count ? trueTotals.entries : falseTotals.entries;
  }

  if (trueTotals.confidence !== falseTotals.confidence) {
    return trueTotals.confidence > falseTotals.confidence
      ? trueTotals.entries
      : falseTotals.entries;
  }

  if (trueTotals.entries.length !== falseTotals.entries.length) {
    return trueTotals.entries.length > falseTotals.entries.length
      ? trueTotals.entries
      : falseTotals.entries;
  }

  return [];
}

function renderSuggestionFlyout(suggestions: SuggestionItem[]): string {
  const verifiedSuggestions = getRenderableExactSuggestions(suggestions);

  if (verifiedSuggestions.length === 0) {
    return renderEmptyFlyout();
  }

  return verifiedSuggestions
    .map(
      (s) => `
      <div class="flyout-option flyout-row" ${getFlyoutActionAttributes(s)}${getAnswerMetaDataAttributes(s)}>
        <div class="flyout-label-block">
          <span class="flyout-label">${escapeHtml(s.displayLabel ?? s.label)}</span>
        </div>
        <span class="flyout-pct" style="color:${correctnessColor(s.correctness)}">${Math.round(s.confidence * 100)}%</span>
      </div>`,
    )
    .join("");
}

function renderSubmissionFlyout(submissions: SubmissionItem[]): string {
  if (submissions.length === 0) {
    return renderEmptyFlyout();
  }

  return submissions
    .map((s) => {
      const wrongClass = s.correctness <= 0 ? " flyout-label--wrong" : "";
      const canVote = Boolean(s.taskId) && s.correctness === 1;
      const dubiousClass = canVote && isDownvotedAnswerItem(s) ? " flyout-label--dubious" : "";
      return `
      <div class="flyout-option flyout-row" ${getFlyoutActionAttributes(s)}${getAnswerMetaDataAttributes(s)}${getAnswerVoteDataAttributes(s)}>
        <div class="flyout-label-block">
          <span class="flyout-label${wrongClass}${dubiousClass}">${escapeHtml(s.displayLabel ?? s.label)}</span>
        </div>
        <span class="flyout-pct" style="color:${correctnessColor(s.correctness)}">${s.count}</span>${renderVoteCluster(s)}
      </div>`;
    })
    .join("");
}

function getAnswerVoteDataAttributes(item: SubmissionItem) {
  if (!item.taskId || item.correctness !== 1) {
    return "";
  }

  return ` data-meta-votes="${item.votesUp ?? 0}/${item.votesDown ?? 0}"`;
}

function renderVoteCluster(item: SubmissionItem): string {
  if (!item.taskId || item.correctness !== 1) {
    return "";
  }

  const upActive = item.myVote === 1;
  const downActive = item.myVote === -1;

  return `
      <div class="flyout-votes" role="group">
        <button type="button" class="flyout-vote-btn${upActive ? " flyout-vote-btn--active" : ""}" data-vote-action="up" data-vote-task-id="${escapeHtml(item.taskId)}" title="${escapeHtml(currentT("quiz.menu.voteUp"))}" aria-pressed="${upActive ? "true" : "false"}" tabindex="-1">${VOTE_UP_ICON_MARKUP}<span class="flyout-vote-count">${item.votesUp ?? 0}</span></button>
        <button type="button" class="flyout-vote-btn${downActive ? " flyout-vote-btn--active" : ""}" data-vote-action="down" data-vote-task-id="${escapeHtml(item.taskId)}" title="${escapeHtml(currentT("quiz.menu.voteDown"))}" aria-pressed="${downActive ? "true" : "false"}" tabindex="-1">${VOTE_DOWN_ICON_MARKUP}<span class="flyout-vote-count">${item.votesDown ?? 0}</span></button>
      </div>`;
}

const HOVERCARD_WIDTH = 230;
const HOVERCARD_MARGIN = 12;

export function attachAnswerHovercards(shadowRoot: ShadowRoot) {
  let card = shadowRoot.querySelector<HTMLElement>(".flyout-hovercard");

  if (!card) {
    card = document.createElement("div");
    card.className = "flyout-hovercard";
    card.hidden = true;
    shadowRoot.append(card);
  }

  let originMarker = shadowRoot.querySelector<HTMLElement>(".flyout-hovercard-origin");

  if (!originMarker) {
    originMarker = document.createElement("div");
    originMarker.className = "flyout-hovercard-origin";
    originMarker.setAttribute("aria-hidden", "true");
    shadowRoot.append(originMarker);
  }

  const hovercard = card;
  const origin = originMarker;

  const showCard = (anchor: HTMLElement, event: MouseEvent) => {
    const user = anchor.dataset.metaUser ?? "";
    const added = anchor.dataset.metaAdded ?? "";
    const updated = anchor.dataset.metaUpdated ?? "";
    const votes = anchor.dataset.metaVotes ?? "";

    if (!user && !added && !updated && !votes) {
      return;
    }

    const lines: string[] = [];

    if (user && added) {
      lines.push(`${currentT("quiz.menu.addedBy", { user })} · ${added}`);
    } else if (user) {
      lines.push(currentT("quiz.menu.addedBy", { user }));
    } else if (added) {
      lines.push(currentT("quiz.menu.addedAt", { date: added }));
    }

    if (updated && updated !== added) {
      lines.push(currentT("quiz.menu.updatedAt", { date: updated }));
    }

    if (votes) {
      const [rawUp, rawDown] = votes.split("/");
      const up = Number.parseInt(rawUp ?? "", 10);
      const down = Number.parseInt(rawDown ?? "", 10);
      lines.push(
        currentT("quiz.menu.votesLine", {
          up: Number.isFinite(up) ? up : 0,
          down: Number.isFinite(down) ? down : 0,
        }),
      );
    }

    const label = anchor.dataset.answerLabel ?? "";
    hovercard.innerHTML =
      (label ? `<div class="flyout-hovercard__title">${escapeHtml(label)}</div>` : "") +
      lines.map((line) => `<div class="flyout-hovercard__line">${escapeHtml(line)}</div>`).join("");
    hovercard.hidden = false;

    const originRect = origin.getBoundingClientRect();
    const clientX = event.clientX ?? 0;
    const clientY = event.clientY ?? 0;
    const cardHeight = hovercard.offsetHeight || 110;
    let viewportLeft = clientX + 16;

    if (viewportLeft + HOVERCARD_WIDTH > window.innerWidth - HOVERCARD_MARGIN) {
      viewportLeft = clientX - HOVERCARD_WIDTH - 16;
    }

    let viewportTop = clientY + 18;

    if (viewportTop + cardHeight > window.innerHeight - HOVERCARD_MARGIN) {
      viewportTop = clientY - cardHeight - 18;
    }

    hovercard.style.left = `${Math.round(Math.max(HOVERCARD_MARGIN, viewportLeft) - originRect.left)}px`;
    hovercard.style.top = `${Math.round(Math.max(HOVERCARD_MARGIN, viewportTop) - originRect.top)}px`;
  };

  const hideCard = () => {
    hovercard.hidden = true;
  };

  for (const option of Array.from(
    shadowRoot.querySelectorAll<HTMLElement>(".flyout-option[data-answer-label]"),
  )) {
    option.addEventListener("mouseenter", (event) => showCard(option, event as MouseEvent));
    option.addEventListener("focusin", () => {
      const rowRect = option.getBoundingClientRect();
      showCard(option, { clientX: rowRect.left, clientY: rowRect.top } as MouseEvent);
    });
    option.addEventListener("mouseleave", hideCard);
  }
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
      actionSlotIndex: suggestion.actionSlotIndex,
      taskId: suggestion.taskId,
      votesUp: suggestion.votesUp,
      votesDown: suggestion.votesDown,
      myVote: suggestion.myVote,
    }));
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

function getAiExplainIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M24 7a12 12 0 0 1 12 12c0 4.5-2.6 7.4-4.8 9.8-1.3 1.4-2.2 2.7-2.2 4.7h-10c0-2-.9-3.3-2.2-4.7C14.6 26.4 12 23.5 12 19A12 12 0 0 1 24 7Z" />
      <path d="M19.5 40h9" />
      <path d="M21 44h6" />
    </svg>
  `;
}

function getEssaySaveIconMarkup() {
  return `
    <svg viewBox="0 0 48 48">
      <path d="M10 8h20l8 8v24a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z" />
      <path d="M16 8v10h14V8" />
      <path d="M16 30h16" />
      <path d="M24 24v12" />
    </svg>
  `;
}

function renderEmptyFlyout(message = currentT("quiz.menu.empty")) {
  return `<div class="flyout-option flyout-empty">${escapeHtml(message)}</div>`;
}

export function isAiSettingsSaved(settings: StoredStateLike["settings"] | undefined) {
  const ai = settings?.ai;

  if (!ai) {
    return false;
  }

  if (ai.accessMode === "official") {
    return true;
  }

  if (!ai.connectionVerified || !ai.apiKey?.trim()) {
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
    error: null,
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

export function renderAiExplanationFlyout(state: AiAnswerState) {
  if (state.status === "loading") {
    return renderEmptyFlyout(currentT("quiz.menu.aiLoading"));
  }

  if (state.status === "error") {
    return `<div class="flyout-option flyout-text flyout-text--error">${escapeHtml(state.error ?? currentT("quiz.menu.empty"))}</div>`;
  }

  if (state.status === "success" && state.answer) {
    return `<div class="flyout-option flyout-text flyout-text--answer">${escapeHtml(state.answer)}</div>`;
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

function renderAnswerMenuItem(
  label: string,
  iconMarkup: string,
  flyoutMarkup: string,
  menuKey: string,
  hidden = false,
) {
  return `
    <div class="menu-item" role="menuitem" tabindex="0" data-answer-menu="${escapeHtml(menuKey)}" ${hidden ? "hidden" : ""}>
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

function renderAiExplainButton(isLoading: boolean, hidden: boolean) {
  return `
    <button class="menu-ai-button" type="button" data-ai-action="explain" ${isLoading ? "disabled" : ""} ${hidden ? "hidden" : ""}>
      <span class="icon" aria-hidden="true">${getAiExplainIconMarkup()}</span>
      <span class="label">${escapeHtml(currentT("quiz.menu.explainAnswer"))}</span>
    </button>
  `;
}

type AnswerMenuTabKey = "internal" | "external" | "ai";

function getVisibleAnswerMenuTabs(
  answerData: SourceAnswerData,
  aiToolsEnabled: boolean,
  externalOnly = false,
  essayMenu?: EssayMenuState,
): AnswerMenuTabKey[] {
  const tabs: AnswerMenuTabKey[] = [];

  if (essayMenu) {
    if (!externalOnly) {
      tabs.push("internal");
    }

    if (!externalOnly && aiToolsEnabled) {
      tabs.push("ai");
    }
  } else {
    if (hasMenuAnswerData(answerData.external)) {
      tabs.push("external");
    }

    if (!externalOnly && hasMenuAnswerData(answerData.reduxshare)) {
      tabs.push("internal");
    }

    if (!externalOnly && aiToolsEnabled) {
      tabs.push("ai");
    }
  }

  if (tabs.length > 0) {
    return tabs;
  }

  return externalOnly ? ["external"] : ["internal"];
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

function renderSourceMenuPanel(
  panelKey: "internal" | "external",
  sourceKey: keyof SourceAnswerData,
  sourceData: AnswerData,
  isActive: boolean,
) {
  const exactSuggestions = sourceData.suggestions.filter(
    (suggestion) => suggestion.correctness === 2,
  );
  const sourcePrefix = sourceKey === "reduxshare" ? "reduxshare" : "external";

  return `
    <div class="menu-panel" data-menu-panel="${panelKey}" data-active="${isActive ? "true" : "false"}">
      ${renderAnswerMenuItem(
        currentT("quiz.menu.exactAnswer"),
        getCheckIconMarkup(),
        renderSuggestionFlyout(exactSuggestions),
        `${sourcePrefix}-exact`,
      )}
      ${renderAnswerMenuItem(
        currentT("quiz.menu.statistics"),
        getStatsAnswerIconMarkup(),
        renderSubmissionFlyout(getStatsSubmissionItems(sourceData)),
        `${sourcePrefix}-stats`,
      )}
    </div>
  `;
}

function renderEssayVoteCluster(example: EssayExampleEntry): string {
  const upActive = example.myVote === 1;
  const downActive = example.myVote === -1;

  return `
      <div class="flyout-votes" role="group">
        <button type="button" class="flyout-vote-btn${upActive ? " flyout-vote-btn--active" : ""}" data-vote-action="up" data-vote-example-id="${escapeHtml(example.exampleId)}" title="${escapeHtml(currentT("quiz.menu.voteUp"))}" aria-pressed="${upActive ? "true" : "false"}" tabindex="-1">${VOTE_UP_ICON_MARKUP}<span class="flyout-vote-count">${example.votesUp}</span></button>
        <button type="button" class="flyout-vote-btn${downActive ? " flyout-vote-btn--active" : ""}" data-vote-action="down" data-vote-example-id="${escapeHtml(example.exampleId)}" title="${escapeHtml(currentT("quiz.menu.voteDown"))}" aria-pressed="${downActive ? "true" : "false"}" tabindex="-1">${VOTE_DOWN_ICON_MARKUP}<span class="flyout-vote-count">${example.votesDown}</span></button>
      </div>`;
}

function renderEssayExampleRow(example: EssayExampleEntry): string {
  const dubiousClass = example.votesDown > example.votesUp ? " flyout-label--dubious" : "";
  const meta = getAnswerMetaParts({
    contributor: example.authorName,
    addedAt: example.createdAt,
    updatedAt: example.updatedAt,
  });
  const metaBits: string[] = [];

  if (meta.user) {
    metaBits.push(meta.user);
  }

  if (meta.added) {
    metaBits.push(meta.added);
  }

  return `
      <div class="flyout-row essay-example" data-essay-example-id="${escapeHtml(example.exampleId)}" data-meta-votes="${example.votesUp}/${example.votesDown}">
        <div class="flyout-label-block">
          <span class="flyout-label essay-example__body${dubiousClass}" data-essay-action="apply" title="${escapeHtml(currentT("quiz.menu.essayExampleApply"))}">${escapeHtml(example.body)}</span>
        </div>
        <div class="essay-example__meta">
          <span class="essay-example__author">${escapeHtml(metaBits.join(" · "))}</span>
          ${renderEssayVoteCluster(example)}
        </div>
      </div>`;
}

function renderEssayMenuPanel(essayMenu: EssayMenuState, isActive: boolean) {
  const listMarkup =
    essayMenu.examples.length > 0
      ? essayMenu.examples.map(renderEssayExampleRow).join("")
      : `<div class="essay-examples-empty">${escapeHtml(currentT("quiz.menu.essayExamplesEmpty"))}</div>`;

  return `
    <div class="menu-panel" data-menu-panel="internal" data-active="${isActive ? "true" : "false"}">
      ${renderAnswerMenuItem(
        currentT("quiz.menu.essayExamples"),
        getQuestionTypeScanIconMarkup("essay"),
        `<div class="essay-examples-list">${listMarkup}</div>`,
        "essay-examples",
      )}
      ${
        essayMenu.canSave
          ? `
      <button class="menu-ai-button" type="button" data-essay-action="save">
        <span class="icon" aria-hidden="true">${getEssaySaveIconMarkup()}</span>
        <span class="label">${escapeHtml(currentT("quiz.menu.essayExampleSave"))}</span>
      </button>
      <div class="essay-save-status" data-essay-save-status hidden></div>`
          : ""
      }
    </div>
  `;
}

function renderAiMenuPanel(
  aiSettingsSaved: boolean,
  aiAnswerState: AiAnswerState,
  aiExplanationState: AiAnswerState,
  isActive: boolean,
) {
  if (!aiSettingsSaved) {
    return `
      <div class="menu-panel" data-menu-panel="ai" data-active="${isActive ? "true" : "false"}">
        <div class="ai-settings-missing">${escapeHtml(currentT("quiz.menu.aiSettingsMissing"))}</div>
      </div>
    `;
  }

  const showExplanationUi =
    aiAnswerState.status === "success" && Boolean(aiAnswerState.answer?.trim());
  const anyRequestLoading =
    aiAnswerState.status === "loading" || aiExplanationState.status === "loading";

  return `
    <div class="menu-panel" data-menu-panel="ai" data-active="${isActive ? "true" : "false"}">
      ${renderAiRequestButton(anyRequestLoading)}
      ${renderAiExplainButton(aiExplanationState.status === "loading", !showExplanationUi)}
      ${renderAnswerMenuItem(
        currentT("quiz.menu.aiAnswer"),
        getAiAnswerIconMarkup(),
        renderAiAnswerFlyout(aiAnswerState),
        "ai-answer",
      )}
      ${renderAnswerMenuItem(
        currentT("quiz.menu.aiExplanation"),
        getAiExplainIconMarkup(),
        renderAiExplanationFlyout(aiExplanationState),
        "ai-explanation",
        !showExplanationUi,
      )}
    </div>
  `;
}

function renderAnswerMenuTabs(
  answerData: SourceAnswerData,
  aiToolsEnabled: boolean,
  externalOnly = false,
  essayMenu?: EssayMenuState,
) {
  const tabs = getVisibleAnswerMenuTabs(answerData, aiToolsEnabled, externalOnly, essayMenu);
  const activeTab = tabs[0] ?? (externalOnly ? "external" : "internal");

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
  aiToolsEnabled: boolean,
  externalOnly = false,
  aiExplanationState: AiAnswerState = createIdleAiAnswerState(),
  essayMenu?: EssayMenuState,
) {
  const tabs = getVisibleAnswerMenuTabs(answerData, aiToolsEnabled, externalOnly, essayMenu);
  const activeTab = tabs[0] ?? (externalOnly ? "external" : "internal");

  return `
    ${tabs.includes("internal") ? (essayMenu ? renderEssayMenuPanel(essayMenu, activeTab === "internal") : renderSourceMenuPanel("internal", "reduxshare", answerData.reduxshare, activeTab === "internal")) : ""}
    ${tabs.includes("external") ? renderSourceMenuPanel("external", "external", answerData.external, activeTab === "external") : ""}
    ${tabs.includes("ai") ? renderAiMenuPanel(aiSettingsSaved, aiAnswerState, aiExplanationState, activeTab === "ai") : ""}
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

      .delay-progress {
        position: absolute;
        right: 0;
        bottom: -9px;
        left: 0;
        height: 5px;
        border-radius: 3px;
        background: rgba(0, 0, 0, 0.38);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22);
        overflow: hidden;
        pointer-events: none;
      }

      .delay-progress-fill {
        width: 0%;
        height: 100%;
        background: var(--reduxshare-accent);
        transition: width 120ms linear;
      }
    </style>

    <div class="widget">
      <button class="trigger" type="button" aria-label="ReduxShare" aria-haspopup="menu" aria-expanded="false">R</button>
    </div>
  `;
}

const ANSWER_DELAY_PROGRESS_CLASS = "delay-progress";

export function setAnswerDelayProgress(host: HTMLElement, ratio: number | null) {
  const shadowRoot = host.shadowRoot;

  if (!shadowRoot) {
    return;
  }

  const existing = shadowRoot.querySelector<HTMLElement>(`.${ANSWER_DELAY_PROGRESS_CLASS}`);

  if (ratio === null) {
    existing?.remove();
    return;
  }

  const progress =
    existing ??
    (() => {
      const element = document.createElement("span");
      element.className = ANSWER_DELAY_PROGRESS_CLASS;
      element.setAttribute("role", "progressbar");
      element.setAttribute("aria-label", "ReduxShare");
      element.innerHTML = `<span class="delay-progress-fill"></span>`;
      shadowRoot.append(element);
      return element;
    })();
  const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  const fill = progress.querySelector<HTMLElement>(".delay-progress-fill");

  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  progress.setAttribute("aria-valuenow", String(percent));

  if (fill) {
    fill.style.width = `${percent}%`;
  }
}

export function getAnswerMenuMarkup(
  answerData: SourceAnswerData,
  aiSettingsSaved: boolean,
  aiAnswerState: AiAnswerState,
  aiToolsEnabled = true,
  externalOnly = false,
  aiExplanationState: AiAnswerState = createIdleAiAnswerState(),
  essayMenu?: EssayMenuState,
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
        width: 348px;
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

      :host([data-flyout-side="left"]) .menu {
        transform-origin: top right;
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
        overflow-wrap: anywhere;
        word-break: break-word;
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

      .menu-ai-button + .menu-ai-button,
      .menu-ai-button + .menu-item {
        border-top: 1px solid rgba(32, 32, 32, 0.72);
      }

      .menu-ai-button[hidden],
      .menu-item[hidden] {
        display: none;
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

      :host([data-flyout-side="left"]) .flyout {
        left: auto;
        right: calc(100% - 4px);
        transform: translateX(6px);
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

      .flyout-label--wrong {
        color: #f87171;
        text-decoration: line-through;
        text-decoration-thickness: 1px;
      }

      .flyout-label-block {
        display: grid;
        flex: 1;
        gap: 2px;
        min-width: 0;
      }

      .flyout-hovercard {
        position: absolute;
        top: 0;
        left: 0;        z-index: 10;
        display: grid;
        gap: 4px;
        width: 230px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        background: rgba(18, 19, 26, 0.97);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
        padding: 10px 12px;
        pointer-events: none;
      }

      .flyout-hovercard[hidden] {
        display: none;
      }

      .flyout-hovercard-origin {
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        overflow: hidden;
        pointer-events: none;
      }

      .flyout-hovercard__title {
        overflow: hidden;
        color: #ffffff;
        font-family: Inter, Arial, sans-serif;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.3;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .flyout-hovercard__line {
        color: rgba(255, 255, 255, 0.66);
        font-family: Inter, Arial, sans-serif;
        font-size: 11.5px;
        font-weight: 400;
        line-height: 1.35;
        word-break: break-word;
      }

      .flyout-pct {
        flex-shrink: 0;
        font-family: Inter, Arial, sans-serif;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
      }

      .flyout-votes {
        display: flex;
        flex-shrink: 0;
        gap: 2px;
        align-items: center;
      }

      .flyout-vote-btn {
        all: unset;
        display: flex;
        flex-shrink: 0;
        gap: 2px;
        align-items: center;
        box-sizing: border-box;
        padding: 2px 3px;
        border-radius: 3px;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
      }

      .flyout-vote-btn svg {
        width: 11px;
        height: 11px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .flyout-vote-btn:hover {
        background: rgba(255, 255, 255, 0.09);
        color: #ffffff;
      }

      .flyout-vote-btn--active {
        color: var(--reduxshare-accent);
      }

      .flyout-vote-btn--active:hover {
        background: transparent;
        color: var(--reduxshare-accent);
      }

      .flyout-vote-count {
        font-family: Inter, Arial, sans-serif;
        font-size: 10px;
        font-weight: 600;
        line-height: 1;
      }

      .flyout-label--dubious {
        color: #fbbf24;
      }

      .flyout-label--wrong.flyout-label--dubious {
        text-decoration-color: #fbbf24;
      }

      .essay-examples-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 260px;
        overflow-y: auto;
      }

      .essay-example {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
      }

      .essay-example__body {
        max-height: 140px;
        overflow-y: auto;
        cursor: pointer;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.45;
      }

      .essay-example__meta {
        display: flex;
        flex-shrink: 0;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        opacity: 0.72;
      }

      .essay-example__author {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .essay-examples-empty {
        padding: 4px 2px;
        font-size: 12px;
        opacity: 0.65;
      }

      .essay-save-status {
        padding: 2px 0 0;
        font-size: 11px;
        opacity: 0.7;
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

      .flyout-option[data-answer-label] {
        cursor: pointer;
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

      :host([data-theme="light"]) .menu {
        border-color: rgba(15, 20, 35, 0.14);
        background: #ffffff;
        box-shadow:
          0 12px 28px rgba(20, 30, 60, 0.16),
          0 2px 8px rgba(20, 30, 60, 0.1);
      }

      :host([data-theme="light"]) .menu-tabs {
        border-bottom-color: rgba(15, 20, 35, 0.1);
      }

      :host([data-theme="light"]) .menu-tab {
        border-right-color: rgba(15, 20, 35, 0.08);
        color: rgba(20, 25, 40, 0.6);
      }

      :host([data-theme="light"]) .menu-tab:not([data-active="true"]):hover,
      :host([data-theme="light"]) .menu-tab:not([data-active="true"]):focus-visible {
        background: rgba(15, 20, 35, 0.05);
        color: #14171d;
      }

      :host([data-theme="light"]) .menu-tab[data-active="true"],
      :host([data-theme="light"]) .icon,
      :host([data-theme="light"]) .chevron {
        color: color-mix(in srgb, var(--reduxshare-accent) 62%, #16213c);
      }

      :host([data-theme="light"]) .menu-tab[data-active="true"] {
        background: color-mix(in srgb, var(--reduxshare-accent) 10%, transparent);
      }

      :host([data-theme="light"]) .menu-item,
      :host([data-theme="light"]) .menu-ai-button {
        background: #ffffff;
        color: #14171d;
      }

      :host([data-theme="light"]) .menu-item::before {
        background: #14171d;
      }

      :host([data-theme="light"]) .menu-item + .menu-item,
      :host([data-theme="light"]) .menu-ai-button + .menu-ai-button,
      :host([data-theme="light"]) .menu-ai-button + .menu-item {
        border-top-color: rgba(15, 20, 35, 0.08);
      }

      :host([data-theme="light"]) .menu-ai-button:hover,
      :host([data-theme="light"]) .menu-ai-button:focus-visible,
      :host([data-theme="light"]) .menu-item:hover,
      :host([data-theme="light"]) .menu-item:focus-visible {
        background: #f2f4f8;
        box-shadow: inset 0 0 0 1px rgba(15, 20, 35, 0.07);
      }

      :host([data-theme="light"]) .label {
        color: #14171d;
      }

      :host([data-theme="light"]) .flyout {
        border-color: rgba(15, 20, 35, 0.14);
        background: #ffffff;
        box-shadow:
          0 12px 28px rgba(20, 30, 60, 0.16),
          0 2px 8px rgba(20, 30, 60, 0.1);
      }

      :host([data-theme="light"]) .flyout-text,
      :host([data-theme="light"]) .flyout-label {
        color: #14171d;
      }

      :host([data-theme="light"]) .flyout-text--error,
      :host([data-theme="light"]) .flyout-label--wrong {
        color: #d9484f;
      }

      :host([data-theme="light"]) .flyout-meta {
        color: rgba(20, 25, 40, 0.6);
      }

      :host([data-theme="light"]) .flyout-empty,
      :host([data-theme="light"]) .menu-empty {
        color: rgba(20, 25, 40, 0.5);
      }

      :host([data-theme="light"]) .ai-settings-missing {
        color: rgba(20, 25, 40, 0.66);
      }

      :host([data-theme="light"]) .flyout-option + .flyout-option {
        border-top-color: rgba(15, 20, 35, 0.08);
      }

      :host([data-theme="light"]) .flyout-option::before {
        background: #14171d;
      }

      :host([data-theme="light"]) .flyout-option:hover,
      :host([data-theme="light"]) .flyout-option:focus-visible {
        background: #f2f4f8;
        box-shadow: inset 0 0 0 1px rgba(15, 20, 35, 0.07);
      }

      :host([data-theme="light"]) .flyout-hovercard {
        border-color: rgba(15, 20, 35, 0.14);
        background: rgba(255, 255, 255, 0.97);
        box-shadow: 0 16px 40px rgba(20, 30, 60, 0.2);
      }

      :host([data-theme="light"]) .flyout-hovercard__title {
        color: #14171d;
      }

      :host([data-theme="light"]) .flyout-hovercard__line {
        color: rgba(20, 25, 40, 0.66);
      }

      :host([data-theme="light"]) .flyout-vote-btn {
        color: rgba(20, 25, 40, 0.45);
      }

      :host([data-theme="light"]) .flyout-vote-btn:hover {
        background: rgba(20, 25, 40, 0.08);
        color: #14171d;
      }

      :host([data-theme="light"]) .flyout-label--dubious {
        color: #b45309;
      }

      :host([data-theme="light"]) .flyout-label--wrong.flyout-label--dubious {
        text-decoration-color: #b45309;
      }

      @media (max-width: 640px) {
        .menu {
          width: min(304px, calc(100vw - 24px));
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
      ${renderAnswerMenuTabs(answerData, aiToolsEnabled, externalOnly, essayMenu)}
      ${renderAnswerMenuPanels(answerData, aiSettingsSaved, aiAnswerState, aiToolsEnabled, externalOnly, aiExplanationState, essayMenu)}
    </div>
  `;
}
