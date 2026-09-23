import { vi } from "vitest";

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

type ChromeStorageArea = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type StorageChangeListener = (changes: StorageChanges, areaName: string) => void;

const storageState = new Map<string, unknown>();

// Real chrome fires chrome.storage.onChanged for every set()/remove() on any
// storage area. The mock keeps a listener registry and dispatches the same
// events, so tests can `await chrome.storage.local.set(...)` and observe the
// watcher flows exactly like the production content script and service
// worker do.
const storageListeners = new Set<StorageChangeListener>();

function cloneStorageValue(value: unknown) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // structuredClone cannot handle functions/DOM nodes; fall back below.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return value;
  }
}

function computeChangedArea(areaName: string, items: Record<string, unknown>): StorageChanges {
  const changes: StorageChanges = {};

  for (const [key, nextValue] of Object.entries(items)) {
    const previousValue = storageState.get(key);

    if (previousValue === nextValue) {
      continue;
    }

    changes[key] = {
      oldValue: previousValue === undefined ? undefined : cloneStorageValue(previousValue),
      newValue: cloneStorageValue(nextValue)
    };
  }

  void areaName;
  return changes;
}

function computeRemovedArea(keys: string[]): StorageChanges {
  const changes: StorageChanges = {};

  for (const key of keys) {
    if (!storageState.has(key)) {
      continue;
    }

    changes[key] = {
      oldValue: cloneStorageValue(storageState.get(key))
    };
  }

  return changes;
}

function emitStorageChanges(areaName: string, changes: StorageChanges) {
  if (Object.keys(changes).length === 0) {
    return;
  }

  for (const listener of Array.from(storageListeners)) {
    // chrome delivers an independent changes object to every listener.
    listener(cloneStorageValue(changes) as StorageChanges, areaName);
  }
}

function createStorageArea(areaName: string): ChromeStorageArea {
  return {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
      if (typeof keys === "string") {
        return { [keys]: storageState.get(keys) };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, storageState.get(key)]));
      }

      if (keys && typeof keys === "object") {
        return Object.fromEntries(
          Object.entries(keys).map(([key, fallback]) => [key, storageState.has(key) ? storageState.get(key) : fallback])
        );
      }

      return Object.fromEntries(storageState.entries());
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const changes = computeChangedArea(areaName, items);

      for (const [key, value] of Object.entries(items)) {
        storageState.set(key, value);
      }

      emitStorageChanges(areaName, changes);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const changes = computeRemovedArea(keyList);

      for (const key of keyList) {
        storageState.delete(key);
      }

      emitStorageChanges(areaName, changes);
    })
  };
}

const runtimeSendMessage = vi.fn();
const localStorageArea = createStorageArea("local");

const onChangedApi = {
  addListener: vi.fn((listener: StorageChangeListener) => {
    storageListeners.add(listener);
  }),
  removeListener: vi.fn((listener: StorageChangeListener) => {
    storageListeners.delete(listener);
  }),
  hasListener: vi.fn((listener: StorageChangeListener) => storageListeners.has(listener))
};

const alarmsApi = {
  get: vi.fn((_name: string, callback?: (alarm?: chrome.alarms.Alarm) => void) => {
    callback?.(undefined);
  }),
  create: vi.fn(),
  clear: vi.fn(async () => true),
  onAlarm: { addListener: vi.fn() }
};

vi.stubGlobal("__REDUXSHARE_TEST_MODE__", true);
vi.stubGlobal("chrome", {
  i18n: {
    getUILanguage: vi.fn(() => "ru")
  },
  runtime: {
    lastError: null,
    sendMessage: runtimeSendMessage,
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    // Recorded no-ops: enough for background modules to register their handlers
    // at import time (external.ts) without dispatching them.
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() }
  },
  storage: {
    local: localStorageArea,
    onChanged: onChangedApi
  },
  alarms: alarmsApi
});

beforeEach(() => {
  document.body.innerHTML = "";
  storageState.clear();
  storageListeners.clear();
  runtimeSendMessage.mockReset();
  alarmsApi.get.mockImplementation((_name: string, callback?: (alarm?: chrome.alarms.Alarm) => void) => {
    callback?.(undefined);
  });
  alarmsApi.get.mockClear();
  alarmsApi.create.mockClear();
  alarmsApi.clear.mockClear();
  // restoreMocks/clearMocks must not strip the listener-registry behavior.
  onChangedApi.addListener.mockImplementation((listener: StorageChangeListener) => {
    storageListeners.add(listener);
  });
  onChangedApi.removeListener.mockImplementation((listener: StorageChangeListener) => {
    storageListeners.delete(listener);
  });
  onChangedApi.hasListener.mockImplementation((listener: StorageChangeListener) => storageListeners.has(listener));
  onChangedApi.addListener.mockClear();
  onChangedApi.removeListener.mockClear();
  onChangedApi.hasListener.mockClear();
  localStorageArea.get.mockClear();
  localStorageArea.set.mockClear();
  localStorageArea.remove.mockClear();
});
