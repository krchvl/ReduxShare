import { getLocalizedErrorMessage, getTranslator } from "../i18n";
import { DEFAULT_UPDATE_STATE, type UpdateSource, type UpdateState } from "../types";

export const CHECK_UPDATE_MESSAGE = "REDUXSHARE_CHECK_UPDATE";
export const GET_UPDATE_STATE_MESSAGE = "REDUXSHARE_GET_UPDATE_STATE";
export const UPDATE_ALARM_NAME = "reduxshare-update-check";
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const UPDATE_SOURCE: UpdateSource = "github";
export const GITHUB_VERSION_URL = "https://raw.githubusercontent.com/krchvl/ReduxShare/refs/heads/main/.VERSION";
export const GITHUB_LATEST_RELEASE_URL = "https://github.com/krchvl/ReduxShare/releases/latest";

export type UpdateCheckReason = "startup" | "installed" | "alarm" | "popup" | "manual";

export interface CheckUpdatePayload {
  force?: boolean;
  reason?: UpdateCheckReason;
}

export interface CheckUpdateMessage {
  type: typeof CHECK_UPDATE_MESSAGE;
  payload?: CheckUpdatePayload;
}

export interface GetUpdateStateMessage {
  type: typeof GET_UPDATE_STATE_MESSAGE;
}

export interface UpdateCheckResponse {
  ok: boolean;
  updateState?: UpdateState;
  error?: string;
}

interface LatestUpdateInfo {
  version: string;
  releaseUrl: string | null;
  source: UpdateSource;
}

export function getCurrentExtensionVersion() {
  if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
    return chrome.runtime.getManifest().version;
  }

  return DEFAULT_UPDATE_STATE.currentVersion;
}

export function normalizeUpdateState(
  state: Partial<UpdateState> | null | undefined,
  currentVersion = getCurrentExtensionVersion()
): UpdateState {
  return {
    ...DEFAULT_UPDATE_STATE,
    ...state,
    currentVersion,
    source: state?.source ?? UPDATE_SOURCE
  };
}

export function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, "");
}

function isValidVersion(value: string) {
  return /^\d+(?:\.\d+){1,3}$/.test(value);
}

export function isUpdateCheckDue(state: UpdateState, now = Date.now()) {
  if (!state.nextCheckAt) {
    return true;
  }

  return Date.parse(state.nextCheckAt) <= now;
}

export async function fetchLatestUpdateInfo(currentVersion: string): Promise<LatestUpdateInfo> {
  const response = await fetch(GITHUB_VERSION_URL, {
    cache: "no-store",
    headers: {
      Accept: "text/plain"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub version check failed with status ${response.status}.`);
  }

  const latestVersion = normalizeVersion(await response.text());

  if (!isValidVersion(latestVersion)) {
    throw new Error("GitHub version file contains an invalid version.");
  }

  return {
    version: latestVersion,
    releaseUrl: compareVersions(latestVersion, currentVersion) > 0 ? GITHUB_LATEST_RELEASE_URL : null,
    source: UPDATE_SOURCE
  };
}

function getErrorMessage(error: unknown) {
  return getLocalizedErrorMessage(error, getTranslator(undefined), "errors.updateCheckFailed");
}

function canUseRuntimeMessaging() {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.runtime?.sendMessage) &&
    Boolean(chrome.runtime?.id)
  );
}

function sendRuntimeMessage<TResponse>(message: CheckUpdateMessage | GetUpdateStateMessage): Promise<TResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: TResponse) => {
      const lastError = chrome.runtime.lastError;

      if (lastError) {
        resolve({
          ok: false,
          updateState: normalizeUpdateState(null),
          error: lastError.message ?? getTranslator(undefined)("errors.backgroundConnection")
        } as TResponse);
        return;
      }

      resolve(response);
    });
  });
}

export async function requestUpdateState(): Promise<UpdateCheckResponse> {
  if (!canUseRuntimeMessaging()) {
    return {
      ok: true,
      updateState: normalizeUpdateState(null)
    };
  }

  try {
    return await sendRuntimeMessage<UpdateCheckResponse>({ type: GET_UPDATE_STATE_MESSAGE });
  } catch (error) {
    return {
      ok: false,
      updateState: normalizeUpdateState(null),
      error: getErrorMessage(error)
    };
  }
}

export async function requestUpdateCheck(payload: CheckUpdatePayload = {}): Promise<UpdateCheckResponse> {
  if (!canUseRuntimeMessaging()) {
    return {
      ok: true,
      updateState: normalizeUpdateState({
        status: "up-to-date",
        latestVersion: getCurrentExtensionVersion(),
        checkedAt: new Date().toISOString(),
        nextCheckAt: new Date(Date.now() + UPDATE_CHECK_INTERVAL_MS).toISOString()
      })
    };
  }

  try {
    return await sendRuntimeMessage<UpdateCheckResponse>({
      type: CHECK_UPDATE_MESSAGE,
      payload
    });
  } catch (error) {
    return {
      ok: false,
      updateState: normalizeUpdateState(null),
      error: getErrorMessage(error)
    };
  }
}
