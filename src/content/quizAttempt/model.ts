export const APP_STORAGE_KEY = "reduxshare";
export const QUIZ_CONTEXT_STORAGE_KEY = "reduxshareQuizAttemptContext";
export const QUIZ_PROGRESS_REPORTS_STORAGE_KEY = "reduxshareQuizProgressReports";
export const QUIZ_REVIEW_PENDING_STORAGE_KEY = "reduxshareQuizReviewPending";
export const QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY = "reduxshareQuizReviewSaveDiagnostics";
export const FETCH_QUIZ_ANSWERS_MESSAGE = "REDUXSHARE_FETCH_QUIZ_ANSWERS";
export const RECORD_QUIZ_PROGRESS_MESSAGE = "REDUXSHARE_RECORD_QUIZ_PROGRESS";
export const SAVE_REVIEW_ANSWERS_MESSAGE = "REDUXSHARE_SAVE_REVIEW_ANSWERS";
export const GENERATE_AI_ANSWER_MESSAGE = "REDUXSHARE_GENERATE_AI_ANSWER";
export const STEALTH_MODE_MESSAGE = "REDUXSHARE_STEALTH_MODE";
export const STEALTH_MESSAGE_SOURCE = "ReduxShare";
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
export const CHOICE_QUESTION_TYPES = new Set(["multichoice", "truefalse", "calculatedmulti"]);
export const MATCHING_QUESTION_TYPES = new Set(["match", "randomsamatch"]);
export const SELECTABLE_QUESTION_TYPES = new Set(["gapselect", ...MATCHING_QUESTION_TYPES]);
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

export type LanguageSetting = "auto" | "ru" | "en";

export interface StoredStateLike {
  settings?: {
    extensionEnabled?: boolean;
    stealthMode?: boolean;
    accentColor?: string;
    theme?: string;
    language?: LanguageSetting;
    hotkey?: string;
    hotkeyCode?: string;
    autoSelect?: boolean;
    ai?: {
      provider?: string;
      model?: string;
      apiKey?: string;
      connectionVerified?: boolean;
      verifiedAt?: string | null;
      customModelName?: string | null;
      customEndpoint?: string | null;
    };
  };
  authSession?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number | null;
    user?: {
      id?: string;
      email?: string | null;
    };
  } | null;
  userProfile?: UserProfileLike | null;
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

export interface UserProfileLike {
  id?: string;
  email?: string;
  username?: string;
  moodleDomain?: string | null;
  solvedTestsCount?: number;
  solvedTasksCount?: number;
}

export interface RecordQuizProgressResponse {
  ok: boolean;
  error?: string;
  userProfile?: UserProfileLike;
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
}

export interface SubmissionItem {
  correctness: number;
  count: number;
  label: string;
  displayLabel?: string;
  actionSlotIndex?: number | null;
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
}

export interface ReviewObservation {
  label: string;
  slotKey: string;
  slotIndex: number | null;
}
