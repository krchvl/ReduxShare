import {
  AI_DISABLED_QUESTION_TYPES,
  type GenerateAiAnswerPayload,
  isGenerateAiAnswerMessage,
  isTestAiConnectionMessage,
  type AiResponse
} from "../lib/ai";
import {
  generateAiAnswer,
  hasUsableAiSettings,
  testAiConnection
} from "../lib/googleAi";
import {
  fetchReduxShareTasks,
  saveReduxShareReviewAnswers,
  type SaveReduxShareReviewPayload
} from "../lib/quizTasks";
import { getLocalizedErrorMessage, getTranslator, type TranslationKey } from "../i18n";
import {
  CHECK_UPDATE_MESSAGE,
  GET_UPDATE_STATE_MESSAGE,
  UPDATE_ALARM_NAME,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_RETRY_INTERVAL_MS,
  compareVersions,
  fetchLatestUpdateInfo,
  getCurrentExtensionVersion,
  isUpdateCheckDue,
  normalizeUpdateState,
  type CheckUpdateMessage,
  type CheckUpdatePayload,
  type GetUpdateStateMessage,
  type UpdateCheckResponse
} from "../lib/updates";
import { recordUserQuizProgress } from "../lib/userProfiles";
import { normalizeAiSettings, type AiSettings, type AuthSession, type LanguageSetting, type UpdateState, type UserProfile } from "../types";

const APP_STORAGE_KEY = "reduxshare";
const FETCH_QUIZ_ANSWERS_MESSAGE = "REDUXSHARE_FETCH_QUIZ_ANSWERS";
const RECORD_QUIZ_PROGRESS_MESSAGE = "REDUXSHARE_RECORD_QUIZ_PROGRESS";
const SAVE_REVIEW_ANSWERS_MESSAGE = "REDUXSHARE_SAVE_REVIEW_ANSWERS";
const QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY = "reduxshareQuizReviewSaveDiagnostics";
const EXTERNAL_CLIENT_VERSION = "2.6.0";
const EXTERNAL_SERVICE_HOST = `${String.fromCharCode(115, 121, 110, 99, 115, 104, 97, 114, 101)}.naloaty.me`;
const EXTERNAL_VARIANTS_URL = `https://${EXTERNAL_SERVICE_HOST}/api/v2/quiz/solution`;

interface StoredStateLike {
  settings?: {
    language?: LanguageSetting;
    ai?: Partial<AiSettings>;
  };
  authSession?: AuthSession | null;
  userProfile?: UserProfile | null;
  updateState?: UpdateState | null;
}

interface QuizQuestionRequest {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
}

interface FetchQuizAnswersPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: QuizQuestionRequest[];
}

interface FetchQuizAnswersMessage {
  type: typeof FETCH_QUIZ_ANSWERS_MESSAGE;
  payload: FetchQuizAnswersPayload;
}

interface RecordQuizProgressPayload {
  moodleDomain: string | null;
  solvedTestsDelta: number;
  solvedTasksDelta: number;
}

interface RecordQuizProgressMessage {
  type: typeof RECORD_QUIZ_PROGRESS_MESSAGE;
  payload: RecordQuizProgressPayload;
}

interface SaveReviewAnswersMessage {
  type: typeof SAVE_REVIEW_ANSWERS_MESSAGE;
  payload: SaveReduxShareReviewPayload;
}

interface QuizVariantResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  ok: boolean;
  status?: number;
  data?: unknown;
  answerCount?: number;
  error?: string;
}

interface QuizAnswersResponse {
  ok: boolean;
  error?: string;
  reduxshareResults?: QuizVariantResult[];
  externalResults?: QuizVariantResult[];
}

interface RecordQuizProgressResponse {
  ok: boolean;
  error?: string;
  userProfile?: UserProfile;
}

interface SaveReviewAnswersResponse {
  ok: boolean;
  error?: string;
  imported?: boolean;
  savedCount?: number;
}

function isFetchQuizAnswersMessage(message: unknown): message is FetchQuizAnswersMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<FetchQuizAnswersMessage>;

  return candidate.type === FETCH_QUIZ_ANSWERS_MESSAGE && typeof candidate.payload === "object";
}

function isRecordQuizProgressMessage(message: unknown): message is RecordQuizProgressMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<RecordQuizProgressMessage>;

  return candidate.type === RECORD_QUIZ_PROGRESS_MESSAGE && typeof candidate.payload === "object";
}

function isSaveReviewAnswersMessage(message: unknown): message is SaveReviewAnswersMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<SaveReviewAnswersMessage>;

  return candidate.type === SAVE_REVIEW_ANSWERS_MESSAGE && typeof candidate.payload === "object";
}

function isCheckUpdateMessage(message: unknown): message is CheckUpdateMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<CheckUpdateMessage>;

  return candidate.type === CHECK_UPDATE_MESSAGE;
}

function isGetUpdateStateMessage(message: unknown): message is GetUpdateStateMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<GetUpdateStateMessage>;

  return candidate.type === GET_UPDATE_STATE_MESSAGE;
}

function getErrorMessage(
  error: unknown,
  language?: LanguageSetting,
  fallbackKey: TranslationKey = "errors.externalRequest"
) {
  return getLocalizedErrorMessage(error, getTranslator(language), fallbackKey);
}

function sendErrorResponse<TResponse extends { ok: false; error?: string }>(
  error: unknown,
  sendResponse: (response: TResponse) => void,
  fallbackKey: TranslationKey = "errors.externalRequest"
) {
  void loadStoredState()
    .then((storedState) => {
      sendResponse({
        ok: false,
        error: getErrorMessage(error, storedState.settings?.language, fallbackKey)
      } as TResponse);
    })
    .catch(() => {
      sendResponse({
        ok: false,
        error: getErrorMessage(error, undefined, fallbackKey)
      } as TResponse);
    });
}

async function loadStoredState(): Promise<StoredStateLike> {
  const result = await chrome.storage.local.get(APP_STORAGE_KEY);
  return (result[APP_STORAGE_KEY] as StoredStateLike | undefined) ?? {};
}

async function saveStoredStatePatch(patch: Partial<StoredStateLike>) {
  const currentState = await loadStoredState();
  await chrome.storage.local.set({
    [APP_STORAGE_KEY]: {
      ...currentState,
      ...patch
    }
  });
}

async function saveReviewSaveDiagnostics(stage: string, details: Record<string, unknown> = {}) {
  try {
    await chrome.storage.local.set({
      [QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY]: {
        stage,
        savedAt: new Date().toISOString(),
        details
      }
    });
  } catch {
    // Diagnostics must not break background message handling.
  }
}

function ensureUpdateAlarm() {
  if (!chrome.alarms?.get || !chrome.alarms?.create) {
    return;
  }

  chrome.alarms.get(UPDATE_ALARM_NAME, (alarm) => {
    if (alarm) {
      return;
    }

    chrome.alarms.create(UPDATE_ALARM_NAME, {
      delayInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000,
      periodInMinutes: UPDATE_CHECK_INTERVAL_MS / 60_000
    });
  });
}

let updateCheckPromise: Promise<UpdateState> | null = null;

async function performUpdateCheck(payload: CheckUpdatePayload = {}): Promise<UpdateState> {
  const storedState = await loadStoredState();
  const currentVersion = getCurrentExtensionVersion();
  const currentUpdateState = normalizeUpdateState(storedState.updateState, currentVersion);

  if (!payload.force && !isUpdateCheckDue(currentUpdateState)) {
    return currentUpdateState;
  }

  const checkingState = normalizeUpdateState(
    {
      ...currentUpdateState,
      status: "checking",
      error: null
    },
    currentVersion
  );
  await saveStoredStatePatch({ updateState: checkingState });

  try {
    const latestUpdate = await fetchLatestUpdateInfo(currentVersion);
    const checkedAt = new Date();
    const updateState = normalizeUpdateState(
      {
        status: compareVersions(latestUpdate.version, currentVersion) > 0 ? "available" : "up-to-date",
        source: latestUpdate.source,
        currentVersion,
        latestVersion: latestUpdate.version,
        checkedAt: checkedAt.toISOString(),
        nextCheckAt: new Date(checkedAt.getTime() + UPDATE_CHECK_INTERVAL_MS).toISOString(),
        releaseUrl: latestUpdate.releaseUrl,
        error: null
      },
      currentVersion
    );

    await saveStoredStatePatch({ updateState });
    return updateState;
  } catch (error) {
    const checkedAt = new Date();
    const updateState = normalizeUpdateState(
      {
        ...currentUpdateState,
        status: "error",
        currentVersion,
        checkedAt: checkedAt.toISOString(),
        nextCheckAt: new Date(checkedAt.getTime() + UPDATE_RETRY_INTERVAL_MS).toISOString(),
        error: getErrorMessage(error, undefined, "errors.updateCheckFailed")
      },
      currentVersion
    );

    await saveStoredStatePatch({ updateState });
    return updateState;
  }
}

function checkForUpdates(payload: CheckUpdatePayload = {}) {
  if (!updateCheckPromise) {
    updateCheckPromise = performUpdateCheck(payload).finally(() => {
      updateCheckPromise = null;
    });
  }

  return updateCheckPromise;
}

async function handleGetUpdateState(): Promise<UpdateCheckResponse> {
  const storedState = await loadStoredState();

  return {
    ok: true,
    updateState: normalizeUpdateState(storedState.updateState)
  };
}

async function handleCheckUpdate(payload: CheckUpdatePayload = {}): Promise<UpdateCheckResponse> {
  ensureUpdateAlarm();

  return {
    ok: true,
    updateState: await checkForUpdates(payload)
  };
}

function getStoredAuthSession(storedState: StoredStateLike) {
  return storedState.authSession?.user.id ? storedState.authSession : null;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildVariantsUrl(payload: FetchQuizAnswersPayload, question: QuizQuestionRequest) {
  const params = new URLSearchParams({
    host: payload.domain,
    courseId: String(payload.courseId),
    quizId: String(payload.quizId),
    moodleId: "1",
    questionId: question.questionId ?? "",
    attemptId: "1",
    client: EXTERNAL_CLIENT_VERSION,
    questionType: question.questionType ?? ""
  });

  return `${EXTERNAL_VARIANTS_URL}?${params.toString()}`;
}

async function fetchQuestionVariants(
  payload: FetchQuizAnswersPayload,
  question: QuizQuestionRequest,
  language?: LanguageSetting
): Promise<QuizVariantResult> {
  const t = getTranslator(language);

  if (!question.questionId) {
    return {
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash,
      ok: false,
      error: t("errors.questionIdMissing")
    };
  }

  try {
    const response = await fetch(buildVariantsUrl(payload, question), {
      method: "GET",
      headers: {
        Accept: "*/*",
        // "X-Api-Key": accessToken
      }
    });

    return {
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash,
      ok: response.ok,
      status: response.status,
      data: await readResponseBody(response)
    };
  } catch (error) {
    return {
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash,
      ok: false,
      error: getErrorMessage(error, language)
    };
  }
}

async function handleFetchQuizAnswers(payload: FetchQuizAnswersPayload): Promise<QuizAnswersResponse> {
  const storedState = await loadStoredState();
  const authSession = getStoredAuthSession(storedState);
  const t = getTranslator(storedState.settings?.language);

  if (!authSession) {
    return {
      ok: false,
      error: t("errors.authRequired")
    };
  }

  if (payload.courseId === null || payload.quizId === null) {
    return {
      ok: false,
      error: t("errors.moodleIdsMissing")
    };
  }

  const externalResults = await Promise.all(
    payload.questions.map((question) => fetchQuestionVariants(payload, question, storedState.settings?.language))
  );
  let latestAuthSession = authSession;
  let reduxshareResults: QuizVariantResult[] = payload.questions.map((question) => ({
    questionId: question.questionId,
    questionType: question.questionType,
    questionHash: question.questionHash,
    ok: true,
    data: null,
    answerCount: 0
  }));

  const reduxshareResponse = await fetchReduxShareTasks(latestAuthSession, payload, storedState.settings?.language);
  latestAuthSession = reduxshareResponse.authSession;
  reduxshareResults = reduxshareResponse.results;
  await saveStoredStatePatch({ authSession: latestAuthSession });

  return {
    ok: true,
    reduxshareResults,
    externalResults
  };
}

async function handleRecordQuizProgress(payload: RecordQuizProgressPayload): Promise<RecordQuizProgressResponse> {
  const storedState = await loadStoredState();
  const authSession = getStoredAuthSession(storedState);
  const t = getTranslator(storedState.settings?.language);

  if (!authSession) {
    return {
      ok: false,
      error: t("errors.authRequired")
    };
  }

  const { authSession: nextAuthSession, userProfile } = await recordUserQuizProgress(authSession, payload);
  await saveStoredStatePatch({ authSession: nextAuthSession, userProfile });

  return {
    ok: true,
    userProfile
  };
}

async function handleSaveReviewAnswers(payload: SaveReduxShareReviewPayload): Promise<SaveReviewAnswersResponse> {
  const storedState = await loadStoredState();
  const authSession = getStoredAuthSession(storedState);
  const t = getTranslator(storedState.settings?.language);

  if (!authSession) {
    await saveReviewSaveDiagnostics("background-auth-required", {
      courseId: payload.courseId,
      quizId: payload.quizId,
      attemptKey: payload.attemptKey,
      questionCount: payload.questions.length
    });
    return {
      ok: false,
      error: t("errors.authRequired")
    };
  }

  const result = await saveReduxShareReviewAnswers(authSession, payload);
  await saveStoredStatePatch({ authSession: result.authSession });
  await saveReviewSaveDiagnostics("background-save-result", {
    courseId: payload.courseId,
    quizId: payload.quizId,
    attemptKey: payload.attemptKey,
    questionCount: payload.questions.length,
    imported: result.imported,
    savedCount: result.savedCount,
    questions: payload.questions.map((question) => ({
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash,
      answerCount: question.answers.length
    }))
  });

  return {
    ok: true,
    imported: result.imported,
    savedCount: result.savedCount
  };
}

async function handleTestAiConnection(payload: AiSettings): Promise<AiResponse> {
  const storedState = await loadStoredState();
  const t = getTranslator(storedState.settings?.language);
  const aiSettings = normalizeAiSettings({
    ...payload,
    connectionVerified: true,
    verifiedAt: new Date().toISOString()
  });

  if (!aiSettings.apiKey) {
    return {
      ok: false,
      error: t("errors.aiApiKeyMissing")
    };
  }

  try {
    await testAiConnection(aiSettings);

    return {
      ok: true,
      answer: "OK"
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, storedState.settings?.language, "errors.aiConnectionFailed")
    };
  }
}

async function handleGenerateAiAnswer(payload: GenerateAiAnswerPayload): Promise<AiResponse> {
  const storedState = await loadStoredState();
  const t = getTranslator(storedState.settings?.language);
  const aiSettings = normalizeAiSettings(storedState.settings?.ai);

  if (payload.questionType && AI_DISABLED_QUESTION_TYPES.has(payload.questionType)) {
    return {
      ok: false,
      error: t("errors.aiQuestionTypeUnsupported")
    };
  }

  if (!hasUsableAiSettings(aiSettings)) {
    return {
      ok: false,
      error: t("errors.aiSettingsMissing")
    };
  }

  try {
    const aiAnswer = await generateAiAnswer(aiSettings, payload);

    return {
      ok: true,
      answer: aiAnswer.answer,
      confidence: aiAnswer.confidence,
      actions: aiAnswer.actions
    };
  } catch (error) {
    return {
      ok: false,
      error: getErrorMessage(error, storedState.settings?.language, "errors.aiRequestFailed")
    };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isGetUpdateStateMessage(message)) {
    void handleGetUpdateState()
      .then(sendResponse)
      .catch((error) => {
        sendErrorResponse(error, sendResponse, "errors.updateCheckFailed");
      });

    return true;
  }

  if (isCheckUpdateMessage(message)) {
    void handleCheckUpdate(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendErrorResponse(error, sendResponse, "errors.updateCheckFailed");
      });

    return true;
  }

  if (isTestAiConnectionMessage(message)) {
    void handleTestAiConnection(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendErrorResponse(error, sendResponse, "errors.aiConnectionFailed");
      });

    return true;
  }

  if (isGenerateAiAnswerMessage(message)) {
    void handleGenerateAiAnswer(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendErrorResponse(error, sendResponse, "errors.aiRequestFailed");
      });

    return true;
  }

  if (isFetchQuizAnswersMessage(message)) {
    void handleFetchQuizAnswers(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendErrorResponse(error, sendResponse);
      });

    return true;
  }

  if (isRecordQuizProgressMessage(message)) {
    void handleRecordQuizProgress(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendErrorResponse(error, sendResponse);
      });

    return true;
  }

  if (isSaveReviewAnswersMessage(message)) {
    void handleSaveReviewAnswers(message.payload)
      .then(sendResponse)
      .catch((error) => {
        void saveReviewSaveDiagnostics("background-save-error", {
          error: error instanceof Error ? error.message : String(error),
          courseId: message.payload.courseId,
          quizId: message.payload.quizId,
          attemptKey: message.payload.attemptKey,
          questionCount: message.payload.questions.length
        });
        sendErrorResponse(error, sendResponse);
      });

    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  ensureUpdateAlarm();
  void checkForUpdates({ force: true, reason: "installed" });
});

chrome.runtime.onStartup.addListener(() => {
  ensureUpdateAlarm();
  void checkForUpdates({ force: true, reason: "startup" });
});

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== UPDATE_ALARM_NAME) {
      return;
    }

    void checkForUpdates({ force: false, reason: "alarm" });
  });
}

ensureUpdateAlarm();
void checkForUpdates({ force: false, reason: "startup" });

export {};
