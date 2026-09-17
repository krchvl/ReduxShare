// Every chrome.storage.local key used by the extension. The app bundles and the content bundle
// both import this module; the content build pass inlines it (see vite.config.ts).
export const APP_STORAGE_KEY = "reduxshare";
export const QUIZ_CONTEXT_STORAGE_KEY = "reduxshareQuizAttemptContext";
export const QUIZ_PROGRESS_REPORTS_STORAGE_KEY = "reduxshareQuizProgressReports";
export const QUIZ_REVIEW_PENDING_STORAGE_KEY = "reduxshareQuizReviewPending";
export const QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY = "reduxshareQuizReviewSaveDiagnostics";
// Background queue of review saves that could not be uploaded. Not to be confused with
// QUIZ_REVIEW_PENDING_STORAGE_KEY above, which holds the content-side marker for one attempt.
export const PENDING_REVIEW_SAVES_STORAGE_KEY = "reduxsharePendingReviewSaves";
