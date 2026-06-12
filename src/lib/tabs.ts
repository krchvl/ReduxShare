export async function getActiveTabHostname(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return null;
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!activeTab?.url) {
    return null;
  }

  try {
    const url = new URL(activeTab.url);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.hostname;
  } catch {
    return null;
  }
}
