let broadPermissionCache: boolean | null = null;

export async function isBroadHostPermissionGranted(): Promise<boolean> {
  if (typeof chrome.permissions?.contains !== "function") {
    return true;
  }

  try {
    return await chrome.permissions.contains({ origins: ["https://*/*", "http://*/*"] });
  } catch {
    return false;
  }
}

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
