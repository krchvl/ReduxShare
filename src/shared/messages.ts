// Every message name the extension passes through chrome.runtime.sendMessage, plus the markers of
// the MAIN-world bridge. The app bundles and the content bundle both import this module; the
// content build pass inlines it (see vite.config.ts). Declaring a name once keeps the background
// and the content script from silently drifting onto different message types.
export const FETCH_QUIZ_ANSWERS_MESSAGE = "REDUXSHARE_FETCH_QUIZ_ANSWERS";
export const FETCH_QUIZ_PREVIEW_MESSAGE = "REDUXSHARE_FETCH_QUIZ_PREVIEW";
export const RECORD_QUIZ_PROGRESS_MESSAGE = "REDUXSHARE_RECORD_QUIZ_PROGRESS";
export const SAVE_REVIEW_ANSWERS_MESSAGE = "REDUXSHARE_SAVE_REVIEW_ANSWERS";
export const GENERATE_AI_ANSWER_MESSAGE = "REDUXSHARE_GENERATE_AI_ANSWER";
export const TEST_AI_CONNECTION_MESSAGE = "REDUXSHARE_TEST_AI_CONNECTION";
export const FETCH_AI_MODELS_MESSAGE = "REDUXSHARE_FETCH_AI_MODELS";
export const CHECK_UPDATE_MESSAGE = "REDUXSHARE_CHECK_UPDATE";
export const GET_UPDATE_STATE_MESSAGE = "REDUXSHARE_GET_UPDATE_STATE";
export const STEALTH_MODE_MESSAGE = "REDUXSHARE_STEALTH_MODE";
export const COPY_UNLOCK_MESSAGE = "REDUXSHARE_COPY_UNLOCK";
// window.postMessage origin marker shared with src/content/stealthConsole.ts.
export const STEALTH_MESSAGE_SOURCE = "ReduxShare";
