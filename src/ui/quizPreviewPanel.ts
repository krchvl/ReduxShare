// Quiz preview modal: question statements and answers for a quiz whose attempt has
// not been started. Rendered with Moodle's own modal/tab/card markup (the theme CSS
// is already loaded on the page) so it looks like a native Moodle window instead of
// a custom floating panel.
import {
  hasAnswerData,
  getPreferredSuggestionLabels,
} from "../data/answerData";
import { currentStoredState, currentT } from "../state";
import { canUseQuizFeatures } from "../logic/settings";
import { EXTERNAL_TYPE_PROBE_ORDER } from "../lib/externalProvider";
import { QUIZ_ID_SCAN_DEFAULT_FROM, QUIZ_ID_SCAN_DEFAULT_TO } from "../lib/quizIdScan";
import { getQuestionTypeLabel } from "../shared/questionTypes";
import type {
  AnswerData,
  QuizPreviewQuestion,
  StoredStateLike,
} from "../model";

const QUIZ_PREVIEW_ROOT_ID = "reduxshare-quiz-preview-modal";
const QUIZ_PREVIEW_STYLE_ID = "reduxshare-quiz-preview-style";

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

const PREVIEW_STYLES = `
  .reduxshare-preview-condition {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin-bottom: 8px;
  }

  .reduxshare-preview-condition--missing {
    font-size: 0.85rem;
    font-style: italic;
    opacity: 0.7;
  }

  .reduxshare-preview-answers {
    display: grid;
    gap: 2px;
    margin: 0;
  }

  .reduxshare-preview-answer {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
  }

  .reduxshare-preview-answer--exact .reduxshare-preview-answer-label {
    font-weight: 700;
  }

  .reduxshare-preview-answer-meta {
    font-size: 0.8rem;
    opacity: 0.75;
  }

  .reduxshare-preview-external-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
    margin-bottom: 4px;
  }

  .reduxshare-preview-options {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(0, 0, 0, 0.125);
  }

  .reduxshare-preview-option-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .reduxshare-preview-option {
    display: inline-block;
    padding: 1px 8px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 12px;
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }

  .reduxshare-preview-option--exact {
    border-color: #198754;
    color: #198754;
    font-weight: 700;
  }

  .reduxshare-preview-refresh:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .reduxshare-preview-scan {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.125);
    display: grid;
    gap: 8px;
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
    gap: 4px;
    font-size: 0.85rem;
    margin-bottom: 0;
  }

  .reduxshare-preview-scan-row input {
    width: 90px;
  }

  .reduxshare-preview-scan-progress {
    font-size: 0.85rem;
    opacity: 0.8;
    min-height: 1.2em;
  }

  .reduxshare-preview-scan-types {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 10px;
    font-size: 0.85rem;
  }

  .reduxshare-preview-scan-types-label {
    font-weight: 700;
  }

  .reduxshare-preview-scan-type-option {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 0;
    font-weight: 400;
    cursor: pointer;
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

export function showQuizPreviewQuestions(
  questions: QuizPreviewQuestion[],
  authRequired: boolean,
) {
  panelState.visible = true;
  panelState.loading = false;
  panelState.error = null;
  panelState.authRequired = authRequired;
  panelState.questions = questions;
  // The internal tab is the default; fall back to the external one only when the
  // internal database has nothing at all for this quiz.
  panelState.activeTab = questions.some((question) =>
    hasAnswerData(question.reduxshare),
  )
    ? "internal"
    : "external";
  renderQuizPreviewPanel();
}

export function removeQuizPreviewPanel() {
  document.getElementById(QUIZ_PREVIEW_ROOT_ID)?.remove();
  document.body?.classList.remove("modal-open");
}

// Force-refresh entry point owned by the content script: the preview caches
// responses and trusts recorded question types, either of which can hide
// answers without any request being made. The panel only renders the button
// and forwards the click.
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
  document.getElementById("reduxshare-preview-scan-progress")?.replaceChildren(
    document.createTextNode(
      currentT("quiz.preview.scanProgress", {
        checked: progress.checked,
        total: progress.total,
        found: progress.found
      })
    )
  );
}

function formatQuizPreviewScanProgress() {
  if (!quizPreviewScanProgress) {
    return "";
  }

  return currentT("quiz.preview.scanProgress", {
    checked: quizPreviewScanProgress.checked,
    total: quizPreviewScanProgress.total,
    found: quizPreviewScanProgress.found
  });
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
    const slotSuggestions = slot.suggestions.filter(
      (suggestion) => suggestion.label.trim() !== "",
    );
    const slotSubmissions = slot.submissions.filter(
      (submission) => submission.label.trim() !== "",
    );

    if (slotSuggestions.length === 0 && slotSubmissions.length === 0) {
      continue;
    }

    const exactLabels = new Set(
      slotSuggestions.map((suggestion) => suggestion.label),
    );

    for (const submission of slotSubmissions) {
      rows.push({
        label: submission.label,
        exact: exactLabels.has(submission.label),
        meta: getMetaText(
          submission.contributor,
          submission.count,
          submission.updatedAt,
        ),
      });
    }

    for (const suggestion of slotSuggestions) {
      if (
        slotSubmissions.some(
          (submission) => submission.label === suggestion.label,
        )
      ) {
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
    const exactLabels = new Set(
      answerData.suggestions.map((suggestion) => suggestion.label),
    );

    for (const submission of answerData.submissions) {
      rows.push({
        label: submission.label,
        exact: exactLabels.has(submission.label),
        meta: getMetaText(
          submission.contributor,
          submission.count,
          submission.updatedAt,
        ),
      });
    }

    for (const suggestion of answerData.suggestions) {
      if (
        answerData.submissions.some(
          (submission) => submission.label === suggestion.label,
        )
      ) {
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
    return `<p class="text-muted mb-0 reduxshare-preview-empty">${escapeHtml(currentT("quiz.menu.empty"))}</p>`;
  }

  return `<ul class="list-unstyled reduxshare-preview-answers">${rows
    .map(
      (row) => `
      <li class="reduxshare-preview-answer${row.exact ? " reduxshare-preview-answer--exact" : ""}">
        <span class="reduxshare-preview-answer-label${row.exact ? " text-success" : ""}">${escapeHtml(row.label)}</span>
        ${row.meta ? `<span class="reduxshare-preview-answer-meta">${escapeHtml(row.meta)}</span>` : ""}
      </li>
    `,
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
  // The external provider never ships the statement; when no internal record
  // pairs with the question either, say so instead of leaving the card silent.
  const conditionMarkup = condition
    ? `<div class="reduxshare-preview-condition">${escapeHtml(condition)}</div>`
    : tab === "external"
      ? `<div class="reduxshare-preview-condition reduxshare-preview-condition--missing">${escapeHtml(currentT("quiz.preview.conditionMissing"))}</div>`
      : "";

  return `
    <div class="card mb-3 reduxshare-preview-question">
      <div class="card-header d-flex align-items-center justify-content-between gap-2">
        <span class="font-weight-bold">${escapeHtml(currentT("quiz.preview.question", { number: questionNumber }))}</span>
        <span class="badge badge-secondary">${escapeHtml(questionType)}</span>
      </div>
      <div class="card-body">
        ${conditionMarkup}
        ${renderAnswerRows(answers)}
        ${tab === "internal" ? renderAnswerOptionsSection(question) : ""}
      </div>
    </div>
  `;
}

// The option pool collected from review pages: every choice the question ever
// offered, with the known exact answers highlighted.
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
      getPreferredSuggestionLabels(suggestions).map((label) =>
        label.toLowerCase(),
      ),
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

// The external provider answers per question id without shipping the question
// statement, so the external tab pairs its rows with the statement taken from
// the internal record of the same question, when one exists.
function getTabQuestions(tab: QuizPreviewTabKey) {
  if (tab === "external") {
    return panelState.questions.filter((question) =>
      hasAnswerData(question.external),
    );
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
    <li class="nav-item">
      <button
        class="nav-link${isActive ? " active" : ""} reduxshare-preview-tab"
        type="button"
        data-tab="${tabKey}"
        ${count === 0 ? 'data-empty="true"' : ""}
      >
        ${escapeHtml(label)} <span class="badge badge-light">${count}</span>
      </button>
    </li>
  `;
}

function renderModalBody() {
  if (panelState.loading) {
    return `
      <div class="reduxshare-preview-placeholder d-flex align-items-center gap-2">
        <span class="loading-icon"><i class="icon fa fa-spinner fa-spin fa-fw" aria-hidden="true"></i></span>
        <span>${escapeHtml(currentT("quiz.preview.loading"))}</span>
      </div>
    `;
  }

  if (panelState.error) {
    return `<div class="reduxshare-preview-placeholder text-danger">${escapeHtml(panelState.error)}</div>`;
  }

  if (panelState.authRequired) {
    return `<div class="reduxshare-preview-placeholder">${escapeHtml(currentT("quiz.preview.authRequired"))}</div>`;
  }

  const internalCount = getTabQuestions("internal").filter((question) =>
    hasAnswerData(question.reduxshare),
  ).length;
  const externalCount = getTabQuestions("external").length;
  const tabQuestions = getTabQuestions(panelState.activeTab);

  // With no question identities at all the external source cannot be queried per
  // question: explain what unlocks the listing instead of a bare "no answers".
  const tabEmptyPlaceholder =
    panelState.questions.length === 0
      ? currentT("quiz.preview.externalDiscovery")
      : currentT("quiz.menu.empty");

  // The deep ID scan stays available even after discoveries: finding a few
  // questions must not lock the user out of scanning further ranges/types.
  const scanBlock = renderQuizPreviewScanBlock();

  return `
    <ul class="nav nav-tabs mb-3">
      ${renderTabButton("internal", currentT("quiz.menu.internalSources"), internalCount, panelState.activeTab === "internal")}
      ${renderTabButton("external", currentT("quiz.menu.externalSources"), externalCount, panelState.activeTab === "external")}
    </ul>
    ${
      tabQuestions.length === 0
        ? `<div class="reduxshare-preview-placeholder">${escapeHtml(tabEmptyPlaceholder)}</div>${scanBlock}`
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
    ? `<button type="button" class="btn btn-secondary btn-sm reduxshare-preview-scan-cancel">${escapeHtml(currentT("quiz.preview.scanCancel"))}</button>`
    : `<button type="button" class="btn btn-primary btn-sm reduxshare-preview-scan-start">${escapeHtml(currentT("quiz.preview.scanStart"))}</button>`;

  const language = currentStoredState?.settings?.language;
  const typeOptions = EXTERNAL_TYPE_PROBE_ORDER.map(
    (type) => `
      <label class="reduxshare-preview-scan-type-option" title="${escapeHtml(type)}">
        <input type="checkbox" class="reduxshare-preview-scan-type" value="${escapeHtml(type)}" checked />
        ${escapeHtml(getQuestionTypeLabel(type, language))}
      </label>
    `
  ).join("");

  return `
    <div class="reduxshare-preview-scan">
      <div class="reduxshare-preview-scan-row">
        <label>${escapeHtml(currentT("quiz.preview.scanRangeFrom"))}
          <input
            type="number"
            min="1"
            id="reduxshare-preview-scan-from"
            class="form-control form-control-sm"
            value="${QUIZ_ID_SCAN_DEFAULT_FROM}"
          />
        </label>
        <label>${escapeHtml(currentT("quiz.preview.scanRangeTo"))}
          <input
            type="number"
            min="1"
            id="reduxshare-preview-scan-to"
            class="form-control form-control-sm"
            value="${QUIZ_ID_SCAN_DEFAULT_TO}"
          />
        </label>
        ${actionButton}
      </div>
      <div class="reduxshare-preview-scan-types">
        <span class="reduxshare-preview-scan-types-label">${escapeHtml(currentT("quiz.preview.scanTypes"))}:</span>
        ${typeOptions}
        <button type="button" class="btn btn-link btn-sm reduxshare-preview-scan-select-all">${escapeHtml(currentT("quiz.preview.scanSelectAll"))}</button>
        <button type="button" class="btn btn-link btn-sm reduxshare-preview-scan-select-none">${escapeHtml(currentT("quiz.preview.scanClearAll"))}</button>
      </div>
      <div class="reduxshare-preview-scan-progress" id="reduxshare-preview-scan-progress">${escapeHtml(formatQuizPreviewScanProgress())}</div>
    </div>
  `;
}

function ensureQuizPreviewStyle() {
  if (document.getElementById(QUIZ_PREVIEW_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = QUIZ_PREVIEW_STYLE_ID;
  style.textContent = PREVIEW_STYLES;
  document.head.append(style);
}

function ensureQuizPreviewRoot(): HTMLDivElement {
  const existing = document.getElementById(QUIZ_PREVIEW_ROOT_ID);

  if (existing instanceof HTMLDivElement) {
    return existing;
  }

  const root = document.createElement("div");
  root.id = QUIZ_PREVIEW_ROOT_ID;
  document.body.append(root);

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

function renderQuizPreviewPanel() {
  if (
    !panelState.visible ||
    !canUseQuizFeatures(currentStoredState as StoredStateLike | undefined)
  ) {
    removeQuizPreviewPanel();
    return;
  }

  ensureQuizPreviewStyle();
  ensureQuizPreviewEscapeListener();
  const root = ensureQuizPreviewRoot();
  const closeLabel = currentT("quiz.panel.close");
  const refreshLabel = currentT("quiz.preview.refreshQuestions");

  root.innerHTML = `
    <div class="modal-backdrop fade show"></div>
    <div
      class="modal fade show reduxshare-preview-modal"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reduxshare-quiz-preview-title"
      style="display: block"
    >
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header" style="display: flex; justify-content: between;">
            <h5 class="modal-title" id="reduxshare-quiz-preview-title">
              ${escapeHtml(getQuizPreviewHeading())}
              <small class="text-muted d-block">${escapeHtml(currentT("quiz.preview.subtitle"))}</small>
            </h5>
            <button type="button" class="close reduxshare-preview-refresh" aria-label="${escapeHtml(refreshLabel)}" title="${escapeHtml(refreshLabel)}" ${panelState.loading ? "disabled" : ""}>
              <span aria-hidden="true">&#8635;</span>
            </button>
            <button type="button" class="close reduxshare-preview-close" aria-label="${escapeHtml(closeLabel)}" title="${escapeHtml(closeLabel)}">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">${renderModalBody()}</div>
        </div>
      </div>
    </div>
  `;

  document.body.classList.add("modal-open");

  root
    .querySelector<HTMLElement>(".reduxshare-preview-close")
    ?.addEventListener("click", () => {
      hideQuizPreviewPanel();
    });

  root
    .querySelector<HTMLElement>(".reduxshare-preview-refresh")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      quizPreviewRefreshHandler?.();
    });

  root
    .querySelector<HTMLElement>(".reduxshare-preview-scan-start")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const fromInput = root.querySelector<HTMLInputElement>("#reduxshare-preview-scan-from");
      const toInput = root.querySelector<HTMLInputElement>("#reduxshare-preview-scan-to");
      const selectedTypes = Array.from(
        root.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type:checked")
      ).map((checkbox) => checkbox.value);
      quizPreviewScanHandlers?.onStartScan(fromInput?.value ?? "", toInput?.value ?? "", selectedTypes);
    });

  const syncScanStartAvailability = () => {
    const startButton = root.querySelector<HTMLButtonElement>(".reduxshare-preview-scan-start");

    if (!startButton) {
      return;
    }

    startButton.disabled =
      root.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type:checked").length === 0;
  };

  for (const typeCheckbox of Array.from(
    root.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type")
  )) {
    typeCheckbox.addEventListener("change", () => {
      syncScanStartAvailability();
    });
  }

  root
    .querySelector<HTMLElement>(".reduxshare-preview-scan-select-all")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      for (const typeCheckbox of Array.from(
        root.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type")
      )) {
        typeCheckbox.checked = true;
      }

      syncScanStartAvailability();
    });

  root
    .querySelector<HTMLElement>(".reduxshare-preview-scan-select-none")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      for (const typeCheckbox of Array.from(
        root.querySelectorAll<HTMLInputElement>(".reduxshare-preview-scan-type")
      )) {
        typeCheckbox.checked = false;
      }

      syncScanStartAvailability();
    });

  root
    .querySelector<HTMLElement>(".reduxshare-preview-scan-cancel")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      quizPreviewScanHandlers?.onCancelScan();
    });

  // Moodle's modal closes when the backdrop area (the scrolling .modal surface) is clicked.
  root
    .querySelector<HTMLElement>(".reduxshare-preview-modal")
    ?.addEventListener("click", (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".modal-dialog")
      ) {
        return;
      }

      hideQuizPreviewPanel();
    });

  root.querySelector<HTMLElement>(".reduxshare-preview-modal")?.focus();

  for (const tabButton of Array.from(
    root.querySelectorAll<HTMLButtonElement>(".reduxshare-preview-tab"),
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
