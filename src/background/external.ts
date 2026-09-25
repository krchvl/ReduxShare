import {
  AI_DISABLED_QUESTION_TYPES,
  type GenerateAiAnswerPayload,
  isFetchAiModelsMessage,
  isGenerateAiAnswerMessage,
  isTestAiConnectionMessage,
  type AiModelsResponse,
  type AiResponse
} from "../lib/ai";
import {
  fetchAiModelOptions,
  generateAiAnswer,
  hasUsableAiSettings,
  testAiConnection
} from "../lib/aiProvider";
import {
  fetchReduxShareQuizPreviewTasks,
  fetchReduxShareTasks,
  saveReduxShareReviewAnswers,
  type QuizPreviewTaskResult,
  type SaveReduxShareReviewPayload
} from "../lib/quizTasks";
import {
  flushPendingReviewSaves,
  flushPendingReviewSavesWithStoredState,
  handleSharedAlarmForPendingSaves,
  queuePendingReviewSave,
  schedulePendingFlushAlarm,
  updatePendingFlushAlarmAfterFlush,
  type PendingSaveFlushDeps,
  type PendingSaveFlushResult
} from "./reviewSaveQueue";
import {
  EXTERNAL_TYPE_PROBE_ORDER,
  fetchQuestionVariants,
  hasExternalAnswerRows,
  fetchExternalAnswer,
  probeExternalQuestionType,
  type ExternalQuestionRequest,
  type ExternalVariantResult,
  type ExternalVariantsPayload
} from "../lib/externalProvider";
import { getRequestErrorMessage, getTranslator, type TranslationKey } from "../i18n";
import {
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
import {
  APP_STORAGE_KEY,
  QUIZ_REVIEW_SAVE_DIAGNOSTICS_STORAGE_KEY
} from "../shared/storageKeys";
import {
  CHECK_UPDATE_MESSAGE,
  FETCH_QUIZ_ANSWERS_MESSAGE,
  FETCH_QUIZ_PREVIEW_MESSAGE,
  GET_UPDATE_STATE_MESSAGE,
  PRELOAD_QUIZ_QUESTIONS_MESSAGE,
  RECORD_QUIZ_PROGRESS_MESSAGE,
  SAVE_REVIEW_ANSWERS_MESSAGE
} from "../shared/messages";
import { logReduxShareInfo, logReduxShareWarning } from "../logic/runtime";
import { loadStoredState, patchStoredState as saveStoredStatePatch } from "../lib/storage";
import { getQuizQuestionStubs, recordQuizQuestions } from "../lib/quizQuestionRegistry";
import type { AnswerData, QuizPreviewRequestPayload } from "../model";
import { createEmptyAnswerData, getAnswerData } from "../data/answerData";
import {
  normalizeAiSettings,
  type AiSettings,
  type AuthSession,
  type LanguageSetting,
  type StoredState,
  type UpdateState,
  type UserProfile
} from "../types";

interface FetchQuizAnswersPayload extends ExternalVariantsPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: ExternalQuestionRequest[];
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

interface FetchQuizPreviewMessage {
  type: typeof FETCH_QUIZ_PREVIEW_MESSAGE;
  payload: QuizPreviewRequestPayload;
}

interface PreloadQuizQuestionsPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: Array<ExternalQuestionRequest & { questionText?: string | null }>;
}

interface PreloadQuizQuestionsMessage {
  type: typeof PRELOAD_QUIZ_QUESTIONS_MESSAGE;
  payload: PreloadQuizQuestionsPayload;
}

interface QuizPreviewQuestionResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  questionText: string | null;
  // The panel renders AnswerData (slots/suggestions/submissions), so the raw
  // variant results are normalised here rather than shipped as { data: ... }.
  reduxshare: AnswerData;
  external: AnswerData;
}

interface QuizPreviewResponse {
  ok: boolean;
  error?: string;
  authRequired?: boolean;
  questions?: QuizPreviewQuestionResult[];
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

interface PreloadQuizQuestionsResponse {
  ok: boolean;
  found: number;
  total: number;
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
  queued?: boolean;
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

function isFetchQuizPreviewMessage(message: unknown): message is FetchQuizPreviewMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<FetchQuizPreviewMessage>;

  return candidate.type === FETCH_QUIZ_PREVIEW_MESSAGE && typeof candidate.payload === "object";
}

function isPreloadQuizQuestionsMessage(message: unknown): message is PreloadQuizQuestionsMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<PreloadQuizQuestionsMessage>;

  return candidate.type === PRELOAD_QUIZ_QUESTIONS_MESSAGE && typeof candidate.payload === "object";
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

function sendErrorResponse<TResponse extends { ok: false; error?: string }>(
  error: unknown,
  sendResponse: (response: TResponse) => void,
  fallbackKey: TranslationKey = "errors.externalRequest"
) {
  let responseSent = false;
  
  void loadStoredState()
    .then((storedState) => {
      if (!responseSent) {
        responseSent = true;
        sendResponse({
          ok: false,
          error: getRequestErrorMessage(error, storedState.settings?.language, fallbackKey)
        } as TResponse);
      }
    })
    .catch(() => {
      if (!responseSent) {
        responseSent = true;
        sendResponse({
          ok: false,
          error: getRequestErrorMessage(error, undefined, fallbackKey)
        } as TResponse);
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

const pendingSaveFlushDeps: PendingSaveFlushDeps = {
  loadStoredState: () => loadStoredState(),
  saveStoredStatePatch: (patch) => saveStoredStatePatch(patch),
  saveDiagnostics: saveReviewSaveDiagnostics
};

function runPendingSaveFlush(
  flush: Promise<PendingSaveFlushResult | null>,
  trigger: "sw-start" | "storage-change"
) {
  void flush
    .then(async (result) => {
      if (result && result.flushedCount > 0) {
        await saveReviewSaveDiagnostics("background-pending-save-flush-result", {
          flushedPendingCount: result.flushedCount,
          remainingPendingCount: result.remainingCount,
          trigger
        });
      }

      // Keep the shared alarm compressed while work remains, stretch it back when done.
      await updatePendingFlushAlarmAfterFlush();
    })
    .catch((error) => {
      void saveReviewSaveDiagnostics("background-pending-save-flush-error", {
        error: error instanceof Error ? error.message : String(error),
        trigger
      });
      void schedulePendingFlushAlarm();
    });
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
        error: getRequestErrorMessage(error, undefined, "errors.updateCheckFailed")
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

function getStoredAuthSession(storedState: Partial<StoredState>) {
  return storedState.authSession?.user.id ? storedState.authSession : null;
}

	async function handleFetchQuizAnswers(payload: FetchQuizAnswersPayload): Promise<QuizAnswersResponse> {
	  const storedState = await loadStoredState();
	  const authSession = getStoredAuthSession(storedState);
	  const t = getTranslator(storedState.settings?.language);

	  if (payload.courseId === null || payload.quizId === null) {
	    return {
	      ok: false,
	      error: t("errors.moodleIdsMissing")
	    };
	  }

	  // Remember the question identities seen on attempt pages so the quiz view page
	  // preview can query the external provider for them later.
	  await recordQuizQuestions(payload.domain, payload.courseId, payload.quizId, payload.questions);

	  // Both sources are launched up-front so the slower one bounds latency instead of their sum.
	  const externalResultsPromise = Promise.all(
	    payload.questions.map((question) => fetchQuestionVariants(payload, question, storedState.settings?.language))
	  );

	  const emptyReduxshareResults = payload.questions.map((question) => ({
	    questionId: question.questionId,
	    questionType: question.questionType,
	    questionHash: question.questionHash,
	    ok: true,
	    data: null,
	    answerCount: 0
	  }));

	  if (!authSession) {
	    const externalResults = await externalResultsPromise;
	    return {
	      ok: true,
	      reduxshareResults: emptyReduxshareResults,
	      externalResults
	    };
	  }

  const reduxshareResponse = await fetchReduxShareTasks(authSession, payload, storedState.settings?.language);
  await saveStoredStatePatch({ authSession: reduxshareResponse.authSession });

  const externalResults = await externalResultsPromise;

  return {
    ok: true,
    reduxshareResults: reduxshareResponse.results,
    externalResults
  };
}

async function handlePreloadQuizQuestions(
  payload: PreloadQuizQuestionsPayload
): Promise<{ ok: boolean; found: number; total: number }> {
  const { domain, courseId, quizId, questions } = payload;

  logReduxShareInfo(`ReduxShare: handlePreloadQuizQuestions called:`, payload);

  if (courseId === null || quizId === null) {
    logReduxShareWarning(`ReduxShare: handlePreloadQuizQuestions: courseId or quizId is null`);
    return { ok: true, found: 0, total: questions.length };
  }

  const storedState = await loadStoredState();

  // Check if we already have cached answers for these questions.
  const existingStubs = await getQuizQuestionStubs(domain, courseId, quizId);
  const existingIds = new Set(existingStubs.map((stub) => stub.questionId));

  const newQuestions = questions.filter((q) => !existingIds.has(q.questionId ?? ""));

  if (newQuestions.length === 0) {
    logReduxShareInfo(`ReduxShare: handlePreloadQuizQuestions: all questions already cached`);
    return { ok: true, found: existingStubs.length, total: questions.length };
  }

  logReduxShareInfo(
    `ReduxShare: preloading ${newQuestions.length} quiz questions for ${domain}/${courseId}/${quizId}`
  );

  let found = 0;

  // Probe each question with qtypes in order until we find a non-empty answer.
  for (const question of newQuestions) {
    const questionId = question.questionId?.trim();

    if (!questionId) {
      continue;
    }

    logReduxShareInfo(`ReduxShare: probing question ${questionId}`);

    for (const qtype of EXTERNAL_TYPE_PROBE_ORDER) {
      const probeRequest: ExternalQuestionRequest = {
        questionId,
        questionType: qtype,
        questionHash: question.questionHash?.trim() || null
      };

      try {
        logReduxShareInfo(`ReduxShare: fetching external answer for question ${questionId} (${qtype})`);
        const response = await fetchExternalAnswer(probeRequest, domain, courseId, quizId, storedState.settings?.language);

        logReduxShareInfo(`ReduxShare: response for question ${questionId} (${qtype}):`, response);

        if (!response.ok) {
          logReduxShareInfo(`ReduxShare: request failed for question ${questionId} (${qtype}), continuing...`);
          continue;
        }

        // Empty array [] means no answer found.
        if (Array.isArray(response.data) && response.data.length === 0) {
          logReduxShareInfo(`ReduxShare: empty answer for question ${questionId} (${qtype}), continuing...`);
          continue;
        }

        // Non-empty result found: stop probing this question.
        found++;
        logReduxShareInfo(
          `ReduxShare: preloaded question ${questionId} (${qtype}) from external source for ${domain}/${courseId}/${quizId}`
        );
        break;
      } catch (error) {
        logReduxShareWarning(`ReduxShare: error probing question ${questionId} (${qtype}):`, error);
        continue;
      }
    }
  }

  // Record all successfully probed questions in the registry.
  if (found > 0) {
    logReduxShareInfo(`ReduxShare: recording ${found} probed questions to registry`);
    await recordQuizQuestions(domain, courseId, quizId, newQuestions);
  }

  return { ok: true, found, total: questions.length };
}

async function handleFetchQuizPreview(payload: QuizPreviewRequestPayload): Promise<QuizPreviewResponse> {
  const storedState = await loadStoredState();
  const authSession = getStoredAuthSession(storedState);
  const t = getTranslator(storedState.settings?.language);

  if (payload.courseId === null || payload.quizId === null) {
    return {
      ok: false,
      error: t("errors.moodleIdsMissing")
    };
  }

  // The view page never sees question markup, so the internal answer database doubles
  // as the quiz's question list: questions nobody has ever shared for this quiz cannot
  // be enumerated from here.
  if (!authSession) {
    return {
      ok: true,
      authRequired: true,
      questions: []
    };
  }

  const previewResponse = await fetchReduxShareQuizPreviewTasks(authSession, payload, storedState.settings?.language);
  await saveStoredStatePatch({ authSession: previewResponse.authSession });

  // Questions seen on attempt/review pages but never shared as answers are not in
  // the database; the local registry lists them so the external provider can still
  // be queried for their answers.
  const quizStubs = await getQuizQuestionStubs(payload.domain, payload.courseId, payload.quizId);
  const knownQuestionIds = new Set(previewResponse.results.map((result) => result.questionId));
  const stubResults: QuizPreviewTaskResult[] = quizStubs
    .filter((stub) => !knownQuestionIds.has(stub.questionId))
    .map((stub) => ({
      questionId: stub.questionId,
      questionType: stub.questionType,
      questionHash: stub.questionHash,
      questionText: stub.questionText ?? null,
      answerOptions: [],
      ok: false,
      data: null,
      answerCount: 0
    }));
  const stubTextByQuestionId = new Map(
    quizStubs
      .filter((stub) => stub.questionText)
      .map((stub) => [stub.questionId, stub.questionText as string])
  );
  // The external API answers with 400 unless questionType is a known qtype, and
  // the database rows may lack or stale the type. Registry stubs carry the type
  // as read from the question DOM, so they win; the database type is the fallback.
  const stubTypeByQuestionId = new Map(
    quizStubs
      .filter((stub) => stub.questionType)
      .map((stub) => [stub.questionId, stub.questionType as string])
  );

  const previewEntries = [...previewResponse.results, ...stubResults];

  const externalRequests: ExternalQuestionRequest[] = previewEntries.map((result) => ({
    questionId: result.questionId,
    questionType: stubTypeByQuestionId.get(result.questionId ?? "") ?? result.questionType,
    questionHash: result.questionHash
  }));

  const externalPayload: ExternalVariantsPayload = {
    domain: payload.domain,
    courseId: payload.courseId,
    quizId: payload.quizId,
    // The view page has no attempt: the historical "1" placeholders match what the
    // attempt-page request sends when real page meta is unavailable (server tolerates them).
    attemptId: "1",
    questions: externalRequests
  };

  const externalResults = await Promise.all(
    externalRequests.map((question) => fetchQuestionVariants(externalPayload, question, storedState.settings?.language))
  );

  const externalByQuestionId = new Map<string | null, ExternalVariantResult>();

  for (const result of externalResults) {
    externalByQuestionId.set(result.questionId, result);
  }

  // A failed request with a type that differs from the database value gets one
  // retry with the alternative: the two sources disagree on legacy/named types.
  const retryRequests: ExternalQuestionRequest[] = [];

  externalResults.forEach((result, index) => {
    if (result.ok || !result.questionId) {
      return;
    }

    const entry = previewEntries[index];
    const stubType = stubTypeByQuestionId.get(result.questionId);
    const databaseType = entry.questionType;

    if (!stubType || !databaseType || stubType === databaseType) {
      return;
    }

    retryRequests.push({
      questionId: result.questionId,
      questionType: databaseType,
      questionHash: result.questionHash
    });
  });

  if (retryRequests.length > 0) {
    const retryResults = await Promise.all(
      retryRequests.map((question) => fetchQuestionVariants(externalPayload, question, storedState.settings?.language))
    );

    for (const [retryIndex, retryResult] of retryResults.entries()) {
      if (retryResult.ok) {
        externalByQuestionId.set(retryResult.questionId, retryResult);
      }
    }
  }

  // The API answers with an empty list for an unknown qtype and with 400 for an
  // empty one, so a missing or stale type silently hides answers. Questions whose
  // type is not DOM-confirmed (no registry stub) get a bounded probe over the
  // known qtypes, and a hit is written back to the registry for next time.
  // Force refresh probes every question without rows: a stale recorded type
  // must not suppress the search.
  const discoveredTypes = new Map<string, string>();

  await Promise.all(
    externalRequests.map(async (question) => {
      if (!question.questionId) {
        return;
      }

      if (!payload.forceRefresh && stubTypeByQuestionId.has(question.questionId)) {
        return;
      }

      const currentResult = externalByQuestionId.get(question.questionId);

      if (currentResult && hasExternalAnswerRows(currentResult)) {
        return;
      }

      const hit = await probeExternalQuestionType(
        externalPayload,
        question,
        storedState.settings?.language
      );

      if (!hit) {
        return;
      }

      externalByQuestionId.set(question.questionId, hit.result);
      discoveredTypes.set(question.questionId, hit.questionType);
    })
  );

  if (discoveredTypes.size > 0) {
    await recordQuizQuestions(
      payload.domain,
      payload.courseId,
      payload.quizId,
      Array.from(discoveredTypes, ([questionId, questionType]) => ({ questionId, questionType, questionHash: null }))
    );
  }

  return {
    ok: true,
    questions: previewEntries.map((reduxshareResult) => {
      const externalResult =
        externalByQuestionId.get(reduxshareResult.questionId) ??
        ({
          questionId: reduxshareResult.questionId,
          questionType: reduxshareResult.questionType,
          questionHash: reduxshareResult.questionHash,
          ok: false,
          data: null
        } satisfies ExternalVariantResult);

      return {
        questionId: reduxshareResult.questionId,
        questionType: reduxshareResult.questionType,
        questionHash: reduxshareResult.questionHash,
        questionText: reduxshareResult.questionText || stubTextByQuestionId.get(reduxshareResult.questionId ?? "") || null,
        answerOptions: reduxshareResult.answerOptions,
        reduxshare: reduxshareResult.ok ? getAnswerData(reduxshareResult) : createEmptyAnswerData(),
        external: externalResult.ok ? getAnswerData(externalResult) : createEmptyAnswerData()
      };
    })
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

  // Review pages carry the question statements: record the identities (with text)
  // even when the save itself cannot proceed, so the preview keeps improving.
  await recordQuizQuestions(
    payload.domain,
    payload.courseId,
    payload.quizId,
    payload.questions.map((question) => ({
      questionId: question.questionId,
      questionType: question.questionType,
      questionHash: question.questionHash,
      questionText: question.questionText ?? null
    }))
  );

  if (!authSession) {
    const queueSize = await queuePendingReviewSave(payload);
    await saveReviewSaveDiagnostics("background-save-queued-auth-required", {
      courseId: payload.courseId,
      quizId: payload.quizId,
      attemptKey: payload.attemptKey,
      questionCount: payload.questions.length,
      queueSize
    });
    return {
      ok: true,
      imported: false,
      savedCount: 0,
      queued: true
    };
  }

  const flushResult = await flushPendingReviewSaves(authSession, pendingSaveFlushDeps);

  try {
    const result = await saveReduxShareReviewAnswers(flushResult.authSession, payload);
    await saveStoredStatePatch({ authSession: result.authSession });
    await saveReviewSaveDiagnostics("background-save-result", {
      courseId: payload.courseId,
      quizId: payload.quizId,
      attemptKey: payload.attemptKey,
      questionCount: payload.questions.length,
      imported: result.imported,
      savedCount: result.savedCount,
      flushedPendingCount: flushResult.flushedCount,
      remainingPendingCount: flushResult.remainingCount,
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
  } catch (error) {
    // A failed save must not lose the attempt: the pending queue retries it on
    // every later trigger (SW restart, alarm tick, next login or save).
    const queueSize = await queuePendingReviewSave(payload);
    await saveReviewSaveDiagnostics("background-save-queued-retry", {
      courseId: payload.courseId,
      quizId: payload.quizId,
      attemptKey: payload.attemptKey,
      questionCount: payload.questions.length,
      queueSize,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      ok: true,
      imported: false,
      savedCount: 0,
      queued: true
    };
  }
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
      error: getRequestErrorMessage(error, storedState.settings?.language, "errors.aiConnectionFailed")
    };
  }
}

async function handleFetchAiModels(payload: AiSettings): Promise<AiModelsResponse> {
  const storedState = await loadStoredState();
  const aiSettings = normalizeAiSettings(payload);

  try {
    const models = await fetchAiModelOptions(aiSettings);

    return {
      ok: true,
      models
    };
  } catch (error) {
    return {
      ok: false,
      error: getRequestErrorMessage(error, storedState.settings?.language, "errors.aiModelsFetchFailed")
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
      error: getRequestErrorMessage(error, storedState.settings?.language, "errors.aiRequestFailed")
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

  if (isFetchAiModelsMessage(message)) {
    void handleFetchAiModels(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendErrorResponse(error, sendResponse, "errors.aiModelsFetchFailed");
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

  if (isFetchQuizPreviewMessage(message)) {
    void handleFetchQuizPreview(message.payload)
      .then(sendResponse)
      .catch((error) => {
        sendErrorResponse(error, sendResponse);
      });

    return true;
  }

  if (isPreloadQuizQuestionsMessage(message)) {
    void handlePreloadQuizQuestions(message.payload)
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

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[APP_STORAGE_KEY]) {
      return;
    }

    const nextState = changes[APP_STORAGE_KEY].newValue as Partial<StoredState> | undefined;
    const authSession = nextState ? getStoredAuthSession(nextState) : null;

    if (!authSession) {
      return;
    }

    runPendingSaveFlush(flushPendingReviewSaves(authSession, pendingSaveFlushDeps), "storage-change");
  });
}

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

    // The shared alarm doubles as the pending-save retry while the queue is non-empty.
    void handleSharedAlarmForPendingSaves(pendingSaveFlushDeps).catch((error) => {
      void saveReviewSaveDiagnostics("background-pending-save-flush-error", {
        error: error instanceof Error ? error.message : String(error),
        trigger: "alarm"
      });
    });
  });
}

ensureUpdateAlarm();
void checkForUpdates({ force: false, reason: "startup" });
// Resume a flush that a previous service worker may not have finished: this covers
// the MV3 idle-kill and browser-restart cases that storage.onChanged cannot observe.
runPendingSaveFlush(flushPendingReviewSavesWithStoredState(pendingSaveFlushDeps), "sw-start");

export {};
