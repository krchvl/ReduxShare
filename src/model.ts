import type { AuthSession, Settings, UserProfile } from "./types";

// chrome.storage keys live in src/shared/storageKeys.ts and message names in
// src/shared/messages.ts, so both bundles share one declaration of each.
export const ANSWER_WIDGET_ATTR = "data-reduxshare-answer-widget";
export const ANSWER_MENU_PORTAL_ATTR = "data-reduxshare-answer-menu-portal";
export const DEFAULT_ACCENT_COLOR = "#9cb9f6";
export const LEGACY_THEME_ACCENTS = {
  Night: "#9cb9f6",
  Devil: "#ff6b6f",
  Peace: "#76d982"
} as const;
export const DEFAULT_HOTKEY = "R";
export const DEFAULT_HOTKEY_CODE = "KeyR";
export const MAX_METADATA_WAIT_MS = 10_000;
export const METADATA_POLL_MS = 250;
export const FULL_PAGE_LOAD_MAX_WAIT_MS = 8_000;

export const TEXT_INPUT_QUESTION_TYPES = new Set(["shortanswer", "numerical", "calculated", "calculatedsimple"]);
export const CHOICE_QUESTION_TYPES = new Set(["multichoice", "multichoiceset", "truefalse", "calculatedmulti"]);
export const MATCHING_QUESTION_TYPES = new Set(["match", "randomsamatch"]);
export const SELECTABLE_QUESTION_TYPES = new Set(["gapselect", "gapfill", ...MATCHING_QUESTION_TYPES]);
export const COMPOUND_QUESTION_TYPES = new Set(["multianswer"]);
export const DRAG_TEXT_QUESTION_TYPES = new Set(["ddwtos"]);
export const DRAG_MARKER_QUESTION_TYPES = new Set(["ddmarker"]);
export const DRAG_IMAGE_OR_TEXT_QUESTION_TYPES = new Set(["ddimageortext"]);
export const ESSAY_QUESTION_TYPES = new Set(["essay"]);
export const AI_ONLY_QUESTION_TYPES = new Set([...ESSAY_QUESTION_TYPES]);
export const AI_DISABLED_QUESTION_TYPES = new Set(["ddimageortext", "ddmarker"]);
export const SUPPORTED_REVIEW_QUESTION_TYPES = new Set([
  ...CHOICE_QUESTION_TYPES,
  ...TEXT_INPUT_QUESTION_TYPES,
  ...SELECTABLE_QUESTION_TYPES,
  ...COMPOUND_QUESTION_TYPES,
  ...DRAG_TEXT_QUESTION_TYPES,
  ...DRAG_MARKER_QUESTION_TYPES,
  ...DRAG_IMAGE_OR_TEXT_QUESTION_TYPES,
  "ordering"
]);
export const SUPPORTED_AUTO_SELECT_QUESTION_TYPES = new Set([
  ...CHOICE_QUESTION_TYPES,
  ...TEXT_INPUT_QUESTION_TYPES,
  ...SELECTABLE_QUESTION_TYPES,
  ...COMPOUND_QUESTION_TYPES,
  ...DRAG_TEXT_QUESTION_TYPES,
  ...DRAG_MARKER_QUESTION_TYPES,
  ...DRAG_IMAGE_OR_TEXT_QUESTION_TYPES,
  "ordering"
]);
export const SUPPORTED_WIDGET_QUESTION_TYPES = new Set([
  ...CHOICE_QUESTION_TYPES,
  ...TEXT_INPUT_QUESTION_TYPES,
  ...SELECTABLE_QUESTION_TYPES,
  ...COMPOUND_QUESTION_TYPES,
  ...DRAG_TEXT_QUESTION_TYPES,
  ...DRAG_MARKER_QUESTION_TYPES,
  ...DRAG_IMAGE_OR_TEXT_QUESTION_TYPES,
  ...ESSAY_QUESTION_TYPES,
  "ordering"
]);
export const UNSUPPORTED_DRAG_DROP_QUESTION_TYPES = new Set<string>();

export type { LanguageSetting } from "./types";

// What the content script can read back from chrome.storage: whatever the popup wrote, possibly
// from an older version of the extension, so every field stays optional. The shape is derived
// from the popup's Settings/AuthSession/UserProfile so a new setting never needs to be declared
// a second time here.
export interface StoredStateLike {
  settings?: Partial<Settings> & {
    // Legacy theme name, still read for accounts that never picked an accent color.
    theme?: string;
  };
  authSession?: Partial<AuthSession> | null;
  userProfile?: Partial<UserProfile> | null;
  latestQuizAttemptContext?: QuizAttemptContext;
}

export interface MoodleConfig {
  courseId: number | null;
  contextInstanceId: number | null;
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
  attemptId: string | null;
  moodleUserId: string | null;
  questionCount: number;
  questions: QuizQuestionSummary[];
}

export interface QuizVariantResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  ok: boolean;
  status?: number;
  data?: unknown;
  answerCount?: number;
  error?: string;
}

export interface QuizAnswersResponse {
  ok: boolean;
  error?: string;
  reduxshareResults?: QuizVariantResult[];
  externalResults?: QuizVariantResult[];
}

// Quiz view page (no attempt started): the answer database is queried per quiz
// instead of per question, so the stored questions themselves act as the quiz's
// question list.
export interface QuizPreviewRequestPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  // Force refresh from the preview panel button: bypass cached responses and
  // re-probe question types instead of trusting the recorded ones.
  forceRefresh?: boolean;
}

export interface QuizPreviewQuestion {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  // Statement of the task, stored with the internal answers. Null for questions the
  // database has answers for but never saw the markup of.
  questionText: string | null;
  // Every option the question ever offered (radio/checkbox/select labels), deduplicated.
  // Empty for free-form question types like shortanswer.
  answerOptions?: string[];
  reduxshare: AnswerData;
  external: AnswerData;
}

export interface QuizPreviewResponse {
  ok: boolean;
  error?: string;
  authRequired?: boolean;
  questions?: QuizPreviewQuestion[];
}

export interface RecordQuizProgressResponse {
  ok: boolean;
  error?: string;
  userProfile?: Partial<UserProfile>;
}

export interface QuizProgressReports {
  tests: Record<string, true>;
  questions: Record<string, true>;
}

export interface AnswerVariantCounts {
  anchors: number;
  suggestions: number;
  submissions: number;
}

export interface SuggestionItem {
  correctness: number;
  confidence: number;
  count?: number;
  label: string;
  displayLabel?: string;
  actionSlotIndex?: number | null;
  contributor?: string | null;
  addedAt?: string | null;
  updatedAt?: string | null;
}

export interface SubmissionItem {
  correctness: number;
  count: number;
  label: string;
  displayLabel?: string;
  actionSlotIndex?: number | null;
  contributor?: string | null;
  addedAt?: string | null;
  updatedAt?: string | null;
}

export interface AnswerSlotData {
  index: number;
  hasExplicitIndex: boolean;
  anchors: string[];
  suggestions: SuggestionItem[];
  submissions: SubmissionItem[];
}

export interface AnswerData {
  anchors: string[];
  suggestions: SuggestionItem[];
  submissions: SubmissionItem[];
  slots: AnswerSlotData[];
}

export interface SourceAnswerData {
  reduxshare: AnswerData;
  external: AnswerData;
}

export interface AnswerWidgetState {
  questionId: string | null;
  variantCounts: AnswerVariantCounts;
  answerData: SourceAnswerData;
  slotIndex: number | null;
}

export interface AnswerEntry {
  answerNode: HTMLElement;
  questionId: string | null;
  questionNode: Element;
}

export interface QuizReviewPendingMarker {
  domain: string;
  attemptKey: string;
  attemptId: string | null;
  cmId: string | null;
  pageUrl: string;
  createdAt: string;
}

export interface ReviewAnswerPayload {
  label: string;
  answerKey: string;
  slotKey: string;
  slotIndex: number | null;
  correctness: number;
  isCorrect: boolean;
  wasSelected: boolean;
}

export interface ReviewQuestionPayload {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  // Question statement as read from the review page. Stored with the answers so the
  // quiz view page (which has no question markup) can show the conditions.
  questionText?: string | null;
  // Every option the review page rendered for the question (radio/checkbox/select
  // labels). Stored once per question as the option pool, separate from answers.
  answerOptions?: string[];
  answers: ReviewAnswerPayload[];
}

export interface SaveReviewAnswersResponse {
  ok: boolean;
  error?: string;
  imported?: boolean;
  savedCount?: number;
  queued?: boolean;
}

export interface AiAnswerResponse {
  ok: boolean;
  answer?: string;
  confidence?: number;
  actions?: AiAnswerAction[];
  error?: string;
}

export interface AiAnswerAction {
  label: string;
  slotIndex?: number | null;
  position?: number | null;
  coordinate?: string | null;
}

export interface AiAnswerState {
  status: "idle" | "loading" | "success" | "error";
  answer: string | null;
  confidence: number | null;
  actions: AiAnswerAction[];
  error: string | null;
}

export interface AiQuestionOption {
  label: string;
  value?: string | null;
  index?: number | null;
  groupIndex?: number | null;
}

export interface AiQuestionControl {
  kind: "choice" | "select" | "text" | "textarea" | "ordering-item" | "drop" | "marker";
  label: string;
  slotIndex?: number | null;
  index?: number | null;
  groupIndex?: number | null;
  options?: AiQuestionOption[];
}

export interface AiQuestionImage {
  label: string;
  url: string;
  width?: number | null;
  height?: number | null;
  naturalWidth?: number | null;
  naturalHeight?: number | null;
  /** Pre-fetched bytes: the content script inlines same-origin images so the
   *  service worker never needs host access to the arbitrary quiz origin. */
  dataUrl?: string | null;
}

export interface ReviewObservation {
  label: string;
  slotKey: string;
  slotIndex: number | null;
}
