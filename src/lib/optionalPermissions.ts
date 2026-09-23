// Optional host permissions: the manifest no longer carries blanket
// https://*/* and http://*/* host_permissions. Custom AI endpoints and
// (as a fallback) same-origin question images need per-user grants that are
// requested from a user gesture in the settings screen.

let broadPermissionCache: boolean | null = null;

export async function isBroadHostPermissionGranted(): Promise<boolean> {
  if (typeof chrome.permissions?.contains !== "function") {
    // Non-extension context (tests): behave as "granted" so custom endpoints
    // keep working where no gating is possible.
    return true;
  }

  try {
    return await chrome.permissions.contains({ origins: ["https://*/*", "http://*/*"] });
  } catch {
    return false;
  }
}

/**
 * Requests the optional broad host permission from a user gesture. Returns
 * true when the permission is (or already was) granted, false when the user
 * dismissed the browser prompt or the API is unavailable.
 */
export async function requestBroadHostPermission(): Promise<boolean> {
  const alreadyGranted = await isBroadHostPermissionGranted();

  broadPermissionCache = alreadyGranted ? true : broadPermissionCache;

  if (alreadyGranted) {
    return true;
  }

  if (typeof chrome.permissions?.request !== "function") {
    return false;
  }

  try {
    const granted = await chrome.permissions.request({ origins: ["https://*/*", "http://*/*"] });
    broadPermissionCache = granted ? true : broadPermissionCache;
    return granted;
  } catch {
    return false;
  }
}

export function isBroadHostPermissionGrantedSync(): boolean {
  // Best-effort synchronous probe for gesture-time gating; the async contains()
  // call stays the source of truth, this only reflects the last known state.
  return broadPermissionCache === true;
}

export async function refreshBroadPermissionCache(): Promise<boolean> {
  broadPermissionCache = await isBroadHostPermissionGranted();
  return broadPermissionCache;
}

export function needsBroadHostPermission(endpoint: string | undefined): boolean {
  const rawEndpoint = endpoint?.trim();

  if (!rawEndpoint) {
    return false;
  }

  try {
    const url = new URL(rawEndpoint);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
